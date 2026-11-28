import { describe, expect, it } from 'vitest';
import type { ProposalAuditAction, ProposalStatus, QuoteStatus, StaffContextResponse, StaffHotelAssignment } from '@vintrip/api-client';
import { bookingDetailHref, bookingUpgradeHref, isStaffPath, selectStaffHotel } from './staff-path';
import { filterBookings, formatDateInTz, formatDateTimeInTz, formatRoleLabel, formatRoomFeature, formatShortRoleLabel, formatVnd } from './staff-format';
import { AUDIT_ACTION_LABELS, PROPOSAL_STATUS_META, QUOTE_STATUS_META, STALE_REASON_LABELS } from './staff-status';

describe('staff/customer route separation', () => {
  it.each(['/staff', '/staff/', '/staff/bookings', '/staff/bookings/C2-0001', '/staff/room-upgrades', '/staff/proposals/uuid'])(
    'recognizes %s as staff', (path) => expect(isStaffPath(path)).toBe(true),
  );
  it.each(['/', '/bookings', '/account', '/staffing', '/staffing/bookings', '/other/staff'])(
    'preserves customer route %s', (path) => expect(isStaffPath(path)).toBe(false),
  );
  it('encodes booking identifiers separately for path segments and query strings', () => {
    expect(bookingDetailHref('C2/0001 ?#')).toBe('/staff/bookings/C2%2F0001%20%3F%23');
    expect(bookingUpgradeHref('C2&booking=other')).toBe('/staff/room-upgrades?booking=C2%26booking%3Dother');
  });
});

describe('server-authorized hotel selection', () => {
  const first: StaffHotelAssignment = { hotelId: 'hotel-a', hotelName: 'Khách sạn A', timezone: 'Asia/Ho_Chi_Minh', fixtureVersion: 'v1', staffRole: 'RECEPTIONIST' };
  const second: StaffHotelAssignment = { ...first, hotelId: 'hotel-b', hotelName: 'Khách sạn B', staffRole: 'MANAGER' };
  const context: StaffContextResponse = { caseId: 'C2', isMock: true, requestId: 'request', operationalEffects: 'NONE', userId: 'staff-1', hasAccess: true, assignments: [first, second] };
  it('denies access before the server has verified the user', () => expect(selectStaffHotel(undefined, 'hotel-a')).toBeNull());
  it('denies hasAccess=false even with assignments present', () => expect(selectStaffHotel({ ...context, hasAccess: false }, 'hotel-a')).toBeNull());
  it('denies an unassigned user, including global administrators', () => expect(selectStaffHotel({ ...context, assignments: [] }, null)).toBeNull());
  it('defaults to a server assignment and never manufactures a scope', () => {
    expect(selectStaffHotel(context, null)).toBe(first);
    expect(selectStaffHotel(context, 'unassigned-hotel')).toBe(first);
    expect(context.assignments).toEqual([first, second]);
  });
  it('uses the role belonging to the selected hotel', () => expect(selectStaffHotel(context, 'hotel-b')).toBe(second));
});

describe('staff formatting', () => {
  it.each([[600000, '600.000đ'], [0, '0đ'], [-1000000, '-1.000.000đ'], [null, '—'], [undefined, '—']] as const)(
    'formats VND %s as %s', (amount, expected) => expect(formatVnd(amount)).toBe(expected),
  );
  it('rounds integer VND without currency decimal digits', () => expect(formatVnd(600000.4)).toBe('600.000đ'));
  it('formats an instant in hotel time across midnight', () => {
    expect(formatDateTimeInTz('2026-11-28T18:05:00Z', 'Asia/Ho_Chi_Minh')).toBe('29/11/2026 01:05');
    expect(formatDateInTz('2026-11-28T18:05:00Z', 'Asia/Ho_Chi_Minh')).toBe('29/11/2026');
    expect(formatDateTimeInTz('2026-11-28T18:05:00Z', 'UTC')).toBe('28/11/2026 18:05');
  });
  it('honors an ISO offset rather than interpreting it in the host timezone', () => {
    expect(formatDateTimeInTz('2026-11-29T01:05:00+07:00', 'Asia/Ho_Chi_Minh')).toBe('29/11/2026 01:05');
  });
  it('keeps local night dates unchanged even in a timezone west of UTC', () => {
    expect(formatDateInTz('2026-11-28', 'Asia/Ho_Chi_Minh')).toBe('28/11/2026');
    expect(formatDateInTz('2026-11-28', 'America/Los_Angeles')).toBe('28/11/2026');
  });
  it.each([null, undefined, '', 'invalid'] as const)('handles absent/invalid date %s', (value) => {
    expect(formatDateInTz(value, 'Asia/Ho_Chi_Minh')).toBe('—');
    expect(formatDateTimeInTz(value, 'Asia/Ho_Chi_Minh')).toBe('—');
  });
  it('rejects impossible local night dates', () => expect(formatDateInTz('2026-02-30', 'Asia/Ho_Chi_Minh')).toBe('—'));
  it('has long and short labels for both hotel roles', () => {
    expect(formatRoleLabel('RECEPTIONIST')).toBe('Lễ tân (RECEPTIONIST)');
    expect(formatRoleLabel('MANAGER')).toBe('Quản lý (MANAGER)');
    expect(formatShortRoleLabel('RECEPTIONIST')).toBe('Lễ tân');
    expect(formatShortRoleLabel('MANAGER')).toBe('Quản lý');
  });
  it('translates known room features and keeps unknown codes visible', () => {
    expect(formatRoomFeature('NON_SMOKING')).toBe('Không hút thuốc');
    expect(formatRoomFeature('GARDEN_VIEW')).toBe('Hướng vườn');
    expect(formatRoomFeature('ACCESSIBLE')).toBe('Hỗ trợ tiếp cận');
    expect(formatRoomFeature('NEW_FEATURE')).toBe('NEW_FEATURE');
    expect(formatRoomFeature('constructor')).toBe('constructor');
  });
});

