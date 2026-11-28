import { randomUUID } from 'node:crypto';
import {
  ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
  ServiceUnavailableException, UnprocessableEntityException,
} from '@nestjs/common';
import { TraceContext } from '../../trace-context.js';
import { SnapshotSchema, type Quote, type QuoteRequest, type Snapshot, type StaffRole } from '../domain/room-upgrade.js';
import {
  assertProposalTransition, computeAllowedActions, computeBusinessFingerprint, derivePendingStatus,
  detectStaleQuoteReasons, hashCommandPayload, hashIdempotencyKey, isTerminalProposalStatus,
  type AiRecommendationMetadata, type ApproveProposalRequest, type CreateProposalRequest,
  type EscalateProposalRequest, type ListProposalsQuery, type NormalizedProposalRequest,
  type PreviewExpectation, type ProposalAuditAction, type ProposalCommandOperation,
  type RejectProposalRequest, type ReviseProposalRequest,
} from '../domain/room-upgrade-proposal.js';
import { calculateQuote, validationFailure } from '../domain/upgrade-quote.js';
import { validateQuote } from '../domain/upgrade-quote-validator.js';
import {
  ROOM_UPGRADE_CLOCK, ROOM_UPGRADE_PROPOSAL_STORE,
  type ProposalCasUpdateInput, type ProposalIdempotencyRecord, type ProposalRecord, type ProposalRevisionRecord,
  type RoomUpgradeProposalStore, type RoomUpgradeProposalTx,
} from './room-upgrade.ports.js';
import { snapshotId } from './room-upgrade.use-cases.js';

export interface ProposalCommandResult {
  httpStatus: 200 | 201 | 409;
  body: Record<string, unknown>;
  replayed: boolean;
}
type CommandContext = {
  tx: RoomUpgradeProposalTx; userId: string; actorRole: StaffRole; now: Date; requestId: string;
  replayRecord: Omit<ProposalIdempotencyRecord, 'proposalId' | 'httpStatus' | 'responseBody'>;
};
type PersistableQuote = Quote & {
  status: 'VALID' | 'REQUIRES_MANAGER'; totals: NonNullable<Quote['totals']>; priceDiffVnd: number;
  policy: NonNullable<Quote['policy']>; expiresAt: string; bookingCode: string; approvalRole: StaffRole; effectiveAt: string;
};

function assertPersistable(quote: Quote): asserts quote is PersistableQuote {
  if (!quote.validation.passed || (quote.status !== 'VALID' && quote.status !== 'REQUIRES_MANAGER') ||
    quote.totals === null || quote.priceDiffVnd === null || !quote.policy || !quote.expiresAt ||
    !quote.bookingCode || !quote.approvalRole || !quote.effectiveAt) {
    throw new UnprocessableEntityException({ code: 'QUOTE_NOT_PERSISTABLE',
      message: 'Không thể tạo đề xuất từ báo giá chưa hợp lệ hoặc chưa sẵn sàng.',
      quoteStatus: quote.status, quote, violations: quote.violations, missingFields: quote.missingFields });
  }
}

function guardPreview(quote: Quote, expected?: PreviewExpectation): void {
  if (expected && (
    (expected.expectedPriceDiffVnd !== undefined && quote.priceDiffVnd !== expected.expectedPriceDiffVnd) ||
    (expected.expectedSnapshotId !== undefined && quote.snapshotId !== expected.expectedSnapshotId) ||
    (expected.expectedQuoteStatus !== undefined && quote.status !== expected.expectedQuoteStatus) ||
    (expected.expectedApprovalRole !== undefined && quote.approvalRole !== expected.expectedApprovalRole))) {
    throw new ConflictException({ code: 'PREVIEW_MISMATCH',
      message: 'Báo giá mới nhất khác với bản xem trước; vui lòng xem lại trước khi lưu.',
      reasonCodes: ['PREVIEW_MISMATCH'], freshQuote: quote, expected });
  }
}

