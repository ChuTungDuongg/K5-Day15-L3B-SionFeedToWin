import { useQuery, type QueryClient } from '@tanstack/react-query';
import { http, HttpError, type HttpResponse } from './http';
import { useApiSession } from './session';

export type StaffRole = 'RECEPTIONIST' | 'MANAGER';
export type RoomUpgradeRequestType = 'UPGRADE' | 'ROOM_CHANGE' | 'COMPLIMENTARY_UPGRADE';
export type QuoteStatus = 'VALID' | 'NEEDS_INPUT' | 'MISSING_DATA' | 'INELIGIBLE' | 'UNAVAILABLE' | 'REQUIRES_MANAGER' | 'VALIDATION_FAILED';
export type PersistedQuoteStatus = 'VALID' | 'REQUIRES_MANAGER';
export type ProposalStatus = 'DRAFT' | 'PENDING_RECEPTIONIST' | 'PENDING_MANAGER' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REQUOTE_REQUIRED';
export type ProposalCommandOperation = 'CREATE' | 'REVISE' | 'APPROVE' | 'REJECT' | 'ESCALATE';
export type ProposalAllowedAction = Exclude<ProposalCommandOperation, 'CREATE'>;
export type ProposalAuditAction = 'CREATED' | 'REVISED' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'MARKED_EXPIRED' | 'MARKED_REQUOTE_REQUIRED';

