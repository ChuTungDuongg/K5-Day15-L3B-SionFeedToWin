'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createLogicalCommandManager, invalidateRoomUpgradeQueries, parseRoomUpgradeError, roomUpgradesApi,
  useBookingContext, useInHouseBookings,
  type CreateProposalRequest, type Quote, type RoomUpgradeCandidateQuote, type RoomUpgradeChatRequest,
  type RoomUpgradeChatResponse, type RoomUpgradeError, type RoomUpgradeIssue,
} from '@vintrip/api-client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ViniMascot } from '@/features/mascot/tripi-mascot';
import { buildCreateProposalPayload, buildSafeBackendSummary, canCreateProposalFromCandidate, hasConflictingPriceInDraft, selectDefaultCandidateId } from './copilot-helpers';
import { useStaffPortal } from './staff-context';
import { formatDateInTz, formatDateTimeInTz, formatRoomFeature, formatVnd } from './staff-format';
import { StaffStatusPill } from './staff-shell';
import { PROPOSAL_STATUS_META, QUOTE_STATUS_META, type StaffStatusMeta } from './staff-status';
import staff from './staff.module.css';
import styles from './copilot.module.css';

type Panel = 'context' | 'chat' | 'quote';
type Turn = { id: number; text: string; response?: RoomUpgradeChatResponse };
const PANELS = [{ id: 'context', label: 'Bối cảnh' }, { id: 'chat', label: 'Hội thoại Vini' }, { id: 'quote', label: 'Báo giá & Đề xuất' }] as const;
const WORKFLOW_META = {
  COMPLETED: { label: 'COMPLETED · Đã xử lý', tone: 'success' },
  NEEDS_INPUT: { label: 'NEEDS_INPUT · Cần bổ sung', tone: 'info' },
  DEGRADED: { label: 'DEGRADED · AI bị giới hạn', tone: 'warning' },
  BLOCKED_INJECTION: { label: 'BLOCKED_INJECTION · Đã chặn yêu cầu', tone: 'danger' },
  OUT_OF_SCOPE: { label: 'OUT_OF_SCOPE · Ngoài phạm vi', tone: 'neutral' },
  AI_ERROR: { label: 'AI_ERROR · Lỗi dịch vụ AI', tone: 'danger' },
  DEPENDENCY_ERROR: { label: 'DEPENDENCY_ERROR · Lỗi dịch vụ dữ liệu', tone: 'danger' },
} satisfies Record<RoomUpgradeChatResponse['workflowStatus'], StaffStatusMeta>;
const REQUEST_LABELS = { UPGRADE: 'Nâng hạng', ROOM_CHANGE: 'Đổi phòng', COMPLIMENTARY_UPGRADE: 'Nâng hạng miễn phí' };
const FIELD_LABELS: Readonly<Record<string, string>> = {
  bookingCode: 'Mã booking', roomNumber: 'Số phòng', targetRoomTypeId: 'Hạng phòng đích',
  targetRoomHint: 'Mong muốn hạng phòng', effectiveAt: 'Thời điểm chuyển', requestType: 'Loại yêu cầu',
  requiredFeatures: 'Tiện nghi bắt buộc', benefitId: 'Quyền lợi',
};
const PRICE_WARNING = 'Phát hiện sai lệch số tiền trong văn bản nháp AI — đang hiển thị tóm tắt xác minh từ hệ thống';

function Issues({ missingFields, violations }: { missingFields: string[]; violations: RoomUpgradeIssue[] }) {
  return <>
    {missingFields.length > 0 && <div className={styles.notice} data-tone="warning"><strong>Cần bổ sung</strong><ul>{missingFields.map((field) => <li key={field}>{FIELD_LABELS[field] ?? field}</li>)}</ul></div>}
    {violations.length > 0 && <ul className={styles.issues}>{violations.map((issue, index) => <li key={`${issue.code}:${issue.field}:${index}`}>{issue.message} <span className={staff.muted}>({issue.code})</span></li>)}</ul>}
  </>;
}

