import { describe, expect, it } from 'vitest';
import type { Booking, Quote, QuoteRequest, Snapshot, StaffRole } from './room-upgrade.js';
import {
  AiRecommendationMetadataSchema, ApproveProposalRequestSchema, CreateProposalRequestSchema,
  EscalateProposalRequestSchema, IdempotencyKeySchema, ListProposalsQuerySchema,
  NormalizedProposalRequestSchema, PreviewExpectationSchema, ProposalScopeQuerySchema,
  ProposalStatusSchema, RejectProposalRequestSchema, ReviseProposalRequestSchema,
  assertProposalTransition, canRolePerformAction, canTransitionProposal, canonicalJson,
  computeAllowedActions, computeBusinessFingerprint, derivePendingStatus, detectStaleQuoteReasons,
  hashCommandPayload, hashIdempotencyKey, isTerminalProposalStatus, TERMINAL_PROPOSAL_STATUSES,
  type NormalizedProposalRequest, type ProposalAllowedAction, type ProposalStatus,
} from './room-upgrade-proposal.js';
import { calculateQuote } from './upgrade-quote.js';
import { validateQuote } from './upgrade-quote-validator.js';

const now = new Date('2026-12-10T08:00:00+07:00');
const context = { now, requestId: 'request-1', quoteId: 'quote-1', snapshotId: 'snapshot-1' };
const hotelId = 'upgrade-demo-hotel';
const effectiveAt = '2026-12-11T14:00:00+07:00';
const baseCreate = { hotelId, bookingCode: 'C2-0001', targetRoomTypeId: 'DLX', effectiveAt };
const versionInput = { hotelId, expectedVersion: 1 };
const roles: StaffRole[] = ['RECEPTIONIST', 'MANAGER'];
const actions: ProposalAllowedAction[] = ['REVISE', 'APPROVE', 'REJECT', 'ESCALATE'];
const statuses: ProposalStatus[] = ['DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED'];

// A small synthetic source snapshot, kept inside domain tests to avoid infra imports.
function sample(negative = false) {
  const mock = { isMock: true as const, version: 1 };
  const bookingCode = negative ? 'C2-0010' : 'C2-0001';
  const dates = ['2026-12-11', '2026-12-12'];
  const paidVnd = negative ? 2_000_000 : 1_200_000;
  const booking: Booking = {
    ...mock, hotelId, bookingCode, roomNumber: '101', roomTypeId: 'STD', status: 'IN_HOUSE',
    checkInAt: '2026-12-09T14:00:00+07:00', checkOutAt: '2026-12-13T12:00:00+07:00', guests: 2,
    nights: dates.map((date) => ({ date, paidVnd, creditEligibleVnd: paidVnd, taxIncluded: true, sourceRef: `booking:${date}` })),
  };
  const request: NormalizedProposalRequest = NormalizedProposalRequestSchema.parse({
    ...baseCreate, bookingCode, requestType: 'UPGRADE', requiredFeatures: ['NON_SMOKING', 'GARDEN_VIEW'], benefitId: null,
  });
  const snapshot: Snapshot = {
    hotel: { ...mock, id: hotelId, name: 'Synthetic hotel', timezone: 'Asia/Ho_Chi_Minh', fixtureVersion: 'test-v1' },
    bookings: [booking], benefits: [],
    roomTypes: [
      { ...mock, hotelId, id: 'STD', name: 'Standard', rank: 1, maxGuests: 2, features: ['NON_SMOKING'] },
      { ...mock, hotelId, id: 'DLX', name: 'Deluxe', rank: 2, maxGuests: 2, features: ['NON_SMOKING', 'GARDEN_VIEW'] },
    ],
    inventory: dates.map((date) => ({ ...mock, hotelId, roomTypeId: 'DLX', date,
      total: 10, sold: 2, held: 1, outOfService: 1, stopSell: false })),
    rates: dates.map((date) => ({ ...mock, hotelId, roomTypeId: 'DLX', date, priceVnd: 1_500_000, taxIncluded: true, sourceRef: `rate:${date}` })),
    policies: [{ ...mock, hotelId, code: 'STAY-UPGRADE', validFrom: '2026-12-01T00:00:00+07:00', validUntil: '2027-01-01T00:00:00+07:00',
      sources: [{ code: 'CREDIT', clause: 'Synthetic full credit policy' }],
      rules: { nightRule: 'FULL_LOCAL_NIGHT', originalCreditBps: 10_000, changeFeeVnd: 0, feeTaxIncluded: true,
        taxBps: 1000, maxNights: 30, quoteTtlMinutes: 15, maxReceptionistDiffVnd: 3_000_000,
        allowedTransitions: [{ from: 'STD', to: 'DLX' }], allowedBenefitCodes: ['GOLD-10'] } }],
  };
  const input: QuoteRequest = { ...request, benefitId: request.benefitId ?? undefined };
  const quote = validatedQuote(snapshot, input);
  const stored = storedRevision(booking, request, quote);
  return { booking, request, snapshot, input, quote, stored };
}
function storedRevision(booking: Booking, request: NormalizedProposalRequest, quote: Quote) {
  return {
    normalizedRequest: request, quote, businessFingerprint: computeBusinessFingerprint({ booking, request, quote }),
    priceDiffVnd: quote.priceDiffVnd!, quoteStatus: quote.status as 'VALID' | 'REQUIRES_MANAGER',
    requiredApprovalRole: quote.approvalRole!, policyCode: quote.policy!.code, policyVersion: quote.policy!.version,
  };
}
function validatedQuote(snapshot: Snapshot, input: QuoteRequest): Quote {
  const quote = calculateQuote(snapshot, input, context);
  const violations = validateQuote(snapshot, input, quote, now, context.snapshotId);
  quote.validation = { checked: true, passed: violations.length === 0, violations };
  return quote;
}
function staleWith(mutate: (quote: Quote) => void): string[] {
  const data = sample();
  const freshQuote = structuredClone(data.quote);
  mutate(freshQuote);
  return detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking, freshQuote });
}

