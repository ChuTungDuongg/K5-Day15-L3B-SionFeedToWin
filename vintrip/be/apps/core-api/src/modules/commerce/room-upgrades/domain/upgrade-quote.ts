import type { Benefit, Issue, Quote, QuoteNight, QuoteRequest, Snapshot } from './room-upgrade.js';
import { basisPoints, localDate, nightDates, sumVnd } from './quote-primitives.js';

export interface QuoteContext { now: Date; requestId: string; quoteId: string; snapshotId: string }

/** Pure pricing. No booking writes, holds, payment ports or model-provided prices. */
export function calculateQuote(snapshot: Snapshot, input: QuoteRequest, context: QuoteContext): Quote {
  const { now } = context;
  const quote: Quote = {
    caseId: 'C2', requestId: context.requestId, quoteId: context.quoteId,
    hotelId: snapshot.hotel.id, bookingCode: input.bookingCode ?? null,
    targetRoomTypeId: input.targetRoomTypeId ?? null, status: 'NEEDS_INPUT', currency: 'VND', isMock: true,
    snapshotId: context.snapshotId, fixtureVersion: snapshot.hotel.fixtureVersion,
    calculatedAt: now.toISOString(), expiresAt: null, effectiveAt: input.effectiveAt ?? null,
    timezone: snapshot.hotel.timezone, remainingNights: null, approvalRole: null,
    policy: null, benefit: null, breakdown: [], inventoryByNight: [], totals: null, priceDiffVnd: null,
    missingFields: [], violations: [], validation: { checked: false, passed: false, violations: [] },
    requiresHumanApproval: true, operationalEffects: 'NONE',
  };
  if (!input.bookingCode && !input.roomNumber) quote.missingFields.push('bookingCodeOrRoomNumber');
  if (!input.targetRoomTypeId) quote.missingFields.push('targetRoomTypeId');
  if (!input.effectiveAt) quote.missingFields.push('effectiveAt');
  if (quote.missingFields.length) return quote;

  const issue = (code: string, field: string, message: string) => quote.violations.push({ code, field, message });
  const candidates = snapshot.bookings.filter((b) => input.bookingCode ? b.bookingCode === input.bookingCode :
    b.roomNumber === input.roomNumber && b.status === 'IN_HOUSE' &&
      Date.parse(b.checkInAt) <= now.getTime() && Date.parse(b.checkOutAt) > now.getTime());
  if (candidates.length !== 1) {
    issue(candidates.length ? 'AMBIGUOUS_ROOM_NUMBER' : 'BOOKING_NOT_FOUND', 'bookingCode', 'Không xác định được duy nhất booking trong khách sạn.');
    quote.status = candidates.length ? 'NEEDS_INPUT' : 'INELIGIBLE';
    if (candidates.length) quote.missingFields.push('bookingCode');
    return quote;
  }
  const booking = candidates[0]!;
  quote.bookingCode = booking.bookingCode;
  if (booking.status !== 'IN_HOUSE' || now.getTime() < Date.parse(booking.checkInAt) || now.getTime() >= Date.parse(booking.checkOutAt)) {
    issue('NOT_IN_HOUSE', 'bookingCode', 'Booking chưa check-in hoặc đã checkout.');
    quote.status = 'INELIGIBLE'; return quote;
  }
  const effective = Date.parse(input.effectiveAt!);
  if (effective < now.getTime() || effective < Date.parse(booking.checkInAt) || effective >= Date.parse(booking.checkOutAt)) {
    issue('INVALID_EFFECTIVE_AT', 'effectiveAt', 'Thời điểm chuyển phải từ hiện tại và trước checkout.');
    quote.status = 'INELIGIBLE'; return quote;
  }
  const target = snapshot.roomTypes.find((r) => r.id === input.targetRoomTypeId);
  const current = snapshot.roomTypes.find((r) => r.id === booking.roomTypeId);
  if (!target || !current) {
    quote.status = 'MISSING_DATA'; quote.missingFields.push(!target ? 'targetRoomType' : 'currentRoomType'); return quote;
  }
  const activePolicies = snapshot.policies.filter((p) => Date.parse(p.validFrom) <= now.getTime() &&
    Date.parse(p.validUntil) > effective).sort((a, b) => b.version - a.version);
  const policy = activePolicies[0];
  if (!policy) { quote.status = 'MISSING_DATA'; quote.missingFields.push('upgradePolicy'); return quote; }
  if (activePolicies[1]?.version === policy.version) {
    quote.status = 'MISSING_DATA'; quote.missingFields.push('upgradePolicy.uniqueVersion'); return quote;
  }
  quote.policy = { code: policy.code, version: policy.version, sources: policy.sources };
  quote.expiresAt = new Date(Math.min(now.getTime() + policy.rules.quoteTtlMinutes * 60_000,
    Date.parse(policy.validUntil), Date.parse(booking.checkOutAt))).toISOString();
  if (!policy.rules.allowedTransitions.some((t) => t.from === current.id && t.to === target.id) || current.id === target.id ||
    (input.requestType !== 'ROOM_CHANGE' && target.rank <= current.rank)) {
    issue('TRANSITION_NOT_ALLOWED', 'targetRoomTypeId', 'Hạng phòng không thỏa chính sách đổi/nâng hạng.');
  }
  if (booking.guests > target.maxGuests) issue('CAPACITY_EXCEEDED', 'targetRoomTypeId', 'Phòng mới không đủ sức chứa.');
  if (input.requiredFeatures.some((feature) => !target.features.includes(feature))) {
    issue('ROOM_CONDITION_UNMET', 'requiredFeatures', 'Phòng mới thiếu điều kiện bắt buộc.');
  }
  if (quote.violations.length) { quote.status = 'INELIGIBLE'; return quote; }

  let dates: string[];
  try { dates = nightDates(localDate(input.effectiveAt!, snapshot.hotel.timezone), localDate(booking.checkOutAt, snapshot.hotel.timezone)); }
  catch { quote.status = 'MISSING_DATA'; quote.missingFields.push('timezoneOrStayRange'); return quote; }
  quote.remainingNights = dates.length;
  if (!dates.length || dates.length > policy.rules.maxNights) {
    issue('UNSUPPORTED_NIGHT_RANGE', 'effectiveAt', 'Không còn đêm tính phí hoặc vượt số đêm policy cho phép.');
    quote.status = 'INELIGIBLE'; return quote;
  }
  for (const date of dates) {
    const inventory = snapshot.inventory.filter((v) => v.roomTypeId === target.id && v.date === date);
    const rates = snapshot.rates.filter((v) => v.roomTypeId === target.id && v.date === date);
    const original = booking.nights.filter((v) => v.date === date);
    const day = inventory.length === 1 ? inventory[0]! : null;
    const available = day ? day.total - day.held - day.sold - day.outOfService : null;
    quote.inventoryByNight.push({ date, availableUnits: available, stopSell: day?.stopSell ?? null, version: day?.version ?? null });
    if (!day) quote.missingFields.push(`inventory.${date}`);
    else if (day.stopSell || available! < 1) issue('ROOM_UNAVAILABLE', `inventory.${date}`, 'Không còn phòng sẵn sàng trong đêm này.');
    if (rates.length !== 1) quote.missingFields.push(`rates.${date}`);
    if (original.length !== 1 || original[0]!.paidVnd === null || original[0]!.creditEligibleVnd === null ||
      original[0]!.creditEligibleVnd! > original[0]!.paidVnd!) quote.missingFields.push(`originalBookingPrice.${date}`);
  }
  if (quote.missingFields.length) { quote.status = 'MISSING_DATA'; return quote; }
  if (quote.violations.length) { quote.status = 'UNAVAILABLE'; return quote; }

  const eligible = snapshot.benefits.filter((b) => b.bookingCode === booking.bookingCode && b.verifiedAt !== null &&
    Date.parse(b.verifiedAt) <= now.getTime() && Date.parse(b.validFrom) <= now.getTime() &&
    Date.parse(b.validUntil) > effective && b.roomTypeIds.includes(target.id) && policy.rules.allowedBenefitCodes.includes(b.code));
  const benefit: Benefit | undefined = input.benefitId ? eligible.find((b) => b.id === input.benefitId) :
    eligible.sort((a, b) => b.discountBps - a.discountBps || a.id.localeCompare(b.id))[0];
  if (input.benefitId && !benefit) {
    issue('BENEFIT_NOT_ELIGIBLE', 'benefitId', 'Quyền lợi chưa xác minh, hết hạn hoặc không áp dụng cho phương án này.');
    quote.status = 'INELIGIBLE'; return quote;
  }
  if (benefit) quote.benefit = { id: benefit.id, code: benefit.code, version: benefit.version, discountBps: benefit.discountBps };
  try {
    quote.breakdown = dates.map((date, index): QuoteNight => {
      const rate = snapshot.rates.find((r) => r.roomTypeId === target.id && r.date === date)!;
      const original = booking.nights.find((n) => n.date === date)!;
      const credit = basisPoints(original.creditEligibleVnd!, policy.rules.originalCreditBps);
      const fees = index === 0 ? policy.rules.changeFeeVnd : 0;
      const tax = basisPoints(sumVnd([rate.taxIncluded ? 0 : rate.priceVnd, policy.rules.feeTaxIncluded ? 0 : fees]), policy.rules.taxBps);
      const discount = benefit ? basisPoints(Math.max(rate.priceVnd - credit, 0), benefit.discountBps) : 0;
      return {
        date, availableUnits: quote.inventoryByNight[index]!.availableUnits!,
        newRoomPriceVnd: rate.priceVnd, originalPaidVnd: original.paidVnd!, eligibleOriginalCreditVnd: credit,
        additionalFeesVnd: fees, additionalTaxVnd: tax, eligibleDiscountVnd: discount,
        priceDiffVnd: sumVnd([rate.priceVnd, -credit, fees, tax, -discount]), rateTaxIncluded: rate.taxIncluded,
        sourceRefs: [rate.sourceRef, original.sourceRef, ...policy.sources.map((s) => `${policy.code}:v${policy.version}:${s.code}`)],
        sourceVersions: { booking: booking.version, inventory: quote.inventoryByNight[index]!.version!, rate: rate.version,
          policy: policy.version, benefit: benefit?.version ?? null },
      };
    });
    const sum = (key: keyof Pick<QuoteNight, 'newRoomPriceVnd' | 'eligibleOriginalCreditVnd' | 'additionalFeesVnd' | 'additionalTaxVnd' | 'eligibleDiscountVnd' | 'priceDiffVnd'>) => sumVnd(quote.breakdown.map((n) => n[key]));
    quote.totals = { newRoomTotalVnd: sum('newRoomPriceVnd'), eligibleOriginalCreditVnd: sum('eligibleOriginalCreditVnd'),
      additionalFeesVnd: sum('additionalFeesVnd'), additionalTaxVnd: sum('additionalTaxVnd'),
      eligibleDiscountVnd: sum('eligibleDiscountVnd'), priceDiffVnd: sum('priceDiffVnd') };
    quote.priceDiffVnd = quote.totals.priceDiffVnd;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    quote.status = 'MISSING_DATA'; quote.missingFields.push('financialData.safeInteger');
    quote.breakdown = []; quote.totals = null; quote.priceDiffVnd = null; return quote;
  }
  if (input.requestType === 'COMPLIMENTARY_UPGRADE' && (benefit?.discountBps !== 10_000 || quote.priceDiffVnd !== 0)) {
    issue('COMPLIMENTARY_NOT_ELIGIBLE', 'requestType', 'Không đủ điều kiện miễn phí; giữ nguyên báo giá trả phí và chuyển quản lý.');
  }
  if (quote.priceDiffVnd! < 0) issue('NEGATIVE_DIFFERENCE', 'priceDiffVnd', 'Chênh lệch âm cần quản lý xử lý theo policy; không tự hoàn tiền.');
  if (quote.priceDiffVnd! > policy.rules.maxReceptionistDiffVnd) issue('MANAGER_LIMIT', 'priceDiffVnd', 'Báo giá vượt hạn mức duyệt của lễ tân.');
  quote.approvalRole = quote.violations.length ? 'MANAGER' : 'RECEPTIONIST';
  quote.status = quote.violations.length ? 'REQUIRES_MANAGER' : 'VALID';
  return quote;
}

export function validationFailure(quote: Quote, violations: Issue[]): Quote {
  return { ...quote, status: 'VALIDATION_FAILED', totals: null, priceDiffVnd: null, breakdown: [],
    validation: { checked: true, passed: false, violations }, violations: [...quote.violations, ...violations] };
}
