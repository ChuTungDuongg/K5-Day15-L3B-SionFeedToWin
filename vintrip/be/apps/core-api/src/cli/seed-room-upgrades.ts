import '../platform/load-env.js';
import { parseArgs } from 'node:util';
import { loadEnv } from '@vintrip/config';
import { createDb, createPool } from '@vintrip/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createRoomUpgradeFixture } from '../modules/commerce/room-upgrades/infra/room-upgrade.fixture.js';
import { seedRoomUpgradeFixture, type SeedStaff } from '../modules/commerce/room-upgrades/infra/seed-room-upgrade-fixture.js';
import { localDate } from '../modules/commerce/room-upgrades/domain/quote-primitives.js';
import { coreEnvSchema } from '../platform/env.js';

const env = loadEnv(coreEnvSchema);
if (env.NODE_ENV === 'production') throw new Error('Không seed fixture/phân quyền C2 ở production.');
const { values } = parseArgs({ options: {
  date: { type: 'string' }, 'receptionist-user-id': { type: 'string' }, 'manager-user-id': { type: 'string' },
} });
const anchor = z.iso.date().parse(values.date ?? localDate(new Date(), 'Asia/Ho_Chi_Minh'));
const staff: SeedStaff[] = [];
for (const [option, role] of [['receptionist-user-id', 'RECEPTIONIST'], ['manager-user-id', 'MANAGER']] as const) {
  if (values[option]) staff.push({ userId: z.uuid().parse(values[option]), role });
}
if (new Set(staff.map((s) => s.userId)).size !== staff.length) throw new Error('Hai vai mẫu cần hai principal khác nhau.');
// Look identities up through the access connection, never cross-query access from a commerce pool.
if (staff.length) {
  const accessPool = createPool({ url: env.DATABASE_URL_ACCESS, max: 1, applicationName: 'seed:room-upgrades:identity-check' });
  try {
    for (const member of staff) {
      const found = await createDb(accessPool).execute<{ id: string }>(sql`select id from access.users where id = ${member.userId}::uuid`);
      if (found.rows.length !== 1) throw new Error('Principal phân công phải tồn tại trong hệ thống xác thực.');
    }
  } finally { await accessPool.end(); }
}
const pool = createPool({ url: env.DATABASE_URL_COMMERCE, max: 1, applicationName: 'seed:room-upgrades' });
try {
  const result = await seedRoomUpgradeFixture(createDb(pool), createRoomUpgradeFixture(anchor), staff);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!staff.length) process.stdout.write('Chưa phân công nhân viên; API C2 sẽ trả 403 cho tài khoản chưa được cấp quyền.\n');
} finally { await pool.end(); }
