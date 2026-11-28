import { describe, expect, it } from 'vitest';
import type { ProposalStatus, RoomUpgradeErrorKind, RoomUpgradeRequestType, StaffRole } from '@vintrip/api-client';
import { buildRevisePayload, classifyCommandError, formatActorShort, formatExpiryCountdown, parseApprovalRoleParam, parseProposalStatusParam } from './proposal-helpers';

describe('parseProposalStatusParam', () => {
  it.each<ProposalStatus>(['PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'REQUOTE_REQUIRED', 'APPROVED', 'REJECTED', 'EXPIRED', 'DRAFT'])('accepts %s', (value) => {
    expect(parseProposalStatusParam(value)).toBe(value);
  });
  it.each(['', 'pending_manager', 'APPROVED ', ' APPROVED', 'PENDING', 'toString', '__proto__', undefined, [], ['APPROVED'], ['DRAFT', 'EXPIRED']].map((value) => ({ value })))('rejects invalid status $value', ({ value }) => {
    expect(parseProposalStatusParam(value)).toBeUndefined();
  });
});

describe('parseApprovalRoleParam', () => {
  it.each<StaffRole>(['RECEPTIONIST', 'MANAGER'])('accepts %s', (value) => expect(parseApprovalRoleParam(value)).toBe(value));
  it.each(['', 'manager', 'MANAGER ', ' MANAGER', 'ADMIN', 'toString', undefined, [], ['MANAGER'], ['MANAGER', 'RECEPTIONIST']].map((value) => ({ value })))('rejects invalid role $value', ({ value }) => {
    expect(parseApprovalRoleParam(value)).toBeUndefined();
  });
});

function reviseInput() {
  return { hotelId: 'hotel-1', expectedVersion: 42, targetRoomTypeId: 'DLX', effectiveAt: '2026-11-28T14:00:00+07:00',
    requestType: 'UPGRADE' as RoomUpgradeRequestType, requiredFeatures: ['NON_SMOKING', 'GARDEN_VIEW'], benefitId: null as string | null, reason: '  Yêu cầu mới của khách  ' };
}

describe('buildRevisePayload', () => {
  it('copies only strict CP3 fields, preserving the concurrency version and effective instant', () => {
    const input = reviseInput();
    expect(buildRevisePayload(input)).toEqual({ ...input, reason: 'Yêu cầu mới của khách' });
    expect(buildRevisePayload(input).expectedVersion).toBe(42);
    expect(buildRevisePayload(input).effectiveAt).toBe('2026-11-28T14:00:00+07:00');
  });
  it.each(['', '   ', '\n\t'])('omits an empty trimmed reason %j', (reason) => {
    expect(buildRevisePayload({ ...reviseInput(), reason })).not.toHaveProperty('reason');
  });
  it.each([null, 'benefit-verified'])('passes benefitId %j explicitly, including clearing', (benefitId) => {
    const result = buildRevisePayload({ ...reviseInput(), benefitId });
    expect(result).toHaveProperty('benefitId', benefitId);
  });
  it.each<RoomUpgradeRequestType>(['UPGRADE', 'ROOM_CHANGE', 'COMPLIMENTARY_UPGRADE'])('preserves request type %s', (requestType) => {
    expect(buildRevisePayload({ ...reviseInput(), requestType }).requestType).toBe(requestType);
  });
  it('does not mutate the input or retain a mutable features reference', () => {
    const input = reviseInput();
    const before = JSON.stringify(input);
    const payload = buildRevisePayload(input);
    payload.requiredFeatures?.push('ACCESSIBLE');
    expect(JSON.stringify(input)).toBe(before);
    expect(payload.requiredFeatures).not.toBe(input.requiredFeatures);
  });
  it('never forwards forged money, policy, snapshot, actor, decision or metadata fields', () => {
    const forged = { priceDiffVnd: 0, status: 'APPROVED', actorRole: 'MANAGER', actorUserId: 'forged', approved: true,
      snapshotId: 'forged', policy: {}, policyCode: 'forged', quote: {}, previewExpectation: {}, aiMetadata: {}, version: 99, bookingCode: 'other-booking' };
    const payload = buildRevisePayload({ ...reviseInput(), ...forged });
    for (const key of Object.keys(forged)) expect(payload).not.toHaveProperty(key);
    expect(Object.keys(payload).sort()).toEqual(['hotelId', 'expectedVersion', 'targetRoomTypeId', 'effectiveAt', 'requestType', 'requiredFeatures', 'benefitId', 'reason'].sort());
  });
  it('keeps an empty features list when all requirements are cleared', () => {
    expect(buildRevisePayload({ ...reviseInput(), requiredFeatures: [] }).requiredFeatures).toEqual([]);
  });
});

