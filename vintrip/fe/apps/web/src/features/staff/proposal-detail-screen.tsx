'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createLogicalCommandManager, invalidateRoomUpgradeQueries, parseRoomUpgradeError, roomUpgradeQueryKeys, roomUpgradesApi,
  useBookingContext, useProposalDetail, useProposalHistory,
  type ApproveProposalRequest, type ProposalAllowedAction, type ProposalCommandResponse, type ProposalDetailResponse,
  type ReviseProposalRequest, type RoomUpgradeError, type RoomUpgradeRequestType,
} from '@vintrip/api-client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buildRevisePayload, classifyCommandError, formatActorShort, formatExpiryCountdown } from './proposal-helpers';
import { useStaffPortal } from './staff-context';
import { formatDateInTz, formatDateTimeInTz, formatRoleLabel, formatRoomFeature, formatVnd } from './staff-format';
import { StaffStatusPill } from './staff-shell';
import { AUDIT_ACTION_LABELS, PROPOSAL_STATUS_META, QUOTE_STATUS_META, STALE_REASON_LABELS } from './staff-status';
import styles from './proposal.module.css';
import staff from './staff.module.css';

const APPROVAL_SUCCESS = 'Đã duyệt đề xuất báo giá. Chưa thực hiện chuyển phòng hoặc thu tiền.';
const ACTION_LABELS: Record<ProposalAllowedAction, string> = {
  APPROVE: 'Duyệt báo giá', REVISE: 'Chỉnh sửa / Báo giá lại', ESCALATE: 'Chuyển quản lý', REJECT: 'Từ chối',
};
const REQUEST_LABELS: Record<RoomUpgradeRequestType, string> = {
  UPGRADE: 'Nâng hạng', ROOM_CHANGE: 'Đổi phòng', COMPLIMENTARY_UPGRADE: 'Nâng hạng miễn phí',
};
type ReviseForm = {
  targetRoomTypeId: string; effectiveAt: string; requestType: RoomUpgradeRequestType;
  requiredFeatures: string[]; benefitId: string | null;
};
type LogicalCommand = {
  operation: ProposalAllowedAction; payload: ApproveProposalRequest | ReviseProposalRequest;
  send: (key: string) => Promise<ProposalCommandResponse>; previousPrice: number;
};
type CommandFailure = { error: RoomUpgradeError; previousPrice: number };

function ReasonCodes({ codes }: { codes: readonly string[] }) {
  return codes.length > 0 && <ul className={styles.reasonCodes}>{codes.map((code, index) =>
    <li key={`${code}:${index}`}><span className={staff.tag}>{Object.prototype.hasOwnProperty.call(STALE_REASON_LABELS, code) ? STALE_REASON_LABELS[code] : code}</span></li>)}</ul>;
}

/** Native modal supplies the focus trap; restore focus to its opener on dismissal. */
function DecisionDialog({ action, open, busy, onDismiss, onSubmit, children, submitDisabled, error, onRetry }: {
  action: ProposalAllowedAction; open: boolean; busy: boolean; onDismiss: () => void; onSubmit: () => void;
  children: ReactNode; submitDisabled?: boolean; error: RoomUpgradeError | null; onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      else document.getElementById('proposal-detail-heading')?.focus();
    };
  }, [open]);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`decision-${action}-title`}
    onCancel={(event) => { event.preventDefault(); if (!busy) onDismiss(); }}
    onPointerDown={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onDismiss();
    }}>
    <form className={styles.dialogForm} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); if (!busy && !submitDisabled) onSubmit(); }}>
      <h2 id={`decision-${action}-title`}>{ACTION_LABELS[action]}</h2>
      {children}
      {error && <div className={styles.notice} data-tone="danger"><p role="alert">{error.message}</p>
        {error.violations && <ul>{error.violations.map((issue, index) => <li key={`${issue.field}:${index}`}>{issue.field}: {issue.message}</li>)}</ul>}
        {error.missingFields && error.missingFields.length > 0 && <p>Cần bổ sung: {error.missingFields.join(', ')}</p>}
        {classifyCommandError(error).canRetrySameKey && <><p>Gửi lại nguyên nội dung và mã thao tác của lần gửi vừa rồi.</p><button type="button" className={staff.secondaryButton} disabled={busy} onClick={onRetry}>Thử gửi lại</button></>}
      </div>}
      <footer className={styles.dialogActions}><button ref={cancel} type="button" className={staff.secondaryButton} disabled={busy} onClick={onDismiss}>Hủy</button>
        <button type="submit" className={action === 'REJECT' ? styles.dangerButton : staff.primaryButton} disabled={busy || submitDisabled}>
          {busy ? 'Đang gửi…' : action === 'APPROVE' ? 'Xác nhận duyệt báo giá' : action === 'REVISE' ? 'Tính lại & lưu revision mới' : action === 'REJECT' ? 'Xác nhận từ chối' : 'Xác nhận chuyển quản lý'}
        </button></footer>
    </form>
  </dialog>;
}

