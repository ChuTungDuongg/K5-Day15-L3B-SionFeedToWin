import '../load-env.js';
import { loadEnv } from '@vintrip/config';
import { createPool } from '@vintrip/db';
import { z } from 'zod';
import { ensureInboxSchema } from '../inbox/inbox.schema.js';

const env = loadEnv(z.object({ DATABASE_URL_NOTIFICATION: z.string().min(1) }));
const pool = createPool({
  url: env.DATABASE_URL_NOTIFICATION,
  max: 1,
  applicationName: 'migrate:notification',
});

try {
  await ensureInboxSchema(pool);
  process.stdout.write('notification: đã migrate\n');
} finally {
  await pool.end();
}
