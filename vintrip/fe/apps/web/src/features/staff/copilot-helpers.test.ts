import { describe, expect, it } from 'vitest';
import type { ProposalCreateDraft, Quote, QuoteStatus, RoomUpgradeCandidateQuote, RoomUpgradeChatResponse } from '@vintrip/api-client';
import { buildCreateProposalPayload, buildSafeBackendSummary, canCreateProposalFromCandidate, hasConflictingPriceInDraft, selectDefaultCandidateId } from './copilot-helpers';

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    caseId: 'C2', isMock: true, requestId: 'quote-request', quoteId: 'quote-1', hotelId: 'hotel-1', bookingCode: 'C2-0001',
    targetRoomTypeId: 'DLX', status: 'VALID', currency: 'VND', snapshotId: 'snapshot-1', fixtureVersion: 'v1',
    calculatedAt: '2026-11-28T06:00:00Z', expiresAt: '2026-11-28T06:15:00Z', effectiveAt: '2026-11-28T07:00:00Z',
    timezone: 'Asia/Ho_Chi_Minh', remainingNights: 2, approvalRole: 'RECEPTIONIST', policy: null, benefit: null,
    breakdown: [{ date: '2026-11-28', availableUnits: 3, newRoomPriceVnd: 950000, originalPaidVnd: 700000,
      eligibleOriginalCreditVnd: 650000, additionalFeesVnd: 50000, additionalTaxVnd: 10000,
      eligibleDiscountVnd: 60000, priceDiffVnd: 300000, rateTaxIncluded: true, sourceRefs: ['rate-1'],
      sourceVersions: { booking: 1, inventory: 1, rate: 1, policy: 1, benefit: null } }],
    totals: { newRoomTotalVnd: 1900000, eligibleOriginalCreditVnd: 1300000, additionalFeesVnd: 100000,
      additionalTaxVnd: 20000, eligibleDiscountVnd: 120000, priceDiffVnd: 600000 },
    priceDiffVnd: 600000, inventoryByNight: [{ date: '2026-11-28', availableUnits: 3, stopSell: false, version: 1 }],
    missingFields: [], violations: [], validation: { checked: true, passed: true, violations: [] },
    requiresHumanApproval: true, operationalEffects: 'NONE', ...overrides,
  };
}

function makeCandidate(quoteOverrides: Partial<Quote> = {}, id = 'DLX'): RoomUpgradeCandidateQuote {
  const quote = makeQuote({ targetRoomTypeId: id, ...quoteOverrides });
  return {
    candidateId: id, roomTypeName: id === 'DLX' ? 'Deluxe' : 'Suite', rank: 2, maxGuests: 3, features: ['NON_SMOKING'],
    quoteStatus: quote.status, priceDiffVnd: quote.priceDiffVnd, remainingNights: quote.remainingNights,
    totals: quote.totals, approvalRole: quote.approvalRole, requiresHumanApproval: true, benefit: quote.benefit,
    missingFields: quote.missingFields, violations: quote.violations, quote,
  };
}

