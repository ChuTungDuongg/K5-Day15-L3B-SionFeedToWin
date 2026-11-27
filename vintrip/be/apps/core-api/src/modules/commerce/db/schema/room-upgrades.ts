import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { Booking, Policy, Quote, RoomType, StaffRole } from '../../room-upgrades/domain/room-upgrade.js';
import type { AiRecommendationMetadata, NormalizedProposalRequest, PersistedQuoteStatus, ProposalAuditAction, ProposalCommandOperation, ProposalStatus } from '../../room-upgrades/domain/room-upgrade-proposal.js';
import { commerceSchema } from './commerce-schema.js';

const mockColumns = () => ({ isMock: boolean('is_mock').notNull().default(true), version: integer('version').notNull().default(1) });
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
const vnd = (name: string) => bigint(name, { mode: 'number' });

// Separate sandbox tables: catalog opening/checkout/payment jobs never see these rows.
export const upgradeHotels = commerceSchema.table('room_upgrade_hotels', {
  id: text('id').primaryKey(), name: text('name').notNull(), timezone: text('timezone').notNull(),
  fixtureVersion: text('fixture_version').notNull(), ...mockColumns(),
}, (t) => [check('ck_room_upgrade_hotels_mock_version', sql`${t.isMock} = true and ${t.version} > 0`)]);

export const upgradeRoomTypes = commerceSchema.table('room_upgrade_room_types', {
  hotelId: text('hotel_id').notNull().references(() => upgradeHotels.id), id: text('id').notNull(), name: text('name').notNull(),
  rank: integer('rank').notNull(), maxGuests: integer('max_guests').notNull(),
  features: jsonb('features').$type<RoomType['features']>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.id] }),
  check('ck_room_upgrade_room_types_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.rank} > 0 and ${t.maxGuests} > 0`)]);

export const upgradeBookings = commerceSchema.table('room_upgrade_bookings', {
  hotelId: text('hotel_id').notNull(), bookingCode: text('booking_code').notNull(), roomNumber: text('room_number').notNull(),
  roomTypeId: text('room_type_id').notNull(), status: text('status').$type<Booking['status']>().notNull(),
  checkInAt: instant('check_in_at').notNull(), checkOutAt: instant('check_out_at').notNull(),
  guests: integer('guests').notNull(), nights: jsonb('nights').$type<Booking['nights']>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.bookingCode] }),
  foreignKey({ columns: [t.hotelId, t.roomTypeId], foreignColumns: [upgradeRoomTypes.hotelId, upgradeRoomTypes.id] }),
  check('ck_room_upgrade_bookings_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.guests} > 0 and ${t.checkOutAt} > ${t.checkInAt}`),
  check('ck_room_upgrade_bookings_status', sql`${t.status} in ('IN_HOUSE', 'CONFIRMED', 'CHECKED_OUT')`)]);