interface MockVersion { isMock: true; version: number }
interface CaseEnvelope { caseId: 'C2'; isMock: true; requestId: string }
interface ReadEnvelope extends CaseEnvelope { snapshotId: string; fixtureVersion: string; staffRole: StaffRole }
interface ProposalEnvelope extends CaseEnvelope {
  operationalEffects: 'NONE'; requiresHumanApproval: true; hotelId: string; staffRole: StaffRole;
}
export interface RoomUpgradeHotel extends MockVersion {
  id: string; name: string; timezone: string; fixtureVersion: string;
}
export interface RoomUpgradeBooking extends MockVersion {
  hotelId: string; bookingCode: string; roomNumber: string; roomTypeId: string;
  status: 'IN_HOUSE' | 'CONFIRMED' | 'CHECKED_OUT'; checkInAt: string; checkOutAt: string; guests: number;
  nights: { date: string; paidVnd: number | null; creditEligibleVnd: number | null; taxIncluded: true; sourceRef: string }[];
}
export interface RoomUpgradeRoomType extends MockVersion {
  id: string; hotelId: string; name: string; rank: number; maxGuests: number; features: string[];
}
export interface RoomUpgradeInventory extends MockVersion {
  hotelId: string; roomTypeId: string; date: string; total: number; held: number; sold: number;
  outOfService: number; stopSell: boolean;
}
export interface RoomUpgradeRate extends MockVersion {
  hotelId: string; roomTypeId: string; date: string; priceVnd: number; taxIncluded: boolean; sourceRef: string;
}
export interface RoomUpgradePolicyRules {
  nightRule: 'FULL_LOCAL_NIGHT'; originalCreditBps: number; changeFeeVnd: number; feeTaxIncluded: boolean;
  taxBps: number; maxNights: number; quoteTtlMinutes: number; maxReceptionistDiffVnd: number;
  allowedTransitions: { from: string; to: string }[]; allowedBenefitCodes: string[];
}
export interface RoomUpgradePolicy extends MockVersion {
  hotelId: string; code: string; validFrom: string; validUntil: string; rules: RoomUpgradePolicyRules;
  sources: { code: string; clause: string }[];
}
export interface RoomUpgradeBenefit extends MockVersion {
  id: string; hotelId: string; bookingCode: string; code: string; verifiedAt: string | null;
  validFrom: string; validUntil: string; discountBps: number; roomTypeIds: string[];
}
export interface BookingListResponse extends ReadEnvelope { hotel: RoomUpgradeHotel; items: RoomUpgradeBooking[] }
export interface BookingContextResponse extends ReadEnvelope {
  currency: 'VND'; hotel: RoomUpgradeHotel; booking: RoomUpgradeBooking; roomTypes: RoomUpgradeRoomType[];
  inventory: RoomUpgradeInventory[]; rates: RoomUpgradeRate[]; policies: RoomUpgradePolicy[]; benefits: RoomUpgradeBenefit[];
}
export interface QuoteRequest {
  hotelId: string; bookingCode?: string; roomNumber?: string; targetRoomTypeId?: string; effectiveAt?: string;
  requestType?: RoomUpgradeRequestType; requiredFeatures?: string[]; benefitId?: string;
}
export interface RoomUpgradeIssue { code: string; field: string; message: string }
export interface QuoteNight {
  date: string; availableUnits: number; newRoomPriceVnd: number; originalPaidVnd: number;
  eligibleOriginalCreditVnd: number; additionalFeesVnd: number; additionalTaxVnd: number;
  eligibleDiscountVnd: number; priceDiffVnd: number; rateTaxIncluded: boolean; sourceRefs: string[];
  sourceVersions: { booking: number; inventory: number; rate: number; policy: number; benefit: number | null };
}
export interface QuoteTotals {
  newRoomTotalVnd: number; eligibleOriginalCreditVnd: number; additionalFeesVnd: number;
  additionalTaxVnd: number; eligibleDiscountVnd: number; priceDiffVnd: number;
}
export interface Quote extends CaseEnvelope {
  quoteId: string; hotelId: string; bookingCode: string | null; targetRoomTypeId: string | null;
  status: QuoteStatus; currency: 'VND'; snapshotId: string; fixtureVersion: string; calculatedAt: string;
  expiresAt: string | null; effectiveAt: string | null; timezone: string; remainingNights: number | null;
  approvalRole: StaffRole | null; policy: Pick<RoomUpgradePolicy, 'code' | 'version' | 'sources'> | null;
  benefit: Pick<RoomUpgradeBenefit, 'id' | 'code' | 'version' | 'discountBps'> | null;
  breakdown: QuoteNight[]; totals: QuoteTotals | null; priceDiffVnd: number | null;
  inventoryByNight: { date: string; availableUnits: number | null; stopSell: boolean | null; version: number | null }[];
  missingFields: string[]; violations: RoomUpgradeIssue[];
  validation: { checked: boolean; passed: boolean; violations: RoomUpgradeIssue[] };
  requiresHumanApproval: true; operationalEffects: 'NONE';
}
export interface PreviewExpectation {
  expectedPriceDiffVnd?: number; expectedSnapshotId?: string; expectedQuoteStatus?: PersistedQuoteStatus;
  expectedApprovalRole?: StaffRole;
}
export interface AiRecommendationMetadata {
  source: 'ai_copilot'; sessionId?: string; aiRequestId?: string; selectedCandidateId?: string;
  model?: string; promptVersions?: string[]; recommendationReasonVi?: string; draftMessageVi?: string;
}
export interface CreateProposalRequest extends QuoteRequest {
  targetRoomTypeId: string; effectiveAt: string; previewExpectation?: PreviewExpectation; aiMetadata?: AiRecommendationMetadata;
}
export interface ReviseProposalRequest {
  hotelId: string; expectedVersion: number; targetRoomTypeId?: string; effectiveAt?: string;
  requestType?: RoomUpgradeRequestType; requiredFeatures?: string[]; benefitId?: string | null; reason?: string;
  previewExpectation?: PreviewExpectation; aiMetadata?: AiRecommendationMetadata;
}
export interface ApproveProposalRequest { hotelId: string; expectedVersion: number; reason?: string }
export interface RejectProposalRequest extends ApproveProposalRequest { reason: string }
export interface EscalateProposalRequest extends ApproveProposalRequest { reason: string }
export interface NormalizedProposalRequest {
  hotelId: string; bookingCode: string; targetRoomTypeId: string; effectiveAt: string;
  requestType: RoomUpgradeRequestType; requiredFeatures: string[]; benefitId: string | null;
}
export interface ListProposalsQuery {
  hotelId: string; status?: ProposalStatus; bookingCode?: string; requiredApprovalRole?: StaffRole; limit?: number; offset?: number;
}
export interface StaffHotelAssignment {
  hotelId: string; hotelName: string; timezone: string; fixtureVersion: string; staffRole: StaffRole;
}
export interface StaffContextResponse extends CaseEnvelope {
  operationalEffects: 'NONE'; userId: string; hasAccess: boolean; assignments: StaffHotelAssignment[];
}
export interface ProposalSummaryView {
  proposalId: string; bookingCode: string; status: ProposalStatus; version: number; currentRevision: number;
  requiredApprovalRole: StaffRole; allowedActions: ProposalAllowedAction[]; reasonCodes: string[];
  expiresAt: string; isExpired: boolean; createdBy: string; createdAt: string; updatedAt: string;
  decidedBy: string | null; decidedByRole: StaffRole | null; decidedAt: string | null;
  targetRoomTypeId: string; effectiveAt: string; priceDiffVnd: number; quoteStatus: PersistedQuoteStatus;
  policyCode: string; policyVersion: number;
}
export interface ProposalSummaryResponse extends CaseEnvelope {
  operationalEffects: 'NONE'; hotel: Pick<RoomUpgradeHotel, 'id' | 'name' | 'timezone' | 'fixtureVersion'>; staffRole: StaffRole;
  counts: { inHouseBookings: number; totalProposals: number; draft: number; pendingReceptionist: number;
    pendingManager: number; approved: number; rejected: number; expired: number; requoteRequired: number };
  recentProposals: ProposalSummaryView[];
}
export interface ProposalDetailResponse extends ProposalEnvelope, ProposalSummaryView {
  decisionReason: string | null; normalizedRequest: NormalizedProposalRequest; quote: Quote;
  breakdown: QuoteNight[]; policySources: RoomUpgradePolicy['sources']; fixtureVersion: string; snapshotId: string;
  aiMetadata: (AiRecommendationMetadata & { promptVersions: string[] }) | null; calculatedAt: string; businessFingerprint: string;
}
export interface ProposalListResponse extends ProposalEnvelope {
  total: number; limit: number; offset: number; items: ProposalSummaryView[];
}
export interface ProposalRevisionRecord {
  hotelId: string; proposalId: string; revisionNumber: number; normalizedRequest: NormalizedProposalRequest;
  targetRoomTypeId: string; effectiveAt: string; quote: Quote; breakdown: QuoteNight[]; policySources: RoomUpgradePolicy['sources'];
  policyCode: string; policyVersion: number; fixtureVersion: string; snapshotId: string; businessFingerprint: string;
  priceDiffVnd: number; quoteStatus: PersistedQuoteStatus; requiredApprovalRole: StaffRole; calculatedAt: string;
  expiresAt: string; aiMetadata: (AiRecommendationMetadata & { promptVersions: string[] }) | null;
  createdBy: string; createdAt: string; isMock: true;
}
export interface ProposalAuditEventRecord {
  id: string; hotelId: string; proposalId: string; proposalVersion: number; revisionNumber: number;
  actorUserId: string; actorRole: StaffRole; action: ProposalAuditAction; previousStatus: ProposalStatus | null;
  newStatus: ProposalStatus; reason: string | null; reasonCodes: string[]; requestId: string;
  idempotencyKeyHash: string | null; createdAt: string; isMock: true;
}
export interface ProposalHistoryResponse extends ProposalEnvelope {
  proposalId: string; status: ProposalStatus; version: number; currentRevision: number;
  revisions: ProposalRevisionRecord[]; auditEvents: ProposalAuditEventRecord[];
}

