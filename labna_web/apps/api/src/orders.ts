import { Router } from 'express';
import mongoose, { type ClientSession } from 'mongoose';
import { randomInt, randomUUID } from 'node:crypto';
import { adminOrderQuery, checkoutRequest, orderStatusPatch, type CheckoutRequest, type OrderDTO, type OrderItemDTO, type OrderStatus } from '@labna/contracts';
import { Inventory, InventoryMovement, Order, Store, models } from './database.js';
import { ApiError, pagination, respond } from './http.js';
import type { Config } from './config.js';

const deliveryFeeMinor = 1500;
const demoCoupon = 'LABNA10';

export function ordersRouter() {
  const router = Router();

  router.post('/orders', async (req, res) => {
    const input = checkoutRequest.parse(req.body);
    if (input.paymentMethod === 'demo_card_failure') throw new ApiError(402, 'PAYMENT_FAILED', 'Demo card payment failed');
    const order = await createOrder(input, res.locals.customer?.id ?? null);
    respond(res, order, {}, 201);
  });

  router.get('/orders/:id', async (req, res) => {
    const order = await Order.findOne({ $or: [{ id: req.params.id }, { orderNumber: req.params.id }] }).lean();
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    respond(res, toOrderDTO(order));
  });

  return router;
}

export function adminOrdersRouter(config: Config) {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = adminOrderQuery.parse(req.query);
    const page = pagination(config.CURSOR_SECRET, ['admin-orders', query], query.cursor);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) };
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { orderNumber: { $regex: escaped, $options: 'i' } },
        { 'customer.name': { $regex: escaped, $options: 'i' } },
        { 'customer.phoneNumber': { $regex: escaped, $options: 'i' } },
      ];
    }
    const items = await Order.find(filter).sort({ createdAt: -1, id: 1 }).skip(page.offset).limit(query.limit + 1).lean();
    respond(res, items.slice(0, query.limit).map(toOrderDTO), { nextCursor: page.next(query.limit, items.length > query.limit) });
  });

  router.get('/:id', async (req, res) => {
    const order = await Order.findOne({ $or: [{ id: req.params.id }, { orderNumber: req.params.id }] }).lean();
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    respond(res, toOrderDTO(order));
  });

  router.patch('/:id/status', async (req, res) => {
    const { status } = orderStatusPatch.parse(req.body);
    const actorID = res.locals.staff?.id ?? null;
    const order = await transitionOrder(req.params.id, status, actorID);
    respond(res, order);
  });

  return router;
}

async function createOrder(input: CheckoutRequest, authenticatedCustomerID: string | null) {
  return mongoose.connection.transaction(async session => {
    const store = await Store.findOne({ id: 'store' }).session(session).lean();
    const branchID = input.branchID ?? store?.defaultPickupBranchID;
    if (!branchID) throw new ApiError(503, 'NO_PICKUP_BRANCH', 'Configure a default pickup branch');
    const branch = await models.branches.findOne({ id: branchID, archivedAt: null, 'data.isVisible': true, 'data.pickupEnabled': true }).session(session).lean();
    if (!branch || !branch.data.acceptsOrders) throw new ApiError(422, 'INVALID_BRANCH', 'Select a branch that accepts orders');

    const orderID = randomUUID();
    const orderNumber = await nextOrderNumber(session);
    const items: OrderItemDTO[] = [];
    for (const requested of input.items) {
      const product = await models.products.findOne({ id: requested.productID, archivedAt: null, 'data.publicationStatus': 'published' }).session(session).lean();
      if (!product) throw new ApiError(422, 'PRODUCT_UNAVAILABLE', 'A cart product is no longer available', { productID: requested.productID });
      const variant = product.data.variants.find((item: { id: string }) => item.id === requested.variantID);
      if (!variant || !variant.isActive) throw new ApiError(422, 'VARIANT_UNAVAILABLE', 'A selected variant is no longer available', { productID: requested.productID, variantID: requested.variantID });
      const stock = await Inventory.findOne({ branchID, variantID: requested.variantID }).session(session);
      const availableQuantity = Math.max(0, (stock?.onHand ?? 0) - (stock?.reserved ?? 0));
      if (!stock || requested.quantity > availableQuantity) {
        throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds current stock', { productID: requested.productID, variantID: requested.variantID, availableQuantity });
      }
      stock.reserved += requested.quantity;
      stock.version += 1;
      await stock.save({ session });
      await InventoryMovement.create([{ inventoryID: stock.id, orderID, onHandDelta: 0, reservedDelta: requested.quantity, reason: 'Order reservation', actorID: 'checkout', commandID: randomUUID() }], { session });
      items.push({
        productID: product.id,
        variantID: variant.id,
        productName: product.data.name,
        variantLabel: variant.label,
        imageURL: product.data.imageURLs[0],
        quantity: requested.quantity,
        unit: variant.unit,
        variantQuantity: variant.quantity,
        currencyCode: variant.currencyCode,
        unitPriceMinor: variant.priceMinor,
        lineTotalMinor: requested.quantity * variant.priceMinor,
      });
    }

    const subtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const discountMinor = input.couponCode.toUpperCase() === demoCoupon ? Math.floor(subtotalMinor * 0.1) : 0;
    const totalMinor = Math.max(0, subtotalMinor + deliveryFeeMinor - discountMinor);
    const paymentStatus = input.paymentMethod === 'demo_card_success' ? 'paid' : 'pending';
    const now = new Date().toISOString();
    const [order] = await Order.create([{ id: orderID, orderNumber, customerID: authenticatedCustomerID, customer: input.customer, address: input.address, branchID, items, currencyCode: store?.currencyCode ?? items[0]?.currencyCode ?? 'EGP', subtotalMinor, deliveryFeeMinor, discountMinor, totalMinor, couponCode: input.couponCode.toUpperCase(), payment: { method: input.paymentMethod, status: paymentStatus, providerReference: paymentStatus === 'paid' ? `demo_${randomUUID()}` : null }, status: 'pending', statusHistory: [{ status: 'pending', at: now, actorID: null }] }], { session });
    return toOrderDTO(order.toObject());
  });
}

