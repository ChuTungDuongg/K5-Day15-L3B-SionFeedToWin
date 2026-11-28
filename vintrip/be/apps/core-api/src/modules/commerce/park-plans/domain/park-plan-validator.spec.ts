import { describe, expect, it } from 'vitest';
import { CONG_VIEN_MAU_SNAPSHOT as snapshot } from '../infra/cong-vien-mau.snapshot.js';
import { calculateGateLines, formatVnd, validateParkPlan } from './park-plan-validator.js';
import { ParkPlanRequestSchema, type ParkPlanItem } from './park-snapshot.js';

const family = ParkPlanRequestSchema.parse({
  members: [
    { kind: 'adult', label: 'Người lớn 1' },
    { kind: 'adult', label: 'Người lớn 2' },
    { kind: 'child', label: 'Bé 1', age: 7, heightCm: 122 },
  ],
  window: ['09:00', '14:00'],
  budgetVnd: 1_400_000,
  lunch: { minDurationMin: 45, window: ['11:00', '14:00'] },
});
const goodPlan: ParkPlanItem[] = [
  { kind: 'activity', id: 'A1', zone: 'KHU_A', start: '09:05', end: '10:15' },
  { kind: 'lunch', id: 'LUNCH', zone: 'FOOD', start: '11:00', end: '11:45' },
];

describe('validateParkPlan (C1, kiểm độc lập trên snapshot core-api)', () => {
  it('chấp nhận lịch đúng giờ, đủ đi bộ và tính lại bảng tiền từ snapshot', () => {
    const result = validateParkPlan(snapshot, goodPlan, family);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.breakdown).toEqual([
      { label: 'Vé cổng 2 người lớn', amountVnd: 600_000 },
      { label: 'Vé cổng 1 trẻ em', amountVnd: 175_000 },
      { label: 'Phụ thu Tham quan Khu A – Vườn sinh thái', amountVnd: 100_000 },
      { label: 'Ăn trưa 3 người', amountVnd: 240_000 },
    ]);
    expect(result.totalVnd).toBe(1_115_000);
    expect(result).toMatchObject({ snapshotId: snapshot.snapshotId, isMock: true, validatedBy: 'core-api' });
  });

  it('báo vi phạm khi ngoài giờ mở cửa và thiếu thời gian chờ + chơi', () => {
    const result = validateParkPlan(snapshot, [
      { kind: 'activity', id: 'A1', zone: 'KHU_A', start: '08:30', end: '09:00' },
    ], { ...family, window: ['08:00', '14:00'], lunch: null });
    expect(result.valid).toBe(false);
    const text = result.violations.join('\n');
    expect(text).toMatch(/ngoài khung giờ có mặt \/ giờ mở cửa/);
    expect(text).toMatch(/cần 10 phút chờ \+ 60 phút chơi/);
  });

  it('báo vi phạm khi không đủ phút đi bộ giữa hai khu', () => {
    const result = validateParkPlan(snapshot, [
      { kind: 'activity', id: 'A1', zone: 'KHU_A', start: '09:00', end: '10:10' },
    ], { ...family, lunch: null });
    expect(result.violations.join('\n')).toMatch(/cần 5 phút đi bộ từ Cổng chính sau 09:00/);
  });

  it('không tin số do AI gửi: vượt ngân sách bị chặn dù lịch khớp giờ', () => {
    const result = validateParkPlan(snapshot, goodPlan, { ...family, budgetVnd: 900_000 });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Tổng 1.115.000đ vượt ngân sách 900.000đ');
  });

  it('báo trò thiếu giá, hoạt động lạ và yêu cầu bắt buộc bị bỏ', () => {
    const missingPrice = snapshot.activities.find((activity) => activity.surcharge_vnd === null)!;
    const result = validateParkPlan(snapshot, [
      { kind: 'activity', id: missingPrice.id, zone: missingPrice.zone, start: '09:30', end: '11:00' },
      { kind: 'activity', id: 'ZZ', zone: 'KHU_A', start: '11:30', end: '12:00' },
    ], { ...family, lunch: null, requiredActivities: ['A1'], show: { required: true } });
    const text = result.violations.join('\n');
    expect(text).toContain(`Catalog thiếu giá cho ${missingPrice.name}`);
    expect(text).toContain('Hoạt động ZZ không có trong snapshot');
    expect(text).toContain('Thiếu hoạt động bắt buộc A1');
    expect(text).toContain('Thiếu suất diễn bắt buộc');
  });

  it('suất diễn đã huỷ là vi phạm; sự cố hôm nay chưa khai báo chỉ là cảnh báo', () => {
    const cancelledSession = snapshot.incidents_today[0]!.session_id;
    const session = snapshot.shows.sessions.find((candidate) => candidate.id === cancelledSession)!;
    const item: ParkPlanItem = { kind: 'show', id: session.id, zone: 'STAGE', start: session.start!, end: session.end! };
    const request = { ...family, lunch: null };
    const warned = validateParkPlan(snapshot, [item], request);
    expect(warned.warnings).toHaveLength(1);
    expect(warned.violations.join('\n')).not.toContain('đã huỷ');
    const blocked = validateParkPlan(snapshot, [item], { ...request, cancelledSessions: [cancelledSession] });
    expect(blocked.violations).toContain(`Suất diễn ${session.start} đã huỷ theo get_park_incidents`);
  });

  it('chiều cao của từng bé được kiểm với điều kiện trò', () => {
    const tall = snapshot.activities.find((activity) => (activity.conditions?.min_height_cm ?? 0) > 122)!;
    const result = validateParkPlan(snapshot, [
      { kind: 'activity', id: tall.id, zone: tall.zone, start: '09:30', end: '12:00' },
    ], { ...family, lunch: null, budgetVnd: 5_000_000 });
    expect(result.violations.join('\n')).toContain(`Bé 1 cao 122cm < ${tall.conditions!.min_height_cm}cm yêu cầu của ${tall.name}`);
  });

  it('vé cổng theo chiều cao: dưới 100cm miễn phí, từ 140cm tính người lớn', () => {
    expect(calculateGateLines(snapshot, [
      { kind: 'child', label: 'Bé nhỏ', heightCm: 95 },
      { kind: 'child', label: 'Bé lớn', heightCm: 145 },
    ])).toEqual([
      { label: 'Vé cổng 1 người lớn', amountVnd: 300_000 },
      { label: 'Vé cổng 1 miễn phí', amountVnd: 0 },
    ]);
    expect(formatVnd(1_234_567)).toBe('1.234.567đ');
  });
});
