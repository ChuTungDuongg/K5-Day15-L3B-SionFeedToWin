import { Module } from '@nestjs/common';
import { ParkPlansController } from './api/park-plans.controller.js';
import { PARK_SNAPSHOTS, ParkPlanUseCases, type ParkSnapshots } from './application/park-plan.use-cases.js';
import { MOCK_PARK_ID } from './domain/park-snapshot.js';
import { CONG_VIEN_MAU_SNAPSHOT } from './infra/cong-vien-mau.snapshot.js';

const snapshots: ParkSnapshots = new Map([[MOCK_PARK_ID, CONG_VIEN_MAU_SNAPSHOT]]);

@Module({
  controllers: [ParkPlansController],
  providers: [ParkPlanUseCases, { provide: PARK_SNAPSHOTS, useValue: snapshots }],
})
export class ParkPlansModule {}