function makeResponse(overrides: Partial<RoomUpgradeChatResponse> = {}): RoomUpgradeChatResponse {
  const candidate = makeCandidate();
  return {
    caseId: 'C2', isMock: true, requestId: 'ai-request-1', sessionId: 'session-1',
    sessionContext: { hotelId: 'hotel-1', bookingCode: 'C2-0001', roomNumber: '101', targetRoomTypeId: 'DLX',
      targetRoomHint: 'Deluxe', effectiveAt: '2026-11-28T07:00:00Z', requestType: 'UPGRADE', requiredFeatures: ['NON_SMOKING'],
      guestPreferences: [], benefitId: null, pendingMissingFields: [] },
    workflowStatus: 'COMPLETED', quoteStatus: 'VALID', messageVi: 'Đã tính báo giá.', recommendationReasonVi: null,
    draftMessageVi: null, missingFields: [], violations: [], bookingSummary: null, candidates: [candidate],
    selectedCandidateId: 'DLX', selectedQuote: candidate.quote, proposalDraft: null, policySources: [],
    requiresHumanApproval: true, approvalRole: 'RECEPTIONIST', staffRole: 'RECEPTIONIST', snapshotId: 'snapshot-1',
    fixtureVersion: 'v1', operationalEffects: 'NONE',
    model: { provider: 'openai', api: 'responses', model: 'test-model', reasoningEffort: 'low', promptVersions: ['extract-v1', 'draft-v1'],
      status: 'ok', degraded: false, callCount: 2, repairCount: 0, responseIds: [], guardrailEvents: [],
      usageStatus: 'reported', inputTokens: 120, cachedInputTokens: 0, outputTokens: 80, reasoningTokens: null, costUsd: null },
    trace: { requestId: 'ai-request-1', totalLatencyMs: 150, steps: [], tools: [], modelCalls: [], snapshotId: 'snapshot-1',
      fixtureVersion: 'v1', policyVersion: 1, errorCode: null }, ...overrides,
  };
}

function makeDraft(): ProposalCreateDraft {
  return {
    endpoint: '/api/commerce/room-upgrades/proposals', method: 'POST', requiresIdempotencyKey: true,
    payload: { hotelId: 'hotel-1', bookingCode: 'C2-0001', targetRoomTypeId: 'DLX', effectiveAt: '2026-11-28T07:00:00Z',
      requestType: 'UPGRADE', requiredFeatures: ['NON_SMOKING'], benefitId: 'benefit-verified',
      previewExpectation: { expectedPriceDiffVnd: 600000, expectedSnapshotId: 'snapshot-1', expectedQuoteStatus: 'VALID', expectedApprovalRole: 'RECEPTIONIST' },
      aiMetadata: { source: 'ai_copilot', sessionId: 'session-1', aiRequestId: 'ai-request-1', selectedCandidateId: 'DLX',
        model: 'test-model', promptVersions: ['extract-v1'], recommendationReasonVi: 'Phù hợp nhu cầu.', draftMessageVi: 'Phụ thu 600.000đ.' } },
  };
}

describe('canCreateProposalFromCandidate', () => {
  const statuses: QuoteStatus[] = ['VALID', 'REQUIRES_MANAGER', 'NEEDS_INPUT', 'MISSING_DATA', 'INELIGIBLE', 'UNAVAILABLE', 'VALIDATION_FAILED'];
  it.each(statuses)('allows only persistable %s candidates', (status) => {
    expect(canCreateProposalFromCandidate(makeCandidate({ status }))).toBe(['VALID', 'REQUIRES_MANAGER'].includes(status));
  });
  it.each([null, undefined])('rejects an absent candidate %s', (candidate) => expect(canCreateProposalFromCandidate(candidate)).toBe(false));
  it.each([
    { validation: { checked: true, passed: false, violations: [] } },
    { validation: { checked: false, passed: true, violations: [] } },
    { totals: null }, { priceDiffVnd: null }, { bookingCode: null }, { effectiveAt: null }, { approvalRole: null },
  ] satisfies Partial<Quote>[])('rejects missing validation or a required quote field %j', (patch) => {
    expect(canCreateProposalFromCandidate(makeCandidate(patch))).toBe(false);
  });
  it('uses nested quote validation and totals rather than duplicated display fields', () => {
    const candidate = makeCandidate({ totals: null });
    candidate.totals = makeQuote().totals;
    expect(canCreateProposalFromCandidate(candidate)).toBe(false);
  });
  it.each([0, -1000000])('accepts an authoritative integer difference of %s', (priceDiffVnd) => {
    expect(canCreateProposalFromCandidate(makeCandidate({ priceDiffVnd }))).toBe(true);
  });
});