function ErrorNotice({ error, onRetry, disabled = false, label = 'Thử lại' }: {
  error: RoomUpgradeError; onRetry?: () => void; disabled?: boolean; label?: string;
}) {
  return <div className={styles.notice} data-tone="danger">
    <p role="alert">{error.message}</p>
    <Issues missingFields={error.missingFields ?? []} violations={error.violations ?? []} />
    {onRetry && <button type="button" className={staff.secondaryButton} disabled={disabled} onClick={onRetry}>{label}</button>}
  </div>;
}

function workflowError(response: RoomUpgradeChatResponse): RoomUpgradeError {
  // A workflow failure is a successful HTTP response; adapt it to the same safe error parser.
  const parsed = parseRoomUpgradeError(response);
  return { ...parsed, message: response.workflowStatus === 'AI_ERROR'
    ? 'Vini chưa thể xử lý yêu cầu với dịch vụ AI. Vui lòng thử gửi lại.'
    : 'Dịch vụ dữ liệu báo giá tạm thời chưa sẵn sàng. Vui lòng thử gửi lại.' };
}

function ViniTurn({ response }: { response: RoomUpgradeChatResponse }) {
  const quote = response.selectedQuote ?? response.candidates.find((item) => item.candidateId === selectDefaultCandidateId(response))?.quote;
  const conflict = hasConflictingPriceInDraft(response.messageVi, quote);
  return <>
    <StaffStatusPill meta={WORKFLOW_META[response.workflowStatus]} />
    {conflict && <p className={styles.notice} data-tone="warning">{PRICE_WARNING}</p>}
    <p className={styles.message}>{conflict && quote ? buildSafeBackendSummary(quote) : response.messageVi}</p>
    {response.workflowStatus === 'DEGRADED' && <p className={styles.notice} data-tone="warning">AI đang hoạt động giới hạn. Chỉ các báo giá có kiểm tra độc lập thành công mới đủ điều kiện lập đề xuất.</p>}
    {response.workflowStatus === 'BLOCKED_INJECTION' && <p className={styles.notice} data-tone="danger">Yêu cầu đã bị chặn bởi kiểm soát an toàn. Hãy nhập lại nhu cầu đổi phòng của khách.</p>}
    <Issues missingFields={response.missingFields} violations={response.violations} />
    <details className={styles.trace}>
      <summary>Chi tiết xử lý đã ghi nhận</summary>
      <dl className={styles.facts}>
        <div><dt>Request</dt><dd>{response.requestId}</dd></div>
        <div><dt>Model</dt><dd>{response.model.model ?? 'Chưa ghi nhận tên model'}</dd></div>
        <div><dt>Số lần gọi model</dt><dd>{response.model.callCount}</dd></div>
        <div><dt>Thời gian xử lý</dt><dd>{response.trace.totalLatencyMs} ms</dd></div>
      </dl>
      {response.trace.tools.length > 0 ? <ul>{response.trace.tools.map((tool, index) => <li key={`${tool.tool}:${index}`}>{tool.tool} · {tool.outcome} · {tool.latencyMs} ms</li>)}</ul> : <p>Không có lần gọi công cụ được ghi nhận.</p>}
    </details>
  </>;
}

