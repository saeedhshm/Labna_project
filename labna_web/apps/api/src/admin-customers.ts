import { Router } from 'express';
import { adminCustomerQuery, customerStatusPatch, pageQuery } from '@labna/contracts';
import type { Config } from './config.js';
import { Customer, CustomerSession, Order } from './database.js';
import { ApiError, pagination, respond } from './http.js';
import { toOrderDTO } from './orders.js';

const currencyCode = 'EGP';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function customerDTO(customer: any, metrics: any) {
  return {
    id: customer.id,
    name: customer.name,
    phoneNumber: customer.phoneNumber,
    email: customer.email,
    isActive: customer.isActive !== false,
    addresses: customer.addresses ?? [],
    createdAt: new Date(customer.createdAt).toISOString(),
    updatedAt: new Date(customer.updatedAt).toISOString(),
    metrics,
  };
}

function emptyMetrics() {
  return { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, totalSpentMinor: 0, currencyCode };
}

async function customerMetrics(customerID: string) {
  const [metrics] = await Order.aggregate([
    { $match: { customerID } },
    {
      $group: {
        _id: '$customerID',
        totalOrders: { $sum: 1 },
        completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        totalSpentMinor: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totalMinor', 0] } },
      },
    },
  ]);
  if (!metrics) return emptyMetrics();
  return { totalOrders: metrics.totalOrders, completedOrders: metrics.completedOrders, cancelledOrders: metrics.cancelledOrders, totalSpentMinor: metrics.totalSpentMinor, currencyCode };
}

export function adminCustomersRouter(config: Config) {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = adminCustomerQuery.parse(req.query);
    const { cursor: _cursor, ...cursorScope } = query;
    const page = pagination(config.CURSOR_SECRET, ['admin-customers', cursorScope], query.cursor);
    const match: Record<string, unknown> = {};
    if (query.status) match.isActive = query.status === 'active';
    if (query.q) {
      const pattern = escapeRegex(query.q);
      match.$or = [
        { name: { $regex: pattern, $options: 'i' } },
        { email: { $regex: pattern, $options: 'i' } },
        { phoneNumber: { $regex: pattern, $options: 'i' } },
      ];
    }
    const sorts: Record<typeof query.sort, Record<string, 1 | -1>> = {
      joinedAsc: { createdAt: 1, id: 1 },
      joinedDesc: { createdAt: -1, id: 1 },
      nameAsc: { name: 1, id: 1 },
      nameDesc: { name: -1, id: 1 },
      ordersDesc: { ordersCount: -1, createdAt: -1, id: 1 },
      spentDesc: { totalSpentMinor: -1, createdAt: -1, id: 1 },
    };
    const sort = sorts[query.sort];
    const items = await Customer.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'orders',
          localField: 'id',
          foreignField: 'customerID',
          pipeline: [{ $group: { _id: null, ordersCount: { $sum: 1 }, totalSpentMinor: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$totalMinor', 0] } } } }],
          as: 'orderStats',
        },
      },
      { $set: { ordersCount: { $ifNull: [{ $first: '$orderStats.ordersCount' }, 0] }, totalSpentMinor: { $ifNull: [{ $first: '$orderStats.totalSpentMinor' }, 0] } } },
      { $project: { _id: 0, id: 1, name: 1, phoneNumber: 1, email: 1, isActive: 1, ordersCount: 1, totalSpentMinor: 1, createdAt: 1, updatedAt: 1 } },
      { $sort: sort },
      { $skip: page.offset },
      { $limit: query.limit + 1 },
    ]);
    respond(res, items.slice(0, query.limit).map(item => ({ ...item, createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() })), { nextCursor: page.next(query.limit, items.length > query.limit) });
  });

  router.get('/:id', async (req, res) => {
    const customer = await Customer.findOne({ id: req.params.id }).select('-_id id name phoneNumber email isActive addresses createdAt updatedAt').lean();
    if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
    respond(res, customerDTO(customer, await customerMetrics(customer.id)));
  });

  router.get('/:id/metrics', async (req, res) => {
    if (!await Customer.exists({ id: req.params.id })) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
    respond(res, await customerMetrics(req.params.id));
  });

  router.get('/:id/orders', async (req, res) => {
    if (!await Customer.exists({ id: req.params.id })) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
    const { cursor, limit } = pageQuery.parse(req.query);
    const page = pagination(config.CURSOR_SECRET, ['admin-customer-orders', req.params.id, limit], cursor);
    const items = await Order.find({ customerID: req.params.id }).sort({ createdAt: -1, id: 1 }).skip(page.offset).limit(limit + 1).lean();
    respond(res, items.slice(0, limit).map(toOrderDTO), { nextCursor: page.next(limit, items.length > limit) });
  });

  router.patch('/:id/status', async (req, res) => {
    const input = customerStatusPatch.parse(req.body);
    const customer = await Customer.findOneAndUpdate({ id: req.params.id }, { $set: { isActive: input.isActive } }, { new: true }).select('-_id id name phoneNumber email isActive addresses createdAt updatedAt').lean();
    if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
    if (!input.isActive) await CustomerSession.updateMany({ customerID: req.params.id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    respond(res, customerDTO(customer, await customerMetrics(customer.id)));
  });

  return router;
}
