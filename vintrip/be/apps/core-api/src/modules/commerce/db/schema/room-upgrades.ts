import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, foreignKey, integer, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Booking, Policy, RoomType, StaffRole } from '../../room-upgrades/domain/room-upgrade.js';
import { commerceSchema } from './commerce-schema.js';

const mockColumns = () => ({ isMock: boolean('is_mock').notNull().default(true), version: integer('version').notNull().default(1) });
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
const vnd = (name: string) => bigint(name, { mode: 'number' });

// Separate sandbox tables: catalog opening/checkout/payment jobs never see these rows.
export const upgradeHotels = commerceSchema.table('room_upgrade_hotels', {
  id: text('id').primaryKey(), name: text('name').notNull(), timezone: text('timezone').notNull(),
  fixtureVersion: text('fixture_version').notNull(), ...mockColumns(),
}, (t) => [check('ck_room_upgrade_hotels_mock_version', sql`${t.isMock} = true and ${t.version} > 0`)]);

export const upgradeRoomTypes = commerceSchema.table('room_upgrade_room_types', {
  hotelId: text('hotel_id').notNull().references(() => upgradeHotels.id), id: text('id').notNull(), name: text('name').notNull(),
  rank: integer('rank').notNull(), maxGuests: integer('max_guests').notNull(),
  features: jsonb('features').$type<RoomType['features']>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.id] }),
  check('ck_room_upgrade_room_types_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.rank} > 0 and ${t.maxGuests} > 0`)]);

export const upgradeBookings = commerceSchema.table('room_upgrade_bookings', {
  hotelId: text('hotel_id').notNull(), bookingCode: text('booking_code').notNull(), roomNumber: text('room_number').notNull(),
  roomTypeId: text('room_type_id').notNull(), status: text('status').$type<Booking['status']>().notNull(),
  checkInAt: instant('check_in_at').notNull(), checkOutAt: instant('check_out_at').notNull(),
  guests: integer('guests').notNull(), nights: jsonb('nights').$type<Booking['nights']>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.bookingCode] }),
  foreignKey({ columns: [t.hotelId, t.roomTypeId], foreignColumns: [upgradeRoomTypes.hotelId, upgradeRoomTypes.id] }),
  check('ck_room_upgrade_bookings_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.guests} > 0 and ${t.checkOutAt} > ${t.checkInAt}`),
  check('ck_room_upgrade_bookings_status', sql`${t.status} in ('IN_HOUSE', 'CONFIRMED', 'CHECKED_OUT')`)]);

export const upgradeRoomInventory = commerceSchema.table('room_upgrade_inventory', {
  hotelId: text('hotel_id').notNull(), roomTypeId: text('room_type_id').notNull(), date: date('date', { mode: 'string' }).notNull(),
  total: integer('total').notNull(), held: integer('held').notNull(), sold: integer('sold').notNull(),
  outOfService: integer('out_of_service').notNull(), stopSell: boolean('stop_sell').notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.roomTypeId, t.date] }),
  foreignKey({ columns: [t.hotelId, t.roomTypeId], foreignColumns: [upgradeRoomTypes.hotelId, upgradeRoomTypes.id] }),
  check('ck_room_upgrade_inventory_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.held} >= 0 and ${t.sold} >= 0 and ${t.outOfService} >= 0 and ${t.held} + ${t.sold} + ${t.outOfService} <= ${t.total}`)]);

export const upgradeRoomRates = commerceSchema.table('room_upgrade_rates', {
  hotelId: text('hotel_id').notNull(), roomTypeId: text('room_type_id').notNull(), date: date('date', { mode: 'string' }).notNull(),
  priceVnd: vnd('price_vnd').notNull(), taxIncluded: boolean('tax_included').notNull(), sourceRef: text('source_ref').notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.roomTypeId, t.date] }),
  foreignKey({ columns: [t.hotelId, t.roomTypeId], foreignColumns: [upgradeRoomTypes.hotelId, upgradeRoomTypes.id] }),
  check('ck_room_upgrade_rates_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.priceVnd} between 0 and 9007199254740991`)]);

export const upgradePolicies = commerceSchema.table('room_upgrade_policies', {
  hotelId: text('hotel_id').notNull().references(() => upgradeHotels.id), code: text('code').notNull(),
  validFrom: instant('valid_from').notNull(), validUntil: instant('valid_until').notNull(),
  rules: jsonb('rules').$type<Policy['rules']>().notNull(), sources: jsonb('sources').$type<Policy['sources']>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.code, t.version] }),
  check('ck_room_upgrade_policies_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.validUntil} > ${t.validFrom}`)]);

export const upgradeMemberBenefits = commerceSchema.table('room_upgrade_member_benefits', {
  hotelId: text('hotel_id').notNull(), id: text('id').notNull(), bookingCode: text('booking_code').notNull(), code: text('code').notNull(),
  verifiedAt: instant('verified_at'), validFrom: instant('valid_from').notNull(), validUntil: instant('valid_until').notNull(),
  discountBps: integer('discount_bps').notNull(), roomTypeIds: jsonb('room_type_ids').$type<string[]>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.id] }),
  foreignKey({ columns: [t.hotelId, t.bookingCode], foreignColumns: [upgradeBookings.hotelId, upgradeBookings.bookingCode] }),
  check('ck_room_upgrade_benefits_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.discountBps} between 0 and 10000 and ${t.validUntil} > ${t.validFrom}`)]);

export const upgradeStaffAssignments = commerceSchema.table('room_upgrade_staff_assignments', {
  hotelId: text('hotel_id').notNull().references(() => upgradeHotels.id), userId: uuid('user_id').notNull(),
  role: text('role').$type<StaffRole>().notNull(), active: boolean('active').notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.userId] }),
  check('ck_room_upgrade_staff_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.role} in ('RECEPTIONIST', 'MANAGER')`)]);
