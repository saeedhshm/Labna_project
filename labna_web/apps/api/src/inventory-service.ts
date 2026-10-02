import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  inventoryAdjustmentCommand,
  inventoryDTO,
  inventoryThresholdPatch,
  type InventoryAdjustmentCommand,
  type InventoryDTO,
  type InventoryThresholdPatch,
} from '@labna/contracts';
import { IdempotencyRecord, Inventory, InventoryMovement } from './database.js';
import { ApiError } from './http.js';

const adjustmentRoute = '/admin/inventory/adjustments';
const hashPayload = (payload: unknown) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

export function toInventoryDTO(row: {
  id: string; branchID: string; variantID: string; onHand: number; reserved: number;
  lowStockThreshold: number; version: number; updatedAt: Date;
}): InventoryDTO {
  const available = row.onHand - row.reserved;
  return inventoryDTO.parse({
    id: row.id,
    branchID: row.branchID,
    variantID: row.variantID,
    onHand: row.onHand,
    reserved: row.reserved,
    available,
    lowStockThreshold: row.lowStockThreshold,
    lowStock: available <= row.lowStockThreshold,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
}

type StoredResponse = { data: InventoryDTO; meta: { requestID: string } };

function replay(record: { payloadHash: string; response: unknown; status: number }, payloadHash: string) {
  if (record.payloadHash !== payloadHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with a different payload');
  return { status: record.status, body: record.response as StoredResponse };
}

export async function adjustInventory(
  command: InventoryAdjustmentCommand,
  key: string,
  actorID: string,
  requestID: string,
) {
  command = inventoryAdjustmentCommand.parse(command);
  const payloadHash = hashPayload(command);
  const existing = await IdempotencyRecord.findOne({ subject: actorID, route: adjustmentRoute, key }).lean();
  if (existing) return replay(existing, payloadHash);

  try {
    return await mongoose.connection.transaction(async session => {
      const recorded = await IdempotencyRecord.findOne({ subject: actorID, route: adjustmentRoute, key }).session(session).lean();
      if (recorded) return replay(recorded, payloadHash);

      const current = await Inventory.findOne({ branchID: command.branchID, variantID: command.variantID }).session(session);
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'Inventory row not found');
      if (current.version !== command.version) throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh inventory and retry');
      const nextOnHand = current.onHand + command.onHandDelta;
      if (!Number.isSafeInteger(nextOnHand) || nextOnHand > 1_000_000_000 || nextOnHand < current.reserved || current.reserved < 0) {
        throw new ApiError(409, 'INVENTORY_CONSTRAINT', 'Adjustment would make on-hand stock lower than reserved stock');
      }

      current.onHand = nextOnHand;
      current.version += 1;
      await current.save({ session });
      await InventoryMovement.create([{
        id: randomUUID(), inventoryID: current.id, orderID: null,
        onHandDelta: command.onHandDelta, reservedDelta: 0, reason: command.reason,
        actorID, commandID: key,
      }], { session });
      const response: StoredResponse = { data: toInventoryDTO(current), meta: { requestID } };
      await IdempotencyRecord.create([{
        subject: actorID, route: adjustmentRoute, key, payloadHash, status: 200, response,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      }], { session });
      return { status: 200, body: response };
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const recorded = await IdempotencyRecord.findOne({ subject: actorID, route: adjustmentRoute, key }).lean();
      if (recorded) return replay(recorded, payloadHash);
    }
    throw error;
  }
}

export async function patchInventoryThreshold(inventoryID: string, rawPatch: InventoryThresholdPatch) {
  const patch = inventoryThresholdPatch.parse(rawPatch);
  const updated = await Inventory.findOneAndUpdate(
    { id: inventoryID, version: patch.version },
    { $set: { lowStockThreshold: patch.lowStockThreshold }, $inc: { version: 1 } },
    { new: true },
  );
  if (updated) return toInventoryDTO(updated);
  if (!await Inventory.exists({ id: inventoryID })) throw new ApiError(404, 'NOT_FOUND', 'Inventory row not found');
  throw new ApiError(409, 'VERSION_CONFLICT', 'Refresh inventory and retry');
}