export interface RoomUpgradeClientContext {
  bookingCode?: string | null; roomNumber?: string | null; targetRoomTypeId?: string | null; targetRoomHint?: string | null;
  effectiveAt?: string | null; requestType?: RoomUpgradeRequestType | null; requiredFeatures?: string[];
  guestPreferences?: string[]; benefitId?: string | null;
}
export interface RoomUpgradeChatRequest {
  hotelId: string; message: string; sessionId?: string | null; selectedBookingCode?: string | null;
  context?: RoomUpgradeClientContext | null;
}
export interface RoomUpgradeSessionContext {
  hotelId: string; bookingCode: string | null; roomNumber: string | null; targetRoomTypeId: string | null;
  targetRoomHint: string | null; effectiveAt: string | null; requestType: RoomUpgradeRequestType;
  requiredFeatures: string[]; guestPreferences: string[]; benefitId: string | null; pendingMissingFields: string[];
}
export interface RoomUpgradeBookingSummary {
  hotelId: string; hotelName: string; timezone: string; bookingCode: string; roomNumber: string;
  currentRoomTypeId: string; currentRoomTypeName: string | null; status: RoomUpgradeBooking['status'];
  checkInAt: string; checkOutAt: string; guests: number; version: number;
}
export interface RoomUpgradeCandidateQuote {
  candidateId: string; roomTypeName: string; rank: number; maxGuests: number; features: string[];
  quoteStatus: QuoteStatus; priceDiffVnd: number | null; remainingNights: number | null; totals: QuoteTotals | null;
  approvalRole: StaffRole | null; requiresHumanApproval: true; benefit: Quote['benefit']; missingFields: string[];
  violations: RoomUpgradeIssue[]; quote: Quote;
}
export type RoomUpgradeUsageStatus = 'reported' | 'partial' | 'usage_missing' | 'not_called';
export type RoomUpgradeModelOutcomeStatus = 'ok' | 'not_called' | 'disabled' | 'not_configured' | 'timeout' | 'invalid_output' |
  'guardrail_rejected' | 'budget_exceeded' | 'deadline_exceeded' | 'breaker_open' | 'provider_error';
