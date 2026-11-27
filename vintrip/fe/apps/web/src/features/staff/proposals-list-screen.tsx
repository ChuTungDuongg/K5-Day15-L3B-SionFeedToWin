'use client';

import { parseRoomUpgradeError, useProposalsList, type ProposalStatus, type StaffRole } from '@vintrip/api-client';
import Link from 'next/link';
import { useState } from 'react';
import { formatActorShort, parseApprovalRoleParam, parseProposalStatusParam } from './proposal-helpers';
import { useStaffPortal } from './staff-context';
import { formatDateTimeInTz, formatShortRoleLabel, formatVnd } from './staff-format';
import { StaffStatusPill } from './staff-shell';
import { PROPOSAL_STATUS_META } from './staff-status';
import styles from './proposal.module.css';
import staff from './staff.module.css';

const STATUSES: ProposalStatus[] = ['PENDING_RECEPTIONIST', 'PENDING_MANAGER', 'REQUOTE_REQUIRED', 'APPROVED', 'REJECTED', 'EXPIRED', 'DRAFT'];
const TERMINAL_STATUSES: ReadonlySet<ProposalStatus> = new Set(['APPROVED', 'REJECTED', 'EXPIRED']);
const LIMIT = 20;

export function ProposalsListScreen({ initialStatus, initialApprovalRole, initialBookingCode }: {
  initialStatus?: ProposalStatus; initialApprovalRole?: StaffRole; initialBookingCode: string;
}) {
  const { activeHotel, userId } = useStaffPortal();
  return <ProposalsListWorkspace key={`${userId}:${activeHotel.hotelId}`} initialStatus={initialStatus} initialApprovalRole={initialApprovalRole} initialBookingCode={initialBookingCode} />;
}

