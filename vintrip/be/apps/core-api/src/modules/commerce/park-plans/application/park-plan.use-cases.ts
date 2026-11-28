import { Inject, Injectable } from '@nestjs/common';
import { CommerceError } from '../../inventory/domain/errors.js';
import { validateParkPlan } from '../domain/park-plan-validator.js';
import type { ParkPlanValidation, ParkSnapshot, ValidateParkPlanRequest } from '../domain/park-snapshot.js';

export const PARK_SNAPSHOTS = Symbol('PARK_SNAPSHOTS');
/** Nguồn snapshot theo mã công viên; P0 chỉ có Công viên Mẫu (dữ liệu mô phỏng). */
export type ParkSnapshots = ReadonlyMap<string, ParkSnapshot>;

@Injectable()
export class ParkPlanUseCases {
  constructor(@Inject(PARK_SNAPSHOTS) private readonly snapshots: ParkSnapshots) {}

  getSnapshot(parkId: string): ParkSnapshot {
    const snapshot = this.snapshots.get(parkId);
    if (!snapshot) throw new CommerceError('not_found', 'Không có dữ liệu cho công viên này');
    return snapshot;
  }

  /** Chỉ tính toán, không ghi gì: lịch AI đề xuất được kiểm lại trên snapshot của core-api. */
  validate(body: ValidateParkPlanRequest): ParkPlanValidation {
    const snapshot = this.getSnapshot(body.parkId);
    if (snapshot.snapshotId !== body.snapshotId) {
      throw new CommerceError('conflict', 'Lịch được lập trên snapshot khác với dữ liệu hiện tại của công viên', 'snapshotId', {
        reason: 'SNAPSHOT_MISMATCH',
        currentSnapshotId: snapshot.snapshotId,
      });
    }
    return validateParkPlan(snapshot, body.items, body.request);
  }
}
