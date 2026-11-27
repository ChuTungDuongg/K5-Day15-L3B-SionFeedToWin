import type { Db } from '@vintrip/db';
import { and, eq } from 'drizzle-orm';
import { upgradeBookings, upgradeHotels, upgradeMemberBenefits, upgradeRoomInventory, upgradeRoomRates, upgradeRoomTypes, upgradeStaffAssignments, upgradePolicies } from '../../db/schema/room-upgrades.js';
import { SnapshotSchema, type Snapshot, type StaffRole } from '../domain/room-upgrade.js';

export interface SeedStaff { userId: string; role: StaffRole }

/** Explicit fixture command only. Never called by an HTTP request, startup hook or pricing workflow. */
export async function seedRoomUpgradeFixture(db: Db, input: Snapshot, staff: SeedStaff[] = []) {
  const snapshot = SnapshotSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(upgradeHotels).where(eq(upgradeHotels.id, snapshot.hotel.id));
    if (existing && existing.fixtureVersion !== snapshot.hotel.fixtureVersion) {
      throw new Error('Khách sạn đã có fixture khác ngày/version. Không ghi đè; dùng database sandbox mới.');
    }
    await tx.insert(upgradeHotels).values(snapshot.hotel).onConflictDoNothing();
    await tx.insert(upgradeRoomTypes).values(snapshot.roomTypes).onConflictDoNothing();
    await tx.insert(upgradeBookings).values(snapshot.bookings).onConflictDoNothing();
    await tx.insert(upgradeRoomInventory).values(snapshot.inventory).onConflictDoNothing();
    await tx.insert(upgradeRoomRates).values(snapshot.rates).onConflictDoNothing();
    await tx.insert(upgradePolicies).values(snapshot.policies).onConflictDoNothing();
    if (snapshot.benefits.length) await tx.insert(upgradeMemberBenefits).values(snapshot.benefits).onConflictDoNothing();
    let assignmentsAdded = 0;
    for (const assignment of staff) {
      const [old] = await tx.select().from(upgradeStaffAssignments).where(and(
        eq(upgradeStaffAssignments.hotelId, snapshot.hotel.id), eq(upgradeStaffAssignments.userId, assignment.userId),
      ));
      if (old && (old.role !== assignment.role || !old.active)) throw new Error('Không tự ghi đè phân công nhân viên đã có.');
      const inserted = await tx.insert(upgradeStaffAssignments).values({ hotelId: snapshot.hotel.id, ...assignment,
        active: true, isMock: true, version: 1 }).onConflictDoNothing().returning();
      assignmentsAdded += inserted.length;
    }
    return { hotelId: snapshot.hotel.id, fixtureVersion: snapshot.hotel.fixtureVersion, created: !existing, assignmentsAdded, isMock: true };
  });
}
