/**
 * The API and the admin panel import the same schemas, so a payload that the UI
 * considers valid cannot be rejected by the server for a different reason.
 * Keep server-only rules (media host allowlist, inventory invariants) in code.
 */
export * from '@labna/contracts';
