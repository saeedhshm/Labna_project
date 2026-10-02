import { z } from 'zod';
import {
  schemas, resources, id, loginBody, settingsPatch, versionBody,
  inventoryDTO, inventoryMovementDTO, inventoryAdjustmentCommand, inventoryThresholdPatch,
} from './contracts.js';

const json = (schema: z.ZodType) => {
  const { $schema, ...result } = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  return result;
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const envelope = (data: object, paged = false) => ({ type: 'object', required: ['data', 'meta'], properties: {
  data, meta: { type: 'object', required: ['requestID', ...(paged ? ['nextCursor'] : [])], properties: {
    requestID: { type: 'string' }, nextCursor: { type: ['string', 'null'] }, branchID: { type: 'string' },
  } },
} });
const body = (schema: object) => ({ required: true, content: { 'application/json': { schema } } });
const response = (schema: object) => ({ description: 'Success', content: { 'application/json': { schema } } });
const failure = { $ref: '#/components/responses/Error' };
const errors = { '400': failure, '401': failure, '403': failure, '404': failure, '409': failure, '422': failure, '429': failure, '500': failure, '503': failure };
const param = { name: 'id', in: 'path', required: true, schema: json(id) };
const pagination = [
  { name: 'cursor', in: 'query', schema: { type: 'string' } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const bearer = [{ staffBearer: [] }];
const conditional = { name: 'If-None-Match', in: 'header', schema: { type: 'string' } };
const namedSchemas: Record<string, object> = {
  Error: { type: 'object', required: ['error', 'meta'], properties: {
    error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } },
    meta: { type: 'object', required: ['requestID'], properties: { requestID: { type: 'string' } } },
  } },
};
namedSchemas.Inventory = json(inventoryDTO);
namedSchemas.InventoryMovement = json(inventoryMovementDTO);
namedSchemas.InventoryAdjustment = json(inventoryAdjustmentCommand);
namedSchemas.InventoryThresholdPatch = json(inventoryThresholdPatch);
const paths: Record<string, any> = {};
for (const resource of resources) {
  const schema = schemas[resource];
  namedSchemas[`${resource}Create`] = json(schema.extend({ id }));
  namedSchemas[`${resource}Patch`] = json(schema.partial().extend({ version: z.number().int().min(0) }));
  namedSchemas[`${resource}Admin`] = json(schema.extend({ id, version: z.number().int().min(0) }));
  paths[`/admin/${resource}`] = {
    get: { tags: ['Administration'], summary: `List ${resource}`, security: bearer, parameters: pagination, responses: { '200': response(envelope({ type: 'array', items: ref(`${resource}Admin`) }, true)), ...errors } },
    post: { tags: ['Administration'], summary: `Create ${resource}`, security: bearer, requestBody: body(ref(`${resource}Create`)), responses: { '201': response(envelope(ref(`${resource}Admin`))), ...errors } },
  };
  paths[`/admin/${resource}/{id}`] = {
    parameters: [param],
    get: { tags: ['Administration'], security: bearer, responses: { '200': response(envelope(ref(`${resource}Admin`))), ...errors } },
    patch: { tags: ['Administration'], security: bearer, requestBody: body(ref(`${resource}Patch`)), responses: { '200': response(envelope(ref(`${resource}Admin`))), ...errors } },
    delete: { tags: ['Administration'], security: bearer, requestBody: body(json(versionBody)), responses: { '200': response(envelope({ type: 'object', required: ['archived'], properties: { archived: { const: true } } })), ...errors } },
  };
}
const publicVariant = schemas.products.shape.variants.element.omit({ sku: true, isActive: true }).extend({ isAvailable: z.boolean(), availableQuantity: z.number().int().min(0) });
namedSchemas.productsPublic = json(schemas.products.omit({ publicationStatus: true, variants: true }).extend({ id, isDemo: z.literal(false), variants: z.array(publicVariant) }));
namedSchemas.categoriesPublic = json(schemas.categories.extend({ id }));
namedSchemas.bannersPublic = json(schemas.banners.omit({ isActive: true }).extend({ id }));
namedSchemas.branchesPublic = json(schemas.branches.omit({ isVisible: true, dateOverrides: true }).extend({ id, isDemo: z.literal(false), isOpen: z.boolean(), nextOpensAt: z.string().nullable() }));
const storeSchema = { type: 'object', required: ['id', 'version', 'currencyCode', 'defaultPickupBranchID', 'acceptOutsideHours', 'contact', 'policies'], properties: {
  id: { const: 'store' }, version: { type: 'integer' }, currencyCode: { type: 'string' }, defaultPickupBranchID: { type: ['string', 'null'] }, acceptOutsideHours: { const: true }, contact: { type: 'string' }, policies: { type: 'string' },
} };
for (const resource of resources) {
  const params: object[] = [...pagination, conditional];
  if (resource === 'products') {
    for (const name of ['branchID', 'categoryID', 'q']) params.push({ name, in: 'query', schema: { type: 'string' } });
    for (const name of ['featured', 'available']) params.push({ name, in: 'query', schema: { type: 'boolean' } });
    for (const name of ['minPriceMinor', 'maxPriceMinor']) params.push({ name, in: 'query', schema: { type: 'integer', minimum: 0 } });
    params.push({ name: 'locale', in: 'query', schema: { type: 'string', enum: ['ar', 'en'], default: 'en' } }, { name: 'sort', in: 'query', schema: { type: 'string', enum: ['featured', 'name', 'priceAsc', 'priceDesc'], default: 'featured' } });
  }
  paths[`/${resource}`] = { get: { tags: ['Catalog'], parameters: params, responses: { '200': response(envelope({ type: 'array', items: ref(`${resource}Public`) }, true)), '304': { description: 'Not modified' }, ...errors } } };
  if (resource === 'products' || resource === 'branches') paths[`/${resource}/{id}`] = { get: { tags: ['Catalog'], parameters: [param, conditional, ...(resource === 'products' ? [{ name: 'branchID', in: 'query', schema: json(id) }] : [])], responses: { '200': response(envelope(ref(`${resource}Public`))), '304': { description: 'Not modified' }, ...errors } } };
}
paths['/store'] = { get: { tags: ['Catalog'], responses: { '200': response(envelope(storeSchema)), '304': { description: 'Not modified' }, ...errors } } };
paths['/admin/settings'] = {
  get: { security: bearer, responses: { '200': response(envelope(storeSchema)), ...errors } },
  patch: { security: bearer, requestBody: body(json(settingsPatch)), responses: { '200': response(envelope({ type: 'object', required: ['id', 'version', 'defaultPickupBranchID'], properties: { id: { const: 'store' }, version: { type: 'integer' }, defaultPickupBranchID: { type: 'string' } } })), ...errors } },
};
const lowStockParameter = { name: 'lowStock', in: 'query', schema: { type: 'boolean' } };
const idempotencyKey = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } };
paths['/admin/inventory'] = {
  get: {
    tags: ['Inventory'], summary: 'List inventory (all authenticated staff)', security: bearer,
    parameters: [...pagination, lowStockParameter,
      { name: 'branchID', in: 'query', schema: json(id) }, { name: 'variantID', in: 'query', schema: json(id) }],
    responses: { '200': response(envelope({ type: 'array', items: ref('Inventory') }, true)), ...errors },
  },
};
paths['/admin/inventory/adjustments'] = {
  post: {
    tags: ['Inventory'], summary: 'Adjust on-hand inventory (manager only)', security: bearer,
    parameters: [idempotencyKey], requestBody: body(ref('InventoryAdjustment')),
    responses: { '200': response(envelope(ref('Inventory'))), ...errors },
  },
};
paths['/admin/inventory/movements'] = {
  get: {
    tags: ['Inventory'], summary: 'List inventory movements (manager only)', security: bearer,
    parameters: [...pagination,
      { name: 'inventoryID', in: 'query', schema: { type: 'string', format: 'uuid' } },
      { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
      { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } }],
    responses: { '200': response(envelope({ type: 'array', items: ref('InventoryMovement') }, true)), ...errors },
  },
};
paths['/admin/inventory/{id}'] = {
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  patch: {
    tags: ['Inventory'], summary: 'Update low-stock threshold (manager only)', security: bearer,
    requestBody: body(ref('InventoryThresholdPatch')),
    responses: { '200': response(envelope(ref('Inventory'))), ...errors },
  },
};
const sessionSchema = envelope({ type: 'object', required: ['accessToken', 'expiresIn'], properties: { accessToken: { type: 'string' }, expiresIn: { const: 900 } } });
paths['/staff/auth/login'] = { post: { tags: ['Staff authentication'], requestBody: body(json(loginBody)), responses: { '200': { ...response(sessionSchema), headers: { 'Set-Cookie': { schema: { type: 'string' }, description: 'HttpOnly refresh cookie; Secure in production' } } }, ...errors } } };
paths['/staff/auth/refresh'] = { post: { tags: ['Staff authentication'], security: [{ staffRefresh: [] }], parameters: [{ name: 'Origin', in: 'header', required: true, schema: { type: 'string' } }], responses: { '200': response(sessionSchema), ...errors } } };
paths['/staff/auth/logout'] = { post: { tags: ['Staff authentication'], security: bearer, responses: { '200': response(envelope({ type: 'object', properties: { loggedOut: { const: true } } })), ...errors } } };
export const openapi = {
  openapi: '3.1.0', info: { title: 'Labna API', version: '0.1.0', description: 'Implemented catalog, branches, staff authentication and inventory administration. Inventory listing is available to authenticated staff; inventory adjustments, movement history and threshold changes require manager role. Customer auth, checkout and uploads are planned, not implemented. Media URLs must use MEDIA_ORIGINS. Pagination uses signed, filter-bound offset cursors (maximum 10,000); concurrent edits may shift pages.' },
  servers: [{ url: '/api/v1' }], paths,
  components: { schemas: namedSchemas, responses: { Error: { description: 'Structured API error', content: { 'application/json': { schema: ref('Error') } } } }, securitySchemes: {
    staffBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    staffRefresh: { type: 'apiKey', in: 'cookie', name: 'labna_staff_refresh' },
  } },
};
