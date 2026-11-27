import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule, InvalidAccessTokenError, MemorySidBlocklist } from '@vintrip/auth';
import { buildDrizzleToken, createDb, createPool, createTransactionalPlugins, MODULES, type Db } from '@vintrip/db';
import { migrateModule, startPostgres, type PostgresFixture } from '@vintrip/testing';
import { and, eq, sql } from 'drizzle-orm';
import { ClsModule } from 'nestjs-cls';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyGlobalPrefix } from '../../../../platform/http.js';
import { properties, roomInventory, roomRates, roomTypes } from '../../db/schema/catalog.js';
import { upgradeHotels, upgradeRoomInventory, upgradeRoomRates } from '../../db/schema/room-upgrades.js';
import { ROOM_UPGRADE_CLOCK } from '../application/room-upgrade.ports.js';
import { RoomUpgradesModule } from '../room-upgrades.module.js';
import { createRoomUpgradeFixture, DEMO_HOTEL_ID } from './room-upgrade.fixture.js';
import { DrizzleRoomUpgradeStore } from './drizzle-room-upgrade.store.js';
import { seedRoomUpgradeFixture } from './seed-room-upgrade-fixture.js';

const actor = '00000000-0000-4000-8000-000000000001';
const fixture = createRoomUpgradeFixture('2026-12-10');
const route = '/api/commerce/room-upgrades';
const body = { hotelId: DEMO_HOTEL_ID, bookingCode: 'C2-0001', targetRoomTypeId: 'DLX', effectiveAt: '2026-12-11T14:00:00+07:00' };

