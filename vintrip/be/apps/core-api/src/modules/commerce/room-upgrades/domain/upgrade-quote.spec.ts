import { describe, expect, it } from 'vitest';
import { QuoteRequestSchema, SnapshotSchema, type Quote, type QuoteRequest } from './room-upgrade.js';
import { calculateQuote } from './upgrade-quote.js';
import { validateQuote } from './upgrade-quote-validator.js';
import { createRoomUpgradeFixture } from '../infra/room-upgrade.fixture.js';
import { nightDates } from './quote-primitives.js';

const anchor = '2026-12-10';
const now = new Date('2026-12-10T08:00:00+07:00');
const context = { now, requestId: 'test-request', quoteId: 'test-quote', snapshotId: 'snapshot-test' };
const request = (patch: Partial<QuoteRequest> = {}): QuoteRequest => QuoteRequestSchema.parse({
  hotelId: 'upgrade-demo-hotel', bookingCode: 'C2-0001', targetRoomTypeId: 'DLX', effectiveAt: '2026-12-11T14:00:00+07:00', ...patch,
});
const fixture = () => createRoomUpgradeFixture(anchor);

describe('C2-CP1: domain pricing and independent validation', () => {
  it('1: two nights, 1.2m original credit and 1.5m tax-inclusive rate => 600,000 VND', () => {
    const data = fixture(); const input = request(); const result = calculateQuote(data, input, context);
    expect(result).toMatchObject({ status: 'VALID', remainingNights: 2, priceDiffVnd: 600_000,
      totals: { newRoomTotalVnd: 3_000_000, eligibleOriginalCreditVnd: 2_400_000, additionalTaxVnd: 0 }, isMock: true });
    expect(validateQuote(data, input, result, now, context.snapshotId)).toEqual([]);
  });
  it('2: changing the transfer date re-enumerates nights and recomputes all amounts', () => {
    const data = fixture(); data.rates.find((r) => r.roomTypeId === 'DLX' && r.date === '2026-12-12')!.priceVnd = 1_700_000;
    expect(calculateQuote(data, request(), context).priceDiffVnd).toBe(800_000);
    const input = request({ effectiveAt: '2026-12-12T14:00:00+07:00' });
    const changed = calculateQuote(data, input, context);
    expect(changed).toMatchObject({ remainingNights: 1, priceDiffVnd: 500_000 });
    expect(validateQuote(data, input, changed, now, context.snapshotId)).toEqual([]);
  });
  it('3: sold out in a middle night blocks the entire interval', () => {
    const data = fixture(); const day = data.inventory.find((r) => r.roomTypeId === 'DLX' && r.date === '2026-12-11')!;
    day.sold = day.total - day.held - day.outOfService;
    const result = calculateQuote(data, request({ effectiveAt: '2026-12-10T09:00:00+07:00' }), context);
    expect(result).toMatchObject({ status: 'UNAVAILABLE', totals: null, priceDiffVnd: null });
    expect(result.inventoryByNight).toHaveLength(3);
    expect(result.violations[0]!.field).toBe('inventory.2026-12-11');
  });
  it('4: a missing rate never becomes zero', () => {
    const data = fixture(); data.rates = data.rates.filter((r) => !(r.roomTypeId === 'DLX' && r.date === '2026-12-12'));
    expect(calculateQuote(data, request(), context)).toMatchObject({ status: 'MISSING_DATA', totals: null,
      priceDiffVnd: null, missingFields: ['rates.2026-12-12'] });
  });
  it.each(['C2-0008', 'C2-0009'])('5: booking %s is not in-house', (code) => {
    expect(calculateQuote(fixture(), request({ bookingCode: code }), context).violations[0]!.code).toBe('NOT_IN_HOUSE');
  });
  it('6: a complimentary request cannot change the server-computed amount or grant authority', () => {
    const data = fixture(); const input = request({ requestType: 'COMPLIMENTARY_UPGRADE' });
    const result = calculateQuote(data, input, context);
    expect(result).toMatchObject({ status: 'REQUIRES_MANAGER', approvalRole: 'MANAGER', priceDiffVnd: 600_000 });
    expect(validateQuote(data, input, result, now, context.snapshotId)).toEqual([]);
  });
  it('7: verified membership applies the allowed discount; unverified membership does not', () => {
    const data = fixture(); const input = request({ bookingCode: 'C2-0002' });
    const result = calculateQuote(data, input, context);
    expect(result).toMatchObject({ priceDiffVnd: 540_000, totals: { eligibleDiscountVnd: 60_000 }, benefit: { code: 'GOLD-10' } });
    expect(validateQuote(data, input, result, now, context.snapshotId)).toEqual([]);
    expect(calculateQuote(data, request({ bookingCode: 'C2-0006' }), context).priceDiffVnd).toBe(600_000);
    expect(calculateQuote(data, request({ bookingCode: 'C2-0006', benefitId: 'unverified-0006' }), context).status).toBe('INELIGIBLE');
  });
  it('valid complimentary benefit is verified by backend and does not manufacture a refund', () => {
    const data = fixture(); const input = request({ bookingCode: 'C2-0003', requestType: 'COMPLIMENTARY_UPGRADE' });
    const result = calculateQuote(data, input, context);
    expect(result).toMatchObject({ status: 'VALID', priceDiffVnd: 0, requiresHumanApproval: true });
    expect(validateQuote(data, input, result, now, context.snapshotId)).toEqual([]);
  });
  it('8: negative difference requires manager review, without issuing a refund', () => {
    const data = fixture(); const input = request({ bookingCode: 'C2-0010' });
    const result = calculateQuote(data, input, context);
    expect(result).toMatchObject({ status: 'REQUIRES_MANAGER', priceDiffVnd: -1_000_000, operationalEffects: 'NONE' });
    expect(validateQuote(data, input, result, now, context.snapshotId)).toEqual([]);
  });
  it('uses actual booked nightly credit even when old room list prices change', () => {
    const data = fixture(); data.rates.filter((r) => r.roomTypeId === 'STD').forEach((r) => { r.priceVnd = 9_000_000; });
    expect(calculateQuote(data, request(), context).priceDiffVnd).toBe(600_000);
  });
  it('ambiguous active room-number lookup asks for a booking code; expired assignments do not match', () => {
    const data = fixture();
    data.bookings[1]!.roomNumber = '101';
    const input = request({ bookingCode: undefined, roomNumber: '101' });
    expect(calculateQuote(data, input, context)).toMatchObject({ status: 'NEEDS_INPUT', missingFields: ['bookingCode'] });
    data.bookings[1]!.checkOutAt = '2026-12-10T07:00:00+07:00';
    expect(calculateQuote(data, input, context).priceDiffVnd).toBe(600_000);
  });
  it('conflicting policy versions and expired benefits cannot create an arbitrary quote or discount', () => {
    const data = fixture(); data.benefits[0]!.validUntil = '2026-12-10T07:00:00+07:00';
    expect(calculateQuote(data, request({ bookingCode: 'C2-0002' }), context).priceDiffVnd).toBe(600_000);
    data.policies.push({ ...structuredClone(data.policies[0]!), code: 'CONFLICT' });
    expect(calculateQuote(data, request(), context)).toMatchObject({ status: 'MISSING_DATA', totals: null });
  });
  it('tax-exclusive rates and a taxable one-time fee are charged exactly once', () => {
    const data = fixture(); data.rates.filter((r) => r.roomTypeId === 'DLX').forEach((r) => { r.taxIncluded = false; });
    data.policies[0]!.rules.changeFeeVnd = 50_000; data.policies[0]!.rules.feeTaxIncluded = false;
    const input = request(); const result = calculateQuote(data, input, context);
    expect(result.totals).toMatchObject({ additionalFeesVnd: 50_000, additionalTaxVnd: 305_000, priceDiffVnd: 955_000 });
    expect(validateQuote(data, input, result, now, context.snapshotId)).toEqual([]);
  });
  it('missing booking price, missing inventory and missing policy each block quoting', () => {
    for (const remove of ['original', 'inventory', 'policy']) {
      const data = fixture();
      if (remove === 'original') data.bookings[0]!.nights = [];
      else if (remove === 'inventory') data.inventory = [];
      else data.policies = [];
      expect(calculateQuote(data, request(), context)).toMatchObject({ status: 'MISSING_DATA', totals: null });
    }
  });
  it('requires explicit transfer time; rejects historical/checkout-date transfers and unmet room conditions', () => {
    expect(calculateQuote(fixture(), request({ effectiveAt: undefined }), context).missingFields).toContain('effectiveAt');
    for (const effectiveAt of ['2026-12-09T15:00:00+07:00', '2026-12-13T11:00:00+07:00']) {
      expect(calculateQuote(fixture(), request({ effectiveAt }), context).status).toBe('INELIGIBLE');
    }
    const data = fixture(); data.bookings[0]!.guests = 3;
    expect(calculateQuote(data, request(), context).violations[0]!.code).toBe('CAPACITY_EXCEEDED');
    expect(calculateQuote(fixture(), request({ requiredFeatures: ['ACCESSIBLE'] }), context).violations[0]!.code).toBe('ROOM_CONDITION_UNMET');
  });
  it('counts calendar nights across DST without rounding elapsed hours', () => {
    expect(nightDates('2026-03-07', '2026-03-10')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    const data = fixture(); data.hotel.timezone = 'America/New_York';
    const result = calculateQuote(data, request({ effectiveAt: '2026-12-11T02:00:00Z' }), context);
    expect(result.remainingNights).toBe(3); // Local Dec 10, not UTC Dec 11.
  });
  it('handles safe-integer overflow and rejects malformed source money', () => {
    const data = fixture(); data.rates.forEach((r) => { r.priceVnd = Number.MAX_SAFE_INTEGER; });
    expect(calculateQuote(data, request(), context)).toMatchObject({ status: 'MISSING_DATA', totals: null });
    data.rates[0]!.priceVnd = 1.5;
    expect(SnapshotSchema.safeParse(data).success).toBe(false);
  });
  it('10: schema rejects client role, approval flag, amount and unknown fields', () => {
    for (const forged of [{ role: 'MANAGER' }, { approved: true }, { priceDiffVnd: 0 }, { status: 'APPROVED' }]) {
      expect(QuoteRequestSchema.safeParse({ ...request(), ...forged }).success).toBe(false);
    }
  });
  it.each(['amount', 'night', 'policy', 'benefit', 'candidate', 'snapshot', 'status'])('independent validator catches tampered %s', (kind) => {
    const data = fixture(); const input = request(); const result: Quote = structuredClone(calculateQuote(data, input, context));
    if (kind === 'amount') result.priceDiffVnd = 0;
    else if (kind === 'night') result.breakdown.pop();
    else if (kind === 'policy') result.policy!.version = 99;
    else if (kind === 'benefit') result.benefit = { id: 'invented', code: 'VIP-FREE', version: 1, discountBps: 10_000 };
    else if (kind === 'candidate') result.targetRoomTypeId = 'hallucinated-room';
    else if (kind === 'snapshot') result.snapshotId = 'stale';
    else result.status = 'APPROVED' as Quote['status'];
    expect(validateQuote(data, input, result, now, context.snapshotId).length).toBeGreaterThan(0);
  });
});