interface ModelUsage {
  usageStatus: RoomUpgradeUsageStatus; inputTokens: number | null; cachedInputTokens: number | null;
  outputTokens: number | null; reasoningTokens: number | null; costUsd: number | null;
}
export interface RoomUpgradeModelCallTrace extends ModelUsage {
  step: string; provider: string; model: string | null; responseId: string | null; status: string;
  latencyMs: number; finishReason: string | null; errorCode: string | null;
}
export interface RoomUpgradeModelStatus extends ModelUsage {
  provider: string; api: string; model: string | null; reasoningEffort: string; promptVersions: string[];
  status: RoomUpgradeModelOutcomeStatus; degraded: boolean; callCount: number; repairCount: number;
  responseIds: string[]; guardrailEvents: string[];
}
export interface RoomUpgradeWorkflowTrace {
  requestId: string; totalLatencyMs: number;
  steps: { step: string; outcome: string; latencyMs: number; detail: string | null }[];
  tools: { tool: string; outcome: string; latencyMs: number; detail: string | null }[];
  modelCalls: RoomUpgradeModelCallTrace[]; snapshotId: string | null; fixtureVersion: string | null;
  policyVersion: number | null; errorCode: string | null;
}
export interface ProposalCreateDraft {
  endpoint: '/api/commerce/room-upgrades/proposals'; method: 'POST'; requiresIdempotencyKey: true;
  payload: {
    hotelId: string; bookingCode: string; targetRoomTypeId: string; effectiveAt: string;
    requestType: RoomUpgradeRequestType; requiredFeatures: string[]; benefitId?: string;
    previewExpectation: Required<PreviewExpectation>;
    aiMetadata: AiRecommendationMetadata & { sessionId: string; aiRequestId: string; selectedCandidateId: string; promptVersions: string[] };
  };
}
export interface RoomUpgradeChatResponse extends CaseEnvelope {
  sessionId: string; sessionContext: RoomUpgradeSessionContext;
  workflowStatus: 'COMPLETED' | 'NEEDS_INPUT' | 'OUT_OF_SCOPE' | 'BLOCKED_INJECTION' | 'DEGRADED' | 'AI_ERROR' | 'DEPENDENCY_ERROR';
  quoteStatus: QuoteStatus | null; messageVi: string; recommendationReasonVi: string | null; draftMessageVi: string | null;
  missingFields: string[]; violations: RoomUpgradeIssue[]; bookingSummary: RoomUpgradeBookingSummary | null;
  candidates: RoomUpgradeCandidateQuote[]; selectedCandidateId: string | null; selectedQuote: Quote | null;
  proposalDraft: ProposalCreateDraft | null;
  policySources: { ref: string; code: string; policyCode: string; policyVersion: number; clause: string }[];
  requiresHumanApproval: true; approvalRole: StaffRole | null; staffRole: StaffRole | null;
  snapshotId: string | null; fixtureVersion: string | null; operationalEffects: 'NONE';
  model: RoomUpgradeModelStatus; trace: RoomUpgradeWorkflowTrace;
}

