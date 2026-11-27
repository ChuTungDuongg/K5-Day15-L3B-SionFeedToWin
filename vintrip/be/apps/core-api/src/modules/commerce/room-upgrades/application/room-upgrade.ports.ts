import type { Quote, Snapshot, StaffRole } from '../domain/room-upgrade.js';
import type { AiRecommendationMetadata, NormalizedProposalRequest, PersistedQuoteStatus, ProposalAuditAction, ProposalCommandOperation, ProposalStatus } from '../domain/room-upgrade-proposal.js';

export const ROOM_UPGRADE_STORE = Symbol('ROOM_UPGRADE_STORE');
export const ROOM_UPGRADE_CLOCK = Symbol('ROOM_UPGRADE_CLOCK');
export interface RoomUpgradeStore {
  beginReadSnapshot(): Promise<void>;
  staffRole(hotelId: string, userId: string): Promise<StaffRole | null>;
  loadSnapshot(hotelId: string): Promise<Snapshot | null>;
}

export const ROOM_UPGRADE_PROPOSAL_STORE = Symbol('ROOM_UPGRADE_PROPOSAL_STORE');
export const ROOM_UPGRADE_PROPOSAL_FAULT_INJECTOR = Symbol('ROOM_UPGRADE_PROPOSAL_FAULT_INJECTOR');

export interface ProposalRecord {
  id: string;
  hotelId: string;
  bookingCode: string;
  createdBy: string;
  version: number;
  currentRevision: number;
  status: ProposalStatus;
  requiredApprovalRole: StaffRole;
  reasonCodes: string[];
  decidedBy: string | null;
  decidedByRole: StaffRole | null;
  decidedAt: string | null;
  decisionReason: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  isMock: true;
}
export interface ProposalRevisionRecord {
  hotelId: string;
  proposalId: string;
  revisionNumber: number;
  normalizedRequest: NormalizedProposalRequest;
  targetRoomTypeId: string;
  effectiveAt: string;
  quote: Quote;
  breakdown: Quote['breakdown'];
  policySources: NonNullable<Quote['policy']>['sources'];
  policyCode: string;
  policyVersion: number;
  fixtureVersion: string;
  snapshotId: string;
  businessFingerprint: string;
  priceDiffVnd: number;
  quoteStatus: PersistedQuoteStatus;
  requiredApprovalRole: StaffRole;
  calculatedAt: string;
  expiresAt: string;
  aiMetadata: AiRecommendationMetadata | null;
  createdBy: string;
  createdAt: string;
  isMock: true;
}
export interface ProposalAuditEventRecord {
  id: string;
  hotelId: string;
  proposalId: string;
  proposalVersion: number;
  revisionNumber: number;
  actorUserId: string;
  actorRole: StaffRole;
  action: ProposalAuditAction;
  previousStatus: ProposalStatus | null;
  newStatus: ProposalStatus;
  reason: string | null;
  reasonCodes: string[];
  requestId: string;
  idempotencyKeyHash: string | null;
  createdAt: string;
  isMock: true;
}
export interface ProposalIdempotencyRecord {
  hotelId: string;
  actorUserId: string;
  operation: ProposalCommandOperation;
  /** 'new' for CREATE, otherwise the proposal UUID. */
  targetId: string;
  idempotencyKey: string;
  payloadHash: string;
  proposalId: string;
  httpStatus: 200 | 201 | 409;
  responseBody: Record<string, unknown>;
  createdAt: string;
  isMock: true;
}
export interface ListProposalsFilter {
  hotelId: string;
  status?: ProposalStatus;
  bookingCode?: string;
  requiredApprovalRole?: StaffRole;
  limit: number;
  offset: number;
}
export interface ProposalCasUpdateInput {
  hotelId: string;
  proposalId: string;
  expectedVersion: number;
  expectedStatus: ProposalStatus;
  /** The store increments version itself; identity and creator cannot be changed. */
  changes: Pick<ProposalRecord, 'status' | 'updatedAt'> & Partial<Pick<ProposalRecord,
    'currentRevision' | 'requiredApprovalRole' | 'reasonCodes' | 'decidedBy' | 'decidedByRole' |
    'decidedAt' | 'decisionReason' | 'expiresAt'>>;
}
export type ProposalCasUpdateResult = ProposalRecord | null;

/** Optional test-only hooks; throwing after the audit INSERT must roll back the entire transaction. */
export interface RoomUpgradeProposalFaultInjector {
  beforeProposalLock?(hotelId: string, proposalId: string): void | Promise<void>;
  beforeApprovalSourceLock?(params: { hotelId: string; bookingCode: string; targetRoomTypeId: string }): void | Promise<void>;
  afterAuditInsert?(record: ProposalAuditEventRecord): void | Promise<void>;
}

/** Use only during the callback of a store transaction; never retain a tx reference. */
export interface RoomUpgradeProposalTx {
  staffRole(hotelId: string, userId: string): Promise<StaffRole | null>;
  loadSnapshot(hotelId: string): Promise<Snapshot | null>;
  findIdempotency(scope: {
    hotelId: string; actorUserId: string; operation: ProposalCommandOperation; targetId: string; idempotencyKey: string;
  }): Promise<ProposalIdempotencyRecord | null>;
  insertIdempotency(record: ProposalIdempotencyRecord): Promise<void>;
  insertProposal(record: ProposalRecord): Promise<ProposalRecord>;
  lockProposalForUpdate(hotelId: string, proposalId: string): Promise<ProposalRecord | null>;
  lockApprovalSourcesForShare(params: { hotelId: string; bookingCode: string; targetRoomTypeId: string }): Promise<void>;
  getProposal(hotelId: string, proposalId: string): Promise<ProposalRecord | null>;
  listProposals(filter: ListProposalsFilter): Promise<{ items: ProposalRecord[]; total: number }>;
  updateProposalCas(input: ProposalCasUpdateInput): Promise<ProposalCasUpdateResult>;
  insertRevision(record: ProposalRevisionRecord): Promise<ProposalRevisionRecord>;
  getRevision(hotelId: string, proposalId: string, revisionNumber: number): Promise<ProposalRevisionRecord | null>;
  listRevisions(hotelId: string, proposalId: string): Promise<ProposalRevisionRecord[]>;
  listRevisionsByProposalIds(hotelId: string, proposalIds: string[]): Promise<ProposalRevisionRecord[]>;
  insertAuditEvent(record: ProposalAuditEventRecord): Promise<ProposalAuditEventRecord>;
  listAuditEvents(hotelId: string, proposalId: string): Promise<ProposalAuditEventRecord[]>;
}
export interface RoomUpgradeProposalStore {
  withReadTransaction<T>(fn: (tx: RoomUpgradeProposalTx) => Promise<T>): Promise<T>;
  /** Callback can run again after a rollback: keep all effects inside this transaction. */
  withSerializableTransaction<T>(
    fn: (tx: RoomUpgradeProposalTx) => Promise<T>, options?: { maxAttempts?: number },
  ): Promise<T>;
}
