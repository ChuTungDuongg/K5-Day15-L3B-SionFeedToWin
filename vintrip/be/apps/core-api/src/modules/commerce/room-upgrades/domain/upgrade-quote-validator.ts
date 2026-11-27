import type { Issue, Quote, QuoteRequest, Snapshot } from './room-upgrade.js';
import { localDate, nightDates } from './quote-primitives.js';

/** Re-read source rows and recompute independently; never call the pricing engine. */
export function validateQuote(snapshot: Snapshot, input: QuoteRequest, quote: Quote, now: Date, snapshotId: string): Issue[] {
  const issues: Issue[] = [];
  const fail = (field: string) => issues.push({ code: 'INDEPENDENT_VALIDATION_FAILED', field, message: 'Báo giá không khớp dữ liệu nguồn hoặc policy.' });
  const booking = snapshot.bookings.find((b) => b.bookingCode === quote.bookingCode);
  const target = snapshot.roomTypes.find((r) => r.id === input.targetRoomTypeId);
  const current = snapshot.roomTypes.find((r) => r.id === booking?.roomTypeId);
  const effective = Date.parse(input.effectiveAt ?? '');
  const activePolicies = snapshot.policies.filter((p) => Date.parse(p.validFrom) <= now.getTime() && Date.parse(p.validUntil) > effective)
    .sort((a, b) => b.version - a.version);
  const policy = activePolicies[0];
  if (!booking || !target || !current || !policy || !quote.totals || !Number.isFinite(effective)) {
    fail('sourceContext'); return issues;
  }
  if (activePolicies[1]?.version === policy.version) fail('policy.uniqueVersion');
  if (input.hotelId !== snapshot.hotel.id || quote.hotelId !== input.hotelId || quote.targetRoomTypeId !== target.id ||
    quote.effectiveAt !== input.effectiveAt || quote.snapshotId !== snapshotId || quote.currency !== 'VND' || quote.isMock !== true ||
    quote.caseId !== 'C2' || !quote.requiresHumanApproval || quote.operationalEffects !== 'NONE' ||
    quote.missingFields.length || quote.fixtureVersion !== snapshot.hotel.fixtureVersion || quote.timezone !== snapshot.hotel.timezone) fail('identity');
  if ((input.bookingCode && input.bookingCode !== booking.bookingCode) || (input.roomNumber && input.roomNumber !== booking.roomNumber)) fail('bookingReference');
  if (booking.status !== 'IN_HOUSE' || Date.parse(booking.checkInAt) > now.getTime() || Date.parse(booking.checkOutAt) <= now.getTime() ||
    effective < now.getTime() || effective < Date.parse(booking.checkInAt) || effective >= Date.parse(booking.checkOutAt)) fail('stay');
  if (target.maxGuests < booking.guests || input.requiredFeatures.some((f) => !target.features.includes(f)) ||
    !policy.rules.allowedTransitions.some((t) => t.from === current.id && t.to === target.id) || current.id === target.id ||
    (input.requestType !== 'ROOM_CHANGE' && target.rank <= current.rank)) fail('eligibility');
  if (quote.policy?.code !== policy.code || quote.policy.version !== policy.version ||
    JSON.stringify(quote.policy.sources) !== JSON.stringify(policy.sources)) fail('policy');
  const dates = nightDates(localDate(input.effectiveAt!, snapshot.hotel.timezone), localDate(booking.checkOutAt, snapshot.hotel.timezone));
  if (!dates.length || dates.length > policy.rules.maxNights || quote.remainingNights !== dates.length || quote.breakdown.length !== dates.length ||
    quote.inventoryByNight.length !== dates.length) fail('nights');
  const expiry = Math.min(now.getTime() + policy.rules.quoteTtlMinutes * 60_000, Date.parse(policy.validUntil), Date.parse(booking.checkOutAt));
  if (quote.calculatedAt !== now.toISOString() || Date.parse(quote.expiresAt ?? '') !== expiry) fail('expiry');
  const eligible = snapshot.benefits.filter((b) => b.bookingCode === booking.bookingCode && b.verifiedAt !== null &&
    Date.parse(b.verifiedAt) <= now.getTime() && Date.parse(b.validFrom) <= now.getTime() && Date.parse(b.validUntil) > effective &&
    b.roomTypeIds.includes(target.id) && policy.rules.allowedBenefitCodes.includes(b.code));
  const benefit = input.benefitId ? eligible.find((b) => b.id === input.benefitId) :
    eligible.sort((a, b) => b.discountBps - a.discountBps || a.id.localeCompare(b.id))[0];
  if ((input.benefitId && !benefit) || (quote.benefit?.id ?? null) !== (benefit?.id ?? null) ||
    (benefit && (quote.benefit?.version !== benefit.version || quote.benefit.discountBps !== benefit.discountBps || quote.benefit.code !== benefit.code))) fail('benefit');

  // A separate integer implementation catches line omissions, arithmetic errors and tampered totals.
  const rounded = (value: bigint, bps: number) => (value * BigInt(bps) + 5_000n) / 10_000n;
  const sums = { newRoomTotalVnd: 0n, eligibleOriginalCreditVnd: 0n, additionalFeesVnd: 0n,
    additionalTaxVnd: 0n, eligibleDiscountVnd: 0n, priceDiffVnd: 0n };
  dates.forEach((date, index) => {
    const rates = snapshot.rates.filter((r) => r.date === date && r.roomTypeId === target.id);
    const originals = booking.nights.filter((n) => n.date === date);
    const inventories = snapshot.inventory.filter((v) => v.date === date && v.roomTypeId === target.id);
    const line = quote.breakdown[index];
    if (rates.length !== 1 || originals.length !== 1 || inventories.length !== 1 || !line) { fail(`source.${date}`); return; }
    const rate = rates[0]!; const original = originals[0]!; const inventory = inventories[0]!;
    if (original.paidVnd === null || original.creditEligibleVnd === null || original.creditEligibleVnd > original.paidVnd) { fail(`credit.${date}`); return; }
    const remaining = inventory.total - inventory.held - inventory.sold - inventory.outOfService;
    if (remaining < 1 || inventory.stopSell || line.availableUnits !== remaining) fail(`inventory.${date}`);
    const shownInventory = quote.inventoryByNight[index];
    if (shownInventory?.date !== date || shownInventory.availableUnits !== remaining || shownInventory.stopSell !== inventory.stopSell || shownInventory.version !== inventory.version) fail(`inventoryDisplay.${date}`);
    const price = BigInt(rate.priceVnd);
    const credit = rounded(BigInt(original.creditEligibleVnd), policy.rules.originalCreditBps);
    const fees = index === 0 ? BigInt(policy.rules.changeFeeVnd) : 0n;
    const taxes = rounded((rate.taxIncluded ? 0n : price) + (policy.rules.feeTaxIncluded ? 0n : fees), policy.rules.taxBps);
    const discount = benefit ? rounded(price > credit ? price - credit : 0n, benefit.discountBps) : 0n;
    const diff = price - credit + fees + taxes - discount;
    const expected = { newRoomPriceVnd: price, originalPaidVnd: BigInt(original.paidVnd), eligibleOriginalCreditVnd: credit,
      additionalFeesVnd: fees, additionalTaxVnd: taxes, eligibleDiscountVnd: discount, priceDiffVnd: diff };
    for (const [key, value] of Object.entries(expected)) {
      const actual = line[key as keyof typeof expected];
      if (!Number.isSafeInteger(actual) || BigInt(actual) !== value) fail(`${key}.${date}`);
    }
    const refs = [rate.sourceRef, original.sourceRef, ...policy.sources.map((s) => `${policy.code}:v${policy.version}:${s.code}`)];
    if (line.date !== date || line.rateTaxIncluded !== rate.taxIncluded || JSON.stringify(line.sourceRefs) !== JSON.stringify(refs) ||
      JSON.stringify(line.sourceVersions) !== JSON.stringify({ booking: booking.version, inventory: inventory.version,
        rate: rate.version, policy: policy.version, benefit: benefit?.version ?? null })) fail(`provenance.${date}`);
    sums.newRoomTotalVnd += price; sums.eligibleOriginalCreditVnd += credit; sums.additionalFeesVnd += fees;
    sums.additionalTaxVnd += taxes; sums.eligibleDiscountVnd += discount; sums.priceDiffVnd += diff;
  });
  for (const key of Object.keys(sums) as (keyof typeof sums)[]) {
    const actual = quote.totals[key];
    if (!Number.isSafeInteger(actual) || BigInt(actual) !== sums[key]) fail(`totals.${key}`);
  }
  if (!Number.isSafeInteger(quote.priceDiffVnd) || BigInt(quote.priceDiffVnd!) !== sums.priceDiffVnd) fail('priceDiffVnd');
  const manager = sums.priceDiffVnd < 0n || sums.priceDiffVnd > BigInt(policy.rules.maxReceptionistDiffVnd) ||
    (input.requestType === 'COMPLIMENTARY_UPGRADE' && (benefit?.discountBps !== 10_000 || sums.priceDiffVnd !== 0n));
  if (quote.status !== (manager ? 'REQUIRES_MANAGER' : 'VALID') || quote.approvalRole !== (manager ? 'MANAGER' : 'RECEPTIONIST')) fail('approvalRequirement');
  return issues;
}