describe('selectDefaultCandidateId', () => {
  it('honors an existing AI selection, even a non-actionable candidate', () => {
    expect(selectDefaultCandidateId(makeResponse({ candidates: [makeCandidate(), makeCandidate({ status: 'UNAVAILABLE' }, 'STE')], selectedCandidateId: 'STE' }))).toBe('STE');
  });
  it('falls back to the first actionable candidate for an unknown AI ID', () => {
    expect(selectDefaultCandidateId(makeResponse({ candidates: [makeCandidate({ status: 'INELIGIBLE' }), makeCandidate({ status: 'REQUIRES_MANAGER' }, 'STE')], selectedCandidateId: 'unknown' }))).toBe('STE');
  });
  it('falls back to first candidate when none are actionable', () => {
    expect(selectDefaultCandidateId(makeResponse({ candidates: [makeCandidate({ totals: null }), makeCandidate({ status: 'UNAVAILABLE' }, 'STE')], selectedCandidateId: null }))).toBe('DLX');
  });
  it('handles no candidates or response', () => {
    expect(selectDefaultCandidateId(makeResponse({ candidates: [], selectedCandidateId: 'DLX' }))).toBeNull();
    expect(selectDefaultCandidateId(null)).toBeNull();
  });
});

describe('hasConflictingPriceInDraft', () => {
  it.each(['Phụ thu 600.000đ.', 'Phụ thu 600,000 VND', 'Phụ thu 600.000₫', 'Phụ thu 600.000 VNĐ', 'Phụ thu 600000đ', 'Phụ thu 600.000 đồng'])('accepts an exact verified amount: %s', (text) => {
    expect(hasConflictingPriceInDraft(text, makeQuote())).toBe(false);
  });
  it('accepts multiple structured amounts including per-night credit, fees, tax and discount', () => {
    expect(hasConflictingPriceInDraft('Giá mới 1.900.000đ, đối trừ 1.300.000đ, phụ thu 600.000đ. Mỗi đêm 950.000đ, phí 50.000đ, thuế 10.000đ, giảm 60.000đ.', makeQuote())).toBe(false);
  });
  it.each(['Phụ thu 500.000đ.', 'Phụ thu 0đ.', 'Phụ thu 0 ₫', 'Phụ thu 0 VND', 'Phụ thu 1.000.000đ và 600.000đ', 'Phụ thu 500.000 đồng'])('rejects a fabricated amount: %s', (text) => {
    expect(hasConflictingPriceInDraft(text, makeQuote())).toBe(true);
  });
  it.each(['Nâng hạng miễn phí.', 'MIỄN PHÍ cho khách.', 'Miễn\nphí'])('rejects unauthorized complimentary wording: %s', (text) => {
    expect(hasConflictingPriceInDraft(text, makeQuote())).toBe(true);
  });
  it.each(['không miễn phí', 'chưa đủ điều kiện miễn phí', 'không đủ điều kiện miễn phí', 'KHÔNG ĐỦ ĐIỀU KIỆN MIỄN PHÍ'])('allows an explicit negation: %s', (text) => {
    expect(hasConflictingPriceInDraft(text, makeQuote({ status: 'REQUIRES_MANAGER' }))).toBe(false);
  });
  it('still rejects a separate affirmative claim after a negation', () => {
    expect(hasConflictingPriceInDraft('Không miễn phí. Khách được miễn phí.', makeQuote())).toBe(true);
  });
  it('accepts free wording only when the backend difference is zero', () => {
    expect(hasConflictingPriceInDraft('Nâng hạng miễn phí, phụ thu 0đ.', makeQuote({ priceDiffVnd: 0 }))).toBe(false);
  });
  it('accepts the absolute value of negative backend money fields', () => {
    expect(hasConflictingPriceInDraft('Chênh lệch -1.000.000đ; cần kiểm tra 1.000.000đ.', makeQuote({ priceDiffVnd: -1000000 }))).toBe(false);
  });
  it('does not treat room counts or inventory as permitted money', () => {
    expect(hasConflictingPriceInDraft('Phụ thu 3đ.', makeQuote())).toBe(true);
    expect(hasConflictingPriceInDraft('Phòng 101, còn 3 phòng và 2 đêm.', makeQuote())).toBe(false);
  });
  it('works with missing totals and empty breakdown', () => {
    expect(hasConflictingPriceInDraft('Phụ thu 600.000đ.', makeQuote({ totals: null, breakdown: [] }))).toBe(false);
    expect(hasConflictingPriceInDraft('Phụ thu 500.000đ.', makeQuote({ totals: null, breakdown: [] }))).toBe(true);
  });
  it('normalizes decomposed Vietnamese', () => {
    expect(hasConflictingPriceInDraft('miễn phí'.normalize('NFD'), makeQuote())).toBe(true);
  });
  it('handles absent text and quote safely', () => {
    expect(hasConflictingPriceInDraft(null, makeQuote())).toBe(false);
    expect(hasConflictingPriceInDraft(undefined, makeQuote())).toBe(false);
    expect(hasConflictingPriceInDraft('', makeQuote())).toBe(false);
    expect(hasConflictingPriceInDraft('500.000đ', null)).toBe(false);
    expect(hasConflictingPriceInDraft('500.000đ', undefined)).toBe(false);
  });
});

