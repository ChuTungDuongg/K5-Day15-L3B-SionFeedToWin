import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Booking, Quote, StaffRole } from './room-upgrade.js';

const id = z.string().min(1).max(100);
const instant = z.iso.datetime({ offset: true });
const positiveInt = z.number().int().positive();
const requestType = z.enum(['UPGRADE', 'ROOM_CHANGE', 'COMPLIMENTARY_UPGRADE']);
const features = z.array(id).max(10);
const reason = z.string().trim().min(1).max(500);
const staffRole = z.enum(['RECEPTIONIST', 'MANAGER']);

export const ProposalStatusSchema = z.enum([
  'DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;
export const PersistedQuoteStatusSchema = z.enum(['VALID', 'REQUIRES_MANAGER']);
export type PersistedQuoteStatus = z.infer<typeof PersistedQuoteStatusSchema>;
export type ProposalAuditAction = 'CREATED' | 'REVISED' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'MARKED_EXPIRED' | 'MARKED_REQUOTE_REQUIRED';
export type ProposalCommandOperation = 'CREATE' | 'REVISE' | 'APPROVE' | 'REJECT' | 'ESCALATE';
export type ProposalAllowedAction = 'REVISE' | 'APPROVE' | 'REJECT' | 'ESCALATE';

export const NormalizedProposalRequestSchema = z.strictObject({
  hotelId: id, bookingCode: id, targetRoomTypeId: id, effectiveAt: instant,
  requestType, requiredFeatures: features, benefitId: id.nullable(),
});
export type NormalizedProposalRequest = z.infer<typeof NormalizedProposalRequestSchema>;

export const AiRecommendationMetadataSchema = z.strictObject({
  source: z.literal('ai_copilot'),
  sessionId: z.string().min(1).max(100).optional(),
  aiRequestId: z.string().min(1).max(100).optional(),
  selectedCandidateId: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  promptVersions: z.array(z.string().min(1).max(100)).max(10).default([]),
  recommendationReasonVi: z.string().min(1).max(1000).optional(),
  draftMessageVi: z.string().min(1).max(1000).optional(),
});
export type AiRecommendationMetadata = z.infer<typeof AiRecommendationMetadataSchema>;

export const PreviewExpectationSchema = z.strictObject({
  expectedPriceDiffVnd: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).optional(),
  expectedSnapshotId: z.string().min(1).max(200).optional(),
  expectedQuoteStatus: PersistedQuoteStatusSchema.optional(),
  expectedApprovalRole: staffRole.optional(),
});
export type PreviewExpectation = z.infer<typeof PreviewExpectationSchema>;

// Client input never grants authority or supplies authoritative money/status.
export const CreateProposalRequestSchema = z.strictObject({
  hotelId: id, bookingCode: id.optional(), roomNumber: id.optional(),
  targetRoomTypeId: id, effectiveAt: instant,
  requestType: requestType.default('UPGRADE'), requiredFeatures: features.default([]), benefitId: id.optional(),
  previewExpectation: PreviewExpectationSchema.optional(), aiMetadata: AiRecommendationMetadataSchema.optional(),
}).refine((value) => (value.bookingCode !== undefined) !== (value.roomNumber !== undefined),
  'Supply exactly one of bookingCode or roomNumber');
export type CreateProposalRequest = z.infer<typeof CreateProposalRequestSchema>;

// An unchanged request is intentionally valid: revise can accept a fresh quote.
export const ReviseProposalRequestSchema = z.strictObject({
  hotelId: id, expectedVersion: positiveInt,
  targetRoomTypeId: id.optional(), effectiveAt: instant.optional(), requestType: requestType.optional(),
  requiredFeatures: features.optional(), benefitId: id.nullable().optional(), reason: reason.optional(),
  previewExpectation: PreviewExpectationSchema.optional(), aiMetadata: AiRecommendationMetadataSchema.optional(),
});
export type ReviseProposalRequest = z.infer<typeof ReviseProposalRequestSchema>;
export const ApproveProposalRequestSchema = z.strictObject({ hotelId: id, expectedVersion: positiveInt, reason: reason.optional() });
export type ApproveProposalRequest = z.infer<typeof ApproveProposalRequestSchema>;
export const RejectProposalRequestSchema = z.strictObject({ hotelId: id, expectedVersion: positiveInt, reason });
export type RejectProposalRequest = z.infer<typeof RejectProposalRequestSchema>;
export const EscalateProposalRequestSchema = z.strictObject({ hotelId: id, expectedVersion: positiveInt, reason });
export type EscalateProposalRequest = z.infer<typeof EscalateProposalRequestSchema>;
export const ListProposalsQuerySchema = z.strictObject({
  hotelId: id, status: ProposalStatusSchema.optional(), bookingCode: id.optional(), requiredApprovalRole: staffRole.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type ListProposalsQuery = z.infer<typeof ListProposalsQuerySchema>;
export const ProposalScopeQuerySchema = z.strictObject({ hotelId: id });
export const IdempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const TERMINAL_PROPOSAL_STATUSES: ReadonlySet<ProposalStatus> = new Set(['APPROVED', 'REJECTED', 'EXPIRED']);
export const ALLOWED_PROPOSAL_TRANSITIONS: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  DRAFT: ['PENDING_RECEPTIONIST', 'PENDING_MANAGER'],
  PENDING_RECEPTIONIST: ['APPROVED', 'REJECTED', 'PENDING_MANAGER', 'EXPIRED', 'REQUOTE_REQUIRED', 'PENDING_RECEPTIONIST'],
  PENDING_MANAGER: ['APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER'],
  REQUOTE_REQUIRED: ['PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'REJECTED', 'EXPIRED'],
  APPROVED: [], REJECTED: [], EXPIRED: [],
};
export function canTransitionProposal(from: ProposalStatus, to: ProposalStatus): boolean {
  return ALLOWED_PROPOSAL_TRANSITIONS[from].includes(to);
}
export function assertProposalTransition(from: ProposalStatus, to: ProposalStatus): void {
  if (!canTransitionProposal(from, to)) throw new Error(`Illegal proposal transition: ${from} -> ${to}`);
}
export function isTerminalProposalStatus(status: ProposalStatus): boolean {
  return TERMINAL_PROPOSAL_STATUSES.has(status);
}
export function derivePendingStatus(approvalRole: StaffRole): ProposalStatus {
  return approvalRole === 'MANAGER' ? 'PENDING_MANAGER' : 'PENDING_RECEPTIONIST';
}

export function canRolePerformAction(
  actorRole: StaffRole, action: ProposalAllowedAction, status: ProposalStatus, requiredApprovalRole: StaffRole,
): boolean {
  if (isTerminalProposalStatus(status)) return false;
  switch (action) {
    case 'REVISE': return true;
    case 'APPROVE':
      return (status === 'PENDING_RECEPTIONIST' && requiredApprovalRole === 'RECEPTIONIST') ||
        (status === 'PENDING_MANAGER' && actorRole === 'MANAGER');
    case 'REJECT':
      return status === 'PENDING_RECEPTIONIST' ||
        (status === 'PENDING_MANAGER' && actorRole === 'MANAGER') ||
        (status === 'REQUOTE_REQUIRED' && (actorRole === 'MANAGER' || requiredApprovalRole === 'RECEPTIONIST'));
    case 'ESCALATE': return status === 'PENDING_RECEPTIONIST';
  }
}
export function computeAllowedActions(
  actorRole: StaffRole, status: ProposalStatus, requiredApprovalRole: StaffRole, isExpiredNow: boolean,
): ProposalAllowedAction[] {
  if (isTerminalProposalStatus(status) || isExpiredNow) return [];
  const actions: ProposalAllowedAction[] = ['REVISE', 'APPROVE', 'REJECT', 'ESCALATE'];
  return actions.filter((action) => canRolePerformAction(actorRole, action, status, requiredApprovalRole));
}

/** JSON semantics (including omitted undefined properties), with sorted keys at every depth. */
export function canonicalJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('Expected a JSON-serializable value');
  const encode = (item: unknown): string => {
    if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
    if (item !== null && typeof item === 'object') {
      const object = item as Record<string, unknown>;
      return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${encode(object[key])}`).join(',')}}`;
    }
    return JSON.stringify(item)!;
  };
  return encode(JSON.parse(json) as unknown);
}
export function hashCommandPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}
export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function computeBusinessFingerprint(params: {
  booking: Pick<Booking, 'bookingCode' | 'roomTypeId' | 'status' | 'version' | 'checkInAt' | 'checkOutAt' | 'guests'>;
  request: NormalizedProposalRequest; quote: Quote;
}): string {
  const { booking, request, quote } = params;
  return hashCommandPayload({
    booking: {
      bookingCode: booking.bookingCode, roomTypeId: booking.roomTypeId, status: booking.status, version: booking.version,
      checkInAt: booking.checkInAt, checkOutAt: booking.checkOutAt, guests: booking.guests,
    },
    request: {
      hotelId: request.hotelId, bookingCode: request.bookingCode, targetRoomTypeId: request.targetRoomTypeId,
      effectiveAt: request.effectiveAt, requestType: request.requestType,
      requiredFeatures: [...request.requiredFeatures].sort(), benefitId: request.benefitId,
    },
    quote: {
      status: quote.status, approvalRole: quote.approvalRole, remainingNights: quote.remainingNights,
      policy: quote.policy, benefit: quote.benefit, inventoryByNight: quote.inventoryByNight,
      breakdown: quote.breakdown, totals: quote.totals, priceDiffVnd: quote.priceDiffVnd,
    },
  });
}

export function detectStaleQuoteReasons(params: {
  storedRevision: {
    normalizedRequest: NormalizedProposalRequest; quote: Quote; businessFingerprint: string;
    priceDiffVnd: number; quoteStatus: PersistedQuoteStatus; requiredApprovalRole: StaffRole;
    policyCode: string; policyVersion: number;
  };
  freshBooking: Booking | null; freshQuote: Quote;
}): string[] {
  const { storedRevision: stored, freshBooking, freshQuote: fresh } = params;
  const reasons: string[] = [];
  const changed = (left: unknown, right: unknown) => canonicalJson(left) !== canonicalJson(right);
  if (!freshBooking || freshBooking.status !== 'IN_HOUSE') reasons.push('BOOKING_STATUS_CHANGED');
  if (freshBooking) {
    // Persisted valid quotes were in-house. Reuse the OLD quote to isolate booking
    // changes in the fingerprint, including fields absent from QuoteNight.
    const bookingFingerprint = computeBusinessFingerprint({
      booking: { ...freshBooking, status: 'IN_HOUSE' }, request: stored.normalizedRequest, quote: stored.quote,
    });
    if (stored.quote.breakdown.some((night) => night.sourceVersions.booking !== freshBooking.version) ||
      bookingFingerprint !== stored.businessFingerprint) reasons.push('BOOKING_CHANGED');
  }
  if (fresh.status === 'UNAVAILABLE') reasons.push('INVENTORY_UNAVAILABLE');
  else if ((fresh.inventoryByNight.length > 0 && changed(stored.quote.inventoryByNight, fresh.inventoryByNight)) ||
    fresh.missingFields.some((f) => f.startsWith('inventory.'))) reasons.push('INVENTORY_CHANGED');
  const rates = (quote: Quote) => quote.breakdown.map((night) => ({
    date: night.date, newRoomPriceVnd: night.newRoomPriceVnd, rateTaxIncluded: night.rateTaxIncluded,
    rateVersion: night.sourceVersions.rate, originalPaidVnd: night.originalPaidVnd,
    eligibleOriginalCreditVnd: night.eligibleOriginalCreditVnd,
  }));
  if ((fresh.breakdown.length > 0 && changed(rates(stored.quote), rates(fresh))) ||
    fresh.missingFields.some((f) => f.startsWith('rates.') || f.startsWith('originalBookingPrice.'))) reasons.push('RATE_CHANGED');
  if ((fresh.policy !== null && (fresh.policy.code !== stored.policyCode || fresh.policy.version !== stored.policyVersion ||
    changed(stored.quote.policy?.sources ?? null, fresh.policy.sources))) ||
    fresh.missingFields.some((f) => f.startsWith('upgradePolicy'))) reasons.push('POLICY_VERSION_CHANGED');
  if (fresh.violations.some((v) => v.code === 'BENEFIT_NOT_ELIGIBLE') ||
    (fresh.breakdown.length > 0 && changed(stored.quote.benefit, fresh.benefit))) reasons.push('BENEFIT_CHANGED');
  if (fresh.totals !== null && (stored.priceDiffVnd !== fresh.priceDiffVnd ||
    changed(stored.quote.totals, fresh.totals))) reasons.push('PRICE_CHANGED');
  if (fresh.approvalRole !== null && stored.requiredApprovalRole !== fresh.approvalRole) reasons.push('APPROVAL_ROLE_CHANGED');
  if (!fresh.validation.passed || (fresh.status !== 'VALID' && fresh.status !== 'REQUIRES_MANAGER')) reasons.push('QUOTE_INVALIDATED');
  if (freshBooking && fresh.totals !== null && !reasons.length && computeBusinessFingerprint({
    booking: freshBooking, request: stored.normalizedRequest, quote: fresh,
  }) !== stored.businessFingerprint) reasons.push('SNAPSHOT_FINGERPRINT_MISMATCH');
  return [...new Set(reasons)];
}