export const upgradeRoomInventory = commerceSchema.table('room_upgrade_inventory', {
  hotelId: text('hotel_id').notNull(), roomTypeId: text('room_type_id').notNull(), date: date('date', { mode: 'string' }).notNull(),
  total: integer('total').notNull(), held: integer('held').notNull(), sold: integer('sold').notNull(),
  outOfService: integer('out_of_service').notNull(), stopSell: boolean('stop_sell').notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.roomTypeId, t.date] }),
  foreignKey({ columns: [t.hotelId, t.roomTypeId], foreignColumns: [upgradeRoomTypes.hotelId, upgradeRoomTypes.id] }),
  check('ck_room_upgrade_inventory_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.held} >= 0 and ${t.sold} >= 0 and ${t.outOfService} >= 0 and ${t.held} + ${t.sold} + ${t.outOfService} <= ${t.total}`)]);

export const upgradeRoomRates = commerceSchema.table('room_upgrade_rates', {
  hotelId: text('hotel_id').notNull(), roomTypeId: text('room_type_id').notNull(), date: date('date', { mode: 'string' }).notNull(),
  priceVnd: vnd('price_vnd').notNull(), taxIncluded: boolean('tax_included').notNull(), sourceRef: text('source_ref').notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.roomTypeId, t.date] }),
  foreignKey({ columns: [t.hotelId, t.roomTypeId], foreignColumns: [upgradeRoomTypes.hotelId, upgradeRoomTypes.id] }),
  check('ck_room_upgrade_rates_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.priceVnd} between 0 and 9007199254740991`)]);

export const upgradePolicies = commerceSchema.table('room_upgrade_policies', {
  hotelId: text('hotel_id').notNull().references(() => upgradeHotels.id), code: text('code').notNull(),
  validFrom: instant('valid_from').notNull(), validUntil: instant('valid_until').notNull(),
  rules: jsonb('rules').$type<Policy['rules']>().notNull(), sources: jsonb('sources').$type<Policy['sources']>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.code, t.version] }),
  check('ck_room_upgrade_policies_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.validUntil} > ${t.validFrom}`)]);

export const upgradeMemberBenefits = commerceSchema.table('room_upgrade_member_benefits', {
  hotelId: text('hotel_id').notNull(), id: text('id').notNull(), bookingCode: text('booking_code').notNull(), code: text('code').notNull(),
  verifiedAt: instant('verified_at'), validFrom: instant('valid_from').notNull(), validUntil: instant('valid_until').notNull(),
  discountBps: integer('discount_bps').notNull(), roomTypeIds: jsonb('room_type_ids').$type<string[]>().notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.id] }),
  foreignKey({ columns: [t.hotelId, t.bookingCode], foreignColumns: [upgradeBookings.hotelId, upgradeBookings.bookingCode] }),
  check('ck_room_upgrade_benefits_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.discountBps} between 0 and 10000 and ${t.validUntil} > ${t.validFrom}`)]);

export const upgradeStaffAssignments = commerceSchema.table('room_upgrade_staff_assignments', {
  hotelId: text('hotel_id').notNull().references(() => upgradeHotels.id), userId: uuid('user_id').notNull(),
  role: text('role').$type<StaffRole>().notNull(), active: boolean('active').notNull(), ...mockColumns(),
}, (t) => [primaryKey({ columns: [t.hotelId, t.userId] }),
  check('ck_room_upgrade_staff_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.role} in ('RECEPTIONIST', 'MANAGER')`)]);

// CP3 proposal persistence remains sandbox-only; revisions and audit events are append-only.
export const upgradeProposals = commerceSchema.table('room_upgrade_proposals', {
  id: uuid('id').primaryKey(),
  hotelId: text('hotel_id').notNull(), bookingCode: text('booking_code').notNull(), createdBy: uuid('created_by').notNull(),
  version: integer('version').notNull().default(1), currentRevision: integer('current_revision').notNull().default(1),
  status: text('status').$type<ProposalStatus>().notNull(),
  requiredApprovalRole: text('required_approval_role').$type<StaffRole>().notNull(),
  reasonCodes: jsonb('reason_codes').$type<string[]>().notNull().default([]),
  decidedBy: uuid('decided_by'), decidedByRole: text('decided_by_role').$type<StaffRole>(),
  decidedAt: instant('decided_at'), decisionReason: text('decision_reason'),
  expiresAt: instant('expires_at').notNull(), createdAt: instant('created_at').notNull(), updatedAt: instant('updated_at').notNull(),
  isMock: boolean('is_mock').notNull().default(true),
}, (t) => [
  unique('uq_room_upgrade_proposals_hotel_id').on(t.hotelId, t.id),
  foreignKey({ name: 'fk_room_upgrade_proposals_booking', columns: [t.hotelId, t.bookingCode], foreignColumns: [upgradeBookings.hotelId, upgradeBookings.bookingCode] }),
  check('ck_room_upgrade_proposals_values', sql`${t.isMock} = true and ${t.version} > 0 and ${t.currentRevision} > 0 and ${t.version} >= ${t.currentRevision}`),
  check('ck_room_upgrade_proposals_status', sql`${t.status} in ('DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED')`),
  check('ck_room_upgrade_proposals_role', sql`${t.requiredApprovalRole} in ('RECEPTIONIST', 'MANAGER') and (${t.decidedByRole} is null or ${t.decidedByRole} in ('RECEPTIONIST', 'MANAGER'))`),
  index('idx_room_upgrade_proposals_queue').on(t.hotelId, t.status, t.updatedAt),
  index('idx_room_upgrade_proposals_booking').on(t.hotelId, t.bookingCode, t.createdAt),
]);

export const upgradeProposalRevisions = commerceSchema.table('room_upgrade_proposal_revisions', {
  hotelId: text('hotel_id').notNull(), proposalId: uuid('proposal_id').notNull(), revisionNumber: integer('revision_number').notNull(),
  normalizedRequest: jsonb('normalized_request').$type<NormalizedProposalRequest>().notNull(),
  targetRoomTypeId: text('target_room_type_id').notNull(), effectiveAt: instant('effective_at').notNull(),
  quote: jsonb('quote').$type<Quote>().notNull(), breakdown: jsonb('breakdown').$type<Quote['breakdown']>().notNull(),
  policySources: jsonb('policy_sources').$type<NonNullable<Quote['policy']>['sources']>().notNull(),
  policyCode: text('policy_code').notNull(), policyVersion: integer('policy_version').notNull(),
  fixtureVersion: text('fixture_version').notNull(), snapshotId: text('snapshot_id').notNull(),
  businessFingerprint: text('business_fingerprint').notNull(), priceDiffVnd: vnd('price_diff_vnd').notNull(),
  quoteStatus: text('quote_status').$type<PersistedQuoteStatus>().notNull(),
  requiredApprovalRole: text('required_approval_role').$type<StaffRole>().notNull(),
  calculatedAt: instant('calculated_at').notNull(), expiresAt: instant('expires_at').notNull(),
  aiMetadata: jsonb('ai_metadata').$type<AiRecommendationMetadata | null>(),
  createdBy: uuid('created_by').notNull(), createdAt: instant('created_at').notNull(),
  isMock: boolean('is_mock').notNull().default(true),
}, (t) => [
  primaryKey({ columns: [t.proposalId, t.revisionNumber] }),
  foreignKey({ name: 'fk_room_upgrade_revisions_proposal', columns: [t.hotelId, t.proposalId], foreignColumns: [upgradeProposals.hotelId, upgradeProposals.id] }),
  foreignKey({ name: 'fk_room_upgrade_revisions_target_room', columns: [t.hotelId, t.targetRoomTypeId], foreignColumns: [upgradeRoomTypes.hotelId, upgradeRoomTypes.id] }),
  check('ck_room_upgrade_revisions_values', sql`${t.isMock} = true and ${t.revisionNumber} > 0 and ${t.policyVersion} > 0 and ${t.priceDiffVnd} between -9007199254740991 and 9007199254740991`),
  check('ck_room_upgrade_revisions_status', sql`${t.quoteStatus} in ('VALID', 'REQUIRES_MANAGER') and ${t.requiredApprovalRole} in ('RECEPTIONIST', 'MANAGER')`),
  index('idx_room_upgrade_revisions_hotel_proposal').on(t.hotelId, t.proposalId, t.revisionNumber),
]);

export const upgradeProposalAuditEvents = commerceSchema.table('room_upgrade_proposal_audit_events', {
  id: uuid('id').primaryKey(), hotelId: text('hotel_id').notNull(), proposalId: uuid('proposal_id').notNull(),
  proposalVersion: integer('proposal_version').notNull(), revisionNumber: integer('revision_number').notNull(),
  actorUserId: uuid('actor_user_id').notNull(), actorRole: text('actor_role').$type<StaffRole>().notNull(),
  action: text('action').$type<ProposalAuditAction>().notNull(),
  previousStatus: text('previous_status').$type<ProposalStatus | null>(), newStatus: text('new_status').$type<ProposalStatus>().notNull(),
  reason: text('reason'), reasonCodes: jsonb('reason_codes').$type<string[]>().notNull().default([]),
  requestId: text('request_id').notNull(), idempotencyKeyHash: text('idempotency_key_hash'),
  createdAt: instant('created_at').notNull(), isMock: boolean('is_mock').notNull().default(true),
}, (t) => [
  foreignKey({ name: 'fk_room_upgrade_audit_proposal', columns: [t.hotelId, t.proposalId], foreignColumns: [upgradeProposals.hotelId, upgradeProposals.id] }),
  check('ck_room_upgrade_audit_values', sql`${t.isMock} = true and ${t.proposalVersion} > 0 and ${t.revisionNumber} > 0`),
  check('ck_room_upgrade_audit_action', sql`${t.action} in ('CREATED', 'REVISED', 'APPROVED', 'REJECTED', 'ESCALATED', 'MARKED_EXPIRED', 'MARKED_REQUOTE_REQUIRED')`),
  check('ck_room_upgrade_audit_roles_status', sql`${t.actorRole} in ('RECEPTIONIST', 'MANAGER') and (${t.previousStatus} is null or ${t.previousStatus} in ('DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED')) and ${t.newStatus} in ('DRAFT', 'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUOTE_REQUIRED')`),
  index('idx_room_upgrade_audit_history').on(t.hotelId, t.proposalId, t.createdAt, t.proposalVersion),
]);

export const upgradeProposalIdempotency = commerceSchema.table('room_upgrade_proposal_idempotency', {
  hotelId: text('hotel_id').notNull().references(() => upgradeHotels.id), actorUserId: uuid('actor_user_id').notNull(),
  operation: text('operation').$type<ProposalCommandOperation>().notNull(), targetId: text('target_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(), payloadHash: text('payload_hash').notNull(),
  proposalId: uuid('proposal_id').notNull(), httpStatus: integer('http_status').notNull(),
  responseBody: jsonb('response_body').$type<Record<string, unknown>>().notNull(),
  createdAt: instant('created_at').notNull(), isMock: boolean('is_mock').notNull().default(true),
}, (t) => [
  primaryKey({ name: 'room_upgrade_proposal_idempotency_pkey', columns: [t.hotelId, t.actorUserId, t.operation, t.targetId, t.idempotencyKey] }),
  foreignKey({ name: 'fk_room_upgrade_idempotency_proposal', columns: [t.hotelId, t.proposalId], foreignColumns: [upgradeProposals.hotelId, upgradeProposals.id] }),
  check('ck_room_upgrade_idempotency_values', sql`${t.isMock} = true and ${t.httpStatus} in (200, 201, 409) and ${t.operation} in ('CREATE', 'REVISE', 'APPROVE', 'REJECT', 'ESCALATE')`),
]);
