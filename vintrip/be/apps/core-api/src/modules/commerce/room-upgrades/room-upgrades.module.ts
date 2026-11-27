import { Module } from '@nestjs/common';
import { TraceContext } from '../trace-context.js';
import { RoomUpgradesController } from './api/room-upgrades.controller.js';
import { RoomUpgradeProposalsController } from './api/room-upgrade-proposals.controller.js';
import { RoomUpgradeProposalUseCases } from './application/room-upgrade-proposal.use-cases.js';
import { RoomUpgradeUseCases } from './application/room-upgrade.use-cases.js';
import { ROOM_UPGRADE_CLOCK, ROOM_UPGRADE_PROPOSAL_STORE, ROOM_UPGRADE_STORE } from './application/room-upgrade.ports.js';
import { DrizzleRoomUpgradeStore } from './infra/drizzle-room-upgrade.store.js';
import { DrizzleRoomUpgradeProposalStore } from './infra/drizzle-room-upgrade-proposal.store.js';

@Module({
  controllers: [RoomUpgradesController, RoomUpgradeProposalsController],
  providers: [TraceContext, RoomUpgradeUseCases, { provide: ROOM_UPGRADE_STORE, useClass: DrizzleRoomUpgradeStore },
    { provide: ROOM_UPGRADE_CLOCK, useValue: () => new Date() },
    RoomUpgradeProposalUseCases, { provide: ROOM_UPGRADE_PROPOSAL_STORE, useClass: DrizzleRoomUpgradeProposalStore }],
})
export class RoomUpgradesModule {}