const root = '/api/commerce/room-upgrades';
function queryString(query: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await http<HttpResponse<T>>(path, { signal })).data;
}
async function post<T>(path: string, body: unknown, signal?: AbortSignal, credentials?: RequestCredentials): Promise<T> {
  return (await http<HttpResponse<T>>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    ...(credentials ? { credentials } : {}),
  })).data;
}
export interface ProposalCommandResponse { data: ProposalDetailResponse; status: number; replayed: boolean }
async function command(path: string, body: unknown, idempotencyKey: string): Promise<ProposalCommandResponse> {
  const response = await http<HttpResponse<ProposalDetailResponse>>(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body),
  });
  return { data: response.data, status: response.status, replayed: response.headers.get('idempotency-replayed') === 'true' };
}
export const roomUpgradesApi = {
  getStaffContext: (signal?: AbortSignal) => read<StaffContextResponse>(`${root}/staff-context`, signal),
  getSummary: (hotelId: string, signal?: AbortSignal) => read<ProposalSummaryResponse>(`${root}/proposals/summary?${queryString({ hotelId })}`, signal),
  listBookings: (hotelId: string, roomNumber?: string, signal?: AbortSignal) => read<BookingListResponse>(`${root}/bookings?${queryString({ hotelId, roomNumber })}`, signal),
  getBookingContext: (hotelId: string, bookingCode: string, signal?: AbortSignal) => read<BookingContextResponse>(`${root}/bookings/${encodeURIComponent(bookingCode)}?${queryString({ hotelId })}`, signal),
  calculateQuote: (body: QuoteRequest, signal?: AbortSignal) => post<Quote>(`${root}/quotes`, body, signal),
  // AI service authenticates via Bearer JWT only; omit cookies so CORS does not require allow-credentials.
  chatCopilot: (body: RoomUpgradeChatRequest, signal?: AbortSignal) => post<RoomUpgradeChatResponse>('/ai/room-upgrades/chat', body, signal, 'omit'),
  listProposals: (query: ListProposalsQuery, signal?: AbortSignal) => read<ProposalListResponse>(`${root}/proposals?${queryString(query)}`, signal),
  getProposal: (hotelId: string, proposalId: string, signal?: AbortSignal) => read<ProposalDetailResponse>(`${root}/proposals/${encodeURIComponent(proposalId)}?${queryString({ hotelId })}`, signal),
  getProposalHistory: (hotelId: string, proposalId: string, signal?: AbortSignal) => read<ProposalHistoryResponse>(`${root}/proposals/${encodeURIComponent(proposalId)}/history?${queryString({ hotelId })}`, signal),
  createProposal: (body: CreateProposalRequest, key: string) => command(`${root}/proposals`, body, key),
  reviseProposal: (id: string, body: ReviseProposalRequest, key: string) => command(`${root}/proposals/${encodeURIComponent(id)}/revise`, body, key),
  approveProposal: (id: string, body: ApproveProposalRequest, key: string) => command(`${root}/proposals/${encodeURIComponent(id)}/approve`, body, key),
  rejectProposal: (id: string, body: RejectProposalRequest, key: string) => command(`${root}/proposals/${encodeURIComponent(id)}/reject`, body, key),
  escalateProposal: (id: string, body: EscalateProposalRequest, key: string) => command(`${root}/proposals/${encodeURIComponent(id)}/escalate`, body, key),
};

