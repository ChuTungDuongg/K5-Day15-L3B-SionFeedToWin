import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule, InvalidAccessTokenError, MemorySidBlocklist, type AuthUser } from '@vintrip/auth';
import { buildDrizzleToken, createDb, createPool, createTransactionalPlugins, MODULES, type Db } from '@vintrip/db';
import { migrateModule, startPostgres, type PostgresFixture } from '@vintrip/testing';
import { and, eq, sql } from 'drizzle-orm';
import { ClsModule } from 'nestjs-cls';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyGlobalPrefix } from '../../../../platform/http.js';
import { properties, roomInventory, roomRates, roomTypes } from '../../db/schema/catalog.js';
import {
  upgradeBookings, upgradeHotels, upgradeMemberBenefits, upgradePolicies, upgradeRoomInventory,
  upgradeRoomRates, upgradeStaffAssignments,
} from '../../db/schema/room-upgrades.js';
import type { ProposalDetailResponse, ProposalHistoryResponse, ProposalListResponse } from '../application/room-upgrade-proposal.use-cases.js';
import {
  ROOM_UPGRADE_CLOCK, ROOM_UPGRADE_PROPOSAL_FAULT_INJECTOR, ROOM_UPGRADE_PROPOSAL_STORE,
  type RoomUpgradeProposalFaultInjector,
} from '../application/room-upgrade.ports.js';
import { RoomUpgradesModule } from '../room-upgrades.module.js';
import { DrizzleRoomUpgradeProposalStore, isRetryableProposalTxError } from './drizzle-room-upgrade-proposal.store.js';
import { createRoomUpgradeFixture, DEMO_HOTEL_ID } from './room-upgrade.fixture.js';
import { seedRoomUpgradeFixture } from './seed-room-upgrade-fixture.js';

const users = {
  receptionist: { userId: '00000000-0000-4000-8000-000000000001', role: 'member', sid: 'pg-r', exp: 9_999_999_999 },
  manager: { userId: '00000000-0000-4000-8000-000000000002', role: 'member', sid: 'pg-m', exp: 9_999_999_999 },
  superadmin: { userId: '00000000-0000-4000-8000-000000000003', role: 'superadmin', sid: 'pg-s', exp: 9_999_999_999 },
  customer: { userId: '00000000-0000-4000-8000-000000000004', role: 'member', sid: 'pg-c', exp: 9_999_999_999 },
  otherStaff: { userId: '00000000-0000-4000-8000-000000000006', role: 'member', sid: 'pg-o', exp: 9_999_999_999 },
} satisfies Record<string, AuthUser>;
type Token = keyof typeof users;
const fixture = createRoomUpgradeFixture('2026-12-10');
const initialTime = '2026-12-10T08:00:00+07:00';
const otherHotel = 'other-hotel';
const route = '/api/commerce/room-upgrades/proposals';
const createInput = { hotelId: DEMO_HOTEL_ID, bookingCode: 'C2-0001', targetRoomTypeId: 'DLX', effectiveAt: '2026-12-11T14:00:00+07:00' };
const decisionInput = { hotelId: DEMO_HOTEL_ID, expectedVersion: 1, reason: 'Đã kiểm tra chính sách mô phỏng.' };
const proposalTables = ['room_upgrade_proposals', 'room_upgrade_proposal_revisions',
  'room_upgrade_proposal_audit_events', 'room_upgrade_proposal_idempotency'] as const;
const invariantTables = ['orders', 'order_items', 'room_inventory', 'room_rates', 'payments', 'refunds', 'idempotency_keys',
  'properties', 'room_types', 'room_upgrade_bookings', 'room_upgrade_inventory', 'room_upgrade_rates', 'room_upgrade_policies',
  'room_upgrade_member_benefits', 'room_upgrade_hotels', 'room_upgrade_room_types', 'room_upgrade_staff_assignments'] as const;

/** One-shot gate: retries pass through immediately after the original callers meet. */
function createBarrier(count: number) {
  let arrived = 0;
  let release!: () => void;
  let fail!: (error: Error) => void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  return async () => {
    if (++arrived === 1) timer = setTimeout(() => fail(new Error(`Barrier timed out: ${arrived}/${count} callers`)), 10_000);
    if (arrived === count) { clearTimeout(timer); release(); }
    await gate;
  };
}

async function withDeadline<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 10_000);
    })]);
  } finally { clearTimeout(timer); }
}

