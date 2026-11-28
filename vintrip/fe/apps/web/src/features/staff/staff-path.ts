import type { StaffContextResponse, StaffHotelAssignment } from '@vintrip/api-client';

/** Match a route segment, so customer paths such as /staffing stay untouched. */
export function isStaffPath(pathname: string): boolean {
  return pathname === '/staff' || pathname.startsWith('/staff/');
}

/** Selection is always constrained to assignments verified by the server. */
export function selectStaffHotel(
  context: StaffContextResponse | undefined,
  hotelId: string | null,
): StaffHotelAssignment | null {
  if (!context?.hasAccess) return null;
  return context.assignments.find((assignment) => assignment.hotelId === hotelId) ?? context.assignments[0] ?? null;
}

export function bookingDetailHref(bookingCode: string): string {
  return `/staff/bookings/${encodeURIComponent(bookingCode)}`;
}

export function bookingUpgradeHref(bookingCode: string): string {
  return `/staff/room-upgrades?booking=${encodeURIComponent(bookingCode)}`;
}