function QuoteBreakdown({ proposal }: { proposal: ProposalDetailResponse }) {
  const { quote } = proposal;
  return <section className={staff.card} aria-labelledby="verified-quote-title">
    <header className={staff.sectionHeading}><h2 id="verified-quote-title">Báo giá đã xác minh</h2><StaffStatusPill meta={QUOTE_STATUS_META[proposal.quoteStatus]} /></header>
    <div className={styles.body}>
      <section className={styles.tableScroll} aria-label="Chi tiết báo giá từng đêm"><table className={`${staff.table} ${styles.quoteTable}`}>
        <caption>Chi tiết từng đêm · VND · {quote.timezone}</caption>
        <thead><tr>{['Ngày', 'Giá phòng mới', 'Đối trừ gốc', 'Phí bổ sung', 'Thuế bổ sung', 'Giảm hợp lệ', 'Phụ thu'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{proposal.breakdown.map((night) => <tr key={night.date}><th scope="row">{formatDateInTz(night.date, quote.timezone)}</th>
          <td>{formatVnd(night.newRoomPriceVnd)}</td><td>{formatVnd(night.eligibleOriginalCreditVnd)}</td><td>{formatVnd(night.additionalFeesVnd)}</td>
          <td>{formatVnd(night.additionalTaxVnd)}</td><td>{formatVnd(night.eligibleDiscountVnd)}</td><td>{formatVnd(night.priceDiffVnd)}</td></tr>)}</tbody>
      </table></section>
      {quote.totals && <dl className={styles.totals}>
        <div><dt>Giá phòng mới</dt><dd>{formatVnd(quote.totals.newRoomTotalVnd)}</dd></div>
        <div><dt>Đối trừ booking gốc</dt><dd>{formatVnd(quote.totals.eligibleOriginalCreditVnd)}</dd></div>
        <div><dt>Phí bổ sung</dt><dd>{formatVnd(quote.totals.additionalFeesVnd)}</dd></div>
        <div><dt>Thuế bổ sung</dt><dd>{formatVnd(quote.totals.additionalTaxVnd)}</dd></div>
        <div><dt>Giảm giá hợp lệ</dt><dd>{formatVnd(quote.totals.eligibleDiscountVnd)}</dd></div>
        <div className={styles.grandTotal}><dt>Tổng phụ thu</dt><dd>{formatVnd(proposal.priceDiffVnd)}</dd></div>
      </dl>}
      {quote.benefit ? <StaffStatusPill meta={{ label: `Quyền lợi đã xác minh: ${quote.benefit.code} · v${quote.benefit.version} · ${quote.benefit.discountBps / 100}%`, tone: 'success' }} /> : <p className={staff.muted}>Không áp dụng quyền lợi giảm giá.</p>}
      <div className={styles.sources}><h3>Nguồn chính sách</h3><p>{proposal.policyCode} · v{proposal.policyVersion}</p>
        {proposal.policySources.length ? <ul>{proposal.policySources.map((source, index) => <li key={`${source.code}:${index}`}><strong>{source.code}</strong> · {source.clause}</li>)}</ul> : <p>Không có nguồn chính sách được trả về.</p>}
        <p className={staff.muted}>Tính lúc {formatDateTimeInTz(proposal.calculatedAt, quote.timezone)} · Snapshot {proposal.snapshotId}</p>
      </div>
      {proposal.aiMetadata && <aside className={styles.notice} aria-label="Metadata AI tham khảo"><h3>Metadata AI · Chỉ tham khảo</h3>
        <p>Nội dung AI không có thẩm quyền xác định giá, chính sách hoặc quyết định duyệt. Báo giá xác minh ở trên là căn cứ xét duyệt.</p>
        <dl className={styles.facts}><div><dt>Nguồn</dt><dd>{proposal.aiMetadata.source}</dd></div><div><dt>Model</dt><dd>{proposal.aiMetadata.model ?? '—'}</dd></div>
          <div><dt>Prompt versions</dt><dd>{proposal.aiMetadata.promptVersions.join(', ') || '—'}</dd></div></dl>
        {proposal.aiMetadata.recommendationReasonVi && <p className={styles.preWrap}>Lý do AI tham khảo: {proposal.aiMetadata.recommendationReasonVi}</p>}
        {proposal.aiMetadata.draftMessageVi && <p className={styles.preWrap}>Lời nhắn nháp AI: {proposal.aiMetadata.draftMessageVi}</p>}
      </aside>}
    </div>
  </section>;
}

export function ProposalDetailScreen({ proposalId }: { proposalId: string }) {
  const { activeHotel, userId } = useStaffPortal();
  return <ProposalDetailWorkspace key={`${userId}:${activeHotel.hotelId}:${proposalId}`} proposalId={proposalId} />;
}

function ProposalDetailWorkspace({ proposalId }: { proposalId: string }) {
  const { activeHotel, userId } = useStaffPortal();
  const hotelId = activeHotel.hotelId;
  const queryClient = useQueryClient();
  const detail = useProposalDetail(hotelId, proposalId);
  const history = useProposalHistory(hotelId, proposalId);
  const bookingContext = useBookingContext(hotelId, detail.data?.bookingCode ?? '');
  const commands = useRef(createLogicalCommandManager());
  const inFlight = useRef(false);
  const lastCommand = useRef<LogicalCommand | null>(null);
  const previousAction = useRef<ProposalAllowedAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ProposalAllowedAction | null>(null);
  // Confirmation always binds to the exact server version displayed when it opened.
  const [snapshot, setSnapshot] = useState<ProposalDetailResponse | null>(null);
  const [reason, setReason] = useState('');
  const [revise, setRevise] = useState<ReviseForm | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [success, setSuccess] = useState<{ message: string; replayed: boolean } | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const proposal = detail.data;
  const reloadProposal = async () => {
    setReloading(true);
    try {
      await invalidateRoomUpgradeQueries(queryClient, userId, hotelId, proposalId);
      setReloadFailed(queryClient.getQueryState(roomUpgradeQueryKeys.proposalDetail(userId, hotelId, proposalId))?.status === 'error');
    } catch {
      // A refresh failure must never turn a committed decision into a retryable command.
      setReloadFailed(true);
    } finally {
      setReloading(false);
    }
  };

  const execute = async (command: LogicalCommand) => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastCommand.current = command;
    setBusy(true); setFailure(null); setSuccess(null);
    try {
      const response = await commands.current.execute(command.operation, proposalId, command.payload, command.send);
      // Only a completed backend command can update the displayed status.
      queryClient.setQueryData(roomUpgradeQueryKeys.proposalDetail(userId, hotelId, proposalId), response.data);
      setModal(null);
      setSuccess({ replayed: response.replayed, message: command.operation === 'APPROVE' ? APPROVAL_SUCCESS : command.operation === 'REVISE'
        ? `Đã lưu Revision #${response.data.currentRevision}. Tổng phụ thu mới: ${formatVnd(response.data.priceDiffVnd)}.`
        : command.operation === 'REJECT' ? 'Đã ghi nhận từ chối đề xuất.' : 'Đã chuyển đề xuất cho quản lý xét duyệt.' });
      lastCommand.current = null;
      await reloadProposal();
    } catch (error: unknown) {
      const parsed = parseRoomUpgradeError(error);
      setFailure({ error: parsed, previousPrice: command.previousPrice });
      if (classifyCommandError(parsed).shouldReloadProposal) {
        setModal(null);
        lastCommand.current = null;
        await reloadProposal();
      } else if (!classifyCommandError(parsed).canRetrySameKey) lastCommand.current = null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const retryCommand = () => { if (lastCommand.current) void execute(lastCommand.current); };
  const openModal = (action: ProposalAllowedAction) => {
    if (!proposal || busy || reloading || reloadFailed || !proposal.allowedActions.includes(action)) return;
    if (previousAction.current !== null && previousAction.current !== action) commands.current.reset();
    previousAction.current = action;
    setSnapshot(proposal);
    setRevise({ targetRoomTypeId: proposal.normalizedRequest.targetRoomTypeId, effectiveAt: proposal.normalizedRequest.effectiveAt,
      requestType: proposal.normalizedRequest.requestType, requiredFeatures: [...proposal.normalizedRequest.requiredFeatures], benefitId: proposal.normalizedRequest.benefitId });
    setReason(''); setFailure(null); setModal(action);
  };
  const submit = (operation: ProposalAllowedAction) => {
    if (!snapshot || busy || inFlight.current) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length > 500 || ((operation === 'REJECT' || operation === 'ESCALATE') && !trimmedReason)) return;
    const base = { hotelId, expectedVersion: snapshot.version };
    const previousPrice = snapshot.priceDiffVnd;
    if (operation === 'REVISE' && revise) {
      const payload = buildRevisePayload({ ...base, ...revise, reason });
      void execute({ operation, payload, previousPrice, send: (key) => roomUpgradesApi.reviseProposal(proposalId, payload, key) });
    } else if (operation === 'APPROVE') {
      const payload = { ...base, ...(trimmedReason ? { reason: trimmedReason } : {}) };
      void execute({ operation, payload, previousPrice, send: (key) => roomUpgradesApi.approveProposal(proposalId, payload, key) });
    } else if (operation === 'REJECT' || operation === 'ESCALATE') {
      const payload = { ...base, reason: trimmedReason };
      void execute({ operation, payload, previousPrice, send: (key) => operation === 'REJECT'
        ? roomUpgradesApi.rejectProposal(proposalId, payload, key) : roomUpgradesApi.escalateProposal(proposalId, payload, key) });
    }
  };

  if (!proposal && detail.isPending) return <div className={staff.loading} aria-busy="true"><h1>Chi tiết đề xuất</h1><output>Đang tải đề xuất…</output><div className={staff.skeleton} /><div className={staff.skeleton} /></div>;
  if (!proposal) return <div className={staff.empty}><h1>Chưa tải được đề xuất</h1><p role="alert">{parseRoomUpgradeError(detail.error).message}</p><button type="button" className={staff.secondaryButton} disabled={detail.isFetching} onClick={() => void detail.refetch()}>Thử lại</button><Link prefetch={false} className={staff.textLink} href="/staff/proposals">Về danh sách đề xuất</Link></div>;

  const timezone = proposal.quote.timezone;
  const newProposalHref = `/staff/room-upgrades?booking=${encodeURIComponent(proposal.bookingCode)}`;
  const countdown = formatExpiryCountdown(proposal.expiresAt, nowMs);
  const commandError = failure?.error;
  const errorClass = commandError ? classifyCommandError(commandError) : null;
  const canRevise = proposal.allowedActions.includes('REVISE');
  const disabled = busy || reloading || reloadFailed || detail.isError;
  const roomTypes = bookingContext.data?.roomTypes ?? [];
  const benefits = bookingContext.data?.benefits ?? [];
  const features = [...new Set([...roomTypes.flatMap((room) => room.features), ...(snapshot?.normalizedRequest.requiredFeatures ?? []), ...(revise?.requiredFeatures ?? [])])].sort();
  const revisions = [...(history.data?.revisions ?? [])].sort((a, b) => a.revisionNumber - b.revisionNumber);
  const auditEvents = [...(history.data?.auditEvents ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.proposalVersion - b.proposalVersion);

  return <div className={`${staff.stack} ${styles.workspace}`}>
    <nav className={staff.breadcrumb} aria-label="Đường dẫn"><Link prefetch={false} className={staff.textLink} href="/staff/proposals">Quản lý đề xuất</Link><span aria-hidden="true">→</span><span>{proposalId}</span></nav>
    <header className={staff.pageHeading}><div><h1 id="proposal-detail-heading" tabIndex={-1}>Chi tiết đề xuất</h1><p className={staff.mono}>{proposalId}</p></div><button type="button" className={staff.secondaryButton} disabled={busy || reloading} onClick={() => void reloadProposal()}>Làm mới dữ liệu</button></header>
    <div className={styles.metadata}><StaffStatusPill meta={PROPOSAL_STATUS_META[proposal.status]} /><span className={staff.tag}>Nội dung: Revision #{proposal.currentRevision}</span><span className={staff.tag}>Đồng thời: Version v{proposal.version}</span><span className={staff.tag}>Người duyệt yêu cầu: {formatRoleLabel(proposal.requiredApprovalRole)}</span></div>

    {proposal.status === 'APPROVED' && <section className={styles.notice} data-tone="success" aria-label="Đề xuất đã duyệt"><strong>{APPROVAL_SUCCESS}</strong><p>Người duyệt: {proposal.decidedByRole ? formatRoleLabel(proposal.decidedByRole) : '—'} · {formatDateTimeInTz(proposal.decidedAt, timezone)}</p>{proposal.decisionReason && <p className={styles.preWrap}>Lý do: {proposal.decisionReason}</p>}</section>}
    {proposal.status === 'REJECTED' && <section className={styles.notice} data-tone="danger" aria-label="Đề xuất bị từ chối"><strong>Đề xuất đã bị từ chối</strong><p>{formatDateTimeInTz(proposal.decidedAt, timezone)}</p><p className={styles.preWrap}>Lý do: {proposal.decisionReason ?? '—'}</p></section>}
    {(proposal.status === 'EXPIRED' || proposal.isExpired) && <section className={styles.notice} data-tone="warning" aria-label="Đề xuất hết hạn"><strong>Đề xuất đã hết hạn — không thể duyệt; tạo đề xuất mới nếu cần.</strong><Link prefetch={false} className={staff.textLink} href={newProposalHref}>Tạo đề xuất mới với Vini Copilot</Link></section>}
    {proposal.status === 'REQUOTE_REQUIRED' && <section className={styles.notice} data-tone="warning" aria-label="Cần báo giá lại"><strong>Báo giá cần được tính lại</strong><ReasonCodes codes={proposal.reasonCodes} /><p>Chọn “Chỉnh sửa / Báo giá lại” để tính báo giá và tạo revision mới.</p>{canRevise && <button type="button" className={staff.secondaryButton} disabled={disabled} onClick={() => openModal('REVISE')}>Chỉnh sửa / Báo giá lại</button>}</section>}
    {success && <output className={styles.notice} data-tone="success">{(success.message !== APPROVAL_SUCCESS || proposal.status !== 'APPROVED') && <p>{success.message}</p>}{success.replayed && <p>Đã đồng bộ lại kết quả thao tác đã lưu trước đó — không tạo quyết định trùng lặp.</p>}{success.message === APPROVAL_SUCCESS && proposal.status === 'APPROVED' && !success.replayed && <p>Quyết định đã được máy chủ ghi nhận.</p>}</output>}
    {(detail.isError || reloadFailed) && <div className={styles.notice} data-tone="danger"><p role="alert">Chưa tải được trạng thái mới nhất. Tải lại trước khi thực hiện quyết định tiếp theo.</p><button type="button" className={staff.secondaryButton} disabled={busy || reloading} onClick={() => void reloadProposal()}>Tải lại đề xuất</button></div>}

    {commandError && <section className={styles.notice} data-tone={commandError.kind === 'proposal_expired' ? 'danger' : errorClass?.bannerTone} aria-label="Kết quả thao tác">
      <p role="alert">{commandError.message}</p>
      {(commandError.kind === 'version_conflict' || commandError.kind === 'concurrent_modification') && <p>{reloading ? 'Đang tải lại đề xuất…' : reloadFailed ? 'Chưa tải được phiên bản mới nhất.' : `Đã tải lại: Version v${proposal.version} · ${PROPOSAL_STATUS_META[proposal.status].label}.`} Không tự động thử duyệt lại với phiên bản mới. Hãy kiểm tra và xác nhận lại.</p>}
      <ReasonCodes codes={commandError.reasonCodes ?? []} />
      {commandError.kind === 'requote_required' && <><p>Chỉnh sửa / Báo giá lại để máy chủ tính revision mới.</p>{commandError.freshQuote && <dl className={styles.facts}><div><dt>Phụ thu đã gửi duyệt</dt><dd>{formatVnd(failure?.previousPrice)}</dd></div><div><dt>Phụ thu báo giá mới · Chưa được duyệt</dt><dd>{formatVnd(commandError.freshQuote.priceDiffVnd)}</dd></div><div><dt>Trạng thái báo giá mới</dt><dd>{QUOTE_STATUS_META[commandError.freshQuote.status].label}</dd></div></dl>}{canRevise && <button type="button" className={staff.secondaryButton} disabled={disabled} onClick={() => openModal('REVISE')}>Chỉnh sửa / Báo giá lại</button>}</>}
      {commandError.kind === 'proposal_expired' && <Link prefetch={false} className={staff.textLink} href={newProposalHref}>Tạo đề xuất mới với Vini Copilot</Link>}
      {commandError.violations && <ul>{commandError.violations.map((issue, index) => <li key={`${issue.field}:${index}`}>{issue.field}: {issue.message}</li>)}</ul>}
      {errorClass?.canRetrySameKey && <><p>Thử lại nguyên thao tác vừa gửi, giữ nguyên nội dung, phiên bản và mã thao tác.</p><button type="button" className={staff.secondaryButton} disabled={busy} onClick={retryCommand}>Thử gửi lại</button></>}
    </section>}

    <section className={staff.card} aria-labelledby="proposal-facts-title"><header className={staff.sectionHeading}><h2 id="proposal-facts-title">Thông tin đề xuất</h2></header><dl className={`${styles.facts} ${styles.body}`}>
      <div><dt>Mã booking</dt><dd><Link prefetch={false} className={staff.textLink} href={`/staff/bookings/${encodeURIComponent(proposal.bookingCode)}`}>{proposal.bookingCode}</Link></dd></div>
      <div><dt>Hạng phòng đích</dt><dd>{proposal.targetRoomTypeId}</dd></div><div><dt>Thời điểm áp dụng · {timezone}</dt><dd>{formatDateTimeInTz(proposal.normalizedRequest.effectiveAt, timezone)}</dd></div>
      <div><dt>Số đêm còn lại</dt><dd>{proposal.quote.remainingNights ?? '—'}</dd></div><div><dt>Tổng phụ thu</dt><dd className={staff.mono}>{formatVnd(proposal.priceDiffVnd)}</dd></div>
      <div><dt>Loại yêu cầu</dt><dd>{REQUEST_LABELS[proposal.normalizedRequest.requestType]}</dd></div><div><dt>Tiện nghi bắt buộc</dt><dd>{proposal.normalizedRequest.requiredFeatures.map(formatRoomFeature).join(', ') || 'Không yêu cầu'}</dd></div>
      <div><dt>Thời gian tạo</dt><dd>{formatDateTimeInTz(proposal.createdAt, timezone)}</dd></div><div><dt>Thời hạn báo giá · {timezone}</dt><dd>{formatDateTimeInTz(proposal.expiresAt, timezone)}<p className={staff.muted}>{countdown?.text ?? '—'}</p><p className={staff.muted}>Chỉ hiển thị tham khảo; máy chủ quyết định hết hạn.</p></dd></div>
      <div><dt>Người tạo</dt><dd>{formatActorShort(proposal.createdBy)}</dd></div><div><dt>Tác động vận hành</dt><dd>Không có — mô phỏng</dd></div>
    </dl></section>
    <section className={staff.card} aria-labelledby="proposal-actions-title"><div className={styles.body}><h2 id="proposal-actions-title">Xét duyệt đề xuất</h2>
      {proposal.status === 'PENDING_MANAGER' && activeHotel.staffRole === 'RECEPTIONIST' && <p className={styles.notice}>Đề xuất này đang chờ Quản lý (MANAGER) xét duyệt; lễ tân không có quyền phê duyệt vượt thẩm quyền.</p>}
      <div className={staff.actions}>{(['APPROVE', 'REVISE', 'ESCALATE', 'REJECT'] as const).filter((action) => proposal.allowedActions.includes(action)).map((action) => <button key={action} type="button" className={action === 'APPROVE' ? staff.primaryButton : action === 'REJECT' ? styles.dangerButton : staff.secondaryButton} disabled={disabled} onClick={() => openModal(action)}>{ACTION_LABELS[action]}</button>)}</div>
      {proposal.allowedActions.length === 0 && <p className={staff.muted}>Không có thao tác khả dụng ở trạng thái và vai trò hiện tại.</p>}
      {busy && <output>Đang chờ máy chủ xác nhận thao tác…</output>}
    </div></section>
    <QuoteBreakdown proposal={proposal} />

    <section className={staff.card} aria-labelledby="revisions-title"><header className={staff.sectionHeading}><div><h2 id="revisions-title">Lịch sử revisions</h2><p className={staff.muted}>Các bản nội dung đã lưu không thể chỉnh sửa.</p></div></header>
      {history.isPending && <div className={staff.loading}><output>Đang tải revisions…</output></div>}
      {history.isError && <div className={staff.empty}><p role="alert">{parseRoomUpgradeError(history.error).message}</p><button type="button" className={staff.secondaryButton} disabled={history.isFetching} onClick={() => void history.refetch()}>Thử lại lịch sử</button></div>}
      {!history.isPending && !history.isError && (revisions.length ? <section className={styles.tableScroll} aria-label="Bảng revisions"><table className={staff.table}><thead><tr>{['Revision', 'Hạng phòng đích', 'Áp dụng từ', 'Phụ thu VND', 'Trạng thái báo giá', 'Vai trò duyệt', 'Chính sách', 'Tạo lúc'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{revisions.map((revision) => <tr key={revision.revisionNumber} data-current={revision.revisionNumber === proposal.currentRevision || undefined}>
        <th scope="row">Rev #{revision.revisionNumber}{revision.revisionNumber === proposal.currentRevision && <p className={staff.muted}>Hiện tại</p>}</th><td>{revision.targetRoomTypeId}</td><td>{formatDateTimeInTz(revision.effectiveAt, revision.quote.timezone)}</td><td className={staff.money}>{formatVnd(revision.priceDiffVnd)}</td><td><StaffStatusPill meta={QUOTE_STATUS_META[revision.quoteStatus]} /></td><td>{formatRoleLabel(revision.requiredApprovalRole)}</td><td>{revision.policyCode} · v{revision.policyVersion}</td><td>{formatDateTimeInTz(revision.createdAt, timezone)}</td>
      </tr>)}</tbody></table></section> : <p className={styles.body}>Chưa có revision từ máy chủ.</p>)}
    </section>
    <section className={staff.card} aria-labelledby="audit-title"><header className={staff.sectionHeading}><div><h2 id="audit-title">Lịch sử kiểm toán</h2><p className={staff.muted}>Chỉ hiển thị sự kiện do máy chủ cung cấp · {timezone}</p></div></header>
      {history.isPending && <div className={staff.loading}><output>Đang tải sự kiện kiểm toán…</output></div>}
      {history.isError && <div className={staff.empty}><p role="alert">Chưa tải được sự kiện kiểm toán.</p><button type="button" className={staff.secondaryButton} disabled={history.isFetching} onClick={() => void history.refetch()}>Thử lại lịch sử</button></div>}
      {!history.isPending && !history.isError && (auditEvents.length ? <ol className={styles.timeline}>{auditEvents.map((event) => <li key={event.id}>
        <div className={styles.metadata}><StaffStatusPill meta={{ label: AUDIT_ACTION_LABELS[event.action], tone: PROPOSAL_STATUS_META[event.newStatus].tone }} /><time dateTime={event.createdAt}>{formatDateTimeInTz(event.createdAt, timezone)}</time></div>
        <p>{event.previousStatus ? PROPOSAL_STATUS_META[event.previousStatus].label : 'Chưa có đề xuất'} → {PROPOSAL_STATUS_META[event.newStatus].label}</p><p className={staff.mono}>Rev #{event.revisionNumber} · v{event.proposalVersion}</p>
        <p className={staff.muted}>{formatRoleLabel(event.actorRole)} · {formatActorShort(event.actorUserId)}</p>{event.reason && <p className={styles.preWrap}>Lý do: {event.reason}</p>}<ReasonCodes codes={event.reasonCodes} />
      </li>)}</ol> : <p className={styles.body}>Chưa có sự kiện kiểm toán từ máy chủ.</p>)}
    </section>

    {(['APPROVE', 'REVISE', 'REJECT', 'ESCALATE'] as const).map((action) => <DecisionDialog key={action} action={action} open={modal === action} busy={busy} onDismiss={() => setModal(null)} onSubmit={() => submit(action)}
      error={modal === action ? commandError ?? null : null} onRetry={retryCommand}
      submitDisabled={reason.trim().length > 500 || ((action === 'REJECT' || action === 'ESCALATE') && reason.trim().length === 0) || (action === 'REVISE' && (!revise?.targetRoomTypeId || !revise.effectiveAt.trim()))}>
      {snapshot && action === 'APPROVE' && <><dl className={styles.facts}>
        <div><dt>Booking</dt><dd>{snapshot.bookingCode}</dd></div><div><dt>Phương án phòng</dt><dd>{snapshot.targetRoomTypeId}</dd></div><div><dt>Thời điểm chuyển · {snapshot.quote.timezone}</dt><dd>{formatDateTimeInTz(snapshot.normalizedRequest.effectiveAt, snapshot.quote.timezone)}</dd></div><div><dt>Chênh lệch đã xác minh</dt><dd className={staff.mono}>{formatVnd(snapshot.priceDiffVnd)}</dd></div><div><dt>Phiên bản đang duyệt</dt><dd>Revision #{snapshot.currentRevision} · Version v{snapshot.version}</dd></div><div><dt>Thời hạn báo giá</dt><dd>{formatDateTimeInTz(snapshot.expiresAt, snapshot.quote.timezone)}</dd></div>
      </dl><p className={styles.notice} data-tone="warning">Cảnh báo: Duyệt đề xuất chỉ xác nhận nội dung báo giá mô phỏng — không thực hiện chuyển phòng, giữ phòng hoặc thu tiền.</p></>}
      {action === 'REVISE' && revise && <>
        <p className={styles.notice}>Máy chủ sẽ tính lại báo giá và tạo revision mới; không thể tự sửa số tiền, snapshot hay chính sách.</p>
        <p className={staff.muted}>Đang sửa Revision #{snapshot?.currentRevision} · Version v{snapshot?.version}</p>
        {bookingContext.isPending && <output>Đang tải hạng phòng và quyền lợi…</output>}
        {bookingContext.isError && <div className={styles.notice} data-tone="warning"><p>Chưa tải được lựa chọn từ booking. Giá trị hiện tại vẫn được giữ.</p><button type="button" className={staff.secondaryButton} disabled={busy || bookingContext.isFetching} onClick={() => void bookingContext.refetch()}>Thử tải lựa chọn</button></div>}
        <fieldset className={styles.formFields} disabled={busy}>
          <div className={styles.field}><label htmlFor="revise-room">Hạng phòng đích</label><select id="revise-room" required value={revise.targetRoomTypeId} onChange={(event) => setRevise({ ...revise, targetRoomTypeId: event.target.value })}>
            {!roomTypes.some((room) => room.id === revise.targetRoomTypeId) && <option value={revise.targetRoomTypeId}>{revise.targetRoomTypeId} · Hiện tại</option>}{roomTypes.map((room) => <option key={room.id} value={room.id}>{room.name} ({room.id})</option>)}
          </select></div>
          <div className={styles.field}><label htmlFor="revise-effective">Thời điểm chuyển (ISO kèm múi giờ)</label><input id="revise-effective" type="text" required value={revise.effectiveAt} aria-describedby="revise-effective-hint" onChange={(event) => setRevise({ ...revise, effectiveAt: event.target.value })} /><p id="revise-effective-hint" className={staff.muted}>Ví dụ: 2026-11-28T14:00:00+07:00. Máy chủ kiểm tra thời điểm áp dụng.</p></div>
          <div className={styles.field}><label htmlFor="revise-request">Loại yêu cầu</label><select id="revise-request" value={revise.requestType} onChange={(event) => { const value = event.target.value; if (value === 'UPGRADE' || value === 'ROOM_CHANGE' || value === 'COMPLIMENTARY_UPGRADE') setRevise({ ...revise, requestType: value }); }}>
            {(Object.keys(REQUEST_LABELS) as RoomUpgradeRequestType[]).map((value) => <option key={value} value={value}>{REQUEST_LABELS[value]} ({value})</option>)}
          </select></div>
          <fieldset className={styles.featureFields}><legend>Tiện nghi bắt buộc</legend>{features.length ? features.map((feature) => <label key={feature}><input type="checkbox" checked={revise.requiredFeatures.includes(feature)} onChange={(event) => setRevise({ ...revise, requiredFeatures: event.target.checked ? [...revise.requiredFeatures, feature] : revise.requiredFeatures.filter((value) => value !== feature) })} />{formatRoomFeature(feature)}</label>) : <p className={staff.muted}>Chưa có tiện nghi để chọn.</p>}</fieldset>
          <div className={styles.field}><label htmlFor="revise-benefit">Quyền lợi áp dụng</label><select id="revise-benefit" value={revise.benefitId ?? ''} onChange={(event) => setRevise({ ...revise, benefitId: event.target.value || null })}>
            <option value="">Tự động chọn quyền lợi tốt nhất</option>{revise.benefitId && !benefits.some((benefit) => benefit.id === revise.benefitId) && <option value={revise.benefitId}>{revise.benefitId} · Hiện tại</option>}{benefits.map((benefit) => <option key={benefit.id} value={benefit.id}>{benefit.code} ({benefit.id}){benefit.verifiedAt ? ' · Đã xác minh' : ' · Chưa xác minh'}</option>)}
          </select></div>
        </fieldset>
      </>}
      {(action === 'REJECT' || action === 'ESCALATE') && <p>{action === 'REJECT' ? 'Ghi rõ lý do từ chối đề xuất.' : 'Ghi rõ lý do cần quản lý xét duyệt.'} Quyết định sẽ áp dụng cho Revision #{snapshot?.currentRevision} · Version v{snapshot?.version}.</p>}
      <div className={styles.field}><label htmlFor={`reason-${action}`}>{action === 'REVISE' ? 'Ghi chú chỉnh sửa (không bắt buộc)' : action === 'APPROVE' ? 'Lý do (không bắt buộc)' : 'Lý do (bắt buộc, 1–500 ký tự)'}</label>
        <textarea id={`reason-${action}`} rows={3} maxLength={500} required={action === 'REJECT' || action === 'ESCALATE'} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /><span className={staff.muted}>{reason.trim().length}/500 ký tự</span>
      </div>
    </DecisionDialog>)}
  </div>;
}
