import { Injectable } from '@nestjs/common';
import { InjectTransactionHost, type Db } from '@vintrip/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { upgradeBookings, upgradeHotels, upgradeMemberBenefits, upgradeRoomInventory, upgradeRoomRates, upgradeRoomTypes, upgradeStaffAssignments, upgradePolicies } from '../../db/schema/room-upgrades.js';
import type { RoomUpgradeStore } from '../application/room-upgrade.ports.js';
import { SnapshotSchema } from '../domain/room-upgrade.js';

@Injectable()
export class DrizzleRoomUpgradeStore implements RoomUpgradeStore {
  constructor(@InjectTransactionHost('commerce') private readonly host: { readonly tx: Pick<Db, 'select' | 'execute'> }) {}

  async beginReadSnapshot(): Promise<void> {
    await this.host.tx.execute(sql`set transaction isolation level repeatable read read only`);
  }

  async staffRole(hotelId: string, userId: string) {
    const [assignment] = await this.host.tx.select().from(upgradeStaffAssignments).where(and(
      eq(upgradeStaffAssignments.hotelId, hotelId), eq(upgradeStaffAssignments.userId, userId), eq(upgradeStaffAssignments.active, true),
    ));
    return assignment?.role ?? null;
  }

  async loadSnapshot(hotelId: string) {
    const db = this.host.tx;
    const [hotel] = await db.select().from(upgradeHotels).where(eq(upgradeHotels.id, hotelId));
    if (!hotel) return null;
    const roomTypes = await db.select().from(upgradeRoomTypes).where(eq(upgradeRoomTypes.hotelId, hotelId)).orderBy(asc(upgradeRoomTypes.id));
    const bookings = await db.select().from(upgradeBookings).where(eq(upgradeBookings.hotelId, hotelId)).orderBy(asc(upgradeBookings.bookingCode));
    const inventory = await db.select().from(upgradeRoomInventory).where(eq(upgradeRoomInventory.hotelId, hotelId)).orderBy(asc(upgradeRoomInventory.roomTypeId), asc(upgradeRoomInventory.date));
    const rates = await db.select().from(upgradeRoomRates).where(eq(upgradeRoomRates.hotelId, hotelId)).orderBy(asc(upgradeRoomRates.roomTypeId), asc(upgradeRoomRates.date));
    const policies = await db.select().from(upgradePolicies).where(eq(upgradePolicies.hotelId, hotelId)).orderBy(asc(upgradePolicies.version), asc(upgradePolicies.code));
    const benefits = await db.select().from(upgradeMemberBenefits).where(eq(upgradeMemberBenefits.hotelId, hotelId)).orderBy(asc(upgradeMemberBenefits.id));
    const iso = (value: string) => new Date(value).toISOString();
    return SnapshotSchema.parse({ hotel, roomTypes, inventory, rates,
      bookings: bookings.map((b) => ({ ...b, checkInAt: iso(b.checkInAt), checkOutAt: iso(b.checkOutAt) })),
      policies: policies.map((p) => ({ ...p, validFrom: iso(p.validFrom), validUntil: iso(p.validUntil) })),
      benefits: benefits.map((b) => ({ ...b, verifiedAt: b.verifiedAt && iso(b.verifiedAt), validFrom: iso(b.validFrom), validUntil: iso(b.validUntil) })),
    });
  }
}