export type RoomUpgradeErrorKind = 'unauthorized' | 'forbidden' | 'not_found' | 'version_conflict' | 'requote_required' |
  'proposal_expired' | 'preview_mismatch' | 'idempotency_mismatch' | 'concurrent_modification' | 'invalid_state' |
  'not_persistable' | 'validation' | 'dependency_unavailable' | 'network' | 'unknown';
export interface RoomUpgradeError {
  kind: RoomUpgradeErrorKind; status?: number; code?: string; message: string; reasonCodes?: string[];
  currentVersion?: number; currentStatus?: ProposalStatus; proposal?: ProposalDetailResponse; freshQuote?: Quote;
  violations?: RoomUpgradeIssue[]; missingFields?: string[];
}
const errorKinds: Readonly<Record<string, RoomUpgradeErrorKind>> = {
  VERSION_CONFLICT: 'version_conflict', REQUOTE_REQUIRED: 'requote_required', PROPOSAL_EXPIRED: 'proposal_expired',
  PREVIEW_MISMATCH: 'preview_mismatch', IDEMPOTENCY_PAYLOAD_MISMATCH: 'idempotency_mismatch',
  CONCURRENT_MODIFICATION: 'concurrent_modification', INVALID_STATE_TRANSITION: 'invalid_state', QUOTE_NOT_PERSISTABLE: 'not_persistable',
};
const errorMessages: Record<RoomUpgradeErrorKind, string> = {
  unauthorized: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  not_found: 'Không tìm thấy dữ liệu được yêu cầu.', version_conflict: 'Đề xuất đã thay đổi. Vui lòng tải lại trước khi tiếp tục.',
  requote_required: 'Dữ liệu báo giá đã thay đổi. Vui lòng báo giá lại.', proposal_expired: 'Đề xuất đã hết hạn. Vui lòng tạo đề xuất mới.',
  preview_mismatch: 'Báo giá khác bản xem trước. Vui lòng kiểm tra lại.', idempotency_mismatch: 'Mã thao tác đã được dùng với nội dung khác.',
  concurrent_modification: 'Có thao tác đồng thời. Vui lòng tải lại và kiểm tra.', invalid_state: 'Không thể thực hiện ở trạng thái hiện tại.',
  not_persistable: 'Báo giá chưa đủ điều kiện để lưu.', validation: 'Dữ liệu nhập chưa hợp lệ. Vui lòng kiểm tra lại.',
  dependency_unavailable: 'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',
  network: 'Kết nối bị gián đoạn hoặc quá thời gian. Vui lòng thử lại.', unknown: 'Chưa thể hoàn tất thao tác. Vui lòng thử lại sau.',
};
export function parseRoomUpgradeError(error: unknown): RoomUpgradeError {
  if (!(error instanceof HttpError)) {
    const kind = error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) ? 'network' : 'unknown';
    return { kind, message: errorMessages[kind] };
  }
  const body = error.body !== null && typeof error.body === 'object' ? error.body as Record<string, unknown> : {};
  const code = typeof body.code === 'string' ? body.code : undefined;
  const status = error.status;
  const kind: RoomUpgradeErrorKind = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' :
    status === 404 ? 'not_found' : status >= 500 ? 'dependency_unavailable' :
    (code && errorKinds[code]) || (status === 400 || status === 422 ? 'validation' : 'unknown');
  // Never expose raw transport/5xx details; application messages are already Vietnamese.
  const backendMessage = typeof body.message === 'string' ? body.message :
    typeof body.detail === 'string' ? body.detail : typeof body.messageVi === 'string' ? body.messageVi : undefined;
  const message = status < 500 && backendMessage?.trim() && !['Unauthorized', 'Forbidden', 'Not Found', 'Bad Request', 'Unprocessable Entity'].includes(backendMessage) ?
    backendMessage : errorMessages[kind];
  return { kind, status, code, message,
    reasonCodes: Array.isArray(body.reasonCodes) && body.reasonCodes.every((item) => typeof item === 'string') ? body.reasonCodes : undefined,
    currentVersion: typeof body.currentVersion === 'number' ? body.currentVersion : undefined,
    currentStatus: typeof body.currentStatus === 'string' && proposalStatuses.has(body.currentStatus) ? body.currentStatus as ProposalStatus : undefined,
    proposal: body.proposal !== null && typeof body.proposal === 'object' ? body.proposal as ProposalDetailResponse : undefined,
    freshQuote: body.freshQuote !== null && typeof body.freshQuote === 'object' ? body.freshQuote as Quote : undefined,
    violations: Array.isArray(body.violations) ? body.violations as RoomUpgradeIssue[] : undefined,
    missingFields: Array.isArray(body.missingFields) && body.missingFields.every((item) => typeof item === 'string') ? body.missingFields : undefined };
}
const proposalStatuses: ReadonlySet<string> = new Set(['DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED']);

function canonicalPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  if (serialized === undefined) throw new TypeError('Expected a JSON payload');
  const encode = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${encode(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value)!;
  };
  return encode(JSON.parse(serialized) as unknown);
}
function newCommandKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
/** Explicit retries only. Never changes expectedVersion or retries a conflict automatically. */
export function createLogicalCommandManager() {
  type Entry = { fingerprint: string; key: string };
  const entries = new Map<string, Entry>();
  // Resetting a form must not allow a duplicate while its request is still in flight.
  const inFlight = new Map<string, Promise<unknown>>();
  return {
    execute<T>(operation: ProposalCommandOperation, targetId: string, payload: unknown, executor: (key: string) => Promise<T>): Promise<T> {
      const slot = JSON.stringify([operation, targetId]);
      const fingerprint = canonicalPayload(payload);
      const commandId = JSON.stringify([slot, fingerprint]);
      const pending = inFlight.get(commandId);
      if (pending) return pending as Promise<T>;
      let entry = entries.get(slot);
      if (!entry || entry.fingerprint !== fingerprint) {
        entry = { fingerprint, key: newCommandKey() };
        entries.set(slot, entry);
      }
      const current = entry;
      const clear = () => { if (entries.get(slot) === current) entries.delete(slot); };
      const result = Promise.resolve().then(() => executor(current.key)).then((data) => {
        clear();
        return data;
      }, (error: unknown) => {
        // Committed expiry/requote conflicts retain their key so another click
        // only replays that conflict. A revised payload starts a fresh command.
        if (error instanceof HttpError && ([400, 401, 403, 404, 422].includes(error.status) ||
          (error.status === 409 && ['VERSION_CONFLICT', 'PREVIEW_MISMATCH', 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            'INVALID_STATE_TRANSITION'].includes(parseRoomUpgradeError(error).code ?? '')))) clear();
        throw error;
      }).finally(() => {
        inFlight.delete(commandId);
      });
      inFlight.set(commandId, result);
      return result;
    },
    reset() { entries.clear(); },
  };
}

