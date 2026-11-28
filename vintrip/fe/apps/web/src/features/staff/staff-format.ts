import type { RoomUpgradeBooking, StaffRole } from '@vintrip/api-client';
import { ROOM_FEATURE_LABELS } from './staff-status';

export { ROOM_FEATURE_LABELS } from './staff-status';

const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function formatVnd(amount: number | null | undefined): string {
  return amount == null ? '—' : `${vnd.format(amount)}đ`;
}

function dateParts(iso: string, timeZone: string, withTime: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } as const : {}),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const day = `${part('day')}/${part('month')}/${part('year')}`;
  return withTime ? `${day} ${part('hour')}:${part('minute')}` : day;
}

export function formatDateTimeInTz(iso: string | null | undefined, timeZone: string): string {
  return iso ? dateParts(iso, timeZone, true) : '—';
}

export function formatDateInTz(isoOrDate: string | null | undefined, timeZone: string): string {
  if (!isoOrDate) return '—';
  // A night is a hotel calendar date, not a UTC instant. Never shift it between zones.
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const date = new Date(`${isoOrDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoOrDate) return '—';
    const [year, month, day] = isoOrDate.split('-');
    return `${day}/${month}/${year}`;
  }
  return dateParts(isoOrDate, timeZone, false);
}

export function formatRoleLabel(role: StaffRole): string {
  return `${formatShortRoleLabel(role)} (${role})`;
}

export function formatShortRoleLabel(role: StaffRole): string {
  return role === 'MANAGER' ? 'Quản lý' : 'Lễ tân';
}

export function formatRoomFeature(code: string): string {
  return Object.prototype.hasOwnProperty.call(ROOM_FEATURE_LABELS, code) ? ROOM_FEATURE_LABELS[code] ?? code : code;
}

export function filterBookings<T extends Pick<RoomUpgradeBooking, 'bookingCode' | 'roomNumber' | 'roomTypeId'>>(
  bookings: readonly T[],
  search: string,
): T[] {
  const query = search.trim().toLocaleLowerCase('vi-VN');
  return bookings.filter((booking) =>
    [booking.bookingCode, booking.roomNumber, booking.roomTypeId].some((value) =>
      value.toLocaleLowerCase('vi-VN').includes(query),
    ),
  );
}
