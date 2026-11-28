import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule, InvalidAccessTokenError, MemorySidBlocklist, type AuthUser } from '@vintrip/auth';
import { createNoOpTransactionalPlugins } from '@vintrip/db';
import { ClsModule } from 'nestjs-cls';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGlobalPrefix } from '../../../../platform/http.js';
import { TraceContext } from '../../trace-context.js';
import { RoomUpgradeProposalUseCases, type ProposalDetailResponse, type ProposalHistoryResponse } from '../application/room-upgrade-proposal.use-cases.js';
import {
  ROOM_UPGRADE_CLOCK, ROOM_UPGRADE_PROPOSAL_STORE, ROOM_UPGRADE_STORE,
  type ProposalAuditEventRecord, type ProposalIdempotencyRecord, type ProposalRecord, type ProposalRevisionRecord,
  type RoomUpgradeProposalStore, type RoomUpgradeProposalTx, type RoomUpgradeStore,
} from '../application/room-upgrade.ports.js';
import { type CreateProposalRequest, hashIdempotencyKey } from '../domain/room-upgrade-proposal.js';
import type { Snapshot, StaffRole } from '../domain/room-upgrade.js';
import { createRoomUpgradeFixture, DEMO_HOTEL_ID } from '../infra/room-upgrade.fixture.js';
import { RoomUpgradesModule } from '../room-upgrades.module.js';

const users = {
  receptionist: { userId: '00000000-0000-4000-8000-000000000001', role: 'member', sid: 's1', exp: 9_999_999_999 },
  manager: { userId: '00000000-0000-4000-8000-000000000002', role: 'member', sid: 's2', exp: 9_999_999_999 },
  superadmin: { userId: '00000000-0000-4000-8000-000000000003', role: 'superadmin', sid: 's3', exp: 9_999_999_999 },
  customer: { userId: '00000000-0000-4000-8000-000000000004', role: 'member', sid: 's4', exp: 9_999_999_999 },
  unassigned: { userId: '00000000-0000-4000-8000-000000000005', role: 'member', sid: 's5', exp: 9_999_999_999 },
  otherStaff: { userId: '00000000-0000-4000-8000-000000000006', role: 'member', sid: 's6', exp: 9_999_999_999 },
} satisfies Record<string, AuthUser>;
type Token = keyof typeof users;
const route = '/api/commerce/room-upgrades/proposals';
const otherHotel = 'another-hotel';
const createInput = { hotelId: DEMO_HOTEL_ID, bookingCode: 'C2-0001', targetRoomTypeId: 'DLX', effectiveAt: '2026-12-11T14:00:00+07:00' };
const decisionInput = { hotelId: DEMO_HOTEL_ID, expectedVersion: 1, reason: 'Đã kiểm tra chính sách.' };
const scope = (hotelId: string, userId: string) => `${hotelId}:${userId}`;
type MemoryState = {
  proposals: ProposalRecord[]; revisions: ProposalRevisionRecord[];
  audits: ProposalAuditEventRecord[]; idempotency: ProposalIdempotencyRecord[];
};

/** Serialized writers + isolated copies emulate atomic commit/rollback, not pg retry/locking internals. */
class MemoryProposalStore implements RoomUpgradeProposalStore {
  state: MemoryState = { proposals: [], revisions: [], audits: [], idempotency: [] };
  assignments = new Map<string, StaffRole>([
    [scope(DEMO_HOTEL_ID, users.receptionist.userId), 'RECEPTIONIST'],
    [scope(DEMO_HOTEL_ID, users.manager.userId), 'MANAGER'],
    [scope(otherHotel, users.manager.userId), 'MANAGER'],
    [scope(otherHotel, users.otherStaff.userId), 'RECEPTIONIST'],
  ]);
  data: Snapshot = createRoomUpgradeFixture('2026-12-10');
  failAudit = false;
  failIdempotency = false;
  failCas = false;
  batchReads = 0;
  readTransactions = 0;
  writeTransactions = 0;
  private tail: Promise<void> = Promise.resolve();

  staffRole(hotelId: string, userId: string) { return this.assignments.get(scope(hotelId, userId)) ?? null; }

  private tx(state: MemoryState): RoomUpgradeProposalTx {
    const assignments = new Map(this.assignments);
    const data = structuredClone(this.data);
    const proposal = (hotelId: string, id: string) => state.proposals.find((row) => row.hotelId === hotelId && row.id === id) ?? null;
    return {
      listStaffAssignments: async (userId) => [...assignments.entries()]
        .filter(([key]) => key.endsWith(`:${userId}`))
        .map(([key, staffRole]) => ({ hotelId: key.slice(0, -(userId.length + 1)),
          hotelName: key.startsWith(`${data.hotel.id}:`) ? data.hotel.name : 'Other synthetic hotel',
          timezone: data.hotel.timezone, fixtureVersion: data.hotel.fixtureVersion, staffRole }))
        .sort((a, b) => a.hotelId.localeCompare(b.hotelId)),
      countProposalsByStatus: async (hotelId) => {
        const counts = new Map<ProposalRecord['status'], number>();
        for (const row of state.proposals.filter((item) => item.hotelId === hotelId)) {
          counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        }
        return [...counts].map(([status, count]) => ({ status, count }));
      },
      staffRole: async (hotelId, userId) => assignments.get(scope(hotelId, userId)) ?? null,
      loadSnapshot: async (hotelId) => data.hotel.id === hotelId ? structuredClone(data) : null,
      findIdempotency: async (input) => structuredClone(state.idempotency.find((row) => row.hotelId === input.hotelId &&
        row.actorUserId === input.actorUserId && row.operation === input.operation && row.targetId === input.targetId &&
        row.idempotencyKey === input.idempotencyKey) ?? null),
      insertIdempotency: async (record) => {
        state.idempotency.push(structuredClone(record));
        if (this.failIdempotency) throw new Error('Injected replay insert failure');
      },
      insertProposal: async (record) => { state.proposals.push(structuredClone(record)); return structuredClone(record); },
      getProposal: async (hotelId, id) => structuredClone(proposal(hotelId, id)),
      lockProposalForUpdate: async (hotelId, id) => structuredClone(proposal(hotelId, id)),
      lockApprovalSourcesForShare: async () => {},
      listProposals: async (input) => {
        const rows = state.proposals.filter((row) => row.hotelId === input.hotelId &&
          (input.status === undefined || row.status === input.status) &&
          (input.bookingCode === undefined || row.bookingCode === input.bookingCode) &&
          (input.requiredApprovalRole === undefined || row.requiredApprovalRole === input.requiredApprovalRole))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
        return { total: rows.length, items: structuredClone(rows.slice(input.offset, input.offset + input.limit)) };
      },
      updateProposalCas: async (input) => {
        const row = proposal(input.hotelId, input.proposalId);
        if (this.failCas || !row || row.version !== input.expectedVersion || row.status !== input.expectedStatus) return null;
        Object.assign(row, structuredClone(input.changes), { version: row.version + 1 });
        return structuredClone(row);
      },
      insertRevision: async (record) => { state.revisions.push(structuredClone(record)); return structuredClone(record); },
      getRevision: async (hotelId, id, revisionNumber) => structuredClone(state.revisions.find((row) =>
        row.hotelId === hotelId && row.proposalId === id && row.revisionNumber === revisionNumber) ?? null),
      listRevisions: async (hotelId, id) => structuredClone(state.revisions.filter((row) => row.hotelId === hotelId && row.proposalId === id)),
      listRevisionsByProposalIds: async (hotelId, ids) => {
        this.batchReads++;
        return structuredClone(state.revisions.filter((row) => row.hotelId === hotelId && ids.includes(row.proposalId)));
      },
      insertAuditEvent: async (record) => {
        state.audits.push(structuredClone(record));
        if (this.failAudit) throw new Error('Injected failure after audit insert');
        return structuredClone(record);
      },
      listAuditEvents: async (hotelId, id) => structuredClone(state.audits.filter((row) => row.hotelId === hotelId && row.proposalId === id)),
    };
  }