describe('buildCreateProposalPayload', () => {
  it('copies the matching verified proposal draft without mutating the response', () => {
    const proposalDraft = makeDraft();
    const payload = buildCreateProposalPayload(makeResponse({ proposalDraft }), makeCandidate());
    expect(payload).toEqual(proposalDraft.payload);
    expect(payload).not.toBe(proposalDraft.payload);
    expect(payload?.aiMetadata).not.toBe(proposalDraft.payload.aiMetadata);
  });
  it('returns null for an invalid candidate even if a matching draft exists', () => {
    expect(buildCreateProposalPayload(makeResponse({ proposalDraft: makeDraft() }), makeCandidate({ validation: { checked: true, passed: false, violations: [] } }))).toBeNull();
  });
  it('constructs an alternate candidate request with its own verified preview', () => {
    const alternate = makeCandidate({ status: 'REQUIRES_MANAGER', priceDiffVnd: 1200000, approvalRole: 'MANAGER', snapshotId: 'snapshot-2' }, 'STE');
    const response = makeResponse({ proposalDraft: makeDraft(), candidates: [makeCandidate(), alternate] });
    expect(buildCreateProposalPayload(response, alternate)).toEqual({
      hotelId: 'hotel-1', bookingCode: 'C2-0001', targetRoomTypeId: 'STE', effectiveAt: '2026-11-28T07:00:00Z',
      requestType: 'UPGRADE', requiredFeatures: ['NON_SMOKING'],
      previewExpectation: { expectedPriceDiffVnd: 1200000, expectedSnapshotId: 'snapshot-2', expectedQuoteStatus: 'REQUIRES_MANAGER', expectedApprovalRole: 'MANAGER' },
      aiMetadata: { source: 'ai_copilot', sessionId: 'session-1', aiRequestId: 'ai-request-1', selectedCandidateId: 'STE', model: 'test-model', promptVersions: ['extract-v1', 'draft-v1'] },
    });
  });
  it.each([null, '', '   '])('omits benefitId when absent or blank (%s)', (benefitId) => {
    const response = makeResponse();
    response.sessionContext.benefitId = benefitId;
    expect(buildCreateProposalPayload(response, makeCandidate())).not.toHaveProperty('benefitId');
  });
  it('includes a non-empty benefit ID', () => {
    const response = makeResponse();
    response.sessionContext.benefitId = 'verified-benefit';
    expect(buildCreateProposalPayload(response, makeCandidate())?.benefitId).toBe('verified-benefit');
  });
  it('omits a null model and caps prompt versions at ten', () => {
    const response = makeResponse();
    response.model.model = null;
    response.model.promptVersions = Array.from({ length: 15 }, (_, index) => `v${index}`);
    const payload = buildCreateProposalPayload(response, makeCandidate());
    expect(payload?.aiMetadata).not.toHaveProperty('model');
    expect(payload?.aiMetadata?.promptVersions).toHaveLength(10);
    expect(response.model.promptVersions).toHaveLength(15);
    expect(Object.values(payload?.aiMetadata ?? {}).every((value) => value !== null && value !== undefined)).toBe(true);
  });
  it('truncates optional Vietnamese strings in the verified draft without changing its input', () => {
    const proposalDraft = makeDraft();
    proposalDraft.payload.aiMetadata.draftMessageVi = 'á'.repeat(1300);
    proposalDraft.payload.aiMetadata.recommendationReasonVi = 'b'.repeat(1500);
    proposalDraft.payload.aiMetadata.promptVersions = Array.from({ length: 12 }, () => 'v1');
    const payload = buildCreateProposalPayload(makeResponse({ proposalDraft }), makeCandidate());
    expect(payload?.aiMetadata?.draftMessageVi).toHaveLength(1000);
    expect(payload?.aiMetadata?.recommendationReasonVi).toHaveLength(1000);
    expect(payload?.aiMetadata?.promptVersions).toHaveLength(10);
    expect(proposalDraft.payload.aiMetadata.draftMessageVi).toHaveLength(1300);
  });
  it.each([false, true])('never forwards actor, charge or persisted-state fields (draft=%s)', (withDraft) => {
    const forged = { actorRole: 'MANAGER', actorUserId: 'attacker', amount: 0, priceDiffVnd: 0, status: 'APPROVED', approved: true, isMock: true };
    const proposalDraft = makeDraft();
    Object.assign(proposalDraft.payload, forged);
    Object.assign(proposalDraft.payload.aiMetadata, forged);
    const response = makeResponse({ proposalDraft: withDraft ? proposalDraft : null });
    Object.assign(response.sessionContext, forged);
    const payload = buildCreateProposalPayload(response, makeCandidate());
    for (const key of Object.keys(forged)) {
      expect(payload).not.toHaveProperty(key);
      expect(payload?.aiMetadata).not.toHaveProperty(key);
    }
  });
  it('preserves zero and negative preview differences exactly', () => {
    for (const difference of [0, -1000000]) {
      expect(buildCreateProposalPayload(makeResponse(), makeCandidate({ priceDiffVnd: difference }))?.previewExpectation?.expectedPriceDiffVnd).toBe(difference);
    }
  });
  it('does not mutate candidate or session features', () => {
    const response = makeResponse();
    const candidate = makeCandidate();
    const before = JSON.stringify({ response, candidate });
    const payload = buildCreateProposalPayload(response, candidate);
    payload?.requiredFeatures?.push('GARDEN_VIEW');
    expect(JSON.stringify({ response, candidate })).toBe(before);
  });
});

