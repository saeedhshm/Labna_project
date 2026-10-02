import { Router } from 'express';
import { cartValidationRequest, type CartValidationItem } from '@labna/contracts';
import { Inventory, models, Store } from './database.js';
import { ApiError, respond } from './http.js';

export function cartRouter() {
  const router = Router();

  router.post('/cart/validate', async (req, res) => {
    const input = cartValidationRequest.parse(req.body);
    const store = await Store.findOne({ id: 'store' }).lean();
    const branchID = input.branchID ?? store?.defaultPickupBranchID;
    if (!branchID) throw new ApiError(503, 'NO_PICKUP_BRANCH', 'Configure a default pickup branch');
    const branch = await models.branches.findOne({ id: branchID, archivedAt: null, 'data.isVisible': true, 'data.pickupEnabled': true }).lean();
    if (!branch) throw new ApiError(422, 'INVALID_BRANCH', 'Select a visible pickup branch');

    const items: CartValidationItem[] = [];
    for (const requested of input.items) {
      const product = await models.products.findOne({ id: requested.productID, archivedAt: null, 'data.publicationStatus': 'published' }).lean();
      if (!product) {
        items.push(invalidItem(requested.productID, requested.variantID, requested.quantity, 'product_not_found'));
        continue;
      }
      const variant = product.data.variants.find((item: { id: string }) => item.id === requested.variantID);
      if (!variant) {
        items.push(invalidItem(requested.productID, requested.variantID, requested.quantity, 'variant_not_found', product.data));
        continue;
      }
      const stock = await Inventory.findOne({ branchID, variantID: requested.variantID }).lean();
      const availableQuantity = variant.isActive && branch.data.acceptsOrders ? Math.max(0, (stock?.onHand ?? 0) - (stock?.reserved ?? 0)) : 0;
      const reason = availableQuantity <= 0 ? 'unavailable' : requested.quantity > availableQuantity ? 'insufficient_stock' : 'ok';
      const valid = reason === 'ok';
      items.push({
        productID: requested.productID,
        variantID: requested.variantID,
        quantity: requested.quantity,
        productName: product.data.name,
        variantLabel: variant.label,
        imageURL: product.data.imageURLs[0],
        unit: variant.unit,
        variantQuantity: variant.quantity,
        currencyCode: variant.currencyCode,
        unitPriceMinor: variant.priceMinor,
        lineTotalMinor: valid ? requested.quantity * variant.priceMinor : 0,
        availableQuantity,
        valid,
        reason,
      });
    }

    respond(res, {
      branchID,
      currencyCode: store?.currencyCode ?? 'EGP',
      items,
      subtotalMinor: items.reduce((sum, item) => sum + item.lineTotalMinor, 0),
      valid: items.every(item => item.valid),
    });
  });

  return router;
}

function invalidItem(
  productID: string,
  variantID: string,
  quantity: number,
  reason: 'product_not_found' | 'variant_not_found',
  product?: { name?: unknown; imageURLs?: unknown },
): CartValidationItem {
  const fallbackText = { ar: 'غير متوفر', en: 'Unavailable' };
  return {
    productID,
    variantID,
    quantity,
    productName: product?.name as CartValidationItem['productName'] ?? fallbackText,
    variantLabel: fallbackText,
    imageURL: Array.isArray(product?.imageURLs) && typeof product.imageURLs[0] === 'string' ? product.imageURLs[0] : 'https://res.cloudinary.com/labna/image/upload/missing.png',
    unit: 'ml',
    variantQuantity: 1,
    currencyCode: 'EGP',
    unitPriceMinor: 0,
    lineTotalMinor: 0,
    availableQuantity: 0,
    valid: false,
    reason,
  };
}