  async withReadTransaction<T>(run: (tx: RoomUpgradeProposalTx) => Promise<T>): Promise<T> {
    this.readTransactions++;
    await this.tail;
    return run(this.tx(structuredClone(this.state)));
  }
  async withSerializableTransaction<T>(run: (tx: RoomUpgradeProposalTx) => Promise<T>): Promise<T> {
    this.writeTransactions++;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const draft = structuredClone(this.state);
      const result = await run(this.tx(draft));
      this.state = draft;
      return result;
    } finally { release(); }
  }
}

describe('room-upgrade proposals HTTP: approval lifecycle, isolation and replay', () => {
  let app: INestApplication;
  let store: MemoryProposalStore;
  let now: Date;

  beforeEach(async () => {
    store = new MemoryProposalStore();
    now = new Date('2026-12-10T08:00:00+07:00');
    const cp1Store: RoomUpgradeStore = {
      beginReadSnapshot: async () => {},
      staffRole: async (hotelId, userId) => store.staffRole(hotelId, userId),
      loadSnapshot: async (hotelId) => hotelId === DEMO_HOTEL_ID ? structuredClone(store.data) : null,
    };
    const module = await Test.createTestingModule({ imports: [
      ClsModule.forRoot({ global: true, middleware: { mount: true }, plugins: createNoOpTransactionalPlugins() }),
      AuthModule.forRootAsync({ useFactory: () => ({ verifier: async (token: string) => {
        const user = users[token as Token];
        if (!user) throw new InvalidAccessTokenError();
        return user;
      }, blocklist: new MemorySidBlocklist() }) }),
      RoomUpgradesModule,
    ] })
      .overrideProvider(ROOM_UPGRADE_STORE).useValue(cp1Store)
      .overrideProvider(ROOM_UPGRADE_PROPOSAL_STORE).useValue(store)
      .overrideProvider(ROOM_UPGRADE_CLOCK).useValue(() => new Date(now))
      .overrideProvider(TraceContext).useValue({ current: () => ({ requestId: 'proposal-http-test', source: 'test' }) })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    applyGlobalPrefix(app);
    await app.init();
  });
  afterEach(async () => { await app?.close(); });

  function post(path: string, input: string | object | undefined, token: Token = 'receptionist', key: string = randomUUID()) {
    return request(app.getHttpServer()).post(`${route}${path}`).auth(token, { type: 'bearer' }).set('Idempotency-Key', key).send(input);
  }
  function get(path = '', query: Record<string, string | number | undefined> = {}, token: Token = 'receptionist') {
    return request(app.getHttpServer()).get(`${route}${path}`).auth(token, { type: 'bearer' }).query({ hotelId: DEMO_HOTEL_ID, ...query });
  }
  async function create(input: Record<string, unknown> = {}, token: Token = 'receptionist'): Promise<ProposalDetailResponse> {
    const response = await post('', { ...createInput, ...input }, token).expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    return response.body as ProposalDetailResponse;
  }
  async function history(id: string): Promise<ProposalHistoryResponse> {
    const response = await get(`/${id}/history`).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return response.body as ProposalHistoryResponse;
  }

  it('staff-context requires authentication and returns ordered active assignments with no writes', async () => {
    const path = '/api/commerce/room-upgrades/staff-context';
    await request(app.getHttpServer()).get(path).expect(401);
    const before = structuredClone(store.state);
    const response = await request(app.getHttpServer()).get(path).auth('manager', { type: 'bearer' }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ caseId: 'C2', isMock: true, operationalEffects: 'NONE',
      requestId: 'proposal-http-test', userId: users.manager.userId, hasAccess: true,
      assignments: [
        { hotelId: otherHotel, hotelName: 'Other synthetic hotel', timezone: store.data.hotel.timezone,
          fixtureVersion: store.data.hotel.fixtureVersion, staffRole: 'MANAGER' },
        { hotelId: DEMO_HOTEL_ID, hotelName: store.data.hotel.name, timezone: store.data.hotel.timezone,
          fixtureVersion: store.data.hotel.fixtureVersion, staffRole: 'MANAGER' },
      ].sort((a, b) => a.hotelId.localeCompare(b.hotelId)) });
    expect(store.state).toEqual(before);
    expect(store.readTransactions).toBe(1);
    expect(store.writeTransactions).toBe(0);
  });

  it.each(['customer', 'unassigned', 'superadmin', 'receptionist'] as const)(
    'staff-context returns 200 without access for %s (including revoked staff)', async (token) => {
      if (token === 'receptionist') store.assignments.delete(scope(DEMO_HOTEL_ID, users.receptionist.userId));
      const response = await request(app.getHttpServer()).get('/api/commerce/room-upgrades/staff-context')
        .auth(token, { type: 'bearer' }).expect(200);
      expect(response.body).toMatchObject({ userId: users[token].userId, hasAccess: false, assignments: [] });
      const denied = await get('/summary', {}, token).expect(403);
      expect(denied.body.code).toBe('HOTEL_ACCESS_DENIED');
      expect(store.writeTransactions).toBe(0);
    },
  );

  it('summary is routed before proposalId, validates scope and returns zero counts for an empty hotel', async () => {
    await request(app.getHttpServer()).get(`${route}/summary?hotelId=${DEMO_HOTEL_ID}`).expect(401);
    await request(app.getHttpServer()).get(`${route}/summary`).auth('manager', { type: 'bearer' }).expect(400);
    await get('/summary', { unknown: 'value' }).expect(400);
    const response = await get('/summary').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ caseId: 'C2', isMock: true, operationalEffects: 'NONE', requestId: 'proposal-http-test',
      hotel: { id: DEMO_HOTEL_ID, name: store.data.hotel.name, timezone: store.data.hotel.timezone,
        fixtureVersion: store.data.hotel.fixtureVersion }, staffRole: 'RECEPTIONIST',
      counts: { inHouseBookings: 8, totalProposals: 0, draft: 0, pendingReceptionist: 0, pendingManager: 0,
        approved: 0, rejected: 0, expired: 0, requoteRequired: 0 }, recentProposals: [] });
  });

  it('summary counts all statuses beyond pagination, isolates hotels and hydrates the current revision', async () => {
    const statuses: ProposalRecord['status'][] = ['DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED',
      'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED'];
    for (let i = 0; i < 23; i++) {
      const created = await create();
      const row = store.state.proposals.find((proposal) => proposal.id === created.proposalId)!;
      row.status = statuses[i % statuses.length]!;
      row.updatedAt = new Date(now.getTime() + i * 1000).toISOString();
    }
    const latest = store.state.proposals.at(-1)!;
    const revision = store.state.revisions.find((row) => row.proposalId === latest.id)!;
    latest.currentRevision = 2;
    store.state.revisions.push({ ...structuredClone(revision), revisionNumber: 2, priceDiffVnd: 777_000 });
    store.state.proposals.push({ ...structuredClone(latest), id: randomUUID(), hotelId: otherHotel });
    // Boundary rule: include check-in == now, exclude checkout == now and future check-in.
    store.data.bookings[0]!.checkInAt = now.toISOString();
    store.data.bookings[1]!.checkOutAt = now.toISOString();
    store.data.bookings[2]!.checkInAt = new Date(now.getTime() + 1).toISOString();
    const before = structuredClone(store.state);
    const source = structuredClone(store.data);
    const response = await get('/summary', {}, 'manager').expect(200);
    expect(response.body.counts).toEqual({ inHouseBookings: 6, totalProposals: 23, draft: 4, pendingReceptionist: 4,
      pendingManager: 3, approved: 3, rejected: 3, expired: 3, requoteRequired: 3 });
    expect(response.body.recentProposals).toHaveLength(5);
    expect(response.body.recentProposals[0]).toMatchObject({ proposalId: latest.id, currentRevision: 2, priceDiffVnd: 777_000 });
    expect(response.body.recentProposals.map((row: { proposalId: string }) => row.proposalId))
      .toEqual(store.state.proposals.slice(0, 23).slice(-5).reverse().map((row) => row.id));
    expect(store.state).toEqual(before);
    expect(store.data).toEqual(source);
    expect(store.batchReads).toBe(1);
    expect(store.readTransactions).toBe(1);
    expect(store.writeTransactions).toBe(23);
  });

  it('summary fails closed if the current revision is missing', async () => {
    await create();
    store.state.revisions = [];
    const response = await get('/summary').expect(503);
    expect(response.body.code).toBe('PROPOSAL_REVISION_MISSING');
  });

  it('creates a server-validated 600,000 VND quote and receptionist approves without operational writes', async () => {
    const source = structuredClone(store.data);
    const proposal = await create();
    expect(proposal).toMatchObject({ status: 'PENDING_RECEPTIONIST', version: 1, currentRevision: 1,
      priceDiffVnd: 600_000, requiredApprovalRole: 'RECEPTIONIST', isMock: true, operationalEffects: 'NONE',
      requiresHumanApproval: true, quote: { validation: { checked: true, passed: true } },
      calculatedAt: now.toISOString(), businessFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(proposal.allowedActions).toEqual(['REVISE', 'APPROVE', 'REJECT', 'ESCALATE']);
    const approved = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(200);
    expect(approved.headers['cache-control']).toBe('no-store');
    expect(approved.body).toMatchObject({ status: 'APPROVED', version: 2, currentRevision: 1, allowedActions: [],
      decidedBy: users.receptionist.userId, decidedByRole: 'RECEPTIONIST', decisionReason: decisionInput.reason,
      priceDiffVnd: 600_000, operationalEffects: 'NONE', requiresHumanApproval: true });
    expect(store.data).toEqual(source);
    expect(store.state.audits.map((event) => event.action)).toEqual(['CREATED', 'APPROVED']);
    expect(store.state.audits[1]).toMatchObject({ previousStatus: 'PENDING_RECEPTIONIST', newStatus: 'APPROVED',
      proposalVersion: 2, revisionNumber: 1, actorRole: 'RECEPTIONIST', requestId: 'proposal-http-test', isMock: true });
  });

  it('rejects with a required reason and records the decision', async () => {
    const proposal = await create();
    const rejected = await post(`/${proposal.proposalId}/reject`, decisionInput).expect(200);
    expect(rejected.headers['cache-control']).toBe('no-store');
    expect(rejected.body).toMatchObject({ status: 'REJECTED', decisionReason: decisionInput.reason, version: 2,
      allowedActions: [], decidedBy: users.receptionist.userId });
    expect((await history(proposal.proposalId)).auditEvents[1]).toMatchObject({ action: 'REJECTED', reason: decisionInput.reason });
  });

  it('revises the effective date, keeps immutable revision 1, and orders history despite identical timestamps', async () => {
    const proposal = await create();
    const original = structuredClone(store.state.revisions[0]);
    const response = await post(`/${proposal.proposalId}/revise`, { ...decisionInput, effectiveAt: '2026-12-12T14:00:00+07:00' }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ currentRevision: 2, version: 2, priceDiffVnd: 300_000,
      normalizedRequest: { effectiveAt: '2026-12-12T14:00:00+07:00', bookingCode: 'C2-0001' } });
    store.state.revisions.reverse();
    store.state.audits.reverse();
    const result = await history(proposal.proposalId);
    expect(result.revisions.map((revision) => revision.revisionNumber)).toEqual([1, 2]);
    expect(result.revisions[0]).toEqual(original);
    expect(result.auditEvents.map((event) => event.action)).toEqual(['CREATED', 'REVISED']);
    await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }).expect(200);
  });

  it('preserves the normalized effectiveAt offset when the store normalizes its timestamp column to UTC', async () => {
    const proposal = await create();
    store.state.revisions[0]!.effectiveAt = new Date(proposal.effectiveAt).toISOString();
    await post(`/${proposal.proposalId}/revise`, decisionInput).expect(200);
    store.state.revisions[1]!.effectiveAt = new Date(proposal.effectiveAt).toISOString();
    const approved = await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }).expect(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  it('escalates manually, enforces manager approval, and keeps the original quoted approval role', async () => {
    const proposal = await create();
    const escalated = await post(`/${proposal.proposalId}/escalate`, decisionInput).expect(200);
    expect(escalated.headers['cache-control']).toBe('no-store');
    expect(escalated.body).toMatchObject({ status: 'PENDING_MANAGER', version: 2, requiredApprovalRole: 'MANAGER',
      reasonCodes: ['MANUAL_ESCALATION'], quote: { approvalRole: 'RECEPTIONIST' }, allowedActions: ['REVISE'] });
    const denied = await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }).expect(403);
    expect(denied.body.code).toBe('INSUFFICIENT_APPROVAL_ROLE');
    const approved = await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }, 'manager').expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', version: 3, decidedByRole: 'MANAGER', priceDiffVnd: 600_000 });
    expect((await history(proposal.proposalId)).auditEvents.map((event) => event.action)).toEqual(['CREATED', 'ESCALATED', 'APPROVED']);
  });

  it.each([
    { input: { bookingCode: 'C2-0010' }, amount: -1_000_000, raiseSuiteRate: false },
    { input: { requestType: 'COMPLIMENTARY_UPGRADE' }, amount: 600_000, raiseSuiteRate: false },
    { input: { targetRoomTypeId: 'STE', effectiveAt: '2026-12-10T14:00:00+07:00' }, amount: 3_300_000, raiseSuiteRate: true },
  ])('manager approves required quotes without waiving the calculated amount: $amount', async ({ input, amount, raiseSuiteRate }) => {
    if (raiseSuiteRate) {
      store.data.rates.filter((rate) => rate.roomTypeId === 'STE').forEach((rate) => { rate.priceVnd += 100_000; });
    }
    const proposal = await create(input);
    expect(proposal).toMatchObject({ status: 'PENDING_MANAGER', priceDiffVnd: amount, requiredApprovalRole: 'MANAGER' });
    for (const action of ['approve', 'reject']) {
      const denied = await post(`/${proposal.proposalId}/${action}`, decisionInput).expect(403);
      expect(denied.body.code).toBe('INSUFFICIENT_APPROVAL_ROLE');
    }
    const approved = await post(`/${proposal.proposalId}/approve`, decisionInput, 'manager').expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', priceDiffVnd: amount });
  });

  it('lists scoped summaries with all filters, pagination, current revision and batched reads', async () => {
    const first = await create();
    await create({ bookingCode: 'C2-0010' });
    await create({ bookingCode: 'C2-0002' });
    await post(`/${first.proposalId}/revise`, { ...decisionInput, effectiveAt: '2026-12-12T14:00:00+07:00' }).expect(200);
    const list = await get().expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body).toMatchObject({ total: 3, limit: 20, offset: 0, hotelId: DEMO_HOTEL_ID,
      staffRole: 'RECEPTIONIST', operationalEffects: 'NONE', isMock: true });
    expect(store.batchReads).toBe(1);
    const filtered = await get('', { status: 'PENDING_MANAGER', bookingCode: 'C2-0010', requiredApprovalRole: 'MANAGER', limit: 1, offset: 0 }).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0]).toMatchObject({ bookingCode: 'C2-0010', allowedActions: ['REVISE'], quoteStatus: 'REQUIRES_MANAGER' });
    const revised = await get('', { bookingCode: 'C2-0001' }).expect(200);
    expect(revised.body.items[0]).toMatchObject({ currentRevision: 2, priceDiffVnd: 300_000 });
    const page = await get('', { limit: 1, offset: 1 }).expect(200);
    expect(page.body).toMatchObject({ total: 3, limit: 1, offset: 1 });
    expect(page.body.items).toHaveLength(1);
    expect((await get('', { offset: 100 }).expect(200)).body.items).toEqual([]);
    expect((await get('', { hotelId: otherHotel }, 'manager').expect(200)).body.items).toEqual([]);
    const detail = await get(`/${first.proposalId}`).expect(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(detail.body).toMatchObject({ proposalId: first.proposalId, currentRevision: 2, quote: { priceDiffVnd: 300_000 } });
    await history(first.proposalId);
    expect(store.readTransactions).toBeGreaterThan(0);
  });

  it('requires authentication on every route', async () => {
    for (const path of ['', `/${randomUUID()}`, `/${randomUUID()}/history`]) {
      await request(app.getHttpServer()).get(`${route}${path}`).query({ hotelId: DEMO_HOTEL_ID }).expect(401);
    }
    for (const path of ['', ...['revise', 'approve', 'reject', 'escalate'].map((action) => `/${randomUUID()}/${action}`)]) {
      await request(app.getHttpServer()).post(`${route}${path}`).set('Idempotency-Key', randomUUID()).send(createInput).expect(401);
    }
    expect(store.writeTransactions).toBe(0);
  });

  it.each(['customer', 'unassigned', 'superadmin', 'otherStaff'] as const)('denies %s without a server-side assignment', async (token) => {
    const proposal = await create();
    await get('', {}, token).expect(403);
    await get(`/${proposal.proposalId}`, {}, token).expect(403);
    await get(`/${proposal.proposalId}/history`, {}, token).expect(403);
    await post('', createInput, token).expect(403);
    for (const action of ['revise', 'approve', 'reject', 'escalate']) {
      const response = await post(`/${proposal.proposalId}/${action}`, decisionInput, token).expect(403);
      expect(response.body.code).toBe('HOTEL_ACCESS_DENIED');
    }
    expect(store.state.audits).toHaveLength(1);
  });

  it('does not resolve a foreign proposal even for staff assigned to both hotels', async () => {
    const proposal = await create();
    for (const path of [`/${proposal.proposalId}`, `/${proposal.proposalId}/history`]) {
      await get(path, { hotelId: otherHotel }, 'manager').expect(404);
      await get(path, { hotelId: otherHotel }).expect(403);
    }
    for (const action of ['revise', 'approve', 'reject', 'escalate']) {
      await post(`/${proposal.proposalId}/${action}`, { ...decisionInput, hotelId: otherHotel }, 'manager').expect(404);
      await post(`/${proposal.proposalId}/${action}`, { ...decisionInput, hotelId: otherHotel }).expect(403);
    }
    await post('', { ...createInput, bookingCode: 'unknown' }).expect(404);
    await get(`/${randomUUID()}`).expect(404);
    expect(store.state.proposals[0]!.version).toBe(1);
  });

  it.each([
    { actorRole: 'MANAGER' }, { actorUserId: users.manager.userId }, { amount: 0 }, { priceDiffVnd: 0 },
    { status: 'APPROVED' }, { approved: true }, { isMock: false },
  ])('rejects forged authority/money/state on every command: %j', async (forged) => {
    await post('', { ...createInput, ...forged }).expect(400);
    for (const action of ['revise', 'approve', 'reject', 'escalate']) {
      await post(`/${randomUUID()}/${action}`, { ...decisionInput, ...forged }).expect(400);
    }
    expect(store.state.proposals).toHaveLength(0);
    expect(store.writeTransactions).toBe(0);
  });

  it('rejects booking changes during revise and invalid schemas before touching storage', async () => {
    const proposal = await create();
    await post(`/${proposal.proposalId}/revise`, { ...decisionInput, bookingCode: 'C2-0002' }).expect(400);
    await post('', { ...createInput, roomNumber: '101' }).expect(400);
    await post('', { hotelId: DEMO_HOTEL_ID }).expect(400);
    for (const action of ['reject', 'escalate']) {
      await post(`/${proposal.proposalId}/${action}`, { hotelId: DEMO_HOTEL_ID, expectedVersion: 1 }).expect(400);
      await post(`/${proposal.proposalId}/${action}`, { ...decisionInput, reason: '  ' }).expect(400);
    }
    for (const query of [{ limit: 0 }, { limit: 51 }, { offset: -1 }, { offset: 10_001 }, { status: 'INVENTED' }, { actorRole: 'MANAGER' }]) {
      await get('', query).expect(400);
    }
    expect(store.state.proposals[0]!.version).toBe(1);
  });

  it('validates UUID params and required idempotency keys on every command', async () => {
    for (const path of ['/not-a-uuid', '/not-a-uuid/history']) {
      const response = await get(path).expect(400);
      expect(response.body.code).toBe('INVALID_PROPOSAL_ID');
    }
    for (const action of ['revise', 'approve', 'reject', 'escalate']) {
      const response = await post(`/not-a-uuid/${action}`, decisionInput).expect(400);
      expect(response.body.code).toBe('INVALID_PROPOSAL_ID');
    }
    for (const path of ['', ...['revise', 'approve', 'reject', 'escalate'].map((action) => `/${randomUUID()}/${action}`)]) {
      const body = path ? decisionInput : createInput;
      const missing = await request(app.getHttpServer()).post(`${route}${path}`).auth('receptionist', { type: 'bearer' }).send(body).expect(400);
      expect(missing.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
      for (const key of ['short', 'invalid key', 'x'.repeat(129)]) {
        const invalid = await post(path, body, 'receptionist', key).expect(400);
        expect(invalid.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
      }
    }
    expect(store.writeTransactions).toBe(0);
  });

  it('revokes access before approval and before replay, without leaking stored responses', async () => {
    const key = randomUUID();
    const created = await post('', createInput, 'receptionist', key).expect(201);
    store.assignments.delete(scope(DEMO_HOTEL_ID, users.receptionist.userId));
    await post(`/${created.body.proposalId}/approve`, decisionInput).expect(403);
    const denied = await post('', createInput, 'receptionist', key).expect(403);
    expect(denied.headers['idempotency-replayed']).toBeUndefined();
    expect(denied.body.proposalId).toBeUndefined();
    expect(store.state.proposals[0]!.status).toBe('PENDING_RECEPTIONIST');
  });

  it('rechecks assignment before replaying a successful approval', async () => {
    const proposal = await create();
    const key = randomUUID();
    await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
    store.assignments.delete(scope(DEMO_HOTEL_ID, users.receptionist.userId));
    const denied = await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(403);
    expect(denied.headers['idempotency-replayed']).toBeUndefined();
  });

  it.each([
    { expectedPriceDiffVnd: 0 }, { expectedSnapshotId: 'old-snapshot' },
    { expectedQuoteStatus: 'REQUIRES_MANAGER' }, { expectedApprovalRole: 'MANAGER' },
  ])('rolls back preview mismatches on create and revise: %j', async (previewExpectation) => {
    const mismatch = await post('', { ...createInput, previewExpectation }).expect(409);
    expect(mismatch.body).toMatchObject({ code: 'PREVIEW_MISMATCH', reasonCodes: ['PREVIEW_MISMATCH'],
      expected: previewExpectation, freshQuote: { priceDiffVnd: 600_000 } });
    expect(store.state).toEqual({ proposals: [], revisions: [], audits: [], idempotency: [] });
    const proposal = await create();
    const before = structuredClone(store.state);
    await post(`/${proposal.proposalId}/revise`, { ...decisionInput, previewExpectation }).expect(409);
    expect(store.state).toEqual(before);
  });

  it('accepts a matching preview and resolves room-number input to a bound booking', async () => {
    const { bookingCode: _bookingCode, ...byRoom } = createInput;
    const created = await post('', { ...byRoom, roomNumber: '101', previewExpectation: {
      expectedPriceDiffVnd: 600_000, expectedQuoteStatus: 'VALID', expectedApprovalRole: 'RECEPTIONIST',
    } }).expect(201);
    expect(created.body).toMatchObject({ bookingCode: 'C2-0001', normalizedRequest: { bookingCode: 'C2-0001', benefitId: null } });
    expect(created.body.normalizedRequest.roomNumber).toBeUndefined();
  });

  it.each(['checked-out', 'unavailable'] as const)('refuses non-persistable %s quotes with no writes', async (mode) => {
    const input = { ...createInput };
    if (mode === 'checked-out') input.bookingCode = 'C2-0008';
    else store.data.inventory.filter((row) => row.roomTypeId === 'DLX').forEach((row) => { row.stopSell = true; });
    const response = await post('', input).expect(422);
    expect(response.body.code).toBe('QUOTE_NOT_PERSISTABLE');
    expect(store.state).toEqual({ proposals: [], revisions: [], audits: [], idempotency: [] });
  });

  it('rolls back an unquotable revision and rejects invalid or cross-hotel snapshot data', async () => {
    const proposal = await create();
    const before = structuredClone(store.state);
    store.data.inventory.filter((row) => row.roomTypeId === 'DLX').forEach((row) => { row.stopSell = true; });
    await post(`/${proposal.proposalId}/revise`, decisionInput).expect(422);
    expect(store.state).toEqual(before);
    store.data.roomTypes[0]!.hotelId = otherHotel;
    const response = await post('', createInput).expect(503);
    expect(response.body.code).toBe('INVALID_SNAPSHOT');
    expect(store.state).toEqual(before);
    store.data.roomTypes[0]!.hotelId = DEMO_HOTEL_ID;
    store.data.rates[0]!.priceVnd = -1;
    await post('', createInput).expect(503);
    expect(store.state).toEqual(before);
  });

  it('replays create exactly, normalizes defaults/key order, and rejects changed payloads', async () => {
    const key = randomUUID();
    const created = await post('', createInput, 'receptionist', key).expect(201);
    now = new Date(now.getTime() + 60_000);
    const replay = await post('', { requiredFeatures: [], requestType: 'UPGRADE', ...createInput }, 'receptionist', key).expect(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.headers['cache-control']).toBe('no-store');
    expect(replay.body).toEqual(created.body);
    expect(store.state.proposals).toHaveLength(1);
    expect(store.state.audits).toHaveLength(1);
    expect(store.state.audits[0]!.idempotencyKeyHash).toBe(hashIdempotencyKey(key));
    const conflict = await post('', { ...createInput, effectiveAt: '2026-12-12T14:00:00+07:00' }, 'receptionist', key).expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect(store.state.audits).toHaveLength(1);
  });

  it('replays approval before version/state checks and rejects a changed approval payload', async () => {
    const proposal = await create();
    const key = randomUUID();
    const approved = await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
    const replay = await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(approved.body);
    expect(store.state.audits).toHaveLength(2);
    const conflict = await post(`/${proposal.proposalId}/approve`, { ...decisionInput, reason: 'Lý do khác.' }, 'receptionist', key).expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    const repeated = await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 2 }).expect(409);
    expect(repeated.body.code).toBe('INVALID_STATE_TRANSITION');
    const oldVersion = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409);
    expect(oldVersion.body.code).toBe('VERSION_CONFLICT');
  });

  it.each(['revise', 'reject', 'escalate'] as const)('replays %s exactly with no duplicate revision or audit', async (action) => {
    const proposal = await create();
    const key = randomUUID();
    const first = await post(`/${proposal.proposalId}/${action}`, decisionInput, 'receptionist', key).expect(200);
    const before = structuredClone(store.state);
    const replay = await post(`/${proposal.proposalId}/${action}`, decisionInput, 'receptionist', key).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(store.state).toEqual(before);
    const mismatch = await post(`/${proposal.proposalId}/${action}`, { ...decisionInput, reason: 'Khác.' }, 'receptionist', key).expect(409);
    expect(mismatch.body.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('scopes replay keys by actor, target and operation', async () => {
    const key = randomUUID();
    const first = await post('', createInput, 'receptionist', key).expect(201);
    const second = await post('', createInput, 'manager', key).expect(201);
    expect(second.body.proposalId).not.toBe(first.body.proposalId);
    await post(`/${first.body.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
    await post(`/${second.body.proposalId}/approve`, decisionInput, 'receptionist', key).expect(200);
    expect(store.state.idempotency).toHaveLength(4);
  });

  it('serializes concurrent identical requests and conflicting decisions without duplicate audits', async () => {
    const key = randomUUID();
    const results = await Promise.all([post('', createInput, 'receptionist', key), post('', createInput, 'receptionist', key)]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0]!.body).toEqual(results[1]!.body);
    expect(results.filter((result) => result.headers['idempotency-replayed'] === 'true')).toHaveLength(1);
    expect(store.state.proposals).toHaveLength(1);
    const id = store.state.proposals[0]!.id;
    const decisions = await Promise.all([post(`/${id}/approve`, decisionInput), post(`/${id}/reject`, decisionInput)]);
    expect(decisions.map((result) => result.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(store.state.audits).toHaveLength(2);
    expect(store.state.proposals[0]!.version).toBe(2);
  });

  it.each(['revise', 'approve', 'reject', 'escalate'])('rejects stale expectedVersion on %s without writes', async (action) => {
    const proposal = await create();
    const before = structuredClone(store.state);
    const conflict = await post(`/${proposal.proposalId}/${action}`, { ...decisionInput, expectedVersion: 99 }).expect(409);
    expect(conflict.body.code).toBe('VERSION_CONFLICT');
    expect(store.state).toEqual(before);
  });

  it.each(['APPROVED', 'REJECTED', 'EXPIRED'] as const)('rejects all commands on terminal %s', async (status) => {
    const proposal = await create();
    store.state.proposals[0]!.status = status;
    const before = structuredClone(store.state);
    for (const action of ['revise', 'approve', 'reject', 'escalate']) {
      const response = await post(`/${proposal.proposalId}/${action}`, decisionInput).expect(409);
      expect(response.body.code).toBe('INVALID_STATE_TRANSITION');
    }
    expect(store.state).toEqual(before);
  });

  it('rejects approve/escalate on REQUOTE_REQUIRED, escalation on PENDING_MANAGER and approval on DRAFT', async () => {
    const proposal = await create();
    for (const [status, actions] of [
      ['REQUOTE_REQUIRED', ['approve', 'escalate']], ['PENDING_MANAGER', ['escalate']], ['DRAFT', ['approve', 'reject', 'escalate']],
    ] as const) {
      store.state.proposals[0]!.status = status;
      for (const action of actions) {
        const response = await post(`/${proposal.proposalId}/${action}`, decisionInput, 'manager').expect(409);
        expect(response.body.code).toBe('INVALID_STATE_TRANSITION');
      }
    }
    expect(store.state.audits).toHaveLength(1);
  });

  it('commits stale quote + audit + replay, revises at the new rate and then approves', async () => {
    const proposal = await create();
    store.data.rates.find((rate) => rate.roomTypeId === 'DLX' && rate.date === '2026-12-12')!.priceVnd += 100_000;
    const key = randomUUID();
    const stale = await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(409);
    expect(stale.headers['cache-control']).toBe('no-store');
    expect(stale.body).toMatchObject({ code: 'REQUOTE_REQUIRED', proposal: { status: 'REQUOTE_REQUIRED', version: 2, currentRevision: 1,
      expiresAt: proposal.expiresAt }, freshQuote: { priceDiffVnd: 700_000, validation: { passed: true } } });
    expect(stale.body.reasonCodes).toEqual(expect.arrayContaining(['RATE_CHANGED', 'PRICE_CHANGED']));
    expect(store.state.proposals[0]).toMatchObject({ status: 'REQUOTE_REQUIRED', version: 2, currentRevision: 1, expiresAt: proposal.expiresAt });
    expect(store.state.audits[1]!.action).toBe('MARKED_REQUOTE_REQUIRED');
    const replay = await post(`/${proposal.proposalId}/approve`, decisionInput, 'receptionist', key).expect(409);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(stale.body);
    expect(store.state.audits).toHaveLength(2);
    const revised = await post(`/${proposal.proposalId}/revise`, { ...decisionInput, expectedVersion: 2 }).expect(200);
    expect(revised.body).toMatchObject({ status: 'PENDING_RECEPTIONIST', currentRevision: 2, version: 3, priceDiffVnd: 700_000 });
    await post(`/${proposal.proposalId}/approve`, { ...decisionInput, expectedVersion: 3 }).expect(200);
    expect((await history(proposal.proposalId)).auditEvents.map((event) => event.action)).toEqual([
      'CREATED', 'MARKED_REQUOTE_REQUIRED', 'REVISED', 'APPROVED',
    ]);
    expect(store.state.revisions[0]!.priceDiffVnd).toBe(600_000);
  });

  it.each(['booking', 'inventory', 'policy', 'approval-role', 'benefit'] as const)('marks changed %s data stale during atomic approval', async (kind) => {
    const proposal = await create(kind === 'benefit' ? { bookingCode: 'C2-0002' } : {});
    const expected: Record<typeof kind, string> = { booking: 'BOOKING_STATUS_CHANGED', inventory: 'INVENTORY_UNAVAILABLE',
      policy: 'POLICY_VERSION_CHANGED', 'approval-role': 'APPROVAL_ROLE_CHANGED', benefit: 'BENEFIT_CHANGED' };
    switch (kind) {
      case 'booking': store.data.bookings[0]!.status = 'CHECKED_OUT'; break;
      case 'inventory': store.data.inventory.filter((row) => row.roomTypeId === 'DLX').forEach((row) => { row.stopSell = true; }); break;
      case 'policy': store.data.policies[0]!.version++; break;
      case 'approval-role': store.data.policies[0]!.rules.maxReceptionistDiffVnd = 100_000; break;
      case 'benefit': store.data.benefits[0]!.discountBps = 2_000; break;
    }
    const stale = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409);
    expect(stale.body.code).toBe('REQUOTE_REQUIRED');
    expect(stale.body.reasonCodes).toContain(expected[kind]);
    expect(store.state.proposals[0]!.status).toBe('REQUOTE_REQUIRED');
  });

  it('permits rejecting REQUOTE_REQUIRED, while preserving manager rejection RBAC', async () => {
    const proposal = await create();
    store.state.proposals[0]!.status = 'REQUOTE_REQUIRED';
    store.state.proposals[0]!.requiredApprovalRole = 'MANAGER';
    await post(`/${proposal.proposalId}/reject`, decisionInput).expect(403);
    await post(`/${proposal.proposalId}/reject`, decisionInput, 'manager').expect(200);
  });

  it.each(['revise', 'approve', 'reject', 'escalate'] as const)('commits expiry and replays 409 exactly on %s at the expiry boundary', async (action) => {
    const proposal = await create();
    now = new Date(proposal.expiresAt);
    const beforeRead = structuredClone(store.state);
    const detail = await get(`/${proposal.proposalId}`).expect(200);
    expect(detail.body).toMatchObject({ status: 'PENDING_RECEPTIONIST', isExpired: true, allowedActions: [] });
    expect(store.state).toEqual(beforeRead);
    const key = randomUUID();
    const expired = await post(`/${proposal.proposalId}/${action}`, decisionInput, 'receptionist', key).expect(409);
    expect(expired.body).toMatchObject({ code: 'PROPOSAL_EXPIRED', reasonCodes: ['PROPOSAL_EXPIRED'],
      proposal: { status: 'EXPIRED', version: 2, currentRevision: 1, isExpired: true, allowedActions: [] } });
    expect(store.state.proposals[0]!.status).toBe('EXPIRED');
    expect(store.state.revisions).toHaveLength(1);
    expect(store.state.audits[1]).toMatchObject({ action: 'MARKED_EXPIRED', proposalVersion: 2, reasonCodes: ['PROPOSAL_EXPIRED'] });
    const replay = await post(`/${proposal.proposalId}/${action}`, decisionInput, 'receptionist', key).expect(409);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(expired.body);
    expect(store.state.audits).toHaveLength(2);
  });

  it.each(['approve', 'reject'] as const)('checks manager RBAC before allowing an expired %s to mutate', async (action) => {
    const proposal = await create({ bookingCode: 'C2-0010' });
    now = new Date(proposal.expiresAt);
    const before = structuredClone(store.state);
    const denied = await post(`/${proposal.proposalId}/${action}`, decisionInput).expect(403);
    expect(denied.body.code).toBe('INSUFFICIENT_APPROVAL_ROLE');
    expect(store.state).toEqual(before);
    await post(`/${proposal.proposalId}/${action}`, decisionInput, 'manager').expect(409);
    expect(store.state.proposals[0]!.status).toBe('EXPIRED');
  });

  it('converts a failed CAS to VERSION_CONFLICT and rolls back completely', async () => {
    const proposal = await create();
    const before = structuredClone(store.state);
    store.failCas = true;
    const response = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409);
    expect(response.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 1, currentStatus: 'PENDING_RECEPTIONIST' });
    expect(store.state).toEqual(before);
  });

  it.each([
    ['40001', false], ['40001', true], ['40P01', false], ['40P01', true],
  ] as const)('maps exhausted %s (nested=%s) to a clean conflict without writes', async (code, nested) => {
    const proposal = await create();
    const before = structuredClone(store.state);
    store.withSerializableTransaction = async () => {
      const pgError = Object.assign(new Error('Database transaction aborted'), { code });
      throw nested ? new Error('Drizzle query failed', { cause: new Error('wrapped', { cause: pgError }) }) : pgError;
    };
    const response = await post(`/${proposal.proposalId}/approve`, decisionInput).expect(409);
    expect(response.body).toMatchObject({ code: 'CONCURRENT_MODIFICATION',
      message: 'Giao dịch xung đột đồng thời; vui lòng thử lại.' });
    expect(store.state).toEqual(before);
  });

  it('preserves non-retryable database failures as 500 without writes', async () => {
    const proposal = await create();
    const before = structuredClone(store.state);
    store.withSerializableTransaction = async () => {
      throw new Error('Drizzle query failed', { cause: { code: '23505', constraint: 'unrelated_unique_key' } });
    };
    await post(`/${proposal.proposalId}/approve`, decisionInput).expect(500);
    expect(store.state).toEqual(before);
  });

  it.each(['create', 'revise', 'approve', 'reject', 'escalate', 'expire', 'stale'] as const)('rolls back %s including an audit failure after insert', async (action) => {
    const proposal = await create();
    const before = structuredClone(store.state);
    if (action === 'expire') now = new Date(proposal.expiresAt);
    if (action === 'stale') store.data.rates.find((row) => row.roomTypeId === 'DLX' && row.date === '2026-12-12')!.priceVnd++;
    store.failAudit = true;
    if (action === 'create') await post('', createInput).expect(500);
    else await post(`/${proposal.proposalId}/${action === 'expire' || action === 'stale' ? 'approve' : action}`, decisionInput).expect(500);
    expect(store.state).toEqual(before);
    expect(store.state.proposals[0]).toMatchObject({ status: 'PENDING_RECEPTIONIST', version: 1 });
    expect(store.state.audits.filter((event) => event.action === 'APPROVED')).toEqual([]);
  });

  it('rolls back proposal, revision and audit if saving replay fails, then permits retry with the same key', async () => {
    const key = randomUUID();
    store.failIdempotency = true;
    await post('', createInput, 'receptionist', key).expect(500);
    expect(store.state).toEqual({ proposals: [], revisions: [], audits: [], idempotency: [] });
    store.failIdempotency = false;
    await post('', createInput, 'receptionist', key).expect(201);
    expect(store.state.proposals).toHaveLength(1);
  });

  it('the application query fails closed when a current revision is missing', async () => {
    const proposal = await create();
    store.state.revisions = [];
    await get(`/${proposal.proposalId}`).expect(503);
    await get().expect(503);
  });

  it('use cases own transactional boundaries and recompute quotes inside every retry attempt', async () => {
    const useCases = app.get(RoomUpgradeProposalUseCases);
    const input: CreateProposalRequest = { ...createInput, requestType: 'UPGRADE', requiredFeatures: [] };
    const runTransaction = store.withSerializableTransaction.bind(store);
    let attempts = 0;
    store.withSerializableTransaction = async (run) => {
      try {
        await runTransaction(async (tx) => {
          attempts++;
          await run(tx);
          throw new Error('Simulated serialization abort');
        });
      } catch {
        store.data.rates.find((row) => row.roomTypeId === 'DLX' && row.date === '2026-12-12')!.priceVnd += 100_000;
      }
      attempts++;
      return runTransaction(run);
    };
    const response = await useCases.createProposal(users.receptionist.userId, input, randomUUID());
    expect(attempts).toBe(2);
    expect(response.body).toMatchObject({ priceDiffVnd: 700_000, version: 1 });
    expect(store.state.proposals).toHaveLength(1);
    expect(store.state.revisions).toHaveLength(1);
    expect(store.state.audits).toHaveLength(1);
    expect(store.state.idempotency).toHaveLength(1);
  });
});
