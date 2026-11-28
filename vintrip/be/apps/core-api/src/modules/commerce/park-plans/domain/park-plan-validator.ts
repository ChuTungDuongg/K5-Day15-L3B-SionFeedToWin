import type {
  ParkActivity,
  ParkMember,
  ParkPlanItem,
  ParkPlanRequest,
  ParkPlanValidation,
  ParkSnapshot,
} from './park-snapshot.js';

// Người lớn không ghi chiều cao: coi như đủ mọi giới hạn chiều cao dành cho trẻ em.
const ADULT_HEIGHT_CM = 150;
const GATE_TIER_ORDER = ['người lớn', 'trẻ em', 'miễn phí'] as const;
type GateTier = (typeof GATE_TIER_ORDER)[number];

export function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours! * 60 + minutes!;
}

export function toHhMm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function formatVnd(amountVnd: number): string {
  return `${String(amountVnd).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

export function findWalkMinutes(snapshot: ParkSnapshot, from: string, to: string): number | null {
  if (from === to) return 0;
  const table = snapshot.walk_minutes;
  return table[from]?.[to] || table[to]?.[from] || null;
}

function overlaps(start: number, end: number, windows: readonly (readonly [string, string])[]): boolean {
  return windows.some(([a, b]) => start < toMinutes(b) && end > toMinutes(a));
}

/** Lý do một hoạt động không hợp với cả nhóm; rỗng nghĩa là mọi thành viên chơi được. */
export function listEligibilityProblems(activity: ParkActivity, members: readonly ParkMember[]): string[] {
  if (activity.conditions === null) return [`${activity.name}: thiếu dữ liệu điều kiện tham gia (MISSING_DATA)`];
  const conditions = activity.conditions;
  const hasAdult = members.some((member) => member.kind === 'adult');
  const problems: string[] = [];
  for (const member of members) {
    const height = member.heightCm || (member.kind === 'adult' ? ADULT_HEIGHT_CM : null);
    const age = member.age ?? null;
    if (conditions.min_height_cm && (height === null || height < conditions.min_height_cm)) {
      problems.push(height
        ? `${member.label} cao ${height}cm < ${conditions.min_height_cm}cm yêu cầu của ${activity.name}`
        : `${member.label} chưa có chiều cao để kiểm ${activity.name}`);
    }
    if (conditions.min_age && member.kind === 'child' && (age === null || age < conditions.min_age)) {
      problems.push(`${member.label} ${age} tuổi < ${conditions.min_age} tuổi yêu cầu của ${activity.name}`);
    }
    const below = conditions.adult_required_below_cm;
    if (below && member.kind === 'child' && height && height < below && !hasAdult) {
      problems.push(`${member.label} dưới ${below}cm cần người lớn đi cùng ở ${activity.name}`);
    }
  }
  return problems;
}

function classifyGateTier(member: ParkMember): GateTier {
  const height = member.heightCm ?? null;
  if (member.kind === 'adult' || (height ?? 0) >= 140) return 'người lớn';
  if (height !== null && height < 100) return 'miễn phí';
  return 'trẻ em';
}

/** Vé cổng theo nhóm khách, giá đọc từ bảng giá trong snapshot. */
export function calculateGateLines(snapshot: ParkSnapshot, members: readonly ParkMember[]): { label: string; amountVnd: number }[] {
  const priceByTier = new Map(snapshot.prices.gate.map((row) => [row.tier, row.price_vnd]));
  const counts = new Map<GateTier, number>();
  for (const member of members) {
    const tier = classifyGateTier(member);
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }
  return GATE_TIER_ORDER.filter((tier) => counts.has(tier)).map((tier) => {
    const count = counts.get(tier)!;
    return { label: `Vé cổng ${count} ${tier}`, amountVnd: count * (priceByTier.get(tier) ?? 0) };
  });
}

/**
 * Kiểm độc lập một lịch Công viên Mẫu: tính lại mọi ràng buộc trên snapshot của core-api, không tin số
 * do bộ lập lịch của AI gửi lên. Quy tắc giữ khớp `validate_plan` của codebase/park_engine.py.
 */
export function validateParkPlan(snapshot: ParkSnapshot, items: readonly ParkPlanItem[], request: ParkPlanRequest): ParkPlanValidation {
  const members = request.members;
  const violations: string[] = [];
  const warnings: string[] = [];
  const breakdown: { label: string; amountVnd: number }[] = [];
  const windowStart = toMinutes(request.window[0]);
  const windowEnd = toMinutes(request.window[1]);
  const openAt = toMinutes(snapshot.open);
  const closeAt = toMinutes(snapshot.close);
  const arriveEarly = snapshot.shows.arrive_early_min;
  const cancelled = new Set(request.cancelledSessions);
  const incidentSessions = new Map(snapshot.incidents_today.map((incident) => [incident.session_id, incident.reason]));
  const zoneName = (zone: string) => snapshot.zones[zone]?.name ?? zone;
  let currentTime = windowStart;
  let currentZone = request.startZone;
  const showItems: ParkPlanItem[] = [];
  const lunchItems: ParkPlanItem[] = [];

  const ordered = [...items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (const item of ordered) {
    const start = toMinutes(item.start);
    const end = toMinutes(item.end);
    const label = item.name || item.id;
    if (end <= start) violations.push(`${label} ${item.start}–${item.end} có giờ kết thúc không sau giờ bắt đầu`);
    if (start < Math.max(windowStart, openAt) || end > Math.min(windowEnd, closeAt)) {
      violations.push(`${label} ${item.start}–${item.end} nằm ngoài khung giờ có mặt / giờ mở cửa`);
    }
    let walkNeeded = findWalkMinutes(snapshot, currentZone, item.zone);
    if (walkNeeded === null) {
      violations.push(`Không có dữ liệu đi bộ ${currentZone} → ${item.zone}`);
      walkNeeded = 0;
    }
    if (start < currentTime + walkNeeded && item.kind !== 'show') {
      violations.push(`${label} bắt đầu ${item.start} nhưng cần ${walkNeeded} phút đi bộ từ ${zoneName(currentZone)} sau ${toHhMm(currentTime)}`);
    }
    if (item.kind === 'activity') {
      const activity = snapshot.activities.find((candidate) => candidate.id === item.id);
      if (!activity) {
        violations.push(`Hoạt động ${item.id} không có trong snapshot`);
        continue;
      }
      if (activity.zone !== item.zone) violations.push(`${activity.name} thuộc ${zoneName(activity.zone)}, không phải ${zoneName(item.zone)}`);
      violations.push(...listEligibilityProblems(activity, members));
      if (end - start < activity.wait_min + activity.duration_min) {
        violations.push(`${activity.name} cần ${activity.wait_min} phút chờ + ${activity.duration_min} phút chơi`);
      }
      if (!activity.indoor && overlaps(start, end, request.rain)) violations.push(`${activity.name} ngoài trời trùng khoảng mưa`);
      if (activity.surcharge_vnd === null) violations.push(`Catalog thiếu giá cho ${activity.name}`);
      else if (activity.surcharge_vnd) breakdown.push({ label: `Phụ thu ${activity.name}`, amountVnd: activity.surcharge_vnd });
    } else if (item.kind === 'show') {
      const session = snapshot.shows.sessions.find((candidate) => candidate.id === item.id);
      if (!session || session.start !== item.start || session.end !== item.end) {
        violations.push(`Suất diễn ${item.id} ${item.start} không đúng lịch snapshot`);
      }
      if (cancelled.has(item.id)) violations.push(`Suất diễn ${item.start} đã huỷ theo get_park_incidents`);
      else if (incidentSessions.has(item.id)) {
        warnings.push(`Suất diễn ${item.start} có trong sự cố hôm nay (${incidentSessions.get(item.id)}); kiểm lại trước khi đi`);
      }
      if (currentTime + walkNeeded > start - arriveEarly) {
        violations.push(`Đến sân khấu lúc ${toHhMm(currentTime + walkNeeded)}, muộn hơn giờ phải có mặt ${toHhMm(start - arriveEarly)} (đến sớm ${arriveEarly} phút)`);
      }
      if (!snapshot.shows.indoor && overlaps(start, end, request.rain)) violations.push(`Show ngoài trời ${item.start} trùng khoảng mưa`);
      showItems.push(item);
    } else {
      const lunch = request.lunch ?? { minDurationMin: 0, window: request.window, beforeShow: false };
      if (item.zone !== snapshot.prices.lunch_zone) violations.push(`Ăn trưa phải ở ${zoneName(snapshot.prices.lunch_zone)}`);
      if (end - start < lunch.minDurationMin) violations.push(`Ăn trưa ${end - start} phút, cần liên tục ≥ ${lunch.minDurationMin} phút`);
      if (start < toMinutes(lunch.window[0]) || end > toMinutes(lunch.window[1])) {
        violations.push(`Ăn trưa ${item.start}–${item.end} ngoài khoảng ${lunch.window[0]}–${lunch.window[1]}`);
      }
      lunchItems.push(item);
    }
    currentTime = Math.max(currentTime, end);
    currentZone = item.zone;
  }

  if (request.show?.required && showItems.length === 0) violations.push('Thiếu suất diễn bắt buộc');
  if (request.lunch && lunchItems.length === 0) violations.push('Thiếu khoảng ăn trưa bắt buộc');
  if (request.lunch?.beforeShow && showItems[0] && lunchItems[0]) {
    const walkToStage = findWalkMinutes(snapshot, snapshot.prices.lunch_zone, snapshot.shows.venue_zone) ?? 0;
    if (toMinutes(lunchItems[0].end) + walkToStage > toMinutes(showItems[0].start) - arriveEarly) {
      violations.push('Ăn trưa không kết thúc kịp trước suất diễn (cộng đi bộ và đến sớm)');
    }
  }
  for (const required of request.requiredActivities) {
    if (!items.some((item) => item.id === required)) violations.push(`Thiếu hoạt động bắt buộc ${required}`);
  }
  if (request.includeGate) breakdown.unshift(...calculateGateLines(snapshot, members));
  if (lunchItems.length > 0) {
    breakdown.push({ label: `Ăn trưa ${members.length} người`, amountVnd: members.length * snapshot.prices.lunch_per_person_vnd });
  }
  const totalVnd = breakdown.reduce((sum, line) => sum + line.amountVnd, 0);
  if (totalVnd > request.budgetVnd) violations.push(`Tổng ${formatVnd(totalVnd)} vượt ngân sách ${formatVnd(request.budgetVnd)}`);

  const uniqueViolations = [...new Set(violations)];
  return {
    valid: uniqueViolations.length === 0,
    violations: uniqueViolations,
    warnings: [...new Set(warnings)],
    totalVnd,
    breakdown,
    snapshotId: snapshot.snapshotId,
    isMock: snapshot.isMock,
    validatedBy: 'core-api',
  };
}