type UserId = string | null;
type ProposalFilters = Omit<ListProposalsQuery, 'hotelId'>;
export const roomUpgradeQueryKeys = {
  all: (userId: UserId) => ['room-upgrades', userId] as const,
  staffContext: (userId: UserId) => [...roomUpgradeQueryKeys.all(userId), 'staff-context'] as const,
  hotelScope: (userId: UserId, hotelId: string) => [...roomUpgradeQueryKeys.all(userId), 'hotel', hotelId] as const,
  summary: (userId: UserId, hotelId: string) => [...roomUpgradeQueryKeys.hotelScope(userId, hotelId), 'summary'] as const,
  bookings: (userId: UserId, hotelId: string, roomNumber?: string) => [...roomUpgradeQueryKeys.hotelScope(userId, hotelId), 'bookings', ...(roomNumber === undefined ? [] : [roomNumber])] as const,
  bookingContext: (userId: UserId, hotelId: string, bookingCode: string) => [...roomUpgradeQueryKeys.hotelScope(userId, hotelId), 'booking-context', bookingCode] as const,
  proposals: (userId: UserId, hotelId: string, filters?: ProposalFilters) => [...roomUpgradeQueryKeys.hotelScope(userId, hotelId), 'proposals', ...(filters === undefined ? [] : [filters])] as const,
  proposalDetail: (userId: UserId, hotelId: string, proposalId: string) => [...roomUpgradeQueryKeys.hotelScope(userId, hotelId), 'proposal', proposalId] as const,
  proposalHistory: (userId: UserId, hotelId: string, proposalId: string) => [...roomUpgradeQueryKeys.proposalDetail(userId, hotelId, proposalId), 'history'] as const,
};
export function useStaffContext() {
  const { user, isReady } = useApiSession();
  return useQuery({ queryKey: roomUpgradeQueryKeys.staffContext(user?.id ?? null),
    queryFn: ({ signal }) => roomUpgradesApi.getStaffContext(signal), enabled: isReady && Boolean(user), retry: false });
}
export function useStaffSummary(hotelId: string) {
  const { user, isReady } = useApiSession();
  return useQuery({ queryKey: roomUpgradeQueryKeys.summary(user?.id ?? null, hotelId),
    queryFn: ({ signal }) => roomUpgradesApi.getSummary(hotelId, signal), enabled: isReady && Boolean(user) && Boolean(hotelId), retry: false });
}
export function useInHouseBookings(hotelId: string, roomNumber?: string) {
  const { user, isReady } = useApiSession();
  return useQuery({ queryKey: roomUpgradeQueryKeys.bookings(user?.id ?? null, hotelId, roomNumber),
    queryFn: ({ signal }) => roomUpgradesApi.listBookings(hotelId, roomNumber, signal), enabled: isReady && Boolean(user) && Boolean(hotelId), retry: false });
}
export function useBookingContext(hotelId: string, bookingCode: string) {
  const { user, isReady } = useApiSession();
  return useQuery({ queryKey: roomUpgradeQueryKeys.bookingContext(user?.id ?? null, hotelId, bookingCode),
    queryFn: ({ signal }) => roomUpgradesApi.getBookingContext(hotelId, bookingCode, signal),
    enabled: isReady && Boolean(user) && Boolean(hotelId) && Boolean(bookingCode), retry: false });
}
export function useProposalsList(query: ListProposalsQuery) {
  const { user, isReady } = useApiSession();
  const { hotelId, ...filters } = query;
  return useQuery({ queryKey: roomUpgradeQueryKeys.proposals(user?.id ?? null, hotelId, filters),
    queryFn: ({ signal }) => roomUpgradesApi.listProposals(query, signal), enabled: isReady && Boolean(user) && Boolean(hotelId), retry: false });
}
export function useProposalDetail(hotelId: string, proposalId: string) {
  const { user, isReady } = useApiSession();
  return useQuery({ queryKey: roomUpgradeQueryKeys.proposalDetail(user?.id ?? null, hotelId, proposalId),
    queryFn: ({ signal }) => roomUpgradesApi.getProposal(hotelId, proposalId, signal),
    enabled: isReady && Boolean(user) && Boolean(hotelId) && Boolean(proposalId), retry: false });
}
export function useProposalHistory(hotelId: string, proposalId: string) {
  const { user, isReady } = useApiSession();
  return useQuery({ queryKey: roomUpgradeQueryKeys.proposalHistory(user?.id ?? null, hotelId, proposalId),
    queryFn: ({ signal }) => roomUpgradesApi.getProposalHistory(hotelId, proposalId, signal),
    enabled: isReady && Boolean(user) && Boolean(hotelId) && Boolean(proposalId), retry: false });
}
export async function invalidateRoomUpgradeQueries(queryClient: QueryClient, userId: UserId, hotelId: string, proposalId?: string) {
  const keys: readonly unknown[][] = [
    [...roomUpgradeQueryKeys.summary(userId, hotelId)], [...roomUpgradeQueryKeys.bookings(userId, hotelId)],
    [...roomUpgradeQueryKeys.proposals(userId, hotelId)],
    ...(proposalId ? [[...roomUpgradeQueryKeys.proposalDetail(userId, hotelId, proposalId)],
      [...roomUpgradeQueryKeys.proposalHistory(userId, hotelId, proposalId)]] : []),
  ];
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