describe('buildSafeBackendSummary', () => {
  it('formats verified money, room identity and receptionist approval with the operational disclaimer', () => {
    const summary = buildSafeBackendSummary(makeQuote(), 'Deluxe');
    expect(summary).toContain('C2-0001');
    expect(summary).toContain('Deluxe (DLX)');
    expect(summary).toContain('2 đêm');
    expect(summary).toContain('600.000đ');
    expect(summary).toContain('Lễ tân duyệt');
    expect(summary).toContain('chưa thực hiện chuyển phòng hay thu tiền');
  });
  it('preserves the negative C2-0010 difference and manager approval', () => {
    const summary = buildSafeBackendSummary(makeQuote({ bookingCode: 'C2-0010', priceDiffVnd: -1000000, approvalRole: 'MANAGER' }));
    expect(summary).toContain('C2-0010');
    expect(summary).toContain('-1.000.000đ');
    expect(summary).toContain('Cần quản lý duyệt');
    expect(summary).toContain('DLX');
  });
  it('does not invent money or approval for missing structured fields', () => {
    const summary = buildSafeBackendSummary(makeQuote({ bookingCode: null, targetRoomTypeId: null, priceDiffVnd: null, approvalRole: null, remainingNights: null }));
    expect(summary).toContain('chưa xác định');
    expect(summary).toContain('Tổng phụ thu đã xác minh: —');
    expect(summary).toContain('Chưa xác định vai trò duyệt');
  });
});
