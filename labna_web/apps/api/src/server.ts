import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { initializeDatabase } from './database.js';
import { createApp } from './app.js';

const config = readConfig();
await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
if (!hello.setName) throw new Error('MongoDB replica set is required for catalog transactions');
await initializeDatabase();
const server = createApp(config).listen(config.PORT, () => console.info(`Labna API listening on port ${config.PORT}`));
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await mongoose.disconnect(); clearTimeout(timeout); process.exit(0); });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
