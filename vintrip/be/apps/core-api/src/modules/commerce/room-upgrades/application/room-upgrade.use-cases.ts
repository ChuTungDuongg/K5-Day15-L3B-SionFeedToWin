import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Transactional } from '@vintrip/db';
import { TraceContext } from '../../trace-context.js';
import { SnapshotSchema, type QuoteRequest, type Snapshot } from '../domain/room-upgrade.js';
import { calculateQuote, validationFailure } from '../domain/upgrade-quote.js';
import { validateQuote } from '../domain/upgrade-quote-validator.js';
import { ROOM_UPGRADE_CLOCK, ROOM_UPGRADE_STORE, type RoomUpgradeStore } from './room-upgrade.ports.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function snapshotId(snapshot: Snapshot): string {
  return `room-upgrades:${createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex')}`;
}

@Injectable()
export class RoomUpgradeUseCases {
  constructor(
    @Inject(ROOM_UPGRADE_STORE) private readonly store: RoomUpgradeStore,
    @Inject(ROOM_UPGRADE_CLOCK) private readonly clock: () => Date,
    @Inject(TraceContext) private readonly trace: TraceContext,
  ) {}

  private async authorized(hotelId: string, userId: string) {
    // This is the first SQL in a new commerce transaction; all subsequent reads share one snapshot.
    await this.store.beginReadSnapshot();
    const role = await this.store.staffRole(hotelId, userId);
    if (role !== 'RECEPTIONIST' && role !== 'MANAGER') throw new ForbiddenException('Bạn không có phân công tại khách sạn này.');
    const data = await this.store.loadSnapshot(hotelId);
    if (!data) throw new NotFoundException('Không tìm thấy khách sạn mô phỏng.');
    const parsed = SnapshotSchema.safeParse(data);
    if (!parsed.success || parsed.data.hotel.id !== hotelId ||
      [data.roomTypes, data.bookings, data.inventory, data.rates, data.policies, data.benefits].some((rows) => rows.some((r) => r.hotelId !== hotelId))) {
      throw new ServiceUnavailableException('Dữ liệu C2 không hợp lệ; chưa thể báo giá.');
    }
    const snapshot = parsed.data;
    return { role, snapshot, snapshotId: snapshotId(snapshot), requestId: this.trace.current().requestId ?? randomUUID() };
  }

  @Transactional('commerce')
  async listBookings(userId: string, hotelId: string, roomNumber?: string) {
    const context = await this.authorized(hotelId, userId);
    const now = this.clock().getTime();
    const items = context.snapshot.bookings.filter((b) => b.status === 'IN_HOUSE' && Date.parse(b.checkInAt) <= now &&
      Date.parse(b.checkOutAt) > now && (!roomNumber || b.roomNumber === roomNumber));
    return { caseId: 'C2', isMock: true, requestId: context.requestId, snapshotId: context.snapshotId,
      fixtureVersion: context.snapshot.hotel.fixtureVersion, hotel: context.snapshot.hotel, staffRole: context.role, items };
  }

  @Transactional('commerce')
  async bookingContext(userId: string, hotelId: string, bookingCode: string) {
    const context = await this.authorized(hotelId, userId);
    const booking = context.snapshot.bookings.find((b) => b.bookingCode === bookingCode);
    if (!booking) throw new NotFoundException('Không tìm thấy booking trong khách sạn.');
    const { hotel, roomTypes, inventory, rates, policies, benefits } = context.snapshot;
    return { caseId: 'C2', isMock: true, requestId: context.requestId, snapshotId: context.snapshotId,
      fixtureVersion: hotel.fixtureVersion, staffRole: context.role, currency: 'VND',
      hotel, booking, roomTypes, inventory, rates, policies, benefits: benefits.filter((b) => b.bookingCode === bookingCode) };
  }

  @Transactional('commerce')
  async quote(userId: string, input: QuoteRequest) {
    const context = await this.authorized(input.hotelId, userId);
    if (input.bookingCode && !context.snapshot.bookings.some((b) => b.bookingCode === input.bookingCode)) {
      throw new NotFoundException('Không tìm thấy booking trong khách sạn.');
    }
    const now = this.clock();
    const quote = calculateQuote(context.snapshot, input, { now, requestId: context.requestId, quoteId: randomUUID(), snapshotId: context.snapshotId });
    if (quote.totals === null) return quote;
    const violations = validateQuote(context.snapshot, input, quote, now, context.snapshotId);
    return violations.length ? validationFailure(quote, violations) : { ...quote, validation: { checked: true, passed: true, violations: [] } };
  }
}
