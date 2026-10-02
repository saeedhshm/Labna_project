import { Router } from 'express';
import { dashboardMetrics, dashboardQuery, type OrderStatus } from '@labna/contracts';
import { Inventory, Order, Store } from './database.js';
import { respond } from './http.js';

const statuses: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];

export function dashboardRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = dashboardQuery.parse(req.query);
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86400_000);
    const range = { createdAt: { $gte: from, $lte: to } };
    const salesFilter = { ...range, status: { $ne: 'cancelled' } };
    const [store, totals, statusRows, topProducts, lowStockCount, outOfStockCount, salesByDay, salesByWeek] = await Promise.all([
      Store.findOne({ id: 'store' }).lean(),
      Order.aggregate([{ $match: salesFilter }, { $group: { _id: null, revenueMinor: { $sum: '$totalMinor' }, ordersCount: { $sum: 1 } } }]),
      Order.aggregate([{ $match: range }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: salesFilter },
        { $unwind: '$items' },
        { $group: { _id: '$items.productID', name: { $first: '$items.productName' }, unitsSold: { $sum: '$items.quantity' }, revenueMinor: { $sum: '$items.lineTotalMinor' } } },
        { $sort: { unitsSold: -1, revenueMinor: -1, _id: 1 } },
        { $limit: 10 },
        { $project: { _id: 0, productID: '$_id', name: 1, unitsSold: 1, revenueMinor: 1 } },
      ]),
      Inventory.countDocuments({ $expr: { $lte: [{ $subtract: ['$onHand', '$reserved'] }, '$lowStockThreshold'] } }),
      Inventory.countDocuments({ $expr: { $eq: [{ $subtract: ['$onHand', '$reserved'] }, 0] } }),
      Order.aggregate([
        { $match: salesFilter },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, revenueMinor: { $sum: '$totalMinor' }, ordersCount: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', revenueMinor: 1, ordersCount: 1 } },
      ]),
      Order.aggregate([
        { $match: salesFilter },
        { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$createdAt', timezone: 'UTC' } }, revenueMinor: { $sum: '$totalMinor' }, ordersCount: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, week: '$_id', revenueMinor: 1, ordersCount: 1 } },
      ]),
    ]);
    const total = totals[0] ?? { revenueMinor: 0, ordersCount: 0 };
    const ordersByStatus = Object.fromEntries(statuses.map(status => [status, 0])) as Record<OrderStatus, number>;
    for (const row of statusRows) ordersByStatus[row._id as OrderStatus] = row.count;
    const result = dashboardMetrics.parse({
      range: { from: from.toISOString(), to: to.toISOString() },
      currencyCode: store?.currencyCode ?? 'EGP',
      revenueMinor: total.revenueMinor,
      ordersCount: total.ordersCount,
      averageOrderValueMinor: total.ordersCount ? Math.round(total.revenueMinor / total.ordersCount) : 0,
      ordersByStatus,
      topProducts,
      lowStockCount,
      outOfStockCount,
      salesByDay,
      salesByWeek,
    });
    respond(res, result);
  });

  return router;
}
