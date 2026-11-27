import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule, InvalidAccessTokenError, MemorySidBlocklist, type AuthUser } from '@vintrip/auth';
import { createNoOpTransactionalPlugins } from '@vintrip/db';
import { ClsModule } from 'nestjs-cls';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGlobalPrefix } from '../../../../platform/http.js';
import { TraceContext } from '../../trace-context.js';
import { ROOM_UPGRADE_CLOCK, ROOM_UPGRADE_STORE, type RoomUpgradeStore } from '../application/room-upgrade.ports.js';
import { createRoomUpgradeFixture, DEMO_HOTEL_ID } from '../infra/room-upgrade.fixture.js';
import { RoomUpgradesModule } from '../room-upgrades.module.js';

const users: Record<string, AuthUser> = {
  receptionist: { userId: '00000000-0000-4000-8000-000000000001', role: 'member', sid: 's1', exp: 9_999_999_999 },
  manager: { userId: '00000000-0000-4000-8000-000000000002', role: 'member', sid: 's2', exp: 9_999_999_999 },
  outsider: { userId: '00000000-0000-4000-8000-000000000003', role: 'superadmin', sid: 's3', exp: 9_999_999_999 },
};
const quoteBody = { hotelId: DEMO_HOTEL_ID, bookingCode: 'C2-0001', targetRoomTypeId: 'DLX', effectiveAt: '2026-12-11T14:00:00+07:00' };
const route = '/api/commerce/room-upgrades';

