import type { ProposalAuditAction, ProposalStatus, QuoteStatus } from '@vintrip/api-client';

export type StaffStatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
export interface StaffStatusMeta { label: string; tone: StaffStatusTone }

export const ROOM_FEATURE_LABELS: Readonly<Record<string, string>> = {
  NON_SMOKING: 'Không hút thuốc',
  GARDEN_VIEW: 'Hướng vườn',
  ACCESSIBLE: 'Hỗ trợ tiếp cận',
};

export const PROPOSAL_STATUS_META = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  PENDING_RECEPTIONIST: { label: 'Chờ lễ tân duyệt', tone: 'info' },
  PENDING_MANAGER: { label: 'Chờ quản lý duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' },
  REQUOTE_REQUIRED: { label: 'Cần báo giá lại', tone: 'warning' },
} satisfies Record<ProposalStatus, StaffStatusMeta>;

export const QUOTE_STATUS_META = {
  VALID: { label: 'Báo giá hợp lệ', tone: 'success' },
  NEEDS_INPUT: { label: 'Cần bổ sung thông tin', tone: 'info' },
  MISSING_DATA: { label: 'Thiếu dữ liệu', tone: 'warning' },
  INELIGIBLE: { label: 'Không đủ điều kiện', tone: 'danger' },
  UNAVAILABLE: { label: 'Không còn phòng phù hợp', tone: 'warning' },
  REQUIRES_MANAGER: { label: 'Cần quản lý duyệt', tone: 'warning' },
  VALIDATION_FAILED: { label: 'Không đạt kiểm tra', tone: 'danger' },
} satisfies Record<QuoteStatus, StaffStatusMeta>;

export const AUDIT_ACTION_LABELS = {
  CREATED: 'Tạo đề xuất',
  REVISED: 'Sửa đề xuất',
  APPROVED: 'Duyệt đề xuất',
  REJECTED: 'Từ chối đề xuất',
  ESCALATED: 'Chuyển quản lý duyệt',
  MARKED_EXPIRED: 'Đánh dấu hết hạn',
  MARKED_REQUOTE_REQUIRED: 'Yêu cầu báo giá lại',
} satisfies Record<ProposalAuditAction, string>;

export const STALE_REASON_LABELS: Readonly<Record<string, string>> = {
  RATE_CHANGED: 'Đơn giá phòng đã thay đổi.',
  INVENTORY_UNAVAILABLE: 'Không còn phòng khả dụng.',
  INVENTORY_CHANGED: 'Tồn phòng đã thay đổi.',
  BOOKING_STATUS_CHANGED: 'Trạng thái booking đã thay đổi.',
  BOOKING_CHANGED: 'Thông tin booking đã thay đổi.',
  POLICY_VERSION_CHANGED: 'Chính sách đã có phiên bản mới.',
  BENEFIT_CHANGED: 'Quyền lợi thành viên đã thay đổi.',
  PRICE_CHANGED: 'Chênh lệch giá đã thay đổi.',
  APPROVAL_ROLE_CHANGED: 'Vai trò được phép duyệt đã thay đổi.',
  QUOTE_INVALIDATED: 'Báo giá không còn hợp lệ.',
  PROPOSAL_EXPIRED: 'Đề xuất đã hết hạn.',
  PREVIEW_MISMATCH: 'Báo giá hiện tại khác bản xem trước.',
  MANUAL_ESCALATION: 'Nhân viên đã chuyển quản lý xét duyệt.',
  COMPLIMENTARY_NOT_ELIGIBLE: 'Không đủ điều kiện nâng hạng miễn phí.',
  NEGATIVE_DIFFERENCE: 'Chênh lệch giá âm cần được kiểm tra.',
  MANAGER_LIMIT: 'Chênh lệch vượt hạn mức phê duyệt của lễ tân.',
};