describe('proposal state machine', () => {
  const expected: Record<ProposalStatus, ProposalStatus[]> = {
    DRAFT: ['PENDING_RECEPTIONIST', 'PENDING_MANAGER'],
    PENDING_RECEPTIONIST: ['APPROVED', 'REJECTED', 'PENDING_MANAGER', 'EXPIRED', 'REQUOTE_REQUIRED', 'PENDING_RECEPTIONIST'],
    PENDING_MANAGER: ['APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER'],
    REQUOTE_REQUIRED: ['PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'REJECTED', 'EXPIRED'],
    APPROVED: [], REJECTED: [], EXPIRED: [],
  };
  for (const from of statuses) for (const to of statuses) {
    it(`${from} -> ${to}`, () => {
      const allowed = expected[from].includes(to);
      expect(canTransitionProposal(from, to)).toBe(allowed);
      if (allowed) expect(() => assertProposalTransition(from, to)).not.toThrow();
      else expect(() => assertProposalTransition(from, to)).toThrow(`Illegal proposal transition: ${from} -> ${to}`);
    });
  }
  it('identifies exactly three terminal statuses and derives both approval queues', () => {
    expect([...TERMINAL_PROPOSAL_STATUSES].sort()).toEqual(['APPROVED', 'EXPIRED', 'REJECTED']);
    for (const status of statuses) expect(isTerminalProposalStatus(status)).toBe(['APPROVED', 'REJECTED', 'EXPIRED'].includes(status));
    expect(derivePendingStatus('RECEPTIONIST')).toBe('PENDING_RECEPTIONIST');
    expect(derivePendingStatus('MANAGER')).toBe('PENDING_MANAGER');
  });
});

describe('proposal RBAC matrix and allowed actions', () => {
  const matrix: {
    status: ProposalStatus; required: StaffRole; receptionist: ProposalAllowedAction[]; manager: ProposalAllowedAction[];
  }[] = [
    { status: 'DRAFT', required: 'RECEPTIONIST', receptionist: ['REVISE'], manager: ['REVISE'] },
    { status: 'DRAFT', required: 'MANAGER', receptionist: ['REVISE'], manager: ['REVISE'] },
    { status: 'PENDING_RECEPTIONIST', required: 'RECEPTIONIST', receptionist: actions, manager: actions },
    { status: 'PENDING_RECEPTIONIST', required: 'MANAGER', receptionist: ['REVISE', 'REJECT', 'ESCALATE'], manager: ['REVISE', 'REJECT', 'ESCALATE'] },
    { status: 'PENDING_MANAGER', required: 'RECEPTIONIST', receptionist: ['REVISE'], manager: ['REVISE', 'APPROVE', 'REJECT'] },
    { status: 'PENDING_MANAGER', required: 'MANAGER', receptionist: ['REVISE'], manager: ['REVISE', 'APPROVE', 'REJECT'] },
    { status: 'REQUOTE_REQUIRED', required: 'RECEPTIONIST', receptionist: ['REVISE', 'REJECT'], manager: ['REVISE', 'REJECT'] },
    { status: 'REQUOTE_REQUIRED', required: 'MANAGER', receptionist: ['REVISE'], manager: ['REVISE', 'REJECT'] },
  ];
  for (const row of matrix) for (const role of roles) {
    it(`${role}, ${row.status}, required ${row.required}`, () => {
      const allowed = role === 'MANAGER' ? row.manager : row.receptionist;
      for (const action of actions) expect(canRolePerformAction(role, action, row.status, row.required)).toBe(allowed.includes(action));
      expect(computeAllowedActions(role, row.status, row.required, false)).toEqual(allowed);
    });
  }
  for (const status of statuses) for (const role of roles) for (const required of roles) {
    it(`expired now: ${status}, ${role}, required ${required}`, () => {
      expect(computeAllowedActions(role, status, required, true)).toEqual([]);
    });
  }
  for (const status of ['APPROVED', 'REJECTED', 'EXPIRED'] as const) for (const role of roles) for (const required of roles) {
    it(`terminal: ${status}, ${role}, required ${required}`, () => {
      for (const action of actions) expect(canRolePerformAction(role, action, status, required)).toBe(false);
      expect(computeAllowedActions(role, status, required, false)).toEqual([]);
    });
  }
});

describe('strict proposal input schemas', () => {
  const strictSchemas = [
    ['create', CreateProposalRequestSchema, baseCreate],
    ['revise', ReviseProposalRequestSchema, versionInput],
    ['approve', ApproveProposalRequestSchema, versionInput],
    ['reject', RejectProposalRequestSchema, { ...versionInput, reason: 'Declined' }],
    ['escalate', EscalateProposalRequestSchema, { ...versionInput, reason: 'Needs review' }],
    ['list', ListProposalsQuerySchema, { hotelId }],
    ['scope', ProposalScopeQuerySchema, { hotelId }],
    ['normalized', NormalizedProposalRequestSchema, { ...baseCreate, requestType: 'UPGRADE', requiredFeatures: [], benefitId: null }],
    ['AI metadata', AiRecommendationMetadataSchema, { source: 'ai_copilot' }],
    ['preview', PreviewExpectationSchema, {}],
  ] as const;
  const forged = { actorRole: 'MANAGER', actorUserId: 'attacker', amount: 0, priceDiffVnd: 0, status: 'APPROVED', approved: true, isMock: false };
  for (const [name, schema, valid] of strictSchemas) {
    it(`${name}: accepts its minimal legitimate payload`, () => expect(schema.safeParse(valid).success).toBe(true));
    for (const [key, value] of Object.entries(forged)) {
      if (name === 'list' && key === 'status') continue;
      it(`${name}: rejects forged ${key}`, () => expect(schema.safeParse({ ...valid, [key]: value }).success).toBe(false));
    }
  }
  it('requires exactly one booking locator and supplies defaults', () => {
    expect(CreateProposalRequestSchema.parse(baseCreate)).toMatchObject({ requestType: 'UPGRADE', requiredFeatures: [] });
    const { bookingCode: _bookingCode, ...withoutBooking } = baseCreate;
    expect(CreateProposalRequestSchema.safeParse(withoutBooking).success).toBe(false);
    expect(CreateProposalRequestSchema.safeParse({ ...baseCreate, roomNumber: '101' }).success).toBe(false);
    expect(CreateProposalRequestSchema.safeParse({ ...withoutBooking, roomNumber: '101' }).success).toBe(true);
  });
  it('accepts an unchanged revise and supports clearing a benefit', () => {
    expect(ReviseProposalRequestSchema.parse(versionInput)).toEqual(versionInput);
    expect(ReviseProposalRequestSchema.parse({ ...versionInput, reason: ' Accept updated rate ' }).reason).toBe('Accept updated rate');
    expect(ReviseProposalRequestSchema.parse({ ...versionInput, benefitId: null }).benefitId).toBeNull();
    expect(ReviseProposalRequestSchema.parse(versionInput).benefitId).toBeUndefined();
  });
  it('requires nonblank reasons for reject/escalate and trims optional decision reasons', () => {
    for (const schema of [RejectProposalRequestSchema, EscalateProposalRequestSchema]) {
      for (const reason of [undefined, '', '   ', 'x'.repeat(501)]) expect(schema.safeParse({ ...versionInput, reason }).success).toBe(false);
      expect(schema.parse({ ...versionInput, reason: ' Review needed ' }).reason).toBe('Review needed');
    }
    expect(ApproveProposalRequestSchema.parse({ ...versionInput, reason: ' Verified ' }).reason).toBe('Verified');
    expect(ApproveProposalRequestSchema.safeParse({ ...versionInput, reason: ' ' }).success).toBe(false);
  });
  it('validates versions, bounded feature lists, dates and identifiers', () => {
    for (const schema of [ReviseProposalRequestSchema, ApproveProposalRequestSchema, RejectProposalRequestSchema, EscalateProposalRequestSchema]) {
      for (const expectedVersion of [0, -1, 1.5, '1']) expect(schema.safeParse({ ...versionInput, expectedVersion, reason: 'Review' }).success).toBe(false);
    }
    for (const patch of [{ hotelId: '' }, { targetRoomTypeId: 'x'.repeat(101) }, { effectiveAt: 'tomorrow' },
      { requiredFeatures: Array.from({ length: 11 }, () => 'VIEW') }, { requestType: 'APPROVE' }, { benefitId: null }]) {
      expect(CreateProposalRequestSchema.safeParse({ ...baseCreate, ...patch }).success).toBe(false);
    }
  });
  it('keeps metadata non-authoritative, bounded and strict inside client requests', () => {
    expect(AiRecommendationMetadataSchema.parse({ source: 'ai_copilot' }).promptVersions).toEqual([]);
    for (const patch of [{ source: 'trusted_backend' }, { sessionId: '' }, { model: 'x'.repeat(101) },
      { promptVersions: Array.from({ length: 11 }, () => 'v1') }, { recommendationReasonVi: 'x'.repeat(1001) }]) {
      expect(AiRecommendationMetadataSchema.safeParse({ source: 'ai_copilot', ...patch }).success).toBe(false);
    }
    expect(CreateProposalRequestSchema.safeParse({ ...baseCreate, aiMetadata: { source: 'ai_copilot', approved: true } }).success).toBe(false);
    expect(ReviseProposalRequestSchema.safeParse({ ...versionInput, previewExpectation: { priceDiffVnd: 0 } }).success).toBe(false);
  });
  it('allows safe signed preview prices including negative C2-0010 quotes', () => {
    for (const expectedPriceDiffVnd of [-Number.MAX_SAFE_INTEGER, -1_000_000, 0, Number.MAX_SAFE_INTEGER]) {
      expect(PreviewExpectationSchema.safeParse({ expectedPriceDiffVnd }).success).toBe(true);
    }
    for (const expectedPriceDiffVnd of [Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1, 0.5, Infinity, NaN]) {
      expect(PreviewExpectationSchema.safeParse({ expectedPriceDiffVnd }).success).toBe(false);
    }
  });
  it('coerces bounded pagination and rejects unknown filters or enum values', () => {
    expect(ListProposalsQuerySchema.parse({ hotelId })).toEqual({ hotelId, limit: 20, offset: 0 });
    expect(ListProposalsQuerySchema.parse({ hotelId, status: 'APPROVED' }).status).toBe('APPROVED');
    expect(ListProposalsQuerySchema.parse({ hotelId, limit: '50', offset: '10000', status: 'REQUOTE_REQUIRED' })).toMatchObject({ limit: 50, offset: 10_000 });
    for (const patch of [{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { offset: -1 }, { offset: 10_001 },
      { status: 'VALID' }, { requiredApprovalRole: 'ADMIN' }, { sort: 'id' }]) {
      expect(ListProposalsQuerySchema.safeParse({ hotelId, ...patch }).success).toBe(false);
    }
    expect(ProposalStatusSchema.options).toEqual(statuses);
  });
  it('accepts only trimmed, bounded ASCII idempotency keys', () => {
    expect(IdempotencyKeySchema.parse('  create:request_1.abc-123  ')).toBe('create:request_1.abc-123');
    expect(IdempotencyKeySchema.safeParse('a'.repeat(8)).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse('a'.repeat(128)).success).toBe(true);
    for (const key of ['', ' '.repeat(8), 'a'.repeat(7), 'a'.repeat(129), 'key has spaces', 'invalid/key', 'invalid\nkey', 'khoá:123456', 'abc12345\u0000']) {
      expect(IdempotencyKeySchema.safeParse(key).success).toBe(false);
    }
  });
});

describe('canonical JSON and SHA-256', () => {
  it('sorts nested keys, preserves arrays, and uses JSON serialization semantics', () => {
    const left = { z: [{ b: 2, a: 1 }, null], a: { d: 4, c: 3 }, omitted: undefined };
    const right = { a: { c: 3, d: 4 }, z: [{ a: 1, b: 2 }, null] };
    expect(canonicalJson(left)).toBe('{"a":{"c":3,"d":4},"z":[{"a":1,"b":2},null]}');
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashCommandPayload(left)).toBe(hashCommandPayload(right));
    expect(hashCommandPayload([1, 2])).not.toBe(hashCommandPayload([2, 1]));
    expect(canonicalJson({ 2: 'two', 10: 'ten' })).toBe('{"10":"ten","2":"two"}');
    expect(canonicalJson([undefined, null])).toBe('[null,null]');
    expect(canonicalJson(JSON.parse('{"__proto__":{"z":1,"a":2}}'))).toBe('{"__proto__":{"a":2,"z":1}}');
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow(TypeError);
  });
  it('hashes raw idempotency keys without exposing them', () => {
    expect(hashIdempotencyKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashCommandPayload({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
    expect(hashIdempotencyKey('request-0001')).not.toBe(hashIdempotencyKey('request-0002'));
  });
});

describe('business fingerprints', () => {
  it('ignores volatile IDs and clocks, including snapshotId', () => {
    const data = sample(); const before = data.stored.businessFingerprint;
    Object.assign(data.quote, { quoteId: 'new-quote', requestId: 'new-request', snapshotId: 'new-snapshot',
      calculatedAt: '2026-12-10T02:00:00Z', expiresAt: '2026-12-10T02:15:00Z' });
    expect(computeBusinessFingerprint(data)).toBe(before);
  });
  it('sorts required features without mutating their order', () => {
    const data = sample(); const before = data.stored.businessFingerprint;
    const reversed = [...data.request.requiredFeatures].reverse(); data.request.requiredFeatures = reversed;
    expect(computeBusinessFingerprint(data)).toBe(before);
    expect(data.request.requiredFeatures).toEqual(reversed);
  });
  const changes: [string, (data: ReturnType<typeof sample>) => void][] = [
    ['nightly rate', (d) => { d.quote.breakdown[0]!.newRoomPriceVnd++; }],
    ['rate version', (d) => { d.quote.breakdown[0]!.sourceVersions.rate++; }],
    ['inventory', (d) => { d.quote.inventoryByNight[0]!.availableUnits!--; }],
    ['booking version', (d) => { d.booking.version++; }],
    ['booking status', (d) => { d.booking.status = 'CHECKED_OUT'; }],
    ['check-in', (d) => { d.booking.checkInAt = '2026-12-08T14:00:00+07:00'; }],
    ['check-out', (d) => { d.booking.checkOutAt = '2026-12-14T12:00:00+07:00'; }],
    ['room type', (d) => { d.booking.roomTypeId = 'STE'; }],
    ['guests', (d) => { d.booking.guests++; }],
    ['policy version', (d) => { d.quote.policy!.version++; }],
    ['policy source', (d) => { d.quote.policy!.sources[0]!.clause = 'Updated clause'; }],
    ['benefit', (d) => { d.quote.benefit = { id: 'gold', code: 'GOLD-10', version: 1, discountBps: 1000 }; }],
    ['price difference', (d) => { d.quote.priceDiffVnd!++; }],
    ['totals', (d) => { d.quote.totals!.additionalTaxVnd++; }],
    ['approval role', (d) => { d.quote.approvalRole = 'MANAGER'; }],
    ['quote status', (d) => { d.quote.status = 'REQUIRES_MANAGER'; }],
    ['normalized request', (d) => { d.request.requestType = 'ROOM_CHANGE'; }],
  ];
  it.each(changes)('changes when %s changes', (_name, mutate) => {
    const data = sample(); const before = data.stored.businessFingerprint; mutate(data);
    expect(computeBusinessFingerprint(data)).not.toBe(before);
  });
});

describe('stale quote reasons', () => {
  it('accepts validated quotes with only volatile fields changed', () => {
    expect(sample().quote.validation.passed).toBe(true);
    expect(staleWith((quote) => Object.assign(quote, { quoteId: 'q2', requestId: 'r2', snapshotId: 's2',
      calculatedAt: '2026-12-10T01:01:00Z', expiresAt: '2026-12-10T01:16:00Z' }))).toEqual([]);
  });
  it('isolates nightly rate changes and detects their full repricing effect', () => {
    expect(staleWith((quote) => { quote.breakdown[0]!.newRoomPriceVnd++; })).toEqual(['RATE_CHANGED']);
    const data = sample(); data.snapshot.rates[0]!.priceVnd += 100_000; data.snapshot.rates[0]!.version++;
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking,
      freshQuote: validatedQuote(data.snapshot, data.input) })).toEqual(['RATE_CHANGED', 'PRICE_CHANGED']);
  });
  it('compares all specified nightly rate and original-credit fields', () => {
    const changes: ((quote: Quote) => void)[] = [
      (q) => { q.breakdown[0]!.rateTaxIncluded = false; },
      (q) => { q.breakdown[0]!.sourceVersions.rate++; },
      (q) => { q.breakdown[0]!.originalPaidVnd++; },
      (q) => { q.breakdown[0]!.eligibleOriginalCreditVnd++; },
    ];
    for (const change of changes) expect(staleWith(change)).toEqual(['RATE_CHANGED']);
  });
  it('detects stock drops while still available and unavailable inventory', () => {
    const data = sample(); data.snapshot.inventory[0]!.sold++; data.snapshot.inventory[0]!.version++;
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking,
      freshQuote: validatedQuote(data.snapshot, data.input) })).toEqual(['INVENTORY_CHANGED']);
    expect(staleWith((q) => { q.status = 'UNAVAILABLE'; q.inventoryByNight[0]!.availableUnits = 0; }))
      .toEqual(['INVENTORY_UNAVAILABLE', 'QUOTE_INVALIDATED']);
  });
  it('detects missing or non-in-house bookings without duplicating a status-only change', () => {
    const data = sample();
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: null, freshQuote: data.quote })).toEqual(['BOOKING_STATUS_CHANGED']);
    for (const status of ['CHECKED_OUT', 'CONFIRMED'] as const) {
      expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: { ...data.booking, status }, freshQuote: data.quote }))
        .toEqual(['BOOKING_STATUS_CHANGED']);
    }
  });
  it('reports checkout without treating uncalculated fields as business changes', () => {
    const data = sample(); data.booking.status = 'CHECKED_OUT';
    const freshQuote = validatedQuote(data.snapshot, data.input);
    expect(freshQuote).toMatchObject({ status: 'INELIGIBLE', breakdown: [], inventoryByNight: [],
      policy: null, totals: null, approvalRole: null, validation: { checked: true, passed: false } });
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking, freshQuote }))
      .toEqual(['BOOKING_STATUS_CHANGED', 'QUOTE_INVALIDATED']);
  });
  it('reports unavailable middle-night stock without a false rate change', () => {
    const data = sample();
    data.booking.checkOutAt = '2026-12-14T12:00:00+07:00';
    data.booking.nights.push({ ...data.booking.nights[0]!, date: '2026-12-13', sourceRef: 'booking:2026-12-13' });
    data.snapshot.inventory.push({ ...data.snapshot.inventory[0]!, date: '2026-12-13' });
    data.snapshot.rates.push({ ...data.snapshot.rates[0]!, date: '2026-12-13', sourceRef: 'rate:2026-12-13' });
    const quote = validatedQuote(data.snapshot, data.input);
    expect(quote).toMatchObject({ status: 'VALID', remainingNights: 3, validation: { passed: true } });
    const stored = storedRevision(data.booking, data.request, quote);
    const middleNight = data.snapshot.inventory[1]!;
    middleNight.sold = middleNight.total - middleNight.held - middleNight.outOfService;
    middleNight.version++;
    const freshQuote = validatedQuote(data.snapshot, data.input);
    expect(freshQuote).toMatchObject({ status: 'UNAVAILABLE', breakdown: [], totals: null,
      approvalRole: null, validation: { checked: true, passed: false } });
    expect(freshQuote.inventoryByNight.map((night) => night.availableUnits)).toEqual([6, 0, 6]);
    expect(detectStaleQuoteReasons({ storedRevision: stored, freshBooking: data.booking, freshQuote }))
      .toEqual(['INVENTORY_UNAVAILABLE', 'QUOTE_INVALIDATED']);
  });
  it('reports a deleted nightly rate despite an empty price breakdown', () => {
    const data = sample(); data.snapshot.rates.splice(1, 1);
    const freshQuote = validatedQuote(data.snapshot, data.input);
    expect(freshQuote).toMatchObject({ status: 'MISSING_DATA', missingFields: ['rates.2026-12-12'],
      breakdown: [], totals: null, approvalRole: null, validation: { checked: true, passed: false } });
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking, freshQuote }))
      .toEqual(['RATE_CHANGED', 'QUOTE_INVALIDATED']);
  });
  it('reports an expired explicit benefit despite an empty price breakdown', () => {
    const data = sample();
    data.request.benefitId = 'gold'; data.input.benefitId = 'gold';
    const benefit = { isMock: true as const, version: 1, hotelId, bookingCode: data.booking.bookingCode,
      id: 'gold', code: 'GOLD-10', discountBps: 1000, roomTypeIds: ['DLX'],
      verifiedAt: '2026-12-09T08:00:00+07:00', validFrom: '2026-12-01T00:00:00+07:00',
      validUntil: '2027-01-01T00:00:00+07:00' };
    data.snapshot.benefits.push(benefit);
    const quote = validatedQuote(data.snapshot, data.input);
    expect(quote).toMatchObject({ status: 'VALID', benefit: { id: 'gold' }, validation: { passed: true } });
    const stored = storedRevision(data.booking, data.request, quote);
    benefit.validUntil = '2026-12-10T07:00:00+07:00'; benefit.version++;
    const freshQuote = validatedQuote(data.snapshot, data.input);
    expect(freshQuote).toMatchObject({ status: 'INELIGIBLE', breakdown: [], benefit: null,
      totals: null, approvalRole: null, validation: { checked: true, passed: false } });
    expect(freshQuote.violations.map((v) => v.code)).toEqual(['BENEFIT_NOT_ELIGIBLE']);
    expect(detectStaleQuoteReasons({ storedRevision: stored, freshBooking: data.booking, freshQuote }))
      .toEqual(['BENEFIT_CHANGED', 'QUOTE_INVALIDATED']);
  });
  it('detects booking version, stay, room type and guest changes from the stored fingerprint', () => {
    const patches: Partial<Booking>[] = [{ version: 2 }, { checkInAt: '2026-12-08T14:00:00+07:00' },
      { checkOutAt: '2026-12-14T12:00:00+07:00' }, { roomTypeId: 'STE' }, { guests: 3 }];
    for (const patch of patches) {
      const data = sample();
      expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: { ...data.booking, ...patch }, freshQuote: data.quote }))
        .toEqual(['BOOKING_CHANGED']);
    }
  });
  it('detects policy code, version and clause changes', () => {
    for (const mutate of [(q: Quote) => { q.policy!.code = 'NEW'; }, (q: Quote) => { q.policy!.version++; },
      (q: Quote) => { q.policy!.sources[0]!.clause = 'Revised'; }]) {
      expect(staleWith(mutate)).toEqual(['POLICY_VERSION_CHANGED']);
    }
  });
  it('detects all benefit identity and discount fields, including removed benefits', () => {
    const data = sample(); data.quote.benefit = { id: 'gold', code: 'GOLD-10', version: 1, discountBps: 1000 };
    data.stored.businessFingerprint = computeBusinessFingerprint(data);
    for (const patch of [{ id: 'gold-2' }, { code: 'GOLD-20' }, { version: 2 }, { discountBps: 2000 }]) {
      const freshQuote = structuredClone(data.quote); freshQuote.benefit = { ...freshQuote.benefit!, ...patch };
      expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking, freshQuote })).toEqual(['BENEFIT_CHANGED']);
    }
    const freshQuote = { ...data.quote, benefit: null };
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking, freshQuote })).toEqual(['BENEFIT_CHANGED']);
  });
  it('detects price, totals, approval role and invalid validation separately', () => {
    expect(staleWith((q) => { q.priceDiffVnd!++; })).toEqual(['PRICE_CHANGED']);
    expect(staleWith((q) => { q.totals!.additionalFeesVnd++; })).toEqual(['PRICE_CHANGED']);
    expect(staleWith((q) => { q.approvalRole = 'MANAGER'; q.status = 'REQUIRES_MANAGER'; })).toEqual(['APPROVAL_ROLE_CHANGED']);
    expect(staleWith((q) => { q.validation.passed = false; })).toEqual(['QUOTE_INVALIDATED']);
  });
  it('falls back to a fingerprint mismatch for unclassified business changes', () => {
    expect(staleWith((q) => { q.remainingNights!++; })).toEqual(['SNAPSHOT_FINGERPRINT_MISMATCH']);
  });
  it('deduplicates multiple changed nights and returns stable reason order', () => {
    expect(staleWith((q) => {
      q.breakdown.forEach((night) => { night.newRoomPriceVnd++; night.sourceVersions.rate++; });
      q.inventoryByNight.forEach((night) => { night.availableUnits!--; });
      q.policy!.version++; q.priceDiffVnd!++; q.approvalRole = 'MANAGER'; q.validation.passed = false;
    })).toEqual(['INVENTORY_CHANGED', 'RATE_CHANGED', 'POLICY_VERSION_CHANGED', 'PRICE_CHANGED', 'APPROVAL_ROLE_CHANGED', 'QUOTE_INVALIDATED']);
  });
  it('preserves negative C2-0010 prices as valid manager quotes and detects signed changes', () => {
    const data = sample(true);
    expect(data.quote).toMatchObject({ bookingCode: 'C2-0010', priceDiffVnd: -1_000_000, status: 'REQUIRES_MANAGER',
      approvalRole: 'MANAGER', validation: { passed: true } });
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking, freshQuote: data.quote })).toEqual([]);
    const freshQuote = structuredClone(data.quote); freshQuote.priceDiffVnd = -900_000;
    expect(detectStaleQuoteReasons({ storedRevision: data.stored, freshBooking: data.booking, freshQuote })).toEqual(['PRICE_CHANGED']);
  });
});
