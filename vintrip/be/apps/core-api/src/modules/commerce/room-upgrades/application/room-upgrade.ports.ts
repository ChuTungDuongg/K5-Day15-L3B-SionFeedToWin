import type { Snapshot, StaffRole } from '../domain/room-upgrade.js';

export const ROOM_UPGRADE_STORE = Symbol('ROOM_UPGRADE_STORE');
export const ROOM_UPGRADE_CLOCK = Symbol('ROOM_UPGRADE_CLOCK');
export interface RoomUpgradeStore {
  beginReadSnapshot(): Promise<void>;
  staffRole(hotelId: string, userId: string): Promise<StaffRole | null>;
  loadSnapshot(hotelId: string): Promise<Snapshot | null>;
}