function QuoteDetails({ quote, candidate, response, currentRoomTypeId, allowAiDraft }: {
  quote: Quote; candidate: RoomUpgradeCandidateQuote; response: RoomUpgradeChatResponse;
  currentRoomTypeId: string | undefined; allowAiDraft: boolean;
}) {
  const conflict = hasConflictingPriceInDraft(response.recommendationReasonVi, quote) || hasConflictingPriceInDraft(response.draftMessageVi, quote);
  const safeSummary = buildSafeBackendSummary(quote, candidate.roomTypeName);
  const actionable = canCreateProposalFromCandidate(candidate);
  const issues = [...new Map([...candidate.violations, ...quote.violations, ...quote.validation.violations]
    .map((issue) => [JSON.stringify([issue.code, issue.field, issue.message]), issue] as const)).values()];
  return <div className={styles.quoteDetails}>
    <div><p className={staff.eyebrow}>Phương án đang xem</p><h3>{candidate.roomTypeName}</h3><p className={staff.mono}>{currentRoomTypeId ?? '—'} → {candidate.candidateId}</p></div>
    <div className={staff.tags}>
      <StaffStatusPill meta={QUOTE_STATUS_META[candidate.quoteStatus]} />
      <StaffStatusPill meta={{ label: quote.validation.checked && quote.validation.passed ? 'Đã kiểm độc lập' : 'Chưa đạt kiểm tra độc lập', tone: quote.validation.checked && quote.validation.passed ? 'success' : 'warning' }} />
      {quote.approvalRole && <StaffStatusPill meta={{ label: quote.approvalRole === 'MANAGER' ? 'Cần quản lý duyệt' : 'Lễ tân duyệt', tone: quote.approvalRole === 'MANAGER' ? 'warning' : 'info' }} />}
    </div>
    <Issues missingFields={[...new Set([...candidate.missingFields, ...quote.missingFields])]} violations={issues} />
    {!actionable && <p className={styles.notice} data-tone="warning">Chưa có tổng tiền chính thức đủ điều kiện xác minh. Không thể tạo đề xuất từ phương án này.</p>}
    <dl className={styles.facts}>
      <div><dt>Áp dụng từ</dt><dd>{formatDateTimeInTz(quote.effectiveAt, quote.timezone)}</dd></div>
      <div><dt>Số đêm còn lại</dt><dd>{quote.remainingNights ?? '—'}</dd></div>
      <div><dt>Báo giá hết hạn</dt><dd>{formatDateTimeInTz(quote.expiresAt, quote.timezone)}</dd></div>
    </dl>
    <p className={staff.muted}>Giờ khách sạn: {quote.timezone}</p>
    {quote.inventoryByNight.length > 0 && <section aria-label="Tồn phòng từng đêm" className={styles.tableScroll}><table className={styles.table}>
      <caption>Tồn phòng từng đêm</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Còn phòng</th><th scope="col">Dừng bán</th></tr></thead>
      <tbody>{quote.inventoryByNight.map((night) => <tr key={night.date}><th scope="row">{formatDateInTz(night.date, quote.timezone)}</th><td>{night.availableUnits ?? '—'}</td><td>{night.stopSell === null ? 'Chưa rõ' : night.stopSell ? 'Có' : 'Không'}</td></tr>)}</tbody>
    </table></section>}
    {quote.breakdown.length > 0 && <section aria-label="Chi tiết giá từng đêm" className={styles.tableScroll}><table className={styles.table}>
      <caption>Chi tiết giá từng đêm · VND</caption>
      <thead><tr><th scope="col">Ngày</th><th scope="col">Giá phòng mới</th><th scope="col">Đối trừ gốc</th><th scope="col">Phí</th><th scope="col">Thuế thêm</th><th scope="col">Giảm hợp lệ</th><th scope="col">Phụ thu</th></tr></thead>
      <tbody>{quote.breakdown.map((night) => <tr key={night.date}><th scope="row">{formatDateInTz(night.date, quote.timezone)}</th><td>{formatVnd(night.newRoomPriceVnd)}</td><td>{formatVnd(night.eligibleOriginalCreditVnd)}</td><td>{formatVnd(night.additionalFeesVnd)}</td><td>{formatVnd(night.additionalTaxVnd)}</td><td>{formatVnd(night.eligibleDiscountVnd)}</td><td>{formatVnd(night.priceDiffVnd)}</td></tr>)}</tbody>
    </table></section>}
    {quote.totals && <dl className={styles.totals}>
      <div><dt>Giá phòng mới</dt><dd>{formatVnd(quote.totals.newRoomTotalVnd)}</dd></div>
      <div><dt>Đối trừ booking gốc</dt><dd>{formatVnd(quote.totals.eligibleOriginalCreditVnd)}</dd></div>
      <div><dt>Phí bổ sung</dt><dd>{formatVnd(quote.totals.additionalFeesVnd)}</dd></div>
      <div><dt>Thuế bổ sung</dt><dd>{formatVnd(quote.totals.additionalTaxVnd)}</dd></div>
      <div><dt>Giảm giá hợp lệ</dt><dd>{formatVnd(quote.totals.eligibleDiscountVnd)}</dd></div>
      <div className={styles.grandTotal}><dt>Tổng phụ thu</dt><dd>{formatVnd(quote.priceDiffVnd)}</dd></div>
    </dl>}
    {quote.benefit && <StaffStatusPill meta={{ label: `Quyền lợi xác minh: ${quote.benefit.code} · ${quote.benefit.discountBps / 100}%`, tone: 'success' }} />}
    <div className={styles.sources}><h3>Nguồn chính sách</h3>
      {quote.policy ? <><p>{quote.policy.code} · v{quote.policy.version}</p><ul>{quote.policy.sources.map((source, index) => <li key={`${source.code}:${index}`}><strong>{source.code}</strong> · {source.clause}</li>)}</ul></>
        : allowAiDraft && response.policySources.length > 0 ? <ul>{response.policySources.map((source, index) => <li key={`${source.ref}:${index}`}><strong>{source.ref}</strong> · {source.clause}</li>)}</ul>
        : <p>Chưa có nguồn chính sách.</p>}
    </div>
    {actionable && <div className={styles.draft}>
      <h3>Tóm tắt & lời nhắn cho khách</h3>
      {conflict && allowAiDraft && <p className={styles.notice} data-tone="warning">{PRICE_WARNING}</p>}
      {allowAiDraft && !conflict ? <>
        {response.recommendationReasonVi && <p className={styles.message}>{response.recommendationReasonVi}</p>}
        <p className={styles.message}>{response.draftMessageVi || safeSummary}</p>
      </> : <p>{safeSummary}</p>}
      {!allowAiDraft && <p className={staff.muted}>Tóm tắt từ báo giá của phương án đang xem.</p>}
    </div>}
  </div>;
}