describe('room-upgrades: PostgreSQL migration, authorization, snapshot and side-effect isolation', () => {
  let postgres: PostgresFixture | undefined;
  let pool: pg.Pool;
  let db: Db;
  let app: INestApplication;
  beforeAll(async () => {
    let url = process.env.ROOM_UPGRADE_TEST_DATABASE_URL;
    if (url) {
      if (!/^\/room_upgrade_test_[a-z0-9_]+$/.test(new URL(url).pathname)) throw new Error('External test URL must target a dedicated room_upgrade_test_* database.');
    } else { postgres = await startPostgres(); url = postgres.buildModuleUrl('commerce'); }
    await migrateModule({ url, module: 'commerce', migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)) });
    pool = createPool({ url, max: 2, applicationName: 'room-upgrades-integration' }); db = createDb(pool);
    await seedRoomUpgradeFixture(db, fixture, [{ userId: actor, role: 'RECEPTIONIST' }]);
    await db.insert(properties).values({ id: 'operational-sentinel', slug: 'operational-sentinel', name: 'Test sentinel', provinceSlug: 'test', provinceName: 'Mô phỏng' }).onConflictDoNothing();
    await db.insert(roomTypes).values({ id: 'operational-STD', propertyId: 'operational-sentinel', code: 'STD', name: 'Sentinel',
      maxGuests: 2, defaultTotal: 10, defaultPrice: 999_999, ratePlans: [] }).onConflictDoNothing();
    await db.insert(roomInventory).values({ roomTypeId: 'operational-STD', date: '2026-12-11', total: 10, held: 1, sold: 3 }).onConflictDoNothing();
    await db.insert(roomRates).values({ roomTypeId: 'operational-STD', date: '2026-12-11', price: 999_999 }).onConflictDoNothing();
    @Global()
    @Module({ providers: MODULES.map((m) => ({ provide: buildDrizzleToken(m), useValue: db })), exports: MODULES.map((m) => buildDrizzleToken(m)) })
    class TestDatabaseModule {}
    const module = await Test.createTestingModule({ imports: [
      TestDatabaseModule,
      ClsModule.forRoot({ global: true, middleware: { mount: true }, plugins: createTransactionalPlugins([TestDatabaseModule]) }),
      AuthModule.forRootAsync({ useFactory: () => ({ verifier: async (token: string) => {
        if (token !== 'receptionist') throw new InvalidAccessTokenError();
        return { userId: actor, role: 'member' as const, sid: 'integration-session', exp: 9_999_999_999 };
      }, blocklist: new MemorySidBlocklist() }) }), RoomUpgradesModule,
    ] }).overrideProvider(ROOM_UPGRADE_CLOCK).useValue(() => new Date('2026-12-10T08:00:00+07:00')).compile();
    app = module.createNestApplication(); applyGlobalPrefix(app); await app.init();
  });
  afterAll(async () => { await app?.close(); await pool?.end(); await postgres?.stop(); });

  const quote = () => request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' }).send(body);
  const operationalState = async () => {
    const state: unknown[] = [];
    for (const table of ['orders', 'order_items', 'room_inventory', 'room_rates', 'payments', 'refunds']) {
      const result = await pool.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as value from commerce.${table} t`);
      state.push(result.rows[0].value);
    }
    return state;
  };
  it('migrates and seeds idempotently, with ten bookings and only explicit hotel staff permissions', async () => {
    expect(await seedRoomUpgradeFixture(db, fixture, [{ userId: actor, role: 'RECEPTIONIST' }])).toMatchObject({ created: false, assignmentsAdded: 0 });
    const result = await db.transaction(async (tx) => {
      const store = new DrizzleRoomUpgradeStore({ tx }); await store.beginReadSnapshot();
      return { snapshot: await store.loadSnapshot(DEMO_HOTEL_ID), role: await store.staffRole(DEMO_HOTEL_ID, actor), foreignRole: await store.staffRole('other-hotel', actor) };
    });
    expect(result.snapshot!.bookings).toHaveLength(10); expect(result.snapshot!.roomTypes).toHaveLength(3);
    expect(result.role).toBe('RECEPTIONIST'); expect(result.foreignRole).toBeNull();
  });
  it('uses real repeatable-read/read-only transactions; pricing cannot issue a write', async () => {
    await expect(db.transaction(async (tx) => {
      const store = new DrizzleRoomUpgradeStore({ tx }); await store.beginReadSnapshot();
      const setting = await tx.execute<{ transaction_isolation: string }>(sql`show transaction_isolation`);
      const rows = Array.isArray(setting) ? setting[0]!.rows : setting.rows;
      expect(rows[0]).toEqual({ transaction_isolation: 'repeatable read' });
      await tx.update(upgradeHotels).set({ name: 'forbidden write' });
    })).rejects.toThrow();
    await expect(db.insert(upgradeHotels).values({ id: 'not-mock', name: 'Invalid', timezone: 'UTC', fixtureVersion: 'x', isMock: false })).rejects.toThrow();
  });
  it('16 (CP1): actual HTTP quotes and retries leave operational booking, inventory and payment rows unchanged', async () => {
    const before = await operationalState();
    const response = await quote().expect(200);
    expect(response.body).toMatchObject({ status: 'VALID', priceDiffVnd: 600_000, validation: { checked: true, passed: true }, isMock: true });
    await quote().expect(200);
    expect(await operationalState()).toEqual(before);
  });
  it('fresh requests observe changed prices, middle-night stock and missing rates without fallback', async () => {
    const rateKey = and(eq(upgradeRoomRates.hotelId, DEMO_HOTEL_ID), eq(upgradeRoomRates.roomTypeId, 'DLX'), eq(upgradeRoomRates.date, '2026-12-12'));
    const stockKey = and(eq(upgradeRoomInventory.hotelId, DEMO_HOTEL_ID), eq(upgradeRoomInventory.roomTypeId, 'DLX'), eq(upgradeRoomInventory.date, '2026-12-12'));
    const original = await quote().expect(200);
    try {
      await db.update(upgradeRoomRates).set({ priceVnd: 1_600_000, version: 2 }).where(rateKey);
      const repriced = await quote().expect(200);
      expect(repriced.body.priceDiffVnd).toBe(700_000); expect(repriced.body.snapshotId).not.toBe(original.body.snapshotId);
      await db.update(upgradeRoomInventory).set({ sold: 8 }).where(stockKey);
      expect((await quote().expect(200)).body).toMatchObject({ status: 'UNAVAILABLE', priceDiffVnd: null });
      await db.update(upgradeRoomInventory).set({ sold: 2 }).where(stockKey);
      await db.delete(upgradeRoomRates).where(rateKey);
      expect((await quote().expect(200)).body).toMatchObject({ status: 'MISSING_DATA', priceDiffVnd: null });
    } finally {
      await db.update(upgradeRoomInventory).set({ sold: 2 }).where(stockKey);
      await seedRoomUpgradeFixture(db, fixture);
      await db.update(upgradeRoomRates).set({ priceVnd: 1_500_000, version: 1 }).where(rateKey);
    }
  });
});
