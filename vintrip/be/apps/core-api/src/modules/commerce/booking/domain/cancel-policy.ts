import { randomUUID } from 'node:crypto';
import { CommerceError } from '../../inventory/domain/errors.js';

// Chính sách huỷ đơn đã thanh toán (TF70): tính tiền hoàn cho từng mục rồi cộng lại, huỷ cả đơn.

export interface CancelPolicyItem {
  id: string;
  productType: 'room' | 'flight';
  date: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  isRefundable: boolean;
  freeCancelUntil: string | null;
}

export type CancelRule = 'free_cancel' | 'first_night_fee' | 'non_refundable';

export interface CancelQuoteLine {
  itemId: string;
  rule: CancelRule;
  refundAmount: number;
  feeAmount: number;
}

export type CancelQuote =
  | { isCancellable: true; refundAmount: number; feeAmount: number; lines: CancelQuoteLine[] }
  | { isCancellable: false; reason: 'ALREADY_STARTED'; refundAmount: 0; feeAmount: 0; lines: [] };

function quoteLine(item: CancelPolicyItem, today: string): CancelQuoteLine {
  const noRefund = { itemId: item.id, rule: 'non_refundable' as const, refundAmount: 0, feeAmount: item.lineTotal };
  if (!item.isRefundable) return noRefund;
  if (item.freeCancelUntil && today <= item.freeCancelUntil) {
    return { itemId: item.id, rule: 'free_cancel', refundAmount: item.lineTotal, feeAmount: 0 };
  }
  if (item.productType === 'flight') return noRefund;
  // unitPrice đã trừ giảm giá trẻ em của phòng này, nên phí đêm đầu không vượt số khách đã trả.
  const feeAmount = Math.min(item.lineTotal, item.unitPrice * item.qty);
  return { itemId: item.id, rule: 'first_night_fee', refundAmount: item.lineTotal - feeAmount, feeAmount };
}

export function quoteCancellation(items: CancelPolicyItem[], today: string): CancelQuote {
  if (items.some((item) => today >= item.date)) {
    return { isCancellable: false, reason: 'ALREADY_STARTED', refundAmount: 0, feeAmount: 0, lines: [] };
  }
  const lines = items.map((item) => quoteLine(item, today));
  return {
    isCancellable: true,
    refundAmount: lines.reduce((sum, line) => sum + line.refundAmount, 0),
    feeAmount: lines.reduce((sum, line) => sum + line.feeAmount, 0),
    lines,
  };
}

const HOUR_MS = 3_600_000;
const VND = new Intl.NumberFormat('vi-VN');
const FREE_CANCEL_POLICIES = { 'FLEX-48H': 48, 'MOD-72H': 72 } as const;
export const POLICY_CODES = ['FLEX-48H', 'MOD-72H', 'STRICT-NO-REFUND', 'PARTIAL-50-24H'] as const;

export interface PolicyContractInput {
  policyCode: typeof POLICY_CODES[number];
  hotelSlug: string;
  checkInIso?: string | null;
  cancelAtIso?: string | null;
  timezone: string;
  totalVnd: number;
  nights: number;
}

type Citation = { code: 'C1' | 'C2'; clause: string };
type DateField = 'checkInIso' | 'cancelAtIso';

function getPolicyTerms(policyCode: PolicyContractInput['policyCode']): { cutoffHours: number | null; citations: Citation[] } {
  if (policyCode === 'STRICT-NO-REFUND') {
    return { cutoffHours: null, citations: [{ code: 'C1', clause: 'Đặt phòng không hoàn tiền khi hủy.' }] };
  }
  if (policyCode === 'PARTIAL-50-24H') {
    return {
      cutoffHours: 24,
      citations: [
        { code: 'C1', clause: 'Hoàn 50% nếu hủy ít nhất 24 giờ trước giờ nhận phòng.' },
        { code: 'C2', clause: 'Không hoàn tiền nếu hủy dưới 24 giờ trước giờ nhận phòng hoặc sau đó.' },
      ],
    };
  }
  const cutoffHours = FREE_CANCEL_POLICIES[policyCode];
  return {
    cutoffHours,
    citations: [
      { code: 'C1', clause: `Hủy miễn phí nếu hủy ít nhất ${cutoffHours} giờ trước giờ nhận phòng (mặc định 14:00 giờ địa phương).` },
      { code: 'C2', clause: 'Sau hạn miễn phí, phí hủy bằng tiền một đêm tính theo giá bình quân. Từ giờ nhận phòng, không hoàn tiền.' },
    ],
  };
}

