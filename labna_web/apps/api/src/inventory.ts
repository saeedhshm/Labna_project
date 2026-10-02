import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  inventoryAdjustmentCommand,
  inventoryListQuery,
  inventoryMovementDTO,
  inventoryMovementQuery,
  inventoryThresholdPatch,
} from '@labna/contracts';
import type { Config } from './config.js';
import { Inventory, InventoryMovement } from './database.js';
import { ApiError, pagination, respond } from './http.js';
import { adjustInventory, patchInventoryThreshold, toInventoryDTO } from './inventory-service.js';

export function inventoryRouter(config: Config, requireManager: RequestHandler) {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = inventoryListQuery.parse(req.query);
    const { cursor, limit, lowStock, outOfStock, ...fields } = query;
    const page = pagination(config.CURSOR_SECRET, ['inventory', fields, lowStock, outOfStock, limit], cursor);
    const filter: Record<string, unknown> = { ...fields };
    const expressions: Record<string, unknown>[] = [];
    const available = { $subtract: ['$onHand', '$reserved'] };
    if (lowStock !== undefined) {
      const comparison = { $lte: [available, '$lowStockThreshold'] };
      expressions.push(lowStock ? comparison : { $not: [comparison] });
    }
    if (outOfStock !== undefined) expressions.push(outOfStock ? { $eq: [available, 0] } : { $gt: [available, 0] });
    if (expressions.length === 1) filter.$expr = expressions[0];
    else if (expressions.length > 1) filter.$expr = { $and: expressions };
    const items = await Inventory.find(filter).sort({ id: 1 }).skip(page.offset).limit(limit + 1).lean();
    respond(res, items.slice(0, limit).map(toInventoryDTO), { nextCursor: page.next(limit, items.length > limit) });
  });

  router.post('/adjustments', requireManager, async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Idempotency-Key must be a UUID');
    }
    const result = await adjustInventory(
      inventoryAdjustmentCommand.parse(req.body), key.toLowerCase(), res.locals.staff.id, res.locals.requestID,
    );
    res.status(result.status).json(result.body);
  });

  router.get('/movements', requireManager, async (req, res) => {
    const query = inventoryMovementQuery.parse(req.query);
    const { cursor, limit, from, to, ...fields } = query;
    const page = pagination(config.CURSOR_SECRET, ['inventory-movements', fields, from, to, limit], cursor);
    const filter: Record<string, any> = { ...fields };
    if (from || to) filter.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const items = await InventoryMovement.find(filter).sort({ createdAt: -1, id: 1 }).skip(page.offset).limit(limit + 1).lean();
    const data = items.slice(0, limit).map(item => inventoryMovementDTO.parse({
      id: item.id, inventoryID: item.inventoryID, orderID: item.orderID,
      onHandDelta: item.onHandDelta, reservedDelta: item.reservedDelta,
      reason: item.reason, actorID: item.actorID, commandID: item.commandID,
      createdAt: item.createdAt.toISOString(),
    }));
    respond(res, data, { nextCursor: page.next(limit, items.length > limit) });
  });

  router.patch('/:id', requireManager, async (req, res) => {
    respond(res, await patchInventoryThreshold(z.uuid().parse(req.params.id), inventoryThresholdPatch.parse(req.body)));
  });
  return router;
}
