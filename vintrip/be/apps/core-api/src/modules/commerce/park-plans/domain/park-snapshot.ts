import { z } from 'zod';

// Snapshot giữ nguyên key snake_case của file dữ liệu gốc để AI (Python) và core-api đọc cùng một nguồn;
// hợp đồng HTTP (request/response) vẫn dùng camelCase.
export interface ParkActivity {
  id: string;
  name: string;
  zone: string;
  duration_min: number;
  wait_min: number;
  indoor: boolean;
  intensity: string | null;
  tags: string[];
  popular: boolean;
  surcharge_vnd: number | null;
  conditions: { min_height_cm: number | null; min_age: number | null; adult_required_below_cm: number | null } | null;
}

export interface ParkShowSession {
  id: string;
  start: string | null;
  end: string | null;
}

export interface ParkSnapshot {
  snapshotId: string;
  isMock: boolean;
  park: string;
  date: string;
  timezone: string;
  open: string;
  close: string;
  source: string;
  zones: Record<string, { name: string; indoor: boolean }>;
  walk_minutes: Record<string, Record<string, number>>;
  prices: {
    gate: { tier: string; rule: string; price_vnd: number }[];
    lunch_per_person_vnd: number;
    lunch_zone: string;
    default_lunch_window: string[];
    includes: string;
  };
  activities: ParkActivity[];
  shows: { venue_zone: string; name: string; indoor: boolean; arrive_early_min: number; sessions: ParkShowSession[] };
  incidents_today: { id: string; type: string; session_id: string; reason: string }[];
}

export const MOCK_PARK_ID = 'cong-vien-mau';

const HhMm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:MM');
const TimeRange = z.tuple([HhMm, HhMm]);

export const ParkMemberSchema = z.strictObject({
  kind: z.enum(['adult', 'child']),
  label: z.string().min(1).max(60),
  age: z.number().int().min(0).max(120).nullable().optional(),
  heightCm: z.number().int().min(30).max(250).nullable().optional(),
});

export const ParkPlanRequestSchema = z.strictObject({
  members: z.array(ParkMemberSchema).min(1).max(20),
  window: TimeRange,
  budgetVnd: z.number().int().min(0).max(1_000_000_000),
  includeGate: z.boolean().default(true),
  startZone: z.string().min(1).max(40).default('GATE'),
  lunch: z.strictObject({ minDurationMin: z.number().int().min(0).max(240), window: TimeRange, beforeShow: z.boolean().default(false) })
    .nullable().default(null),
  show: z.strictObject({ required: z.boolean() }).nullable().default(null),
  requiredActivities: z.array(z.string().min(1).max(20)).max(30).default([]),
  rain: z.array(TimeRange).max(10).default([]),
  cancelledSessions: z.array(z.string().min(1).max(20)).max(20).default([]),
});

export const ParkPlanItemSchema = z.strictObject({
  kind: z.enum(['activity', 'show', 'lunch']),
  id: z.string().min(1).max(20),
  zone: z.string().min(1).max(40),
  start: HhMm,
  end: HhMm,
  name: z.string().max(120).optional(),
});

export const ValidateParkPlanRequestSchema = z.strictObject({
  parkId: z.literal(MOCK_PARK_ID),
  snapshotId: z.string().min(1).max(80),
  request: ParkPlanRequestSchema,
  items: z.array(ParkPlanItemSchema).max(40),
});

export type ParkMember = z.infer<typeof ParkMemberSchema>;
export type ParkPlanRequest = z.infer<typeof ParkPlanRequestSchema>;
export type ParkPlanItem = z.infer<typeof ParkPlanItemSchema>;
export type ValidateParkPlanRequest = z.infer<typeof ValidateParkPlanRequestSchema>;

export interface ParkPlanValidation {
  valid: boolean;
  violations: string[];
  /** Cảnh báo không làm lịch sai theo yêu cầu (vd suất diễn có trong sự cố hôm nay nhưng yêu cầu chưa khai báo huỷ). */
  warnings: string[];
  totalVnd: number;
  breakdown: { label: string; amountVnd: number }[];
  snapshotId: string;
  isMock: boolean;
  validatedBy: 'core-api';
}
