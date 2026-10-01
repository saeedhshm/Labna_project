import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ErrorRequestHandler, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export function respond(res: Response, data: unknown, meta: Record<string, unknown> = {}, status = 200) {
  return res.status(status).json({ data, meta: { ...meta, requestID: res.locals.requestID } });
}
export function publicResponse(req: Request, res: Response, data: unknown, meta: Record<string, unknown> = {}) {
  // requestID must not influence the representation validator.
  const etag = `"${createHash('sha256').update(JSON.stringify({ data, meta })).digest('hex')}"`;
  res.set({ ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
  if (req.headers['if-none-match']?.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag || tag.trim() === '*')) return res.status(304).end();
  return respond(res, data, meta);
}
export function requestContext(_req: Request, res: Response, next: () => void) {
  res.locals.requestID = randomUUID();
  res.set('X-Request-ID', res.locals.requestID);
  next();
}
export const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  let fault = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  if (error instanceof ZodError) fault = new ApiError(422, 'VALIDATION_ERROR', 'Invalid input', error.issues.map(issue => ({ path: issue.path, message: issue.message })));
  else if (error?.code === 11000) fault = new ApiError(409, 'DUPLICATE_RESOURCE', 'Identifier or SKU already exists');
  else if (error?.type === 'entity.parse.failed') fault = new ApiError(400, 'INVALID_JSON', 'Malformed JSON');
  else if (error?.type === 'entity.too.large') fault = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  if (fault.status === 500) console.error(JSON.stringify({ requestID: res.locals.requestID, code: fault.code }));
  res.status(fault.status).json({ error: { code: fault.code, message: fault.message, ...(fault.details ? { details: fault.details } : {}) }, meta: { requestID: res.locals.requestID } });
};
export function pagination(secret: string, scope: unknown, cursor?: string) {
  const fingerprint = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url');
  let offset = 0;
  if (cursor) {
    try {
      const [body, signature, extra] = cursor.split('.');
      const expected = sign(body);
      if (extra || !signature || expected.length !== signature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
      const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (decoded.scope !== fingerprint || !Number.isSafeInteger(decoded.offset) || decoded.offset < 0 || decoded.offset > 10000) throw new Error();
      offset = decoded.offset;
    } catch { throw new ApiError(400, 'INVALID_CURSOR', 'Invalid cursor or mismatched filters'); }
  }
  return { offset, next: (limit: number, hasMore: boolean) => {
    if (!hasMore || offset + limit > 10000) return null;
    const body = Buffer.from(JSON.stringify({ scope: fingerprint, offset: offset + limit })).toString('base64url');
    return `${body}.${sign(body)}`;
  } };
}