function localClock(formatter: Intl.DateTimeFormat, instant: number) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  const year = parts.year?.padStart(4, '0');
  const dateTime = `${year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  return { dateTime, offset: parts.timeZoneName?.slice(3) || '+00:00' };
}

function parsePolicyTime(input: string, field: DateField, formatter: Intl.DateTimeFormat): number {
  const invalid = () => new CommerceError('invalid_query', 'Thời điểm không hợp lệ trong múi giờ đã chọn.', field);
  if (/Z$|[+-]\d{2}:\d{2}$/i.test(input)) {
    const instant = Date.parse(input);
    if (!Number.isFinite(instant)) throw invalid();
    return instant;
  }
  const local = field === 'checkInIso' && input.length === 10 ? `${input}T14:00:00` : input;
  const wallTime = Date.parse(`${local}Z`);
  if (!Number.isFinite(wallTime)) throw invalid();

  // Lấy offset ở hai phía của giờ địa phương để xử lý khi đổi giờ mùa hè.
  const offsets = new Set([-24, 24].map((hours) => localClock(formatter, wallTime + hours * HOUR_MS).offset));
  const localSecond = new Date(wallTime).toISOString().slice(0, 19);
  const matches = Array.from(offsets, (offset) => Date.parse(`${local}${offset}`))
    .filter((instant) => Number.isFinite(instant) && localClock(formatter, instant).dateTime === localSecond);
  if (matches.length === 0) throw invalid();
  // Nếu giờ địa phương lặp lại, chọn lần xuất hiện đầu tiên.
  return Math.min(...matches);
}

export function evaluatePolicyContract(input: PolicyContractInput) {
  const { policyCode, totalVnd, nights } = input;
  const { cutoffHours, citations } = getPolicyTerms(policyCode);
  const checkIn = input.checkInIso?.trim();
  const cancelAt = input.cancelAtIso?.trim();
  const missingFields: DateField[] = [];
  if (!checkIn) missingFields.push('checkInIso');
  if (!cancelAt) missingFields.push('cancelAtIso');
  if (!checkIn || !cancelAt) {
    const labels = { checkInIso: 'ngày nhận phòng', cancelAtIso: 'thời điểm hủy dự kiến' };
    return {
      policyCode, status: 'need_info' as const, hoursBeforeCheckIn: null, cutoffLocal: null,
      feeVnd: null, refundVnd: null, citations, missingFields,
      summaryVi: `Vui lòng bổ sung ${missingFields.map((field) => labels[field]).join(' và ')}.`,
    };
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: input.timezone, timeZoneName: 'longOffset', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new CommerceError('invalid_query', 'Múi giờ không hợp lệ.', 'timezone');
  }
  const checkInTime = parsePolicyTime(checkIn, 'checkInIso', formatter);
  const cancelTime = parsePolicyTime(cancelAt, 'cancelAtIso', formatter);
  const hoursBeforeCheckIn = (checkInTime - cancelTime) / HOUR_MS;
  const cutoff = cutoffHours === null ? null : localClock(formatter, checkInTime - cutoffHours * HOUR_MS);
  const fractionalSecond = new Date(checkInTime).toISOString().slice(19, 23);
  const cutoffLocal = cutoff && `${cutoff.dateTime}${fractionalSecond === '.000' ? '' : fractionalSecond}${cutoff.offset}`;

  let status: 'free' | 'partial' | 'non_refundable' = 'non_refundable';
  let refundVnd = 0;
  if (policyCode === 'PARTIAL-50-24H' && hoursBeforeCheckIn >= 24) {
    status = 'partial';
    refundVnd = totalVnd - Math.round(totalVnd / 2);
  } else if (policyCode === 'FLEX-48H' || policyCode === 'MOD-72H') {
    if (hoursBeforeCheckIn >= FREE_CANCEL_POLICIES[policyCode]) {
      status = 'free';
      refundVnd = totalVnd;
    } else if (hoursBeforeCheckIn > 0 && nights > 1) {
      status = 'partial';
      refundVnd = totalVnd - Math.round(totalVnd / nights);
    }
  }

  const feeVnd = totalVnd - refundVnd;
  const summaries = {
    free: `Miễn phí hủy 100%, hoàn lại ${VND.format(refundVnd)}đ.`,
    partial: `Phí hủy ${VND.format(feeVnd)}đ, hoàn lại ${VND.format(refundVnd)}đ.`,
    non_refundable: `Không hoàn tiền. Phí hủy ${VND.format(feeVnd)}đ.`,
  };
  return {
    policyCode, status, hoursBeforeCheckIn, cutoffLocal, feeVnd, refundVnd, citations, missingFields,
    summaryVi: summaries[status],
  };
}

export interface BookingChangeDraftInput {
  bookingCode: string;
  currentRoom: string;
  targetRoom: string;
  nights: number;
  guestNote?: string | null;
}

// Mức ước tính dùng cho bản chạy thử khi chưa có báo giá của khách sạn.
const DEMO_ROOM_CHANGE_PER_NIGHT_VND = 450_000;

export function buildBookingChangeDraft(input: BookingChangeDraftInput) {
  const { bookingCode, currentRoom, targetRoom, nights } = input;
  const priceDiffVnd = currentRoom === targetRoom ? 0 : nights * DEMO_ROOM_CHANGE_PER_NIGHT_VND;
  const guestNote = input.guestNote?.trim();
  const draftMessageVi = [
    'Kính gửi Bộ phận Đặt phòng,',
    `Tôi muốn đổi phòng cho đơn ${bookingCode} từ ${currentRoom} sang ${targetRoom} (${nights} đêm).`,
    ...(guestNote ? [`Ghi chú của khách: ${guestNote}.`] : []),
    `Chênh lệch tạm tính: ${VND.format(priceDiffVnd)}đ. Vui lòng xác nhận tình trạng phòng và báo giá chính thức.`,
  ].join('\n');
  return {
    draftId: `DRAFT-${randomUUID()}`,
    bookingCode,
    actionType: 'ROOM_CHANGE_DRAFT' as const,
    status: 'PENDING_USER_APPROVAL' as const,
    priceDiffVnd,
    requiresConfirmation: true as const,
    draftMessageVi,
    disclaimer: 'Đây chỉ là bản nháp chờ người dùng duyệt. Hệ thống không tự động sửa/hủy đơn hay thu phí.',
  };
}