function summary(proposal: ProposalRecord, revision: ProposalRevisionRecord, role: StaffRole, now: Date) {
  const isExpired = Date.parse(proposal.expiresAt) <= now.getTime();
  return {
    proposalId: proposal.id, bookingCode: proposal.bookingCode, status: proposal.status, version: proposal.version,
    currentRevision: proposal.currentRevision, requiredApprovalRole: proposal.requiredApprovalRole,
    allowedActions: computeAllowedActions(role, proposal.status, proposal.requiredApprovalRole, isExpired),
    reasonCodes: proposal.reasonCodes, expiresAt: proposal.expiresAt, isExpired,
    createdBy: proposal.createdBy, createdAt: proposal.createdAt, updatedAt: proposal.updatedAt,
    decidedBy: proposal.decidedBy, decidedByRole: proposal.decidedByRole, decidedAt: proposal.decidedAt,
    targetRoomTypeId: revision.targetRoomTypeId, effectiveAt: revision.effectiveAt, priceDiffVnd: revision.priceDiffVnd,
    quoteStatus: revision.quoteStatus, policyCode: revision.policyCode, policyVersion: revision.policyVersion,
  };
}
function envelope(hotelId: string, staffRole: StaffRole, requestId: string) {
  return { caseId: 'C2' as const, isMock: true as const, operationalEffects: 'NONE' as const,
    requiresHumanApproval: true as const, requestId, hotelId, staffRole };
}
function isSerializationFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error !== null && typeof error === 'object' && !seen.has(error)) {
    seen.add(error);
    const detail = error as { code?: unknown; cause?: unknown };
    if (detail.code === '40001' || detail.code === '40P01') return true;
    error = detail.cause;
  }
  return false;
}
function buildDetailView(proposal: ProposalRecord, revision: ProposalRevisionRecord, role: StaffRole, now: Date, requestId: string) {
  return { ...envelope(proposal.hotelId, role, requestId), ...summary(proposal, revision, role, now),
    decisionReason: proposal.decisionReason, normalizedRequest: revision.normalizedRequest,
    quote: revision.quote, breakdown: revision.breakdown, policySources: revision.policySources,
    fixtureVersion: revision.fixtureVersion, snapshotId: revision.snapshotId, aiMetadata: revision.aiMetadata,
    calculatedAt: revision.calculatedAt, businessFingerprint: revision.businessFingerprint };
}
export type ProposalDetailResponse = ReturnType<typeof buildDetailView>;

@Injectable()
export class RoomUpgradeProposalUseCases {
  constructor(
    @Inject(ROOM_UPGRADE_PROPOSAL_STORE) private readonly store: RoomUpgradeProposalStore,
    @Inject(ROOM_UPGRADE_CLOCK) private readonly clock: () => Date,
    @Inject(TraceContext) private readonly trace: TraceContext,
  ) {}

  private requestId() { return this.trace.current().requestId ?? randomUUID(); }

  private async authorize(tx: RoomUpgradeProposalTx, hotelId: string, userId: string): Promise<StaffRole> {
    const role = await tx.staffRole(hotelId, userId);
    if (role !== 'RECEPTIONIST' && role !== 'MANAGER') throw new ForbiddenException({ code: 'HOTEL_ACCESS_DENIED',
      message: 'Bạn không có phân công tại khách sạn này.' });
    return role;
  }

  private async snapshot(tx: RoomUpgradeProposalTx, hotelId: string): Promise<Snapshot> {
    const data = await tx.loadSnapshot(hotelId);
    if (!data) throw new NotFoundException({ code: 'HOTEL_NOT_FOUND', message: 'Không tìm thấy khách sạn mô phỏng.' });
    const parsed = SnapshotSchema.safeParse(data);
    if (!parsed.success || parsed.data.hotel.id !== hotelId ||
      [parsed.data.roomTypes, parsed.data.bookings, parsed.data.inventory, parsed.data.rates,
        parsed.data.policies, parsed.data.benefits].some((rows) => rows.some((row) => row.hotelId !== hotelId))) {
      throw new ServiceUnavailableException({ code: 'INVALID_SNAPSHOT', message: 'Dữ liệu C2 không hợp lệ; chưa thể báo giá.' });
    }
    return parsed.data;
  }

  private quote(data: Snapshot, input: QuoteRequest | NormalizedProposalRequest, context: CommandContext): Quote {
    // Keep the original offset string; only nullable benefitId needs adapting to CP1's input contract.
    const request: QuoteRequest = { ...input, benefitId: input.benefitId ?? undefined };
    const snapId = snapshotId(data);
    const quote = calculateQuote(data, request, { now: context.now, requestId: context.requestId,
      quoteId: randomUUID(), snapshotId: snapId });
    if (quote.totals === null) return quote;
    const violations = validateQuote(data, request, quote, context.now, snapId);
    return violations.length ? validationFailure(quote, violations) :
      { ...quote, validation: { checked: true, passed: true, violations: [] } };
  }