const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function transitionOrder(id: string, nextStatus: OrderStatus, actorID: string | null) {
  return mongoose.connection.transaction(async session => {
    const order = await Order.findOne({ $or: [{ id }, { orderNumber: id }] }).session(session);
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    const current = order.status as OrderStatus;
    if (current === nextStatus) return toOrderDTO(order.toObject());
    if (!transitions[current].includes(nextStatus)) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Order cannot move to the requested status');
    if (nextStatus === 'cancelled') await releaseReservation(order.toObject(), session, actorID ?? 'admin');
    if (nextStatus === 'completed') await consumeReservation(order.toObject(), session, actorID ?? 'admin');
    order.status = nextStatus;
    order.statusHistory = [...(order.statusHistory ?? []), { status: nextStatus, at: new Date().toISOString(), actorID }];
    await order.save({ session });
    return toOrderDTO(order.toObject());
  });
}

async function releaseReservation(order: any, session: ClientSession, actorID: string) {
  for (const item of order.items as OrderItemDTO[]) {
    const stock = await Inventory.findOne({ branchID: order.branchID, variantID: item.variantID }).session(session);
    if (!stock) continue;
    stock.reserved = Math.max(0, stock.reserved - item.quantity);
    stock.version += 1;
    await stock.save({ session });
    await InventoryMovement.create([{ inventoryID: stock.id, orderID: order.id, onHandDelta: 0, reservedDelta: -item.quantity, reason: 'Order cancelled', actorID, commandID: randomUUID() }], { session });
  }
}

async function consumeReservation(order: any, session: ClientSession, actorID: string) {
  for (const item of order.items as OrderItemDTO[]) {
    const stock = await Inventory.findOne({ branchID: order.branchID, variantID: item.variantID }).session(session);
    if (!stock || stock.reserved < item.quantity || stock.onHand < item.quantity) throw new ApiError(409, 'INVENTORY_CONSTRAINT', 'Reserved stock is no longer sufficient');
    stock.reserved -= item.quantity;
    stock.onHand -= item.quantity;
    stock.version += 1;
    await stock.save({ session });
    await InventoryMovement.create([{ inventoryID: stock.id, orderID: order.id, onHandDelta: -item.quantity, reservedDelta: -item.quantity, reason: 'Order completed', actorID, commandID: randomUUID() }], { session });
  }
}

async function nextOrderNumber(session: ClientSession) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const date = new Date();
    const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
    const candidate = `LBN-${stamp}-${randomInt(100000, 999999)}`;
    if (!await Order.exists({ orderNumber: candidate }).session(session)) return candidate;
  }
  throw new ApiError(500, 'ORDER_NUMBER_FAILED', 'Could not allocate an order number');
}

export function toOrderDTO(order: any): OrderDTO {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerID: order.customerID ?? null,
    customer: order.customer,
    address: order.address,
    branchID: order.branchID,
    items: order.items,
    currencyCode: order.currencyCode,
    subtotalMinor: order.subtotalMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    discountMinor: order.discountMinor,
    totalMinor: order.totalMinor,
    couponCode: order.couponCode ?? '',
    payment: order.payment,
    status: order.status,
    statusHistory: (order.statusHistory?.length ? order.statusHistory : [{ status: order.status, at: new Date(order.createdAt).toISOString(), actorID: null }]).map((item: any) => ({ status: item.status, at: new Date(item.at).toISOString(), actorID: item.actorID ?? null })),
    createdAt: new Date(order.createdAt).toISOString(),
    updatedAt: new Date(order.updatedAt).toISOString(),
  };
}
