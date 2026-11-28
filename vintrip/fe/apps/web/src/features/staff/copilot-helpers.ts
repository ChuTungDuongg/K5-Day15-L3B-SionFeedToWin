import type { AiRecommendationMetadata, CreateProposalRequest, Quote, RoomUpgradeCandidateQuote, RoomUpgradeChatResponse } from '@vintrip/api-client';
import { formatVnd } from './staff-format';

export function canCreateProposalFromCandidate(candidate: RoomUpgradeCandidateQuote | null | undefined): boolean {
  if (!candidate) return false;
  const { quote } = candidate;
  return (candidate.quoteStatus === 'VALID' || candidate.quoteStatus === 'REQUIRES_MANAGER') &&
    quote.validation.checked === true && quote.validation.passed === true && quote.totals !== null &&
    quote.priceDiffVnd !== null && quote.bookingCode !== null && quote.effectiveAt !== null && quote.approvalRole !== null;
}

export function selectDefaultCandidateId(response: RoomUpgradeChatResponse | null): string | null {
  if (!response) return null;
  return response.candidates.find((candidate) => candidate.candidateId === response.selectedCandidateId)?.candidateId ??
    response.candidates.find(canCreateProposalFromCandidate)?.candidateId ?? response.candidates[0]?.candidateId ?? null;
}

/** Compare only money fields, never counts, room IDs or other incidental numbers. */
export function hasConflictingPriceInDraft(text: string | null | undefined, quote: Quote | null | undefined): boolean {
  if (!text || !quote) return false;
  const allowed = new Set<number>();
  const add = (value: number | null) => { if (value !== null && Number.isInteger(value)) allowed.add(Math.abs(value)); };
  add(quote.priceDiffVnd);
  for (const item of [quote.totals, ...quote.breakdown]) {
    if (!item) continue;
    for (const [key, value] of Object.entries(item)) {
      if (key.endsWith('Vnd') && typeof value === 'number') add(value);
    }
  }
  // JS \b is ASCII-only: a boundary after đ/₫ misses amounts at sentence end.
  const normalized = text.normalize('NFC');
  const amounts = normalized.matchAll(/\b\d+(?:[.,]\d{3})*\s*(?:đồng|vnđ|vnd|đ|₫)(?![\p{L}\p{N}_])/giu);
  for (const match of amounts) {
    const digits = match[0].match(/^[\d.,]+/)?.[0] ?? '';
    if (!allowed.has(Number(digits.replace(/[.,]/g, '')))) return true;
  }
  const affirmative = normalized.toLocaleLowerCase('vi-VN')
    .replace(/(?:không|chưa)\s+(?:đủ\s+điều\s+kiện\s+)?miễn\s+phí/gu, '');
  return quote.priceDiffVnd !== 0 && /miễn\s+phí/u.test(affirmative);
}

export function buildSafeBackendSummary(quote: Quote, roomTypeName?: string): string {
  const role = quote.approvalRole === 'MANAGER' ? 'Cần quản lý duyệt' :
    quote.approvalRole === 'RECEPTIONIST' ? 'Lễ tân duyệt' : 'Chưa xác định vai trò duyệt';
  return `Booking ${quote.bookingCode ?? 'chưa xác định'}: chuyển sang ${roomTypeName ? `${roomTypeName} (${quote.targetRoomTypeId ?? '—'})` : quote.targetRoomTypeId ?? '—'}, ` +
    `${quote.remainingNights ?? '—'} đêm còn lại. Tổng phụ thu đã xác minh: ${formatVnd(quote.priceDiffVnd)}. ${role}. ` +
    'Đề xuất cần được người có thẩm quyền phê duyệt; chưa thực hiện chuyển phòng hay thu tiền.';
}

function cleanMetadata(metadata: AiRecommendationMetadata): AiRecommendationMetadata {
  return {
    source: 'ai_copilot',
    ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
    ...(metadata.aiRequestId ? { aiRequestId: metadata.aiRequestId } : {}),
    ...(metadata.selectedCandidateId ? { selectedCandidateId: metadata.selectedCandidateId } : {}),
    ...(metadata.model ? { model: metadata.model } : {}),
    ...(metadata.promptVersions ? { promptVersions: metadata.promptVersions.slice(0, 10) } : {}),
    ...(metadata.recommendationReasonVi ? { recommendationReasonVi: metadata.recommendationReasonVi.slice(0, 1000) } : {}),
    ...(metadata.draftMessageVi ? { draftMessageVi: metadata.draftMessageVi.slice(0, 1000) } : {}),
  };
}

export function buildCreateProposalPayload(response: RoomUpgradeChatResponse, candidate: RoomUpgradeCandidateQuote): CreateProposalRequest | null {
  if (!canCreateProposalFromCandidate(candidate)) return null;
  const draft = response.proposalDraft?.payload;
  if (draft?.targetRoomTypeId === candidate.candidateId) {
    // Allowlist CP3 fields even if a future response adds unrelated properties.
    return {
      hotelId: draft.hotelId, bookingCode: draft.bookingCode, targetRoomTypeId: draft.targetRoomTypeId,
      effectiveAt: draft.effectiveAt, requestType: draft.requestType, requiredFeatures: draft.requiredFeatures,
      ...(draft.benefitId?.trim() ? { benefitId: draft.benefitId } : {}),
      previewExpectation: { ...draft.previewExpectation }, aiMetadata: cleanMetadata(draft.aiMetadata),
    };
  }
  const { quote } = candidate;
  return {
    hotelId: quote.hotelId, bookingCode: quote.bookingCode!, targetRoomTypeId: candidate.candidateId,
    effectiveAt: quote.effectiveAt!, requestType: response.sessionContext.requestType,
    requiredFeatures: [...response.sessionContext.requiredFeatures],
    ...(response.sessionContext.benefitId?.trim() ? { benefitId: response.sessionContext.benefitId } : {}),
    previewExpectation: {
      expectedPriceDiffVnd: quote.priceDiffVnd!, expectedSnapshotId: quote.snapshotId,
      expectedQuoteStatus: quote.status as 'VALID' | 'REQUIRES_MANAGER', expectedApprovalRole: quote.approvalRole!,
    },
    aiMetadata: cleanMetadata({
      source: 'ai_copilot', sessionId: response.sessionId, aiRequestId: response.requestId,
      selectedCandidateId: candidate.candidateId, ...(response.model.model ? { model: response.model.model } : {}),
      promptVersions: response.model.promptVersions.slice(0, 10),
    }),
  };
}
