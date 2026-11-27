import { z } from 'zod';

const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const version = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });
const mock = { isMock: z.literal(true), version };
const id = z.string().min(1).max(100);

export const PolicyRulesSchema = z.strictObject({
  nightRule: z.literal('FULL_LOCAL_NIGHT'),
  originalCreditBps: z.number().int().min(0).max(10_000),
  changeFeeVnd: amount,
  feeTaxIncluded: z.boolean(),
  taxBps: z.number().int().min(0).max(10_000),
  maxNights: z.number().int().min(1).max(90),
  quoteTtlMinutes: z.number().int().min(1).max(60),
  maxReceptionistDiffVnd: amount,
  allowedTransitions: z.array(z.strictObject({ from: id, to: id })),
  allowedBenefitCodes: z.array(id),
});
export type PolicyRules = z.infer<typeof PolicyRulesSchema>;

export const HotelSchema = z.strictObject({
  ...mock, id, name: z.string(), timezone: z.string(), fixtureVersion: id,
});
export const RoomTypeSchema = z.strictObject({
  ...mock, id, hotelId: id, name: z.string(), rank: version,
  maxGuests: z.number().int().positive(), features: z.array(id),
});
export const BookingSchema = z.strictObject({
  ...mock, hotelId: id, bookingCode: id, roomNumber: id, roomTypeId: id,
  status: z.enum(['IN_HOUSE', 'CONFIRMED', 'CHECKED_OUT']),
  checkInAt: instant, checkOutAt: instant, guests: z.number().int().positive(),
  nights: z.array(z.strictObject({
    date: z.iso.date(), paidVnd: amount.nullable(), creditEligibleVnd: amount.nullable(),
    taxIncluded: z.literal(true), sourceRef: id,
  })),
});
export const InventorySchema = z.strictObject({
  ...mock, hotelId: id, roomTypeId: id, date: z.iso.date(),
  total: amount, held: amount, sold: amount, outOfService: amount, stopSell: z.boolean(),
}).refine((v) => v.held + v.sold + v.outOfService <= v.total, 'Invalid inventory counters');
export const RateSchema = z.strictObject({
  ...mock, hotelId: id, roomTypeId: id, date: z.iso.date(), priceVnd: amount,
  taxIncluded: z.boolean(), sourceRef: id,
});
export const PolicySchema = z.strictObject({
  ...mock, hotelId: id, code: id, validFrom: instant, validUntil: instant,
  rules: PolicyRulesSchema,
  sources: z.array(z.strictObject({ code: id, clause: z.string().min(1) })).min(1),
});
export const BenefitSchema = z.strictObject({
  ...mock, id, hotelId: id, bookingCode: id, code: id,
  verifiedAt: instant.nullable(), validFrom: instant, validUntil: instant,
  discountBps: z.number().int().min(0).max(10_000), roomTypeIds: z.array(id),
});
export const SnapshotSchema = z.strictObject({
  hotel: HotelSchema, roomTypes: z.array(RoomTypeSchema), bookings: z.array(BookingSchema),
  inventory: z.array(InventorySchema), rates: z.array(RateSchema),
  policies: z.array(PolicySchema), benefits: z.array(BenefitSchema),
});
export type Hotel = z.infer<typeof HotelSchema>;
export type RoomType = z.infer<typeof RoomTypeSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type Inventory = z.infer<typeof InventorySchema>;
export type Rate = z.infer<typeof RateSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Benefit = z.infer<typeof BenefitSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type StaffRole = 'RECEPTIONIST' | 'MANAGER';

// Authority, money and status are deliberately absent. Unknown input keys are rejected.
export const QuoteRequestSchema = z.strictObject({
  hotelId: id,
  bookingCode: id.optional(), roomNumber: id.optional(), targetRoomTypeId: id.optional(),
  effectiveAt: instant.optional(),
  requestType: z.enum(['UPGRADE', 'ROOM_CHANGE', 'COMPLIMENTARY_UPGRADE']).default('UPGRADE'),
  requiredFeatures: z.array(id).max(10).default([]), benefitId: id.optional(),
}).refine((v) => !(v.bookingCode && v.roomNumber), 'Use bookingCode or roomNumber, not both');
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;
export type Issue = { code: string; field: string; message: string };
export type QuoteStatus = 'VALID' | 'NEEDS_INPUT' | 'MISSING_DATA' | 'INELIGIBLE' | 'UNAVAILABLE' | 'REQUIRES_MANAGER' | 'VALIDATION_FAILED';
export interface QuoteNight {
  date: string;
  availableUnits: number;
  newRoomPriceVnd: number;
  originalPaidVnd: number;
  eligibleOriginalCreditVnd: number;
  additionalFeesVnd: number;
  additionalTaxVnd: number;
  eligibleDiscountVnd: number;
  priceDiffVnd: number;
  rateTaxIncluded: boolean;
  sourceRefs: string[];
  sourceVersions: { booking: number; inventory: number; rate: number; policy: number; benefit: number | null };
}
export interface QuoteTotals {
  newRoomTotalVnd: number;
  eligibleOriginalCreditVnd: number;
  additionalFeesVnd: number;
  additionalTaxVnd: number;
  eligibleDiscountVnd: number;
  priceDiffVnd: number;
}
export interface Quote {
  caseId: 'C2'; requestId: string; quoteId: string; hotelId: string;
  bookingCode: string | null; targetRoomTypeId: string | null;
  status: QuoteStatus; currency: 'VND'; isMock: true;
  snapshotId: string; fixtureVersion: string; calculatedAt: string; expiresAt: string | null;
  effectiveAt: string | null; timezone: string; remainingNights: number | null;
  approvalRole: StaffRole | null;
  policy: Pick<Policy, 'code' | 'version' | 'sources'> | null;
  benefit: Pick<Benefit, 'id' | 'code' | 'version' | 'discountBps'> | null;
  breakdown: QuoteNight[]; totals: QuoteTotals | null; priceDiffVnd: number | null;
  inventoryByNight: { date: string; availableUnits: number | null; stopSell: boolean | null; version: number | null }[];
  missingFields: string[]; violations: Issue[];
  validation: { checked: boolean; passed: boolean; violations: Issue[] };
  requiresHumanApproval: true;
  operationalEffects: 'NONE';
}