  private async command(
    userId: string, hotelId: string, operation: ProposalCommandOperation, targetId: string,
    input: unknown, idempotencyKey: string, run: (context: CommandContext) => Promise<ProposalCommandResult>,
  ): Promise<ProposalCommandResult> {
    const requestId = this.requestId();
    try {
      return await this.store.withSerializableTransaction(async (tx) => {
        // Re-authorize even on replay, inside every transaction attempt.
        const actorRole = await this.authorize(tx, hotelId, userId);
        const scope = { hotelId, actorUserId: userId, operation, targetId, idempotencyKey };
        const payloadHash = hashCommandPayload(input);
        const existing = await tx.findIdempotency(scope);
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message: 'Idempotency-Key đã được dùng với nội dung khác.' });
          return { httpStatus: existing.httpStatus, body: existing.responseBody, replayed: true };
        }
        const now = this.clock();
        return run({ tx, userId, actorRole, now, requestId,
          replayRecord: { ...scope, payloadHash, createdAt: now.toISOString(), isMock: true } });
      });
    } catch (error) {
      if (isSerializationFailure(error)) throw new ConflictException({ code: 'CONCURRENT_MODIFICATION',
        message: 'Giao dịch xung đột đồng thời; vui lòng thử lại.' });
      throw error;
    }
  }

  private async finish(context: CommandContext, proposalId: string, httpStatus: ProposalCommandResult['httpStatus'], body: Record<string, unknown>) {
    await context.tx.insertIdempotency({ ...context.replayRecord, proposalId, httpStatus, responseBody: body });
    return { httpStatus, body, replayed: false };
  }

  private async locked(context: CommandContext, proposalId: string, expectedVersion: number) {
    const proposal = await context.tx.lockProposalForUpdate(context.replayRecord.hotelId, proposalId);
    if (!proposal) throw this.notFound();
    if (proposal.version !== expectedVersion) throw this.versionConflict(proposal);
    return proposal;
  }
  private notFound() { return new NotFoundException({ code: 'PROPOSAL_NOT_FOUND', message: 'Không tìm thấy đề xuất trong khách sạn.' }); }
  private versionConflict(proposal?: ProposalRecord) {
    return new ConflictException({ code: 'VERSION_CONFLICT', message: 'Phiên bản đề xuất đã thay đổi; vui lòng tải lại.',
      ...(proposal ? { currentVersion: proposal.version, currentStatus: proposal.status } : {}) });
  }
  private invalidState(proposal: ProposalRecord) {
    return new ConflictException({ code: 'INVALID_STATE_TRANSITION', message: 'Không thể thực hiện thao tác ở trạng thái hiện tại.',
      currentVersion: proposal.version, currentStatus: proposal.status });
  }
  private requireManager(role: StaffRole) {
    if (role !== 'MANAGER') throw new ForbiddenException({ code: 'INSUFFICIENT_APPROVAL_ROLE',
      message: 'Đề xuất này yêu cầu Quản lý (MANAGER) phê duyệt.' });
  }

  private async revision(tx: RoomUpgradeProposalTx, proposal: ProposalRecord) {
    const revision = await tx.getRevision(proposal.hotelId, proposal.id, proposal.currentRevision);
    if (!revision) throw new ServiceUnavailableException({ code: 'PROPOSAL_REVISION_MISSING', message: 'Thiếu revision hiện tại của đề xuất.' });
    return revision;
  }
  private async update(context: CommandContext, proposal: ProposalRecord, changes: ProposalCasUpdateInput['changes']) {
    assertProposalTransition(proposal.status, changes.status);
    const updated = await context.tx.updateProposalCas({ hotelId: proposal.hotelId, proposalId: proposal.id,
      expectedVersion: proposal.version, expectedStatus: proposal.status, changes });
    if (!updated) throw this.versionConflict(await context.tx.getProposal(proposal.hotelId, proposal.id) ?? undefined);
    return updated;
  }
  private async audit(context: CommandContext, proposal: ProposalRecord, previousStatus: ProposalRecord['status'] | null,
    action: ProposalAuditAction, reason: string | null, reasonCodes: string[]) {
    await context.tx.insertAuditEvent({ id: randomUUID(), hotelId: proposal.hotelId, proposalId: proposal.id,
      proposalVersion: proposal.version, revisionNumber: proposal.currentRevision,
      actorUserId: context.userId, actorRole: context.actorRole, action, previousStatus, newStatus: proposal.status,
      reason, reasonCodes, requestId: context.requestId, idempotencyKeyHash: hashIdempotencyKey(context.replayRecord.idempotencyKey),
      createdAt: context.now.toISOString(), isMock: true });
  }
  private async detailResult(context: CommandContext, proposal: ProposalRecord, revision: ProposalRevisionRecord, status: 200 | 201 = 200) {
    return this.finish(context, proposal.id, status, buildDetailView(proposal, revision, context.actorRole, context.now, context.requestId));
  }
  private async expire(context: CommandContext, proposal: ProposalRecord): Promise<ProposalCommandResult | null> {
    if (isTerminalProposalStatus(proposal.status) || Date.parse(proposal.expiresAt) > context.now.getTime()) return null;
    const updated = await this.update(context, proposal, { status: 'EXPIRED', reasonCodes: ['PROPOSAL_EXPIRED'], updatedAt: context.now.toISOString() });
    await this.audit(context, updated, proposal.status, 'MARKED_EXPIRED', 'Đề xuất đã quá hạn hiệu lực báo giá.', ['PROPOSAL_EXPIRED']);
    const revision = await this.revision(context.tx, updated);
    return this.finish(context, proposal.id, 409, { code: 'PROPOSAL_EXPIRED',
      message: 'Đề xuất đã hết hạn; vui lòng tạo đề xuất mới.', reasonCodes: ['PROPOSAL_EXPIRED'],
      proposal: buildDetailView(updated, revision, context.actorRole, context.now, context.requestId) });
  }

  private insertRevision(context: CommandContext, proposal: ProposalRecord, request: NormalizedProposalRequest,
    quote: PersistableQuote, data: Snapshot, aiMetadata: AiRecommendationMetadata | null) {
    const booking = data.bookings.find((row) => row.bookingCode === request.bookingCode);
    if (!booking) throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Không tìm thấy booking trong khách sạn.' });
    return context.tx.insertRevision({ hotelId: proposal.hotelId, proposalId: proposal.id, revisionNumber: proposal.currentRevision,
      normalizedRequest: request, targetRoomTypeId: request.targetRoomTypeId, effectiveAt: quote.effectiveAt,
      quote, breakdown: quote.breakdown, policySources: quote.policy.sources, policyCode: quote.policy.code,
      policyVersion: quote.policy.version, fixtureVersion: quote.fixtureVersion, snapshotId: quote.snapshotId,
      businessFingerprint: computeBusinessFingerprint({ booking, request, quote }), priceDiffVnd: quote.priceDiffVnd,
      quoteStatus: quote.status, requiredApprovalRole: quote.approvalRole, calculatedAt: quote.calculatedAt,
      expiresAt: quote.expiresAt, aiMetadata, createdBy: context.userId, createdAt: context.now.toISOString(), isMock: true });
  }

  createProposal(userId: string, input: CreateProposalRequest, idempotencyKey: string) {
    return this.command(userId, input.hotelId, 'CREATE', 'new', input, idempotencyKey, async (context) => {
      const data = await this.snapshot(context.tx, input.hotelId);
      if (input.bookingCode && !data.bookings.some((booking) => booking.bookingCode === input.bookingCode)) {
        throw new NotFoundException({ code: 'BOOKING_NOT_FOUND', message: 'Không tìm thấy booking trong khách sạn.' });
      }
      const quote = this.quote(data, input, context);
      assertPersistable(quote);
      guardPreview(quote, input.previewExpectation);
      const request: NormalizedProposalRequest = { hotelId: input.hotelId, bookingCode: quote.bookingCode,
        targetRoomTypeId: input.targetRoomTypeId, effectiveAt: input.effectiveAt, requestType: input.requestType,
        requiredFeatures: input.requiredFeatures, benefitId: input.benefitId ?? null };
      const status = derivePendingStatus(quote.approvalRole);
      assertProposalTransition('DRAFT', status);
      const nowIso = context.now.toISOString();
      const reasonCodes = quote.violations.map((violation) => violation.code);
      const proposal = await context.tx.insertProposal({ id: randomUUID(), hotelId: input.hotelId,
        bookingCode: quote.bookingCode, createdBy: userId, version: 1, currentRevision: 1, status,
        requiredApprovalRole: quote.approvalRole, reasonCodes, decidedBy: null, decidedByRole: null,
        decidedAt: null, decisionReason: null, expiresAt: quote.expiresAt, createdAt: nowIso, updatedAt: nowIso, isMock: true });
      const revision = await this.insertRevision(context, proposal, request, quote, data, input.aiMetadata ?? null);
      await this.audit(context, proposal, null, 'CREATED', null, reasonCodes);
      return this.detailResult(context, proposal, revision, 201);
    });
  }

  reviseProposal(userId: string, proposalId: string, input: ReviseProposalRequest, idempotencyKey: string) {
    return this.command(userId, input.hotelId, 'REVISE', proposalId, input, idempotencyKey, async (context) => {
      const proposal = await this.locked(context, proposalId, input.expectedVersion);
      if (isTerminalProposalStatus(proposal.status)) throw this.invalidState(proposal);
      const expired = await this.expire(context, proposal);
      if (expired) return expired;
      const current = await this.revision(context.tx, proposal);
      const request: NormalizedProposalRequest = { ...current.normalizedRequest,
        hotelId: proposal.hotelId, bookingCode: proposal.bookingCode,
        targetRoomTypeId: input.targetRoomTypeId ?? current.normalizedRequest.targetRoomTypeId,
        effectiveAt: input.effectiveAt ?? current.normalizedRequest.effectiveAt,
        requestType: input.requestType ?? current.normalizedRequest.requestType,
        requiredFeatures: input.requiredFeatures ?? current.normalizedRequest.requiredFeatures,
        benefitId: input.benefitId === undefined ? current.normalizedRequest.benefitId : input.benefitId };
      const data = await this.snapshot(context.tx, input.hotelId);
      const quote = this.quote(data, request, context);
      assertPersistable(quote);
      guardPreview(quote, input.previewExpectation);
      const reasonCodes = quote.violations.map((violation) => violation.code);
      const updated = await this.update(context, proposal, { status: derivePendingStatus(quote.approvalRole),
        currentRevision: proposal.currentRevision + 1, requiredApprovalRole: quote.approvalRole,
        reasonCodes, expiresAt: quote.expiresAt, updatedAt: context.now.toISOString() });
      const revision = await this.insertRevision(context, updated, request, quote, data, input.aiMetadata ?? null);
      await this.audit(context, updated, proposal.status, 'REVISED', input.reason ?? null, reasonCodes);
      return this.detailResult(context, updated, revision);
    });
  }

  approveProposal(userId: string, proposalId: string, input: ApproveProposalRequest, idempotencyKey: string) {
    return this.command(userId, input.hotelId, 'APPROVE', proposalId, input, idempotencyKey, async (context) => {
      const proposal = await this.locked(context, proposalId, input.expectedVersion);
      if (proposal.status !== 'PENDING_RECEPTIONIST' && proposal.status !== 'PENDING_MANAGER') throw this.invalidState(proposal);
      if (proposal.status === 'PENDING_MANAGER' || proposal.requiredApprovalRole === 'MANAGER') this.requireManager(context.actorRole);
      const expired = await this.expire(context, proposal);
      if (expired) return expired;
      const current = await this.revision(context.tx, proposal);
      await context.tx.lockApprovalSourcesForShare({
        hotelId: input.hotelId,
        bookingCode: current.normalizedRequest.bookingCode,
        targetRoomTypeId: current.normalizedRequest.targetRoomTypeId,
      });
      const data = await this.snapshot(context.tx, input.hotelId);
      const freshBooking = data.bookings.find((booking) => booking.bookingCode === current.normalizedRequest.bookingCode) ?? null;
      const freshQuote = this.quote(data, current.normalizedRequest, context);
      const staleReasons = detectStaleQuoteReasons({ storedRevision: current, freshBooking, freshQuote });
      if (staleReasons.length > 0) {
        const updated = await this.update(context, proposal, { status: 'REQUOTE_REQUIRED', reasonCodes: staleReasons, updatedAt: context.now.toISOString() });
        await this.audit(context, updated, proposal.status, 'MARKED_REQUOTE_REQUIRED',
          'Dữ liệu nguồn hoặc báo giá đã thay đổi; cần báo giá lại trước khi duyệt.', staleReasons);
        return this.finish(context, proposalId, 409, { code: 'REQUOTE_REQUIRED',
          message: 'Dữ liệu nguồn hoặc báo giá đã thay đổi; cần tạo revision báo giá lại trước khi duyệt.',
          reasonCodes: staleReasons, proposal: buildDetailView(updated, current, context.actorRole, context.now, context.requestId), freshQuote });
      }
      if (freshQuote.approvalRole === 'MANAGER') this.requireManager(context.actorRole);
      const updated = await this.update(context, proposal, { status: 'APPROVED', reasonCodes: [],
        decidedBy: userId, decidedByRole: context.actorRole, decidedAt: context.now.toISOString(),
        decisionReason: input.reason ?? null, updatedAt: context.now.toISOString() });
      await this.audit(context, updated, proposal.status, 'APPROVED', input.reason ?? null, []);
      return this.detailResult(context, updated, current);
    });
  }

  rejectProposal(userId: string, proposalId: string, input: RejectProposalRequest, idempotencyKey: string) {
    return this.command(userId, input.hotelId, 'REJECT', proposalId, input, idempotencyKey, async (context) => {
      const proposal = await this.locked(context, proposalId, input.expectedVersion);
      if (!['PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'REQUOTE_REQUIRED'].includes(proposal.status)) throw this.invalidState(proposal);
      if (proposal.status === 'PENDING_MANAGER' || (proposal.status === 'REQUOTE_REQUIRED' && proposal.requiredApprovalRole === 'MANAGER')) {
        this.requireManager(context.actorRole);
      }
      const expired = await this.expire(context, proposal);
      if (expired) return expired;
      const updated = await this.update(context, proposal, { status: 'REJECTED', decidedBy: userId,
        decidedByRole: context.actorRole, decidedAt: context.now.toISOString(), decisionReason: input.reason, updatedAt: context.now.toISOString() });
      await this.audit(context, updated, proposal.status, 'REJECTED', input.reason, updated.reasonCodes);
      return this.detailResult(context, updated, await this.revision(context.tx, updated));
    });
  }

  escalateProposal(userId: string, proposalId: string, input: EscalateProposalRequest, idempotencyKey: string) {
    return this.command(userId, input.hotelId, 'ESCALATE', proposalId, input, idempotencyKey, async (context) => {
      const proposal = await this.locked(context, proposalId, input.expectedVersion);
      if (proposal.status !== 'PENDING_RECEPTIONIST') throw this.invalidState(proposal);
      const expired = await this.expire(context, proposal);
      if (expired) return expired;
      const updated = await this.update(context, proposal, { status: 'PENDING_MANAGER', requiredApprovalRole: 'MANAGER',
        reasonCodes: [...new Set([...proposal.reasonCodes, 'MANUAL_ESCALATION'])], updatedAt: context.now.toISOString() });
      await this.audit(context, updated, proposal.status, 'ESCALATED', input.reason, ['MANUAL_ESCALATION']);
      return this.detailResult(context, updated, await this.revision(context.tx, updated));
    });
  }

  getStaffContext(userId: string) {
    return this.store.withReadTransaction(async (tx) => {
      const assignments = await tx.listStaffAssignments(userId);
      return { caseId: 'C2' as const, isMock: true as const, operationalEffects: 'NONE' as const,
        requestId: this.requestId(), userId, hasAccess: assignments.length > 0, assignments };
    });
  }

  getSummary(userId: string, hotelId: string) {
    return this.store.withReadTransaction(async (tx) => {
      const staffRole = await this.authorize(tx, hotelId, userId);
      const data = await this.snapshot(tx, hotelId);
      const now = this.clock();
      const inHouseBookings = data.bookings.filter((b) => b.status === 'IN_HOUSE' &&
        Date.parse(b.checkInAt) <= now.getTime() && Date.parse(b.checkOutAt) > now.getTime()).length;
      const statusCounts = await tx.countProposalsByStatus(hotelId);
      const byStatus = new Map(statusCounts.map((row) => [row.status, row.count]));
      const { items } = await tx.listProposals({ hotelId, limit: 5, offset: 0 });
      const revisions = await tx.listRevisionsByProposalIds(hotelId, items.map((proposal) => proposal.id));
      const byRevision = new Map(revisions.map((revision) => [`${revision.proposalId}:${revision.revisionNumber}`, revision]));
      const { id, name, timezone, fixtureVersion } = data.hotel;
      return { caseId: 'C2' as const, isMock: true as const, operationalEffects: 'NONE' as const,
        requestId: this.requestId(), hotel: { id, name, timezone, fixtureVersion }, staffRole,
        counts: { inHouseBookings, totalProposals: statusCounts.reduce((total, row) => total + row.count, 0),
          draft: byStatus.get('DRAFT') ?? 0, pendingReceptionist: byStatus.get('PENDING_RECEPTIONIST') ?? 0,
          pendingManager: byStatus.get('PENDING_MANAGER') ?? 0, approved: byStatus.get('APPROVED') ?? 0,
          rejected: byStatus.get('REJECTED') ?? 0, expired: byStatus.get('EXPIRED') ?? 0,
          requoteRequired: byStatus.get('REQUOTE_REQUIRED') ?? 0 },
        recentProposals: items.map((proposal) => {
          const revision = byRevision.get(`${proposal.id}:${proposal.currentRevision}`);
          if (!revision) throw new ServiceUnavailableException({ code: 'PROPOSAL_REVISION_MISSING', message: 'Thiếu revision hiện tại của đề xuất.' });
          return summary(proposal, revision, staffRole, now);
        }) };
    });
  }

  listProposals(userId: string, input: ListProposalsQuery) {
    return this.store.withReadTransaction(async (tx) => {
      const role = await this.authorize(tx, input.hotelId, userId);
      const { items, total } = await tx.listProposals(input);
      const revisions = await tx.listRevisionsByProposalIds(input.hotelId, items.map((proposal) => proposal.id));
      const byRevision = new Map(revisions.map((revision) => [`${revision.proposalId}:${revision.revisionNumber}`, revision]));
      const now = this.clock();
      return { ...envelope(input.hotelId, role, this.requestId()), total, limit: input.limit, offset: input.offset,
        items: items.map((proposal) => {
          const revision = byRevision.get(`${proposal.id}:${proposal.currentRevision}`);
          if (!revision) throw new ServiceUnavailableException({ code: 'PROPOSAL_REVISION_MISSING', message: 'Thiếu revision hiện tại của đề xuất.' });
          return summary(proposal, revision, role, now);
        }) };
    });
  }

  getProposal(userId: string, proposalId: string, hotelId: string) {
    return this.store.withReadTransaction(async (tx) => {
      const role = await this.authorize(tx, hotelId, userId);
      const proposal = await tx.getProposal(hotelId, proposalId);
      if (!proposal) throw this.notFound();
      return buildDetailView(proposal, await this.revision(tx, proposal), role, this.clock(), this.requestId());
    });
  }

  getProposalHistory(userId: string, proposalId: string, hotelId: string) {
    return this.store.withReadTransaction(async (tx) => {
      const role = await this.authorize(tx, hotelId, userId);
      const proposal = await tx.getProposal(hotelId, proposalId);
      if (!proposal) throw this.notFound();
      const revisions = await tx.listRevisions(hotelId, proposalId);
      const auditEvents = await tx.listAuditEvents(hotelId, proposalId);
      return { ...envelope(hotelId, role, this.requestId()), proposalId, status: proposal.status,
        version: proposal.version, currentRevision: proposal.currentRevision,
        revisions: revisions.sort((a, b) => a.revisionNumber - b.revisionNumber),
        auditEvents: auditEvents.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
          a.proposalVersion - b.proposalVersion || a.id.localeCompare(b.id)) };
    });
  }
}

export type ProposalListResponse = Awaited<ReturnType<RoomUpgradeProposalUseCases['listProposals']>>;
export type StaffContextResponse = Awaited<ReturnType<RoomUpgradeProposalUseCases['getStaffContext']>>;
export type ProposalSummaryResponse = Awaited<ReturnType<RoomUpgradeProposalUseCases['getSummary']>>;
export type ProposalHistoryResponse = Awaited<ReturnType<RoomUpgradeProposalUseCases['getProposalHistory']>>;
