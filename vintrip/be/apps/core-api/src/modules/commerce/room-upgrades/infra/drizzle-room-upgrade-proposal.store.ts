import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectTransactionHost, type ModuleTransactionHost } from '@vintrip/db';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  upgradeBookings, upgradeHotels, upgradeStaffAssignments, upgradeMemberBenefits, upgradePolicies, upgradeRoomInventory, upgradeRoomRates,
  upgradeProposalAuditEvents, upgradeProposalIdempotency, upgradeProposalRevisions, upgradeProposals,
} from '../../db/schema/room-upgrades.js';
import {
  ROOM_UPGRADE_PROPOSAL_FAULT_INJECTOR,
  type ProposalAuditEventRecord, type ProposalIdempotencyRecord, type ProposalRecord, type ProposalRevisionRecord,
  type RoomUpgradeProposalFaultInjector, type RoomUpgradeProposalStore, type RoomUpgradeProposalTx,
} from '../application/room-upgrade.ports.js';
import { DrizzleRoomUpgradeStore } from './drizzle-room-upgrade.store.js';

/** Drizzle wraps pg errors in cause. Never retry unrelated uniqueness violations. */
export function isRetryableProposalTxError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= 4; depth++) {
    if (current === null || typeof current !== 'object') return false;
    const detail = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (detail.code === '40001' || detail.code === '40P01' ||
      (detail.code === '23505' && detail.constraint === 'room_upgrade_proposal_idempotency_pkey')) return true;
    current = detail.cause;
  }
  return false;
}

