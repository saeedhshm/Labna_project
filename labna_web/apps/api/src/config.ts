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
});
export type Config = z.infer<typeof schema>;
export const readConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const config = schema.parse(env);
  if (config.NODE_ENV === 'production' && config.WEB_ORIGINS.some(origin => !origin.startsWith('https://'))) {
    throw new Error('Production web origins must use HTTPS');
  }
  return config;
};
