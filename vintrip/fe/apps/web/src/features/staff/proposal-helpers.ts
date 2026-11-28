import type { ProposalStatus, ReviseProposalRequest, RoomUpgradeError, RoomUpgradeRequestType, StaffRole } from '@vintrip/api-client';

const STATUSES: ReadonlySet<string> = new Set([
  'PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'REQUOTE_REQUIRED', 'APPROVED', 'REJECTED', 'EXPIRED', 'DRAFT',
]);

export function parseProposalStatusParam(value: string | string[] | undefined): ProposalStatus | undefined {
  return typeof value === 'string' && STATUSES.has(value) ? value as ProposalStatus : undefined;
}

export function parseApprovalRoleParam(value: string | string[] | undefined): StaffRole | undefined {
  return value === 'RECEPTIONIST' || value === 'MANAGER' ? value : undefined;
}

export function buildRevisePayload(input: {
  hotelId: string; expectedVersion: number; targetRoomTypeId: string; effectiveAt: string;
  requestType: RoomUpgradeRequestType; requiredFeatures: string[]; benefitId: string | null; reason: string;
}): ReviseProposalRequest {
  const reason = input.reason.trim();
  return {
    hotelId: input.hotelId, expectedVersion: input.expectedVersion, targetRoomTypeId: input.targetRoomTypeId,
    effectiveAt: input.effectiveAt, requestType: input.requestType, requiredFeatures: [...input.requiredFeatures],
    benefitId: input.benefitId, ...(reason ? { reason } : {}),
  };
}

/** Display only. This must never be used to authorize a decision. */
export function formatExpiryCountdown(expiresAtIso: string, nowMs: number | null): { text: string; expiredByClock: boolean } | null {
  if (nowMs === null) return null;
  const remainingMs = Date.parse(expiresAtIso) - nowMs;
  if (!Number.isFinite(remainingMs)) return null;
  if (remainingMs <= 0) return { text: 'Đã qua mốc hết hạn (chờ máy chủ xác nhận)', expiredByClock: true };
  const seconds = Math.ceil(remainingMs / 1000);
  return { text: `Còn ${Math.floor(seconds / 60)} phút ${seconds % 60} giây`, expiredByClock: false };
}

export function classifyCommandError(error: RoomUpgradeError): {
  canRetrySameKey: boolean; shouldReloadProposal: boolean; bannerTone: 'warning' | 'danger';
} {
  switch (error.kind) {
    case 'network':
    case 'dependency_unavailable':
      return { canRetrySameKey: true, shouldReloadProposal: false, bannerTone: 'danger' };
    case 'version_conflict':
    case 'concurrent_modification':
    case 'requote_required':
    case 'proposal_expired':
    case 'invalid_state':
      return { canRetrySameKey: false, shouldReloadProposal: true, bannerTone: 'warning' };
    default:
      return { canRetrySameKey: false, shouldReloadProposal: false, bannerTone: 'danger' };
  }
}

export function formatActorShort(userId: string): string {
  return userId.length > 12 ? `${userId.slice(0, 8)}…` : userId;
}