describe('room-upgrades HTTP: real guards, hotel scope and structured quotes', () => {
  let app: INestApplication;
  let data: ReturnType<typeof createRoomUpgradeFixture>;
  beforeEach(async () => {
    data = createRoomUpgradeFixture('2026-12-10');
    const store: RoomUpgradeStore = {
      beginReadSnapshot: async () => {},
      staffRole: async (hotel, user) => hotel !== DEMO_HOTEL_ID ? null :
        user === users.receptionist!.userId ? 'RECEPTIONIST' : user === users.manager!.userId ? 'MANAGER' : null,
      loadSnapshot: async (hotel) => hotel === DEMO_HOTEL_ID ? data : null,
    };
    const module = await Test.createTestingModule({ imports: [
      ClsModule.forRoot({ global: true, middleware: { mount: true }, plugins: createNoOpTransactionalPlugins() }),
      AuthModule.forRootAsync({ useFactory: () => ({ verifier: async (token: string) => {
        const user = users[token]; if (!user) throw new InvalidAccessTokenError(); return user;
      }, blocklist: new MemorySidBlocklist() }) }),
      RoomUpgradesModule,
    ] })
      .overrideProvider(ROOM_UPGRADE_STORE).useValue(store)
      .overrideProvider(ROOM_UPGRADE_CLOCK).useValue(() => new Date('2026-12-10T08:00:00+07:00'))
      .overrideProvider(TraceContext).useValue({ current: () => ({ requestId: 'http-room-upgrade-test', source: 'test' }) })
      .compile();
    app = module.createNestApplication(); applyGlobalPrefix(app); await app.init();
  });
  afterEach(async () => { await app.close(); });

  it('9: requires authentication and a server-side hotel assignment, including for global superadmin', async () => {
    await request(app.getHttpServer()).get(`${route}/bookings?hotelId=${DEMO_HOTEL_ID}`).expect(401);
    await request(app.getHttpServer()).get(`${route}/bookings?hotelId=${DEMO_HOTEL_ID}`).auth('outsider', { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' })
      .send({ ...quoteBody, hotelId: 'another-hotel' }).expect(403);
  });
  it('lists only current in-house bookings and supports lookup by room number', async () => {
    const response = await request(app.getHttpServer()).get(`${route}/bookings?hotelId=${DEMO_HOTEL_ID}`)
      .auth('receptionist', { type: 'bearer' }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.items).toHaveLength(8);
    const room = await request(app.getHttpServer()).get(`${route}/bookings?hotelId=${DEMO_HOTEL_ID}&roomNumber=101`)
      .auth('manager', { type: 'bearer' }).expect(200);
    expect(room.body.items[0].bookingCode).toBe('C2-0001');
    expect(room.body.staffRole).toBe('MANAGER');
  });
  it('returns the booking context without leaking other bookings or accepting unknown booking codes', async () => {
    const response = await request(app.getHttpServer()).get(`${route}/bookings/C2-0001?hotelId=${DEMO_HOTEL_ID}`)
      .auth('receptionist', { type: 'bearer' }).expect(200);
    expect(response.body).toMatchObject({ isMock: true, currency: 'VND', booking: { bookingCode: 'C2-0001' } });
    expect(response.body.bookings).toBeUndefined(); expect(response.body.roomTypes).toHaveLength(3);
    await request(app.getHttpServer()).get(`${route}/bookings/unknown?hotelId=${DEMO_HOTEL_ID}`)
      .auth('receptionist', { type: 'bearer' }).expect(404);
  });
  it('returns a server-validated quote and source snapshot; room-number lookup has the same amount', async () => {
    const response = await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' }).send(quoteBody).expect(200);
    expect(response.body).toMatchObject({ status: 'VALID', priceDiffVnd: 600_000, validation: { checked: true, passed: true },
      requestId: 'http-room-upgrade-test', caseId: 'C2', isMock: true, operationalEffects: 'NONE' });
    expect(response.body.snapshotId).toMatch(/^room-upgrades:[a-f0-9]{64}$/);
    const { bookingCode: _unused, ...byRoom } = quoteBody;
    const room = await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' })
      .send({ ...byRoom, roomNumber: '101' }).expect(200);
    expect(room.body.priceDiffVnd).toBe(response.body.priceDiffVnd);
    expect(room.body.snapshotId).toBe(response.body.snapshotId);
  });
  it('10: injection cannot self-assign manager, waive the amount, or force APPROVED', async () => {
    for (const forged of [{ role: 'MANAGER' }, { amount: 0 }, { approved: true }, { status: 'APPROVED' }]) {
      await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' }).send({ ...quoteBody, ...forged }).expect(400);
    }
    const response = await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' })
      .send({ ...quoteBody, requestType: 'COMPLIMENTARY_UPGRADE' }).expect(200);
    expect(response.body).toMatchObject({ status: 'REQUIRES_MANAGER', priceDiffVnd: 600_000, requiresHumanApproval: true });
  });
  it('returns missing fields, rejects ambiguous references and does not invent candidate IDs', async () => {
    const missing = await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' })
      .send({ hotelId: DEMO_HOTEL_ID }).expect(200);
    expect(missing.body).toMatchObject({ status: 'NEEDS_INPUT', priceDiffVnd: null });
    await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' })
      .send({ ...quoteBody, roomNumber: '101' }).expect(400);
    const invalid = await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' })
      .send({ ...quoteBody, targetRoomTypeId: 'invented-suite' }).expect(200);
    expect(invalid.body).toMatchObject({ status: 'MISSING_DATA', priceDiffVnd: null });
  });
  it('16 (CP1): repeated quotes do not mutate the mock booking, inventory or any source rows', async () => {
    const before = JSON.stringify(data);
    for (let i = 0; i < 2; i++) await request(app.getHttpServer()).post(`${route}/quotes`)
      .auth('receptionist', { type: 'bearer' }).send(quoteBody).expect(200);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('a changed rate changes the snapshot hash and recomputes the amount', async () => {
    const first = await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' }).send(quoteBody).expect(200);
    data.rates.find((r) => r.roomTypeId === 'DLX' && r.date === '2026-12-12')!.priceVnd += 100_000;
    const next = await request(app.getHttpServer()).post(`${route}/quotes`).auth('receptionist', { type: 'bearer' }).send(quoteBody).expect(200);
    expect(next.body.snapshotId).not.toBe(first.body.snapshotId); expect(next.body.priceDiffVnd).toBe(700_000);
  });
});
