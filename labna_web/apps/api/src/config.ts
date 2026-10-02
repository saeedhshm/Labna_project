import { z } from 'zod';

const origins = z.string().min(1).transform(value => value.split(',').map(item => new URL(item.trim()).origin));
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(64),
  CURSOR_SECRET: z.string().min(64),
  WEB_ORIGINS: origins,
  MEDIA_ORIGINS: origins,
  SEED_ADMIN_EMAIL: z.email().toLowerCase().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).max(200).optional(),
  SEED_STOCK_ON_HAND: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export type Config = z.infer<typeof schema>;

/** Names of the settings that are missing or invalid, for a readable failure. */
function reportIssues(error: z.ZodError): never {
  const hints: Record<string, string> = {
    JWT_SECRET: 'generate with: openssl rand -hex 32',
    CURSOR_SECRET: 'generate separately with: openssl rand -hex 32',
    MONGODB_URI: 'set the database connection string, or run: docker compose up -d --wait',
    WEB_ORIGINS: 'list the browser origins, e.g. http://localhost:5174',
    MEDIA_ORIGINS: 'list the image hosts, e.g. https://images.unsplash.com,https://res.cloudinary.com',
  };
  const lines = error.issues.map(issue => {
    const name = String(issue.path[0] ?? '');
    if (issue.code === 'too_small' && (name === 'JWT_SECRET' || name === 'CURSOR_SECRET')) {
      return `  ${name} is empty or shorter than 64 characters — ${hints[name]}`;
    }
    if (name === 'SEED_ADMIN_PASSWORD' && issue.code === 'too_small') return '  SEED_ADMIN_PASSWORD needs at least 12 characters';
    return `  ${name || 'configuration'}: ${issue.message.toLowerCase()}`;
  });
  throw new Error(`Invalid configuration. Copy apps/api/.env.example to apps/api/.env and fill it in:\n${lines.join('\n')}\nSee labna_web/README.md for the full setup.`);
}

export const readConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const parsed = schema.safeParse(env);
  if (!parsed.success) reportIssues(parsed.error);
  const config = parsed.data;
  if (config.NODE_ENV === 'production' && config.WEB_ORIGINS.some(origin => !origin.startsWith('https://'))) {
    throw new Error('Production web origins must use HTTPS');
  }
  return config;
};
