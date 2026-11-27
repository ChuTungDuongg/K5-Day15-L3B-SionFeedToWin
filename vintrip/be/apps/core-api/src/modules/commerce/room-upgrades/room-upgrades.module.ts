import { Module } from '@nestjs/common';
import { TraceContext } from '../trace-context.js';
import { RoomUpgradesController } from './api/room-upgrades.controller.js';
import { RoomUpgradeUseCases } from './application/room-upgrade.use-cases.js';
import { ROOM_UPGRADE_CLOCK, ROOM_UPGRADE_STORE } from './application/room-upgrade.ports.js';
import { DrizzleRoomUpgradeStore } from './infra/drizzle-room-upgrade.store.js';

@Module({
  controllers: [RoomUpgradesController],
  providers: [TraceContext, RoomUpgradeUseCases, { provide: ROOM_UPGRADE_STORE, useClass: DrizzleRoomUpgradeStore },
    { provide: ROOM_UPGRADE_CLOCK, useValue: () => new Date() }],
})
export class RoomUpgradesModule {}