describe('formatExpiryCountdown', () => {
  const expiry = '2026-11-28T06:15:00Z';
  const end = Date.parse(expiry);
  it('has no client clock during SSR or the first hydration render', () => {
    expect(formatExpiryCountdown(expiry, null)).toBeNull();
  });
  it('formats minutes and seconds', () => {
    expect(formatExpiryCountdown(expiry, end - 750000)).toEqual({ text: 'Còn 12 phút 30 giây', expiredByClock: false });
  });
  it.each([60000, 1000, 1])('does not mark a future expiry as authoritative expiry (%i ms)', (remaining) => {
    expect(formatExpiryCountdown(expiry, end - remaining)?.expiredByClock).toBe(false);
  });
  it('rounds a positive partial second up', () => {
    expect(formatExpiryCountdown(expiry, end - 1)?.text).toBe('Còn 0 phút 1 giây');
  });
  it.each([0, 1, 60000])('marks the boundary and past times with a server-confirmation caveat (%i ms)', (elapsed) => {
    expect(formatExpiryCountdown(expiry, end + elapsed)).toEqual({ text: 'Đã qua mốc hết hạn (chờ máy chủ xác nhận)', expiredByClock: true });
  });
  it('handles ISO offsets as instants', () => {
    expect(formatExpiryCountdown('2026-11-28T13:15:00+07:00', end - 60000)?.text).toBe('Còn 1 phút 0 giây');
  });
  it('omits an invalid timestamp or invalid clock', () => {
    expect(formatExpiryCountdown('invalid', end)).toBeNull();
    expect(formatExpiryCountdown(expiry, Number.NaN)).toBeNull();
  });
});

describe('classifyCommandError', () => {
  const expectations = {
    network: [true, false, 'danger'], dependency_unavailable: [true, false, 'danger'],
    version_conflict: [false, true, 'warning'], concurrent_modification: [false, true, 'warning'],
    requote_required: [false, true, 'warning'], proposal_expired: [false, true, 'warning'], invalid_state: [false, true, 'warning'],
    forbidden: [false, false, 'danger'], unauthorized: [false, false, 'danger'], not_found: [false, false, 'danger'],
    idempotency_mismatch: [false, false, 'danger'], preview_mismatch: [false, false, 'danger'],
    not_persistable: [false, false, 'danger'], validation: [false, false, 'danger'], unknown: [false, false, 'danger'],
  } satisfies Record<RoomUpgradeErrorKind, readonly [boolean, boolean, 'warning' | 'danger']>;
  it.each(Object.entries(expectations) as [RoomUpgradeErrorKind, readonly [boolean, boolean, 'warning' | 'danger']][])('classifies %s', (kind, [canRetrySameKey, shouldReloadProposal, bannerTone]) => {
    expect(classifyCommandError({ kind, message: 'Thông báo' })).toEqual({ canRetrySameKey, shouldReloadProposal, bannerTone });
  });
  it('never retries a version conflict even when the backend supplies a newer version', () => {
    expect(classifyCommandError({ kind: 'version_conflict', code: 'VERSION_CONFLICT', status: 409, currentVersion: 50, message: 'Đã thay đổi' }))
      .toEqual({ canRetrySameKey: false, shouldReloadProposal: true, bannerTone: 'warning' });
  });
  it.each(['network', 'dependency_unavailable'] as const)('preserves explicit same-key retry for %s', (kind) => {
    expect(classifyCommandError({ kind, status: kind === 'dependency_unavailable' ? 503 : undefined, message: 'Thử lại' }).canRetrySameKey).toBe(true);
  });
});

describe('formatActorShort', () => {
  it.each(['', 'actor-1', '123456789012'])('preserves an ID of at most 12 characters: %j', (value) => expect(formatActorShort(value)).toBe(value));
  it('shortens a UUID without exposing the full actor identifier', () => {
    expect(formatActorShort('00000000-0000-4000-8000-000000000001')).toBe('00000000…');
  });
  it('shortens at the first value longer than 12 characters', () => {
    expect(formatActorShort('1234567890123')).toBe('12345678…');
  });
});