describe('room-upgrade proposals: REAL PostgreSQL lifecycle, concurrency, stale quotes and isolation', () => {
  let postgres: PostgresFixture | undefined;
  let pool: pg.Pool;
  let db: Db;
  let app: INestApplication;
  let now = new Date(initialTime);
  const faults: RoomUpgradeProposalFaultInjector = {};

  // Bulk UPSERT restores every fixture field, including versions and JSONB. No
  // operational tables are cleaned, and proposal rows are deleted child first.
  async function restoreSources() {
    await db.insert(upgradeBookings).values(fixture.bookings).onConflictDoUpdate({
      target: [upgradeBookings.hotelId, upgradeBookings.bookingCode], set: {
        roomNumber: sql`excluded.room_number`, roomTypeId: sql`excluded.room_type_id`, status: sql`excluded.status`,
        checkInAt: sql`excluded.check_in_at`, checkOutAt: sql`excluded.check_out_at`, guests: sql`excluded.guests`,
        nights: sql`excluded.nights`, version: sql`excluded.version`, isMock: sql`excluded.is_mock`,
      },
    });
    await db.insert(upgradeRoomInventory).values(fixture.inventory).onConflictDoUpdate({
      target: [upgradeRoomInventory.hotelId, upgradeRoomInventory.roomTypeId, upgradeRoomInventory.date], set: {
        total: sql`excluded.total`, held: sql`excluded.held`, sold: sql`excluded.sold`, outOfService: sql`excluded.out_of_service`,
        stopSell: sql`excluded.stop_sell`, version: sql`excluded.version`, isMock: sql`excluded.is_mock`,
      },
    });
    await db.insert(upgradeRoomRates).values(fixture.rates).onConflictDoUpdate({
      target: [upgradeRoomRates.hotelId, upgradeRoomRates.roomTypeId, upgradeRoomRates.date], set: {
        priceVnd: sql`excluded.price_vnd`, taxIncluded: sql`excluded.tax_included`, sourceRef: sql`excluded.source_ref`,
        version: sql`excluded.version`, isMock: sql`excluded.is_mock`,
      },
    });
    await pool.query('DELETE FROM commerce.room_upgrade_policies WHERE hotel_id = $1 AND code = $2 AND version <> 1',
      [DEMO_HOTEL_ID, 'STAY-UPGRADE']);
    await db.insert(upgradePolicies).values(fixture.policies).onConflictDoUpdate({
      target: [upgradePolicies.hotelId, upgradePolicies.code, upgradePolicies.version], set: {
        validFrom: sql`excluded.valid_from`, validUntil: sql`excluded.valid_until`, rules: sql`excluded.rules`,
        sources: sql`excluded.sources`, isMock: sql`excluded.is_mock`,
      },
    });
    await db.insert(upgradeMemberBenefits).values(fixture.benefits).onConflictDoUpdate({
      target: [upgradeMemberBenefits.hotelId, upgradeMemberBenefits.id], set: {
        bookingCode: sql`excluded.booking_code`, code: sql`excluded.code`, verifiedAt: sql`excluded.verified_at`,
        validFrom: sql`excluded.valid_from`, validUntil: sql`excluded.valid_until`, discountBps: sql`excluded.discount_bps`,
        roomTypeIds: sql`excluded.room_type_ids`, version: sql`excluded.version`, isMock: sql`excluded.is_mock`,
      },
    });
    // Explicitly keep customer/superadmin unassigned and otherStaff foreign-only.
    await pool.query(`DELETE FROM commerce.room_upgrade_staff_assignments WHERE hotel_id IN ($1, $2)
      AND (user_id IN ($3, $4) OR (hotel_id = $1 AND user_id = $5))`,
    [DEMO_HOTEL_ID, otherHotel, users.customer.userId, users.superadmin.userId, users.otherStaff.userId]);
    await db.insert(upgradeStaffAssignments).values([
      { hotelId: DEMO_HOTEL_ID, userId: users.receptionist.userId, role: 'RECEPTIONIST', active: true, version: 1, isMock: true },
      { hotelId: DEMO_HOTEL_ID, userId: users.manager.userId, role: 'MANAGER', active: true, version: 1, isMock: true },
      { hotelId: otherHotel, userId: users.manager.userId, role: 'MANAGER', active: true, version: 1, isMock: true },
      { hotelId: otherHotel, userId: users.otherStaff.userId, role: 'RECEPTIONIST', active: true, version: 1, isMock: true },
    ]).onConflictDoUpdate({ target: [upgradeStaffAssignments.hotelId, upgradeStaffAssignments.userId], set: {
      role: sql`excluded.role`, active: sql`excluded.active`, version: sql`excluded.version`, isMock: sql`excluded.is_mock`,
    } });
  }

  beforeAll(async () => {
    let url = process.env.ROOM_UPGRADE_TEST_DATABASE_URL;
    if (url) {
      if (!/^\/room_upgrade_test_[a-z0-9_]+$/.test(new URL(url).pathname)) {
        throw new Error('External test URL must target a dedicated room_upgrade_test_* database.');
      }
    } else { postgres = await startPostgres(); url = postgres.buildModuleUrl('commerce'); }
    await migrateModule({ url, module: 'commerce', migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)) });
    pool = createPool({ url, max: 5, applicationName: 'room-upgrade-proposals-integration' });
    db = createDb(pool);
    await seedRoomUpgradeFixture(db, fixture);
    await db.insert(upgradeHotels).values({ ...fixture.hotel, id: otherHotel, name: 'Other synthetic hotel' }).onConflictDoNothing();
    await restoreSources();
    await db.insert(properties).values({ id: 'operational-sentinel', slug: 'operational-sentinel', name: 'Test sentinel',
      provinceSlug: 'test', provinceName: 'Mô phỏng' }).onConflictDoNothing();
    await db.insert(roomTypes).values({ id: 'operational-STD', propertyId: 'operational-sentinel', code: 'STD', name: 'Sentinel',
      maxGuests: 2, defaultTotal: 10, defaultPrice: 999_999, ratePlans: [] }).onConflictDoNothing();
    await db.insert(roomInventory).values({ roomTypeId: 'operational-STD', date: '2026-12-11', total: 10, held: 1, sold: 3 }).onConflictDoNothing();
    await db.insert(roomRates).values({ roomTypeId: 'operational-STD', date: '2026-12-11', price: 999_999 }).onConflictDoNothing();
    @Global()
    @Module({ providers: [
      ...MODULES.map((m) => ({ provide: buildDrizzleToken(m), useValue: db })),
      { provide: ROOM_UPGRADE_PROPOSAL_FAULT_INJECTOR, useValue: faults },
    ], exports: [...MODULES.map((m) => buildDrizzleToken(m)), ROOM_UPGRADE_PROPOSAL_FAULT_INJECTOR] })
    class TestDatabaseModule {}
    const module = await Test.createTestingModule({ imports: [
      TestDatabaseModule,
      ClsModule.forRoot({ global: true, middleware: { mount: true }, plugins: createTransactionalPlugins([TestDatabaseModule]) }),
      AuthModule.forRootAsync({ useFactory: () => ({ verifier: async (token: string) => {
        const user = users[token as Token];
        if (!user) throw new InvalidAccessTokenError();
        return user;
      }, blocklist: new MemorySidBlocklist() }) }), RoomUpgradesModule,
    ] }).overrideProvider(ROOM_UPGRADE_CLOCK).useValue(() => new Date(now)).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    applyGlobalPrefix(app);
    await app.init();
    expect(app.get(ROOM_UPGRADE_PROPOSAL_STORE)).toBeInstanceOf(DrizzleRoomUpgradeProposalStore);
  });

  beforeEach(async () => {
    now = new Date(initialTime);
    faults.beforeProposalLock = undefined;
    faults.beforeApprovalSourceLock = undefined;
    faults.afterAuditInsert = undefined;
    await pool.query(`DELETE FROM commerce.room_upgrade_proposal_idempotency;
      DELETE FROM commerce.room_upgrade_proposal_audit_events;
      DELETE FROM commerce.room_upgrade_proposal_revisions;
      DELETE FROM commerce.room_upgrade_proposals;`);
    await restoreSources();
  });
  afterAll(async () => { await app?.close(); await pool?.end(); await postgres?.stop(); });

  function post(path: string, input: string | object | undefined, token: Token = 'receptionist', key: string = randomUUID()) {
    return request(app.getHttpServer()).post(`${route}${path}`).auth(token, { type: 'bearer' })
      .set('Idempotency-Key', key).send(input).timeout({ response: 15_000, deadline: 20_000 });
  }
  function get(path = '', query: Record<string, string | number> = {}, token: Token = 'receptionist') {
    return request(app.getHttpServer()).get(`${route}${path}`).auth(token, { type: 'bearer' })
      .query({ hotelId: DEMO_HOTEL_ID, ...query });
  }
  async function create(input: Record<string, unknown> = {}): Promise<ProposalDetailResponse> {
    const res = await post('', { ...createInput, ...input }).expect(201);
    return res.body as ProposalDetailResponse;
  }
  async function history(id: string): Promise<ProposalHistoryResponse> {
    return (await get(`/${id}/history`).expect(200)).body as ProposalHistoryResponse;
  }
  async function persisted(id: string) {
    const result = await pool.query<{
      status: string; version: number; current_revision: number; decided_by: string | null; expires_at: Date;
    }>('SELECT status, version, current_revision, decided_by, expires_at FROM commerce.room_upgrade_proposals WHERE id = $1', [id]);
    expect(result.rows).toHaveLength(1);
    return result.rows[0]!;
  }
  async function counts() {
    const values: number[] = [];
    for (const table of proposalTables) {
      const result = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM commerce.${table}`);
      values.push(result.rows[0]!.count);
    }
    return values; // proposals, revisions, audit events, idempotency records
  }
  async function auditActions(id: string) {
    const result = await pool.query<{ action: string }>(`SELECT action FROM commerce.room_upgrade_proposal_audit_events
      WHERE proposal_id = $1 ORDER BY created_at, proposal_version, id`, [id]);
    return result.rows.map((row) => row.action);
  }
  async function tableBytes(table: string, where = '', params: unknown[] = []) {
    // PostgreSQL canonical JSONB text, retained as bytes rather than parsed JS
    // numbers/dates, detects *every* column change and row addition/deletion.
    const result = await pool.query<{ value: string }>(`SELECT coalesce(jsonb_agg(to_jsonb(t)
      ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text AS value FROM commerce.${table} t ${where}`, params);
    return Buffer.from(result.rows[0]!.value, 'utf8');
  }
  async function invariantBytes() {
    const values: Buffer[] = [];
    for (const table of invariantTables) values.push(await tableBytes(table));
    return Buffer.concat(values.map((value) => Buffer.concat([Buffer.from(`${value.length}:`), value])));
  }
  async function increaseRate() {
    await db.update(upgradeRoomRates).set({ priceVnd: 1_600_000, version: 2 }).where(and(
      eq(upgradeRoomRates.hotelId, DEMO_HOTEL_ID), eq(upgradeRoomRates.roomTypeId, 'DLX'), eq(upgradeRoomRates.date, '2026-12-12'),
    ));
  }

  describe('A — happy path on real PostgreSQL', () => {
    it('A1 creates 600,000 VND and receptionist approves; all four tables persist atomically', async () => {
      const proposal = await create();
      expect(proposal).toMatchObject({ status: 'PENDING_RECEPTIONIST', priceDiffVnd: 600_000, version: 1, currentRevision: 1,
        calculatedAt: new Date(initialTime).toISOString(), businessFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
      const approved = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(200);
      expect(approved.body).toMatchObject({ status: 'APPROVED', version: 2, currentRevision: 1, priceDiffVnd: 600_000,
        decidedBy: users.receptionist.userId, isMock: true, operationalEffects: 'NONE' });
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'APPROVED', version: 2, current_revision: 1,
        decided_by: users.receptionist.userId });
      expect(await counts()).toEqual([1, 1, 2, 2]);
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'APPROVED']);
      const replay = await pool.query(`SELECT operation, http_status, response_body FROM commerce.room_upgrade_proposal_idempotency
        WHERE proposal_id = $1 ORDER BY operation`, [proposal.proposalId]);
      expect(replay.rows).toEqual([
        { operation: 'APPROVE', http_status: 200, response_body: approved.body },
        { operation: 'CREATE', http_status: 201, response_body: proposal },
      ]);
      const revision = await pool.query(`SELECT price_diff_vnd::text, business_fingerprint, calculated_at
        FROM commerce.room_upgrade_proposal_revisions WHERE proposal_id = $1`, [proposal.proposalId]);
      expect(revision.rows[0]).toMatchObject({ price_diff_vnd: '600000', business_fingerprint: proposal.businessFingerprint });
    });

    it('A2 rejects with reason persisted in proposal and audit', async () => {
      const proposal = await create();
      const res = await post(`/${proposal.proposalId}/reject`, decisionInput).expect(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', version: 2, decisionReason: decisionInput.reason });
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'REJECTED', version: 2 });
      const events = await history(proposal.proposalId);
      expect(events.auditEvents[1]).toMatchObject({ action: 'REJECTED', reason: decisionInput.reason });
      expect(await counts()).toEqual([1, 1, 2, 2]);
    });

    it('A3 revises to 300,000 VND; revision 1 bytes stay immutable and history is ordered', async () => {
      const proposal = await create();
      const original = await tableBytes('room_upgrade_proposal_revisions', 'WHERE proposal_id = $1 AND revision_number = 1', [proposal.proposalId]);
      const revised = await post(`/${proposal.proposalId}/revise`, { ...decisionInput, effectiveAt: '2026-12-12T14:00:00+07:00' }).expect(200);
      expect(revised.body).toMatchObject({ version: 2, currentRevision: 2, priceDiffVnd: 300_000 });
      expect((await tableBytes('room_upgrade_proposal_revisions', 'WHERE proposal_id = $1 AND revision_number = 1', [proposal.proposalId])).equals(original)).toBe(true);
      const result = await history(proposal.proposalId);
      expect(result.revisions.map((row) => row.revisionNumber)).toEqual([1, 2]);
      expect(result.revisions.map((row) => row.priceDiffVnd)).toEqual([600_000, 300_000]);
      expect(result.auditEvents.map((row) => [row.proposalVersion, row.action])).toEqual([[1, 'CREATED'], [2, 'REVISED']]);
      expect(await counts()).toEqual([1, 2, 2, 2]);
    });

    it('A4 escalates to manager; receptionist cannot approve, manager can', async () => {
      const proposal = await create();
      expect((await post(`/${proposal.proposalId}/escalate`, decisionInput).expect(200)).body)
        .toMatchObject({ status: 'PENDING_MANAGER', version: 2, requiredApprovalRole: 'MANAGER' });
      await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }).expect(403);
      expect((await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }, 'manager').expect(200)).body)
        .toMatchObject({ status: 'APPROVED', version: 3, decidedByRole: 'MANAGER' });
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'ESCALATED', 'APPROVED']);
    });

    it('A5 persists signed bigint -1,000,000 VND and supports queue pagination and combined filters', async () => {
      const negative = await create({ bookingCode: 'C2-0010' });
      expect(negative).toMatchObject({ status: 'PENDING_MANAGER', priceDiffVnd: -1_000_000 });
      const stored = await pool.query('SELECT price_diff_vnd::text AS value FROM commerce.room_upgrade_proposal_revisions WHERE proposal_id = $1', [negative.proposalId]);
      expect(stored.rows).toEqual([{ value: '-1000000' }]);
      await post(`/${negative.proposalId}/approve`, decisionInput).expect(403);
      await post(`/${negative.proposalId}/approve`, decisionInput, 'manager').expect(200);
      const pending = await create();
      const first = (await get('', { limit: 1, offset: 0 }).expect(200)).body as ProposalListResponse;
      const second = (await get('', { limit: 1, offset: 1 }).expect(200)).body as ProposalListResponse;
      expect(first).toMatchObject({ total: 2, limit: 1, offset: 0 });
      expect(second).toMatchObject({ total: 2, limit: 1, offset: 1 });
      expect(new Set([...first.items, ...second.items].map((row) => row.proposalId)))
        .toEqual(new Set([pending.proposalId, negative.proposalId]));
      const filtered = (await get('', { status: 'APPROVED', bookingCode: 'C2-0010', requiredApprovalRole: 'MANAGER' }).expect(200)).body as ProposalListResponse;
      expect(filtered.total).toBe(1);
      expect(filtered.items[0]).toMatchObject({ proposalId: negative.proposalId, priceDiffVnd: -1_000_000 });
      expect(((await get('', { status: 'REJECTED' }).expect(200)).body as ProposalListResponse).items).toEqual([]);
    });
  });

  describe('B — security and hotel assignments on real PostgreSQL', () => {
    it('B1 requires a token', async () => {
      await request(app.getHttpServer()).post(route).set('Idempotency-Key', randomUUID()).send(createInput).expect(401);
      await request(app.getHttpServer()).get(route).query({ hotelId: DEMO_HOTEL_ID }).expect(401);
      expect(await counts()).toEqual([0, 0, 0, 0]);
    });

    it.each(['customer', 'superadmin', 'otherStaff'] as const)('B2 denies %s without a demo-hotel assignment', async (token) => {
      const proposal = await create();
      const before = await counts();
      await post('', createInput, token).expect(403);
      await get('', {}, token).expect(403);
      await get(`/${proposal.proposalId}`, {}, token).expect(403);
      await get(`/${proposal.proposalId}/history`, {}, token).expect(403);
      for (const action of ['approve', 'reject', 'revise', 'escalate']) {
        await post(`/${proposal.proposalId}/${action}`, decisionInput, token).expect(403);
      }
      expect(await counts()).toEqual(before);
    });

    it('B3 manager assigned to both hotels cannot use another hotel scope to access the demo proposal', async () => {
      const proposal = await create();
      await get(`/${proposal.proposalId}`, { hotelId: otherHotel }, 'manager').expect(404);
      await get(`/${proposal.proposalId}/history`, { hotelId: otherHotel }, 'manager').expect(404);
      for (const action of ['approve', 'reject', 'revise', 'escalate']) {
        const response = await post(`/${proposal.proposalId}/${action}`, { ...decisionInput, hotelId: otherHotel }, 'manager').expect(404);
        expect(response.body.code).toBe('PROPOSAL_NOT_FOUND');
      }
      expect(await counts()).toEqual([1, 1, 1, 1]);
    });

    it.each([
      ['actorRole', 'MANAGER'], ['amount', 1], ['status', 'APPROVED'], ['approved', true], ['isMock', false],
    ])('B4 rejects forged %s in create and every mutation', async (field, value) => {
      const proposal = await create();
      await post('', { ...createInput, [String(field)]: value }).expect(400);
      for (const action of ['approve', 'reject', 'revise', 'escalate']) {
        await post(`/${proposal.proposalId}/${action}`, { ...decisionInput, [String(field)]: value }).expect(400);
      }
      expect(await counts()).toEqual([1, 1, 1, 1]);
    });

    it('B5 revoked staff cannot approve a new proposal or replay a committed approval response', async () => {
      const approved = await create();
      const key = randomUUID();
      await post(`/${approved.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
      const pending = await create();
      const before = await counts();
      await pool.query('UPDATE commerce.room_upgrade_staff_assignments SET active = false WHERE hotel_id = $1 AND user_id = $2',
        [DEMO_HOTEL_ID, users.receptionist.userId]);
      await post(`/${pending.proposalId}/approve`, decisionInput).expect(403);
      const denied = await post(`/${approved.proposalId}/approve`, decisionInput, 'receptionist', key).expect(403);
      expect(denied.headers['idempotency-replayed']).toBeUndefined();
      expect(denied.body).toMatchObject({ code: 'HOTEL_ACCESS_DENIED' });
      for (const field of ['proposalId', 'bookingCode', 'quote', 'priceDiffVnd', 'normalizedRequest', 'businessFingerprint']) {
        expect(denied.body).not.toHaveProperty(field);
      }
      expect(await persisted(pending.proposalId)).toMatchObject({ status: 'PENDING_RECEPTIONIST', version: 1 });
      expect(await counts()).toEqual(before);
    });
  });

  describe('C — true concurrency and atomic rollback on real PostgreSQL', () => {
    it.each([
      ['C1', 'approve', 'approve'], ['C2', 'approve', 'reject'],
      ['C3', 'approve', 'revise'], ['C4', 'revise', 'revise'],
    ] as const)('%s synchronizes %s vs %s before FOR UPDATE; exactly one command commits', async (_label, left, right) => {
      const proposal = await create();
      const barrier = createBarrier(2);
      let lockCalls = 0;
      faults.beforeProposalLock = async (hotelId, proposalId) => {
        expect([hotelId, proposalId]).toEqual([DEMO_HOTEL_ID, proposal.proposalId]);
        lockCalls++;
        await barrier();
      };
      const results = await Promise.all([
        post(`/${proposal.proposalId}/${left}`, decisionInput, 'receptionist', randomUUID()),
        post(`/${proposal.proposalId}/${right}`, decisionInput, 'receptionist', randomUUID()),
      ]);
      expect(lockCalls).toBeGreaterThanOrEqual(2);
      expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([200, 409]);
      const winner = results.find((res) => res.status === 200)!;
      const loser = results.find((res) => res.status === 409)!;
      expect(loser.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2, currentStatus: winner.body.status });
      const row = await persisted(proposal.proposalId);
      const winningAction = results[0]!.status === 200 ? left : right;
      const revised = winningAction === 'revise';
      const expectedStatus = revised ? 'PENDING_RECEPTIONIST' : winningAction === 'approve' ? 'APPROVED' : 'REJECTED';
      expect(winner.body).toMatchObject({ status: expectedStatus, version: 2, currentRevision: revised ? 2 : 1 });
      expect(row).toMatchObject({ status: expectedStatus, version: 2, current_revision: revised ? 2 : 1 });
      expect(await counts()).toEqual([1, revised ? 2 : 1, 2, 2]);
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', revised ? 'REVISED' : expectedStatus]);
    });

    it('C5 concurrent identical CREATE keys return one committed proposal and exactly one replay', async () => {
      const key = randomUUID();
      const barrier = createBarrier(2);
      let insertedAudits = 0;
      faults.afterAuditInsert = async (record) => {
        expect(record.action).toBe('CREATED');
        insertedAudits++;
        await barrier();
      };
      const results = await Promise.all([post('', createInput, 'receptionist', key), post('', createInput, 'receptionist', key)]);
      // Both attempts wrote before either committed: one must roll back its
      // proposal/revision/audit on the real PG conflict, then replay on retry.
      expect(insertedAudits).toBe(2);
      expect(results.map((res) => res.status)).toEqual([201, 201]);
      expect(results[0]!.body).toEqual(results[1]!.body);
      expect(results.filter((res) => res.headers['idempotency-replayed'] === 'true')).toHaveLength(1);
      expect(await counts()).toEqual([1, 1, 1, 1]);
      expect(await auditActions((results[0]!.body as ProposalDetailResponse).proposalId)).toEqual(['CREATED']);
    });

    it('C6 same key with different payload returns mismatch without additional rows', async () => {
      const key = randomUUID();
      await post('', createInput, 'receptionist', key).expect(201);
      const before = await counts();
      expect((await post('', { ...createInput, effectiveAt: '2026-12-12T14:00:00+07:00' }, 'receptionist', key).expect(409)).body)
        .toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
      expect(await counts()).toEqual(before);
    });

    it('C7 sequential different approval keys report current version and state without duplicate audit', async () => {
      const proposal = await create();
      await post(`/${proposal.proposalId}/approve`, decisionInput).expect(200);
      expect((await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409)).body)
        .toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2, currentStatus: 'APPROVED' });
      expect((await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }).expect(409)).body)
        .toMatchObject({ code: 'INVALID_STATE_TRANSITION', currentVersion: 2, currentStatus: 'APPROVED' });
      expect(await counts()).toEqual([1, 1, 2, 2]);
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'APPROVED']);
    });

    it('C8 lost-response retry replays the exact committed approval body and status', async () => {
      const proposal = await create();
      const key = randomUUID();
      const committed = await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
      now = new Date(now.getTime() + 120_000);
      const replay = await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(replay.body).toEqual(committed.body);
      expect(await counts()).toEqual([1, 1, 2, 2]);
    });

    it('C9 failure AFTER actual audit INSERT rolls back proposal, audit and idempotency', async () => {
      const proposal = await create();
      let inserted = false;
      faults.afterAuditInsert = (record) => {
        expect(record.action).toBe('APPROVED'); inserted = true;
        throw new Error('Simulated audit failure');
      };
      await post(`/${proposal.proposalId}/approve`, decisionInput).expect(500);
      expect(inserted).toBe(true);
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'PENDING_RECEPTIONIST', version: 1, decided_by: null });
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED']);
      const replay = await pool.query("SELECT count(*)::int AS count FROM commerce.room_upgrade_proposal_idempotency WHERE operation = 'APPROVE'");
      expect(replay.rows).toEqual([{ count: 0 }]);
      expect(await counts()).toEqual([1, 1, 1, 1]);
    });

    it.each(['40001', '40P01'])('C10 exhausted nested %s becomes CONCURRENT_MODIFICATION after bounded retries', async (code) => {
      const proposal = await create();
      let attempts = 0;
      faults.beforeProposalLock = () => { attempts++; throw new Error('wrapped pg error', { cause: { code } }); };
      expect((await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409)).body)
        .toMatchObject({ code: 'CONCURRENT_MODIFICATION', message: 'Giao dịch xung đột đồng thời; vui lòng thử lại.' });
      expect(attempts).toBe(3);
      expect(await counts()).toEqual([1, 1, 1, 1]);
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'PENDING_RECEPTIONIST', version: 1 });
    });

    it('C11 different proposals share target-source locks and can both approve', async () => {
      const first = await create();
      const second = await create({ bookingCode: 'C2-0002' });
      const barrier = createBarrier(2);
      faults.beforeApprovalSourceLock = barrier;
      const results = await Promise.all([
        post(`/${first.proposalId}/approve`, decisionInput), post(`/${second.proposalId}/approve`, decisionInput),
      ]);
      expect(results.map((res) => res.status)).toEqual([200, 200]);
      expect(await counts()).toEqual([2, 2, 4, 4]);
    });

    it('C12 retries only serialization, deadlock and the exact idempotency primary key constraint', () => {
      expect(isRetryableProposalTxError({ code: '40001' })).toBe(true);
      expect(isRetryableProposalTxError(new Error('wrapped', { cause: { code: '40P01' } }))).toBe(true);
      expect(isRetryableProposalTxError({ cause: { code: '23505', constraint: 'room_upgrade_proposal_idempotency_pkey' } })).toBe(true);
      expect(isRetryableProposalTxError({ code: '23505', constraint: 'room_upgrade_proposals_pkey' })).toBe(false);
      expect(isRetryableProposalTxError({ code: '23514' })).toBe(false);
      expect(isRetryableProposalTxError(new Error('Simulated audit failure'))).toBe(false);
    });
  });

  describe('D — stale quotes and expiry on real PostgreSQL', () => {
    it('D1 commits stale status with unchanged expiry; revise 700,000 VND then approve version 4', async () => {
      const proposal = await create();
      const before = await persisted(proposal.proposalId);
      await increaseRate();
      const stale = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409);
      expect(stale.body).toMatchObject({ code: 'REQUOTE_REQUIRED', reasonCodes: expect.arrayContaining(['RATE_CHANGED', 'PRICE_CHANGED']),
        freshQuote: { priceDiffVnd: 700_000 } });
      const row = await persisted(proposal.proposalId);
      expect(row).toMatchObject({ status: 'REQUOTE_REQUIRED', version: 2, decided_by: null });
      expect(row.expires_at).toEqual(before.expires_at);
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'MARKED_REQUOTE_REQUIRED']);
      expect((await post(`/${proposal.proposalId}/revise`, { ...decisionInput, expectedVersion: 2 }).expect(200)).body)
        .toMatchObject({ version: 3, currentRevision: 2, priceDiffVnd: 700_000 });
      expect((await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 3 }).expect(200)).body)
        .toMatchObject({ status: 'APPROVED', version: 4, currentRevision: 2, priceDiffVnd: 700_000 });
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'APPROVED', version: 4, current_revision: 2 });
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'MARKED_REQUOTE_REQUIRED', 'REVISED', 'APPROVED']);
    });

    it.each([
      ['D2', 'inventory', ['INVENTORY_UNAVAILABLE', 'QUOTE_INVALIDATED']],
      ['D3', 'booking', ['BOOKING_STATUS_CHANGED', 'QUOTE_INVALIDATED']],
      ['D4', 'policy', ['POLICY_VERSION_CHANGED']],
      ['D5', 'benefit', ['BENEFIT_CHANGED']],
    ] as const)('%s detects changed %s rows and commits REQUOTE_REQUIRED', async (_label, kind, reasons) => {
      const proposal = await create(kind === 'benefit' ? { bookingCode: 'C2-0002' } : {});
      if (kind === 'inventory') {
        await pool.query(`UPDATE commerce.room_upgrade_inventory SET sold = 8, version = 2
          WHERE hotel_id = $1 AND room_type_id = 'DLX' AND date = '2026-12-12'`, [DEMO_HOTEL_ID]);
      } else if (kind === 'booking') {
        await pool.query("UPDATE commerce.room_upgrade_bookings SET status = 'CHECKED_OUT', version = 2 WHERE hotel_id = $1 AND booking_code = 'C2-0001'", [DEMO_HOTEL_ID]);
      } else if (kind === 'policy') {
        const policy = fixture.policies[0]!;
        await db.insert(upgradePolicies).values({ ...policy, version: 2, rules: { ...policy.rules, changeFeeVnd: 10_000 },
          sources: [...policy.sources, { code: 'CP3-V2', clause: 'Phí thay đổi mô phỏng 10.000 VND.' }] });
      } else {
        await pool.query(`UPDATE commerce.room_upgrade_member_benefits SET valid_until = '2026-12-10T07:00:00+07:00', version = 2
          WHERE hotel_id = $1 AND booking_code = 'C2-0002'`, [DEMO_HOTEL_ID]);
      }
      const stale = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409);
      expect(stale.body).toMatchObject({ code: 'REQUOTE_REQUIRED', reasonCodes: expect.arrayContaining([...reasons]) });
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'REQUOTE_REQUIRED', version: 2 });
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'MARKED_REQUOTE_REQUIRED']);
      expect(await counts()).toEqual([1, 1, 2, 2]);
    });

    it('D6 expiry boundary commits EXPIRED; a new key cannot transition again', async () => {
      const proposal = await create();
      now = new Date(proposal.expiresAt);
      const expired = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409);
      expect(expired.body).toMatchObject({ code: 'PROPOSAL_EXPIRED', proposal: { status: 'EXPIRED', version: 2 } });
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'EXPIRED', version: 2 });
      expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'MARKED_EXPIRED']);
      expect((await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }).expect(409)).body)
        .toMatchObject({ code: 'INVALID_STATE_TRANSITION', currentVersion: 2, currentStatus: 'EXPIRED' });
      expect(await counts()).toEqual([1, 1, 2, 2]);
    });

    it('D7 a real uncommitted mid-approve rate update blocks FOR SHARE, aborts stale snapshot, and requotes', async () => {
      const proposal = await create();
      const client = await pool.connect();
      let mutationOpen = false;
      let released = false;
      let approvePromise: Promise<request.Response> | undefined;
      let signalSourceLock!: () => void;
      const sourceLockReached = new Promise<void>((resolve) => { signalSourceLock = resolve; });
      let sourceAttempts = 0;
      try {
        await client.query('BEGIN'); mutationOpen = true;
        const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
        await client.query(`UPDATE commerce.room_upgrade_rates SET price_vnd = 1600000, version = 2
          WHERE hotel_id = $1 AND room_type_id = 'DLX' AND date = '2026-12-12'`, [DEMO_HOTEL_ID]);
        faults.beforeApprovalSourceLock = (params) => {
          expect(params).toEqual({ hotelId: DEMO_HOTEL_ID, bookingCode: 'C2-0001', targetRoomTypeId: 'DLX' });
          if (++sourceAttempts === 1) signalSourceLock();
        };
        // Supertest is lazy: .then starts HTTP before awaiting the hook signal.
        approvePromise = post(`/${proposal.proposalId}/approve`, decisionInput).then((res) => res);
        await withDeadline(sourceLockReached, 'Approval never reached its source-lock phase');
        // Observe an actual PostgreSQL lock wait, not merely overlapping HTTP
        // requests. The external transaction is the blocking backend.
        await (async () => {
          const deadline = Date.now() + 8_000;
          while (Date.now() < deadline) {
            const waiting = await pool.query<{ blocked: boolean }>(`SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))
              AND query LIKE '%room_upgrade_rates%' AND query LIKE '%for share%'
            ) AS blocked`, [pid]);
            if (waiting.rows[0]!.blocked) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error('Approval did not block on the concurrently updated rate row');
        })();
        await client.query('COMMIT'); mutationOpen = false;
        client.release(); released = true;
        const res = await approvePromise;
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 'REQUOTE_REQUIRED', reasonCodes: expect.arrayContaining(['RATE_CHANGED', 'PRICE_CHANGED']),
          freshQuote: { priceDiffVnd: 700_000 } });
        expect(sourceAttempts).toBeGreaterThanOrEqual(2);
        expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'REQUOTE_REQUIRED', version: 2, decided_by: null });
        expect(await auditActions(proposal.proposalId)).toEqual(['CREATED', 'MARKED_REQUOTE_REQUIRED']);
        expect(await counts()).toEqual([1, 1, 2, 2]);
      } finally {
        try { if (mutationOpen) await client.query('ROLLBACK'); }
        finally { if (!released) client.release(); }
        // Drain the in-flight HTTP transaction even when an assertion fails.
        await approvePromise?.catch(() => undefined);
      }
    });

    it('D8 changed quote/request IDs and calculatedAt alone never create false staleness', async () => {
      const proposal = await create();
      now = new Date(now.getTime() + 120_000);
      const preview = await request(app.getHttpServer()).post('/api/commerce/room-upgrades/quotes')
        .auth('receptionist', { type: 'bearer' }).send(createInput).expect(200);
      expect(preview.body.quoteId).not.toBe(proposal.quote.quoteId);
      expect(preview.body.requestId).not.toBe(proposal.quote.requestId);
      expect(preview.body.calculatedAt).not.toBe(proposal.calculatedAt);
      expect((await post(`/${proposal.proposalId}/approve`, decisionInput).expect(200)).body)
        .toMatchObject({ status: 'APPROVED', version: 2, priceDiffVnd: 600_000, businessFingerprint: proposal.businessFingerprint });
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'APPROVED', version: 2 });
    });
  });

  describe('E — database invariants and zero operational or CP1 source writes', () => {
    it('E1 create/revise/escalate/approve and create/reject leave every source and operational row byte-for-byte identical', async () => {
      const before = await invariantBytes();
      const proposal = await create();
      await post(`/${proposal.proposalId}/revise`, { ...decisionInput, effectiveAt: '2026-12-12T14:00:00+07:00' }).expect(200);
      await post(`/${proposal.proposalId}/escalate`, { ...decisionInput, expectedVersion: 2 }).expect(200);
      await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 3 }, 'manager').expect(200);
      const rejected = await create();
      await post(`/${rejected.proposalId}/reject`, decisionInput).expect(200);
      expect((await invariantBytes()).equals(before)).toBe(true);
      expect(await counts()).toEqual([2, 3, 6, 6]);
    });

    it.each(proposalTables)('E2 PostgreSQL CHECK rejects is_mock=false INSERT into %s', async (table) => {
      const proposal = await create();
      const before = await tableBytes(table);
      // Clone a valid persisted row with a fresh PK and only is_mock changed.
      // This avoids a 23505/FK/NOT NULL error masking the CHECK enforcement.
      const patch = table === 'room_upgrade_proposals' || table === 'room_upgrade_proposal_audit_events' ? { id: randomUUID() } :
        table === 'room_upgrade_proposal_revisions' ? { revision_number: 2 } : { idempotency_key: randomUUID() };
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        try {
          await client.query(`INSERT INTO commerce.${table} SELECT (jsonb_populate_record(NULL::commerce.${table},
            to_jsonb(t) || $1::jsonb)).* FROM commerce.${table} t LIMIT 1`, [JSON.stringify({ ...patch, is_mock: false })]);
          throw new Error(`Database accepted is_mock=false in ${table}`);
        } catch (error) {
          expect(error).toMatchObject({ code: '23514', constraint: expect.stringMatching(/^ck_room_upgrade_.*_values$/) });
        }
      } finally {
        try { await client.query('ROLLBACK'); } finally { client.release(); }
      }
      expect((await tableBytes(table)).equals(before)).toBe(true);
      expect(await persisted(proposal.proposalId)).toMatchObject({ status: 'PENDING_RECEPTIONIST', version: 1 });
      expect(await counts()).toEqual([1, 1, 1, 1]);
    });
  });
});