const iso = (value: string) => new Date(value).toISOString();
function mockRow<T extends { isMock: boolean }>(row: T): T & { isMock: true } {
  if (!row.isMock) throw new Error('Non-sandbox proposal row');
  return { ...row, isMock: true };
}
function proposalRecord(row: typeof upgradeProposals.$inferSelect): ProposalRecord {
  return { ...mockRow(row), decidedAt: row.decidedAt === null ? null : iso(row.decidedAt),
    expiresAt: iso(row.expiresAt), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function revisionRecord(row: typeof upgradeProposalRevisions.$inferSelect): ProposalRevisionRecord {
  return { ...mockRow(row), effectiveAt: iso(row.effectiveAt), calculatedAt: iso(row.calculatedAt),
    expiresAt: iso(row.expiresAt), createdAt: iso(row.createdAt) };
}
function auditRecord(row: typeof upgradeProposalAuditEvents.$inferSelect): ProposalAuditEventRecord {
  return { ...mockRow(row), createdAt: iso(row.createdAt) };
}
function idempotencyRecord(row: typeof upgradeProposalIdempotency.$inferSelect): ProposalIdempotencyRecord {
  const httpStatus = row.httpStatus;
  if (httpStatus !== 200 && httpStatus !== 201 && httpStatus !== 409) throw new Error('Invalid proposal replay status');
  return { ...mockRow(row), httpStatus, createdAt: iso(row.createdAt) };
}

@Injectable()
export class DrizzleRoomUpgradeProposalStore implements RoomUpgradeProposalStore {
  constructor(
    @InjectTransactionHost('commerce') private readonly host: ModuleTransactionHost,
    @Optional() @Inject(ROOM_UPGRADE_PROPOSAL_FAULT_INJECTOR) private readonly faults?: RoomUpgradeProposalFaultInjector,
  ) {}

  withReadTransaction<T>(fn: (tx: RoomUpgradeProposalTx) => Promise<T>): Promise<T> {
    return this.host.withTransaction({ isolationLevel: 'repeatable read', accessMode: 'read only' }, async () => fn(this.bindTx()));
  }

  async withSerializableTransaction<T>(
    fn: (tx: RoomUpgradeProposalTx) => Promise<T>, options?: { maxAttempts?: number },
  ): Promise<T> {
    const requested = options?.maxAttempts ?? 3;
    const maxAttempts = Number.isNaN(requested) ? 3 : Math.min(5, Math.max(1, Math.trunc(requested)));
    for (let attempt = 1; ; attempt++) {
      try {
        // Retry surrounds the transaction, so every attempt gets a new snapshot
        // and rolls back proposal, revision, audit and replay writes together.
        return await this.host.withTransaction({ isolationLevel: 'serializable' }, async () => fn(this.bindTx()));
      } catch (error) {
        if (attempt >= maxAttempts || !isRetryableProposalTxError(error)) throw error;
      }
    }
  }

  private bindTx(): RoomUpgradeProposalTx {
    const db = this.host.tx;
    // Bind the existing CP1 loader to THIS attempt's tx. Its ordering, ISO
    // normalization and SnapshotSchema.parse remain the single implementation.
    const snapshots = new DrizzleRoomUpgradeStore({ tx: db });
    return {
      listStaffAssignments: async (userId) => db.select({
        hotelId: upgradeHotels.id, hotelName: upgradeHotels.name, timezone: upgradeHotels.timezone,
        fixtureVersion: upgradeHotels.fixtureVersion, staffRole: upgradeStaffAssignments.role,
      }).from(upgradeStaffAssignments).innerJoin(upgradeHotels, eq(upgradeStaffAssignments.hotelId, upgradeHotels.id))
        .where(and(eq(upgradeStaffAssignments.userId, userId), eq(upgradeStaffAssignments.active, true)))
        .orderBy(asc(upgradeStaffAssignments.hotelId)),
      countProposalsByStatus: async (hotelId) => db.select({
        status: upgradeProposals.status, count: sql<number>`count(*)::int`,
      }).from(upgradeProposals).where(eq(upgradeProposals.hotelId, hotelId)).groupBy(upgradeProposals.status),
      staffRole: (hotelId, userId) => snapshots.staffRole(hotelId, userId),
      loadSnapshot: (hotelId) => snapshots.loadSnapshot(hotelId),
      findIdempotency: async (scope) => {
        const [row] = await db.select().from(upgradeProposalIdempotency).where(and(
          eq(upgradeProposalIdempotency.hotelId, scope.hotelId), eq(upgradeProposalIdempotency.actorUserId, scope.actorUserId),
          eq(upgradeProposalIdempotency.operation, scope.operation), eq(upgradeProposalIdempotency.targetId, scope.targetId),
          eq(upgradeProposalIdempotency.idempotencyKey, scope.idempotencyKey),
        ));
        return row ? idempotencyRecord(row) : null;
      },
      insertIdempotency: async (record) => {
        // Do not ignore conflicts: abort and retry the whole transaction, then
        // the application can replay the committed response or reject its hash.
        await db.insert(upgradeProposalIdempotency).values(record);
      },
      insertProposal: async (record) => {
        const [row] = await db.insert(upgradeProposals).values(record).returning();
        if (!row) throw new Error('Proposal insert returned no row');
        return proposalRecord(row);
      },
      lockProposalForUpdate: async (hotelId, proposalId) => {
        await this.faults?.beforeProposalLock?.(hotelId, proposalId);
        const [row] = await db.select().from(upgradeProposals).where(and(
          eq(upgradeProposals.hotelId, hotelId), eq(upgradeProposals.id, proposalId),
        )).for('update');
        return row ? proposalRecord(row) : null;
      },
      lockApprovalSourcesForShare: async ({ hotelId, bookingCode, targetRoomTypeId }) => {
        await this.faults?.beforeApprovalSourceLock?.({ hotelId, bookingCode, targetRoomTypeId });
        // Every approval uses the same table/PK order. Shared locks coexist for
        // separate proposals, but conflict with source updates/deletes. Under
        // SERIALIZABLE a row changed after our snapshot aborts this attempt;
        // the outer retry then quotes from a new snapshot before deciding.
        await db.select().from(upgradeBookings).where(and(
          eq(upgradeBookings.hotelId, hotelId), eq(upgradeBookings.bookingCode, bookingCode),
        )).for('share');
        await db.select().from(upgradeRoomInventory).where(and(
          eq(upgradeRoomInventory.hotelId, hotelId), eq(upgradeRoomInventory.roomTypeId, targetRoomTypeId),
        )).orderBy(asc(upgradeRoomInventory.date)).for('share');
        await db.select().from(upgradeRoomRates).where(and(
          eq(upgradeRoomRates.hotelId, hotelId), eq(upgradeRoomRates.roomTypeId, targetRoomTypeId),
        )).orderBy(asc(upgradeRoomRates.date)).for('share');
        await db.select().from(upgradePolicies).where(eq(upgradePolicies.hotelId, hotelId))
          .orderBy(asc(upgradePolicies.code), asc(upgradePolicies.version)).for('share');
        await db.select().from(upgradeMemberBenefits).where(and(
          eq(upgradeMemberBenefits.hotelId, hotelId), eq(upgradeMemberBenefits.bookingCode, bookingCode),
        )).orderBy(asc(upgradeMemberBenefits.id)).for('share');
      },
      getProposal: async (hotelId, proposalId) => {
        const [row] = await db.select().from(upgradeProposals).where(and(
          eq(upgradeProposals.hotelId, hotelId), eq(upgradeProposals.id, proposalId),
        ));
        return row ? proposalRecord(row) : null;
      },
      listProposals: async (filter) => {
        const where = and(
          eq(upgradeProposals.hotelId, filter.hotelId),
          filter.status === undefined ? undefined : eq(upgradeProposals.status, filter.status),
          filter.bookingCode === undefined ? undefined : eq(upgradeProposals.bookingCode, filter.bookingCode),
          filter.requiredApprovalRole === undefined ? undefined : eq(upgradeProposals.requiredApprovalRole, filter.requiredApprovalRole),
        );
        const [totalRow] = await db.select({ total: count() }).from(upgradeProposals).where(where);
        const rows = await db.select().from(upgradeProposals).where(where)
          .orderBy(desc(upgradeProposals.updatedAt), desc(upgradeProposals.id)).limit(filter.limit).offset(filter.offset);
        return { items: rows.map(proposalRecord), total: totalRow?.total ?? 0 };
      },
      updateProposalCas: async (input) => {
        const change = input.changes;
        const [row] = await db.update(upgradeProposals).set({
          version: sql`${upgradeProposals.version} + 1`, status: change.status, updatedAt: change.updatedAt,
          currentRevision: change.currentRevision, requiredApprovalRole: change.requiredApprovalRole,
          reasonCodes: change.reasonCodes, decidedBy: change.decidedBy, decidedByRole: change.decidedByRole,
          decidedAt: change.decidedAt, decisionReason: change.decisionReason, expiresAt: change.expiresAt,
        }).where(and(
          eq(upgradeProposals.hotelId, input.hotelId), eq(upgradeProposals.id, input.proposalId),
          eq(upgradeProposals.version, input.expectedVersion), eq(upgradeProposals.status, input.expectedStatus),
        )).returning();
        return row ? proposalRecord(row) : null;
      },
      insertRevision: async (record) => {
        const [row] = await db.insert(upgradeProposalRevisions).values(record).returning();
        if (!row) throw new Error('Proposal revision insert returned no row');
        return revisionRecord(row);
      },
      getRevision: async (hotelId, proposalId, revisionNumber) => {
        const [row] = await db.select().from(upgradeProposalRevisions).where(and(
          eq(upgradeProposalRevisions.hotelId, hotelId), eq(upgradeProposalRevisions.proposalId, proposalId),
          eq(upgradeProposalRevisions.revisionNumber, revisionNumber),
        ));
        return row ? revisionRecord(row) : null;
      },
      listRevisions: async (hotelId, proposalId) => {
        const rows = await db.select().from(upgradeProposalRevisions).where(and(
          eq(upgradeProposalRevisions.hotelId, hotelId), eq(upgradeProposalRevisions.proposalId, proposalId),
        )).orderBy(asc(upgradeProposalRevisions.revisionNumber));
        return rows.map(revisionRecord);
      },
      listRevisionsByProposalIds: async (hotelId, proposalIds) => {
        if (proposalIds.length === 0) return [];
        const rows = await db.select().from(upgradeProposalRevisions).where(and(
          eq(upgradeProposalRevisions.hotelId, hotelId), inArray(upgradeProposalRevisions.proposalId, proposalIds),
        )).orderBy(asc(upgradeProposalRevisions.proposalId), asc(upgradeProposalRevisions.revisionNumber));
        return rows.map(revisionRecord);
      },
      insertAuditEvent: async (record) => {
        const [row] = await db.insert(upgradeProposalAuditEvents).values(record).returning();
        if (!row) throw new Error('Proposal audit insert returned no row');
        const event = auditRecord(row);
        await this.faults?.afterAuditInsert?.(event);
        return event;
      },
      listAuditEvents: async (hotelId, proposalId) => {
        const rows = await db.select().from(upgradeProposalAuditEvents).where(and(
          eq(upgradeProposalAuditEvents.hotelId, hotelId), eq(upgradeProposalAuditEvents.proposalId, proposalId),
        )).orderBy(asc(upgradeProposalAuditEvents.createdAt), asc(upgradeProposalAuditEvents.proposalVersion), asc(upgradeProposalAuditEvents.id));
        return rows.map(auditRecord);
      },
    };
  }
}