export function CopilotScreen({ initialBookingCode }: { initialBookingCode: string | null }) {
  const { activeHotel, userId } = useStaffPortal();
  const [bookingCode, setBookingCode] = useState(initialBookingCode);
  const [generation, setGeneration] = useState(0);
  return <CopilotWorkspace key={`${userId}:${activeHotel.hotelId}:${bookingCode ?? 'auto'}:${generation}`}
    selectedBookingCode={bookingCode} onBookingChange={setBookingCode} onNewRequest={() => setGeneration((value) => value + 1)} />;
}

function CopilotWorkspace({ selectedBookingCode, onBookingChange, onNewRequest }: {
  selectedBookingCode: string | null; onBookingChange: (code: string | null) => void; onNewRequest: () => void;
}) {
  const { activeHotel, userId } = useStaffPortal();
  const queryClient = useQueryClient();
  const bookings = useInHouseBookings(activeHotel.hotelId);
  const [panel, setPanel] = useState<Panel>('chat');
  const [draftText, setDraftText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [response, setResponse] = useState<RoomUpgradeChatResponse | null>(null);
  const [resolvedBookingCode, setResolvedBookingCode] = useState(selectedBookingCode);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const commands = useRef(createLogicalCommandManager());
  const chatLock = useRef(false);
  const createLock = useRef(false);
  const nextTurnId = useRef(0);
  const sessionId = useRef<string | null>(null);
  const lastRequest = useRef<RoomUpgradeChatRequest | null>(null);
  const activeBookingCode = response?.sessionContext.bookingCode ?? resolvedBookingCode ?? '';
  const context = useBookingContext(activeHotel.hotelId, activeBookingCode);
  const currentRoom = context.data?.roomTypes.find((room) => room.id === context.data.booking.roomTypeId);

  const createMutation = useMutation({
    mutationFn: (payload: CreateProposalRequest) => commands.current.execute('CREATE', `${activeHotel.hotelId}:${payload.bookingCode}`, payload,
      (key) => roomUpgradesApi.createProposal(payload, key)),
    onSuccess: (result) => {
      // Invalidation failure must never turn a successful persisted create into a retryable create error.
      void invalidateRoomUpgradeQueries(queryClient, userId, activeHotel.hotelId, result.data.proposalId).catch(() => undefined);
    },
    onSettled: () => { createLock.current = false; },
    retry: false,
  });
  const chatMutation = useMutation({
    mutationFn: (request: RoomUpgradeChatRequest) => roomUpgradesApi.chatCopilot(request),
    onSuccess: (result) => {
      sessionId.current = result.sessionId;
      setResolvedBookingCode(result.sessionContext.bookingCode);
      setResponse(result);
      setSelectedCandidateId(selectDefaultCandidateId(result));
      const turn: Turn = { id: nextTurnId.current++, text: '', response: result };
      setTurns((previous) => [...previous, turn]);
    },
    onSettled: () => { chatLock.current = false; },
    retry: false,
  });
  const busy = chatMutation.isPending || createMutation.isPending;
  const workflowFailed = response?.workflowStatus === 'AI_ERROR' || response?.workflowStatus === 'DEPENDENCY_ERROR';
  const activeCandidate = response?.candidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? null;
  const createError = createMutation.isError ? parseRoomUpgradeError(createMutation.error) : null;
  const mismatch = createError?.kind === 'preview_mismatch';
  const quoteReady = Boolean(response && !chatMutation.isPending && !chatMutation.isError && !workflowFailed &&
    (response.workflowStatus === 'COMPLETED' || response.workflowStatus === 'DEGRADED'));
  const send = (message: string, retry = false) => {
    const text = message.trim();
    if (!text || chatLock.current || createLock.current || busy) return;
    chatLock.current = true;
    const request: RoomUpgradeChatRequest = retry && lastRequest.current ? {
      ...lastRequest.current, sessionId: sessionId.current ?? lastRequest.current.sessionId,
      selectedBookingCode: activeBookingCode || lastRequest.current.selectedBookingCode,
    } : {
      hotelId: activeHotel.hotelId, message: text, sessionId: sessionId.current,
      selectedBookingCode: activeBookingCode || null,
    };
    lastRequest.current = request;
    createMutation.reset();
    commands.current.reset();
    setResponse(null);
    setSelectedCandidateId(null);
    if (!retry) {
      const turn: Turn = { id: nextTurnId.current++, text };
      setTurns((previous) => [...previous, turn]);
    }
    setDraftText('');
    chatMutation.mutate(request);
  };
  const retryChat = () => { if (lastRequest.current) send(lastRequest.current.message, true); };
  const create = () => {
    if (!response || !activeCandidate || !quoteReady || mismatch || createMutation.isSuccess || busy || createLock.current || chatLock.current) return;
    const payload = buildCreateProposalPayload(response, activeCandidate);
    if (!payload) return;
    createLock.current = true;
    createMutation.mutate(payload);
  };
  const starter = activeBookingCode ? `Khách booking ${activeBookingCode} muốn nâng lên Deluxe. Vini cần thêm thông tin gì?` : 'Khách muốn nâng hạng phòng. Vini cần những thông tin gì để báo giá?';
  const bookingOptions = bookings.data?.items.filter((booking) => booking.status === 'IN_HOUSE') ?? [];
  const slots = response?.sessionContext;
  const created = createMutation.data?.data;
  const retryableCreate = createError && ['network', 'dependency_unavailable', 'unknown'].includes(createError.kind);

  return <div className={styles.workspace}>
    <header className={staff.pageHeading}><div><p className={staff.eyebrow}>Vini AI Copilot</p><h1>Yêu cầu nâng hạng phòng</h1><p>Tra cứu booking, so sánh báo giá và lập đề xuất chờ duyệt.</p></div></header>
    <nav className={styles.tabs} aria-label="Chọn khung làm việc">{PANELS.map((item) => <button type="button" key={item.id} aria-pressed={panel === item.id} aria-controls={`copilot-${item.id}`} onClick={() => setPanel(item.id)}>{item.label}</button>)}</nav>
    <div className={styles.grid}>
      <section id="copilot-context" aria-label="Bối cảnh booking" className={styles.panel} data-active={panel === 'context'}>
        <div className={styles.panelHeading}><h2>Bối cảnh booking</h2></div>
        <div className={styles.panelBody}>
          <div className={styles.field}><label htmlFor="copilot-booking">Khách đang lưu trú</label><select id="copilot-booking" value={selectedBookingCode ?? ''} disabled={busy} onChange={(event) => onBookingChange(event.target.value || null)}>
            <option value="">Tự xác định qua tin nhắn</option>
            {selectedBookingCode && !bookingOptions.some((booking) => booking.bookingCode === selectedBookingCode) && <option value={selectedBookingCode}>{selectedBookingCode} · Đang kiểm tra</option>}
            {bookingOptions.map((booking) => <option value={booking.bookingCode} key={booking.bookingCode}>{booking.bookingCode} · Phòng {booking.roomNumber} ({booking.roomTypeId})</option>)}
          </select></div>
          {bookings.isPending && <output>Đang tải danh sách booking…</output>}
          {bookings.isError && <ErrorNotice error={parseRoomUpgradeError(bookings.error)} disabled={bookings.isFetching} onRetry={() => void bookings.refetch()} />}
          {!activeBookingCode && <p className={staff.muted}>Chọn booking hoặc nhập mã booking / số phòng trong hội thoại.</p>}
          {activeBookingCode && context.isPending && <output>Đang tải bối cảnh booking…</output>}
          {context.isError && <ErrorNotice error={parseRoomUpgradeError(context.error)} disabled={context.isFetching} onRetry={() => void context.refetch()} />}
          {context.data && <>
            <dl className={styles.facts}>
              <div><dt>Booking</dt><dd className={staff.mono}>{context.data.booking.bookingCode}</dd></div>
              <div><dt>Phòng hiện tại</dt><dd>{context.data.booking.roomNumber}</dd></div>
              <div><dt>Hạng phòng</dt><dd>{currentRoom?.name ?? context.data.booking.roomTypeId} ({context.data.booking.roomTypeId})</dd></div>
              <div><dt>Nhận phòng</dt><dd>{formatDateTimeInTz(context.data.booking.checkInAt, context.data.hotel.timezone)}</dd></div>
              <div><dt>Trả phòng</dt><dd>{formatDateTimeInTz(context.data.booking.checkOutAt, context.data.hotel.timezone)}</dd></div>
              <div><dt>Số khách</dt><dd>{context.data.booking.guests}</dd></div>
            </dl>
            <div className={staff.tags}>{currentRoom?.features.map((feature) => <span className={staff.tag} key={feature}>{formatRoomFeature(feature)}</span>)}</div>
            <p className={staff.muted}>Giờ khách sạn: {context.data.hotel.timezone}</p>
            <h3>Quyền lợi thành viên</h3>
            {context.data.benefits.length === 0 && <p className={staff.muted}>Chưa có quyền lợi được ghi nhận.</p>}
            {context.data.benefits.map((benefit) => <div className={styles.benefit} key={benefit.id}><strong>{benefit.code} · {benefit.discountBps / 100}%</strong><StaffStatusPill meta={{ label: benefit.verifiedAt ? 'Đã xác minh' : 'Chưa xác minh · chưa áp dụng', tone: benefit.verifiedAt ? 'success' : 'warning' }} /></div>)}
          </>}
          {slots && <div className={styles.slots}><h3>Thông tin đã trích xuất</h3><dl className={styles.facts}>
            <div><dt>Hạng phòng đích</dt><dd>{slots.targetRoomTypeId ?? slots.targetRoomHint ?? 'Chưa xác định'}</dd></div>
            <div><dt>Thời điểm chuyển</dt><dd>{formatDateTimeInTz(slots.effectiveAt, activeHotel.timezone)}</dd></div>
            <div><dt>Loại yêu cầu</dt><dd>{REQUEST_LABELS[slots.requestType]}</dd></div>
            <div><dt>Tiện nghi bắt buộc</dt><dd>{slots.requiredFeatures.map(formatRoomFeature).join(', ') || 'Chưa yêu cầu'}</dd></div>
          </dl><Issues missingFields={[...new Set([...(response?.missingFields ?? []), ...slots.pendingMissingFields])]} violations={[]} /></div>}
        </div>
      </section>

      <section id="copilot-chat" aria-label="Hội thoại Vini" className={`${styles.panel} ${styles.chatPanel}`} data-active={panel === 'chat'}>
        <div className={styles.panelHeading}><div className={styles.viniHeading}><ViniMascot pose="expr-curious" size={44} alt="Vini AI Copilot" /><div><h2>Hội thoại Vini</h2><p className={staff.muted}>Trợ lý nâng hạng phòng</p></div></div><button type="button" className={staff.secondaryButton} disabled={busy} onClick={() => { commands.current.reset(); onNewRequest(); }}>Yêu cầu mới</button></div>
        <div className={styles.conversation} aria-busy={chatMutation.isPending}>
          {turns.length === 0 && <div className={styles.welcome}><h3>Khách muốn đổi phòng thế nào?</h3><p>Cho Vini biết booking, hạng phòng mong muốn và thời điểm chuyển. Báo giá sẽ được kiểm tra bằng dữ liệu hệ thống.</p><button type="button" className={styles.prompt} onClick={() => { setDraftText(starter); }}>{starter}</button></div>}
          <ol className={styles.turns}>{turns.map((turn) => <li key={turn.id} className={turn.response ? styles.viniTurn : styles.staffTurn}><strong className={styles.speaker}>{turn.response ? 'Vini' : 'Bạn'}</strong>{turn.response ? <ViniTurn response={turn.response} /> : <p className={styles.message}>{turn.text}</p>}</li>)}</ol>
          {chatMutation.isPending && <output className={styles.notice}>Vini đang xử lý yêu cầu và kiểm tra báo giá trên hệ thống…</output>}
          {chatMutation.isError && <ErrorNotice error={parseRoomUpgradeError(chatMutation.error)} onRetry={retryChat} disabled={busy} label="Thử gửi lại" />}
          {response && workflowFailed && <ErrorNotice error={workflowError(response)} onRetry={retryChat} disabled={busy} label="Thử gửi lại" />}
        </div>
        <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); send(draftText); }}>
          <label htmlFor="copilot-message">Yêu cầu của khách</label>
          <textarea id="copilot-message" rows={4} maxLength={1000} value={draftText} disabled={busy} aria-describedby="copilot-composer-hint" placeholder="Nhập nhu cầu nâng hạng hoặc bổ sung thông tin…" onChange={(event) => setDraftText(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draftText); }
          }} />
          <div className={styles.composerFoot}><span id="copilot-composer-hint" className={staff.muted}>Enter để gửi · Shift+Enter xuống dòng<br />{draftText.length}/1000 ký tự</span><button type="submit" className={staff.primaryButton} disabled={busy || !draftText.trim()}>Gửi yêu cầu</button></div>
        </form>
      </section>

      <section id="copilot-quote" aria-label="Báo giá và đề xuất" className={styles.panel} data-active={panel === 'quote'}>
        <div className={styles.panelHeading}><h2>Báo giá & Đề xuất</h2><span className={staff.tag}>Nguồn: hệ thống</span></div>
        <div className={styles.panelBody}>
          {!response && <p className={styles.empty}>{chatMutation.isPending ? 'Đang chờ kết quả xác minh từ hệ thống…' : 'Nhập yêu cầu ở khung hội thoại để Vini tra cứu và tính báo giá đã xác minh từ hệ thống.'}</p>}
          {response && !activeCandidate && <><StaffStatusPill meta={response.quoteStatus ? QUOTE_STATUS_META[response.quoteStatus] : WORKFLOW_META[response.workflowStatus]} /><Issues missingFields={response.missingFields} violations={response.violations} /><p className={styles.notice}>Chưa có tổng tiền chính thức. Chưa thể tạo đề xuất; hãy bổ sung thông tin hoặc thử gửi lại yêu cầu.</p></>}
          {response && response.candidates.length > 1 && <fieldset className={styles.candidates}><legend>So sánh phương án</legend>{response.candidates.map((candidate) => <label className={styles.candidate} key={candidate.candidateId} data-selected={selectedCandidateId === candidate.candidateId}>
            <input type="radio" name="copilot-candidate" value={candidate.candidateId} checked={selectedCandidateId === candidate.candidateId} disabled={busy || createMutation.isSuccess} onChange={() => { setSelectedCandidateId(candidate.candidateId); createMutation.reset(); }} />
            <span><strong>{candidate.roomTypeName} ({candidate.candidateId})</strong><span className={styles.candidatePrice}>{formatVnd(candidate.quote.priceDiffVnd)}</span><StaffStatusPill meta={QUOTE_STATUS_META[candidate.quoteStatus]} /><span className={staff.muted}>{candidate.quote.approvalRole === 'MANAGER' ? 'Cần quản lý duyệt' : candidate.quote.approvalRole === 'RECEPTIONIST' ? 'Lễ tân duyệt' : 'Chưa xác định người duyệt'}</span></span>
          </label>)}</fieldset>}
          {response && activeCandidate && <QuoteDetails quote={activeCandidate.quote} candidate={activeCandidate} response={response} currentRoomTypeId={context.data?.booking.roomTypeId ?? response.bookingSummary?.currentRoomTypeId} allowAiDraft={activeCandidate.candidateId === response.selectedCandidateId} />}
          {response && activeCandidate && <div className={styles.createSection}>
            {!created && <><p className={staff.muted}>Tạo bản đề xuất chờ duyệt. Chưa thực hiện chuyển phòng hay thu tiền.</p><button type="button" className={staff.primaryButton} disabled={!quoteReady || !canCreateProposalFromCandidate(activeCandidate) || busy || Boolean(mismatch)} onClick={create}>{createMutation.isPending ? 'Đang tạo đề xuất…' : 'Tạo đề xuất chờ duyệt'}</button></>}
            {createMutation.isPending && <output>Đang chờ hệ thống xác nhận lưu đề xuất…</output>}
            {mismatch && <div className={styles.notice} data-tone="warning"><p role="alert">Báo giá trên hệ thống vừa thay đổi so với bản bạn đang xem — chưa lưu đề xuất</p><p>Bản xem trước: {formatVnd(createMutation.variables?.previewExpectation?.expectedPriceDiffVnd)} · Báo giá mới: {formatVnd(createError?.freshQuote?.priceDiffVnd)}</p><button type="button" className={staff.secondaryButton} disabled={busy} onClick={() => send('Vui lòng tính lại báo giá cho yêu cầu vừa trao đổi theo dữ liệu hệ thống mới nhất.')}>Báo giá lại với Vini</button></div>}
            {createError && !mismatch && <ErrorNotice error={createError} disabled={busy} onRetry={retryableCreate ? create : undefined} />}
            {created && <div className={styles.notice} data-tone="success"><output>Đã tạo đề xuất {created.proposalId}</output><StaffStatusPill meta={PROPOSAL_STATUS_META[created.status]} /><p>Rev #{created.currentRevision} · v{created.version}</p><p>Chưa thực hiện chuyển phòng hay thu tiền</p><Link prefetch={false} className={staff.primaryButton} href={`/staff/proposals/${encodeURIComponent(created.proposalId)}`}>Mở chi tiết đề xuất</Link></div>}
          </div>}
        </div>
      </section>
    </div>
  </div>;
}