describe('complete Vietnamese business status mappings', () => {
  const proposals = ['DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED'] satisfies ProposalStatus[];
  const quotes = ['VALID', 'NEEDS_INPUT', 'MISSING_DATA', 'INELIGIBLE', 'UNAVAILABLE', 'REQUIRES_MANAGER', 'VALIDATION_FAILED'] satisfies QuoteStatus[];
  const actions = ['CREATED', 'REVISED', 'APPROVED', 'REJECTED', 'ESCALATED', 'MARKED_EXPIRED', 'MARKED_REQUOTE_REQUIRED'] satisfies ProposalAuditAction[];
  const tones = ['neutral', 'info', 'warning', 'success', 'danger'];
  it('covers every CP3 proposal status with a label and semantic tone', () => {
    expect(Object.keys(PROPOSAL_STATUS_META).sort()).toEqual([...proposals].sort());
    for (const status of proposals) {
      expect(PROPOSAL_STATUS_META[status].label.trim().length).toBeGreaterThan(0);
      expect(tones).toContain(PROPOSAL_STATUS_META[status].tone);
    }
  });
  it('covers every CP1 quote status with a label and semantic tone', () => {
    expect(Object.keys(QUOTE_STATUS_META).sort()).toEqual([...quotes].sort());
    for (const status of quotes) {
      expect(QUOTE_STATUS_META[status].label.trim().length).toBeGreaterThan(0);
      expect(tones).toContain(QUOTE_STATUS_META[status].tone);
    }
  });
  it('covers all seven audit actions with non-empty labels', () => {
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual([...actions].sort());
    for (const action of actions) expect(AUDIT_ACTION_LABELS[action].trim().length).toBeGreaterThan(0);
  });
  it('explains every stale/requote reason', () => {
    const reasons = ['RATE_CHANGED', 'INVENTORY_UNAVAILABLE', 'INVENTORY_CHANGED', 'BOOKING_STATUS_CHANGED', 'BOOKING_CHANGED', 'POLICY_VERSION_CHANGED', 'BENEFIT_CHANGED', 'PRICE_CHANGED', 'APPROVAL_ROLE_CHANGED', 'QUOTE_INVALIDATED', 'PROPOSAL_EXPIRED', 'PREVIEW_MISMATCH', 'MANUAL_ESCALATION', 'COMPLIMENTARY_NOT_ELIGIBLE', 'NEGATIVE_DIFFERENCE', 'MANAGER_LIMIT'];
    expect(Object.keys(STALE_REASON_LABELS).sort()).toEqual(reasons.sort());
    for (const reason of reasons) expect(STALE_REASON_LABELS[reason]?.trim().length).toBeGreaterThan(0);
  });
});

describe('instant booking search', () => {
  const bookings = [
    { bookingCode: 'C2-0001', roomNumber: '101', roomTypeId: 'STD' },
    { bookingCode: 'C2-0002', roomNumber: '202', roomTypeId: 'DLX' },
    { bookingCode: 'C2-0010', roomNumber: '303', roomTypeId: 'STE' },
  ];
  it('matches a booking code substring case-insensitively', () => expect(filterBookings(bookings, 'c2-0001')).toEqual([bookings[0]]));
  it('matches a room number substring', () => expect(filterBookings(bookings, '02')).toEqual([bookings[1]]));
  it('matches a room type case-insensitively', () => expect(filterBookings(bookings, 'dlx')).toEqual([bookings[1]]));
  it('trims search whitespace', () => expect(filterBookings(bookings, '  sTd  ')).toEqual([bookings[0]]));
  it('returns every booking for an empty or whitespace-only search', () => {
    expect(filterBookings(bookings, '')).toEqual(bookings);
    expect(filterBookings(bookings, '   ')).toEqual(bookings);
  });
  it('returns no matches for unknown text or an empty dataset', () => {
    expect(filterBookings(bookings, 'unknown')).toEqual([]);
    expect(filterBookings([], 'C2')).toEqual([]);
  });
  it('preserves ordering and does not mutate the source', () => {
    const frozen = Object.freeze([...bookings]);
    expect(filterBookings(frozen, 'C2')).toEqual(bookings);
    expect(filterBookings(frozen, 'C2')).not.toBe(frozen);
  });
});
