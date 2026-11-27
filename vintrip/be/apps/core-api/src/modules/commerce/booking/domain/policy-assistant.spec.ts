import { describe, expect, it } from 'vitest';
import { buildBookingChangeDraft, evaluatePolicyContract, type PolicyContractInput } from './cancel-policy.js';

const evaluation: PolicyContractInput = {
  policyCode: 'FLEX-48H',
  hotelSlug: 'coastal-pearl-da-nang',
  checkInIso: '2026-12-10T14:00:00+07:00',
  cancelAtIso: '2026-12-08T10:00:00+07:00',
  timezone: 'Asia/Ho_Chi_Minh',
  totalVnd: 3_200_000,
  nights: 2,
};

describe('evaluatePolicyContract', () => {
  it('tính phí và hạn hủy theo ví dụ Việt Nam trong hợp đồng', () => {
    expect(evaluatePolicyContract(evaluation)).toMatchObject({
      policyCode: 'FLEX-48H',
      status: 'free',
      hoursBeforeCheckIn: 52,
      cutoffLocal: '2026-12-08T14:00:00+07:00',
      feeVnd: 0,
      refundVnd: 3_200_000,
      missingFields: [],
      summaryVi: 'Miễn phí hủy 100%, hoàn lại 3.200.000đ.',
    });
  });

  it('mặc định nhận phòng lúc 14:00 ở Tokyo và tính cả thời điểm đúng hạn', () => {
    const result = evaluatePolicyContract({
      ...evaluation,
      policyCode: 'MOD-72H',
      checkInIso: '2026-12-10',
      cancelAtIso: '2026-12-07T05:00:00Z',
      timezone: 'Asia/Tokyo',
    });
    expect(result).toMatchObject({ status: 'free', hoursBeforeCheckIn: 72, cutoffLocal: '2026-12-07T14:00:00+09:00' });
  });

  it('giữ giờ nhận phòng đã nhập và lấy offset tại thời điểm cutoff khi đổi giờ mùa hè', () => {
    expect(evaluatePolicyContract({
      ...evaluation,
      checkInIso: '2026-03-08T16:00:00',
      cancelAtIso: '2026-03-06T15:00:00-05:00',
      timezone: 'America/New_York',
    })).toMatchObject({ status: 'free', hoursBeforeCheckIn: 48, cutoffLocal: '2026-03-06T15:00:00-05:00' });
  });

  it('báo lỗi cho giờ địa phương không tồn tại khi chuyển giờ mùa hè', () => {
    expect(() => evaluatePolicyContract({
      ...evaluation, checkInIso: '2026-03-08T02:30:00', timezone: 'America/New_York',
    })).toThrow('Thời điểm không hợp lệ');
  });

  it('sau hạn FLEX tính phí một đêm trước giờ nhận phòng và mất toàn bộ từ giờ nhận phòng', () => {
    const late = evaluatePolicyContract({ ...evaluation, cancelAtIso: '2026-12-08T14:00:01+07:00' });
    expect(late).toMatchObject({ status: 'partial', feeVnd: 1_600_000, refundVnd: 1_600_000 });
    expect(late.citations.map(({ code }) => code)).toEqual(['C1', 'C2']);
    expect(evaluatePolicyContract({ ...evaluation, cancelAtIso: evaluation.checkInIso }))
      .toMatchObject({ status: 'non_refundable', feeVnd: 3_200_000, refundVnd: 0 });
  });

  it('hoàn 50% đúng mốc 24 giờ và mất toàn bộ khi quá mốc', () => {
    const input = { ...evaluation, policyCode: 'PARTIAL-50-24H' } as const;
    expect(evaluatePolicyContract({ ...input, cancelAtIso: '2026-12-09T14:00:00+07:00' }))
      .toMatchObject({ status: 'partial', feeVnd: 1_600_000, refundVnd: 1_600_000 });
    expect(evaluatePolicyContract({ ...input, cancelAtIso: '2026-12-09T14:00:01+07:00' }))
      .toMatchObject({ status: 'non_refundable', feeVnd: 3_200_000, refundVnd: 0 });
  });

  it('gói STRICT luôn không hoàn tiền và không có cutoff', () => {
    expect(evaluatePolicyContract({ ...evaluation, policyCode: 'STRICT-NO-REFUND' }))
      .toMatchObject({ status: 'non_refundable', cutoffLocal: null, feeVnd: 3_200_000, refundVnd: 0 });
  });

  it.each([
    ['', evaluation.cancelAtIso, ['checkInIso']],
    [evaluation.checkInIso, null, ['cancelAtIso']],
    [null, '', ['checkInIso', 'cancelAtIso']],
  ] as const)('báo rõ các trường thời gian còn thiếu (%s, %s)', (checkInIso, cancelAtIso, missingFields) => {
    expect(evaluatePolicyContract({ ...evaluation, checkInIso, cancelAtIso })).toMatchObject({
      status: 'need_info', missingFields, hoursBeforeCheckIn: null, cutoffLocal: null, feeVnd: null, refundVnd: null,
    });
  });
});

describe('buildBookingChangeDraft', () => {
  it('trả bản nháp tiếng Việt với chênh lệch ước tính và yêu cầu xác nhận', () => {
    const result = buildBookingChangeDraft({
      bookingCode: 'VT-2026-8841',
      currentRoom: 'Deluxe City View',
      targetRoom: 'Premier Sea View',
      nights: 2,
      guestNote: 'Ưu tiên tầng cao',
    });
    expect(result).toMatchObject({
      draftId: expect.stringMatching(/^DRAFT-/),
      bookingCode: 'VT-2026-8841',
      actionType: 'ROOM_CHANGE_DRAFT',
      status: 'PENDING_USER_APPROVAL',
      priceDiffVnd: 900_000,
      requiresConfirmation: true,
      disclaimer: 'Đây chỉ là bản nháp chờ người dùng duyệt. Hệ thống không tự động sửa/hủy đơn hay thu phí.',
    });
    expect(result.draftMessageVi).toContain('Deluxe City View sang Premier Sea View (2 đêm)');
    expect(result.draftMessageVi).toContain('Ưu tiên tầng cao');
    expect(result.draftMessageVi).toContain('Chênh lệch tạm tính: 900.000đ');
  });
});