function ProposalsListWorkspace({ initialStatus, initialApprovalRole, initialBookingCode }: {
  initialStatus?: ProposalStatus; initialApprovalRole?: StaffRole; initialBookingCode: string;
}) {
  const { activeHotel } = useStaffPortal();
  const [status, setStatus] = useState(initialStatus);
  const [requiredApprovalRole, setRequiredApprovalRole] = useState(initialApprovalRole);
  const [bookingDraft, setBookingDraft] = useState(initialBookingCode);
  const [bookingCode, setBookingCode] = useState(initialBookingCode);
  const [offset, setOffset] = useState(0);
  const list = useProposalsList({ hotelId: activeHotel.hotelId, status, bookingCode: bookingCode.trim() || undefined,
    requiredApprovalRole, limit: LIMIT, offset });
  const data = list.data;

  return <div className={`${staff.stack} ${styles.workspace}`}>
    <header className={staff.pageHeading}>
      <div><p className={staff.eyebrow}>{activeHotel.hotelName}</p><h1>Quản lý đề xuất</h1><p>Xem báo giá mô phỏng và các đề xuất cần con người xét duyệt.</p></div>
      <button type="button" className={staff.secondaryButton} disabled={list.isFetching} onClick={() => void list.refetch()}>Làm mới</button>
    </header>
    <section className={staff.card} aria-label="Hàng đợi đề xuất">
      <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setBookingCode(bookingDraft.trim()); setOffset(0); }}>
        <div className={styles.field}><label htmlFor="proposal-status">Trạng thái</label><select id="proposal-status" value={status ?? ''} onChange={(event) => { setStatus(parseProposalStatusParam(event.target.value)); setOffset(0); }}>
          <option value="">Tất cả</option>{STATUSES.map((value) => <option key={value} value={value}>{PROPOSAL_STATUS_META[value].label}</option>)}
        </select></div>
        <div className={styles.field}><label htmlFor="proposal-role">Vai trò duyệt</label><select id="proposal-role" value={requiredApprovalRole ?? ''} onChange={(event) => { setRequiredApprovalRole(parseApprovalRoleParam(event.target.value)); setOffset(0); }}>
          <option value="">Tất cả vai trò</option><option value="RECEPTIONIST">Lễ tân (RECEPTIONIST)</option><option value="MANAGER">Quản lý (MANAGER)</option>
        </select></div>
        <div className={styles.field}><label htmlFor="proposal-booking">Mã booking</label><input id="proposal-booking" value={bookingDraft} onChange={(event) => setBookingDraft(event.target.value)} placeholder="Nhập mã booking" /></div>
        <div className={staff.actions}><button type="submit" className={staff.primaryButton}>Áp dụng</button><button type="button" className={staff.secondaryButton} onClick={() => { setStatus(undefined); setRequiredApprovalRole(undefined); setBookingDraft(''); setBookingCode(''); setOffset(0); }}>Xóa bộ lọc</button></div>
      </form>
      {list.isPending && <div className={staff.loading} aria-busy="true"><output>Đang tải đề xuất…</output><div className={staff.skeleton} /><div className={staff.skeleton} /><div className={staff.skeleton} /></div>}
      {list.isError && <div className={staff.empty}><p role="alert">{parseRoomUpgradeError(list.error).message}</p><button type="button" className={staff.secondaryButton} disabled={list.isFetching} onClick={() => void list.refetch()}>Thử lại</button></div>}
      {!list.isError && data && <>
        {data.items.length === 0 ? <div className={staff.empty}><strong>Không có đề xuất phù hợp</strong><p>Điều chỉnh bộ lọc hoặc tạo đề xuất báo giá mới.</p><Link prefetch={false} href="/staff/room-upgrades" className={staff.secondaryButton}>Tạo đề xuất với Vini Copilot</Link></div> :
          <section className={staff.tableScroll} aria-label="Danh sách đề xuất"><table className={staff.table}>
            <thead><tr>{['Mã booking', 'Hạng phòng đích', 'Áp dụng từ', 'Chênh lệch VND', 'Trạng thái', 'Vai trò duyệt', 'Phiên bản', 'Hết hạn', 'Thao tác'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.proposalId}>
              <th scope="row">{item.bookingCode}<p className={staff.muted}>{formatActorShort(item.proposalId)}</p></th>
              <td className={staff.mono}>{item.targetRoomTypeId}</td><td className={staff.dateCell}>{formatDateTimeInTz(item.effectiveAt, activeHotel.timezone)}</td><td className={staff.money}>{formatVnd(item.priceDiffVnd)}</td>
              <td><StaffStatusPill meta={PROPOSAL_STATUS_META[item.status]} /></td><td className={styles.noWrap}>{formatShortRoleLabel(item.requiredApprovalRole)}</td>
              <td className={styles.noWrap}>Rev #{item.currentRevision} · v{item.version}</td>
              <td className={staff.dateCell}>{formatDateTimeInTz(item.expiresAt, activeHotel.timezone)}{item.isExpired && !TERMINAL_STATUSES.has(item.status) && <p><StaffStatusPill meta={{ label: 'Hết hạn', tone: 'warning' }} /></p>}</td>
              <td className={styles.noWrap}><Link prefetch={false} className={staff.textLink} href={`/staff/proposals/${encodeURIComponent(item.proposalId)}`}>Xem &amp; Xử lý</Link></td>
            </tr>)}</tbody>
          </table></section>}
        <nav aria-label="Phân trang đề xuất" className={styles.pagination}>
          <output>Hiển thị {data.items.length ? data.offset + 1 : 0}–{data.items.length ? data.offset + data.items.length : 0} / tổng {data.total} đề xuất</output>
          <div className={staff.actions}><button type="button" className={staff.secondaryButton} disabled={list.isFetching || data.offset <= 0} onClick={() => setOffset(Math.max(0, data.offset - data.limit))}>Trang trước</button>
            <button type="button" className={staff.secondaryButton} disabled={list.isFetching || data.offset + data.limit >= data.total} onClick={() => setOffset(data.offset + data.limit)}>Trang sau</button></div>
        </nav>
      </>}
    </section>
    <p className={staff.muted}>Thời gian theo múi giờ khách sạn: {activeHotel.timezone}.</p>
  </div>;
}
