import { Router } from 'express';
import mongoose, { type ClientSession } from 'mongoose';
import { randomInt, randomUUID } from 'node:crypto';
import { checkoutRequest, type CheckoutRequest, type OrderDTO, type OrderItemDTO } from '@labna/contracts';
import { Inventory, InventoryMovement, Order, Store, models } from './database.js';
import { ApiError, respond } from './http.js';

const deliveryFeeMinor = 1500;
const demoCoupon = 'LABNA10';

export function ordersRouter() {
  const router = Router();

  router.post('/orders', async (req, res) => {
    const input = checkoutRequest.parse(req.body);
    if (input.paymentMethod === 'demo_card_failure') throw new ApiError(402, 'PAYMENT_FAILED', 'Demo card payment failed');
    const order = await createOrder(input);
    respond(res, order, {}, 201);
  });

  router.get('/orders/:id', async (req, res) => {
    const order = await Order.findOne({ $or: [{ id: req.params.id }, { orderNumber: req.params.id }] }).lean();
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    respond(res, toOrderDTO(order));
  });

  return router;
}

async function createOrder(input: CheckoutRequest) {
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
    const [order] = await Order.create([{ id: orderID, orderNumber, customerID: input.customerID ?? null, customer: input.customer, address: input.address, branchID, items, currencyCode: store?.currencyCode ?? items[0]?.currencyCode ?? 'EGP', subtotalMinor, deliveryFeeMinor, discountMinor, totalMinor, couponCode: input.couponCode.toUpperCase(), payment: { method: input.paymentMethod, status: paymentStatus, providerReference: paymentStatus === 'paid' ? `demo_${randomUUID()}` : null }, status: 'pending' }], { session });
    return toOrderDTO(order.toObject());
  });
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

function toOrderDTO(order: any): OrderDTO {
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
    createdAt: new Date(order.createdAt).toISOString(),
    updatedAt: new Date(order.updatedAt).toISOString(),
  };
}
