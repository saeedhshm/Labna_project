import mongoose from 'mongoose';
import { hash } from '@node-rs/argon2';
import { z } from 'zod';
import { readConfig } from './config.js';
import { initializeDatabase, Staff } from './database.js';

const config = readConfig();
const input = z.object({ SEED_ADMIN_EMAIL: z.email().toLowerCase(), SEED_ADMIN_PASSWORD: z.string().min(12).max(200) }).parse(process.env);
try {
  await mongoose.connect(config.MONGODB_URI);
  await initializeDatabase();
  await Staff.updateOne({ email: input.SEED_ADMIN_EMAIL }, { $setOnInsert: {
    email: input.SEED_ADMIN_EMAIL, passwordHash: await hash(input.SEED_ADMIN_PASSWORD), role: 'manager', status: 'active',
  } }, { upsert: true });
  console.info('Manager bootstrap completed; existing credentials were not changed.');
} finally { await mongoose.disconnect(); }
