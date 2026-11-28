'use client';

import { useStaffSummary } from '@vintrip/api-client';
import Link from 'next/link';
import { ViniMascot } from '@/features/mascot/tripi-mascot';
import { useStaffPortal } from './staff-context';
import { formatDateTimeInTz, formatRoleLabel, formatVnd } from './staff-format';
import { PROPOSAL_STATUS_META } from './staff-status';
import { StaffEmpty, StaffError, StaffLoading, StaffStatusPill } from './staff-shell';
import styles from './staff.module.css';

export function DashboardScreen() {
  const { activeHotel } = useStaffPortal();
  const summary = useStaffSummary(activeHotel.hotelId);
  const data = summary.data;
  return (
    <div className={styles.stack}>
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>{activeHotel.hotelName}</p><h1>Tổng quan vận hành</h1><p>Theo dõi khách lưu trú và các đề xuất nâng hạng phòng.</p></div>
        <StaffStatusPill meta={{ label: formatRoleLabel(activeHotel.staffRole), tone: 'neutral' }} />
      </div>
      {summary.isPending ? <StaffLoading label="Đang tải tổng quan khách sạn…" />
        : summary.isError ? <StaffError error={summary.error} retrying={summary.isFetching} onRetry={() => void summary.refetch()} />
        : data && <>
          <div className={styles.kpiGrid}>
            {[
              { label: 'Khách đang lưu trú', value: data.counts.inHouseBookings, href: '/staff/bookings' },
              { label: 'Chờ lễ tân duyệt', value: data.counts.pendingReceptionist, href: '/staff/proposals?status=PENDING_RECEPTIONIST' },
              { label: 'Chờ quản lý duyệt', value: data.counts.pendingManager, href: '/staff/proposals?status=PENDING_MANAGER' },
              { label: 'Đề xuất đã duyệt', value: data.counts.approved, href: '/staff/proposals?status=APPROVED' },
            ].map((kpi) => <Link prefetch={false} className={styles.kpi} key={kpi.href} href={kpi.href}><span>{kpi.label}</span><strong>{kpi.value}</strong><span className={styles.kpiLink}>Xem danh sách</span></Link>)}
          </div>
          <dl className={styles.breakdown}>
            <div><dt>Cần báo giá lại</dt><dd>{data.counts.requoteRequired}</dd></div>
            <div><dt>Từ chối</dt><dd>{data.counts.rejected}</dd></div>
            <div><dt>Hết hạn</dt><dd>{data.counts.expired}</dd></div>
            <div><dt>Tổng đề xuất</dt><dd>{data.counts.totalProposals}</dd></div>
          </dl>
        </>}
      <section className={styles.quickAction} aria-labelledby="staff-copilot-title">
        <ViniMascot pose="expr-curious" size={56} alt="Vini AI Copilot" />
        <div><h2 id="staff-copilot-title">Chuẩn bị báo giá cùng Vini</h2><p>Chọn booking, kiểm tra điều kiện và lập đề xuất để nhân viên xét duyệt.</p></div>
        <div className={styles.actions}><Link prefetch={false} className={styles.primaryButton} href="/staff/room-upgrades">Mở Vini AI Copilot</Link><Link prefetch={false} className={styles.secondaryButton} href="/staff/bookings">Chọn booking đang lưu trú</Link></div>
      </section>
      <section className={styles.card} aria-labelledby="staff-recent-title">
        <div className={styles.sectionHeading}><h2 id="staff-recent-title">Đề xuất gần đây</h2><Link prefetch={false} className={styles.textLink} href="/staff/proposals">Xem tất cả</Link></div>
        {summary.isPending ? <StaffLoading label="Đang tải đề xuất gần đây…" />
          : summary.isError ? <StaffError error={summary.error} retrying={summary.isFetching} onRetry={() => void summary.refetch()} />
          : data && (data.recentProposals.length === 0 ? <StaffEmpty title="Chưa có đề xuất nâng hạng"><p>Bắt đầu từ một booking đang lưu trú.</p><Link prefetch={false} className={styles.primaryButton} href="/staff/room-upgrades">Mở Vini AI Copilot</Link></StaffEmpty>
            : <section className={styles.tableScroll} aria-label="Đề xuất gần đây"><table className={styles.table}>
              <thead><tr><th scope="col">Booking</th><th scope="col">Hạng phòng đích</th><th scope="col">Ngày chuyển</th><th scope="col">Chênh lệch VND</th><th scope="col">Trạng thái</th><th scope="col">Phiên bản</th><th scope="col">Hành động</th></tr></thead>
              <tbody>{data.recentProposals.slice(0, 5).map((proposal) => <tr key={proposal.proposalId}>
                <th scope="row" className={styles.mono}>{proposal.bookingCode}</th><td className={styles.mono}>{proposal.targetRoomTypeId}</td><td className={styles.dateCell}>{formatDateTimeInTz(proposal.effectiveAt, data.hotel.timezone)}</td><td className={styles.money}>{formatVnd(proposal.priceDiffVnd)}</td><td><StaffStatusPill meta={PROPOSAL_STATUS_META[proposal.status]} /></td><td className={styles.mono}>Rev #{proposal.currentRevision} · v{proposal.version}</td><td><Link prefetch={false} className={styles.textLink} href={`/staff/proposals/${encodeURIComponent(proposal.proposalId)}`}>Xem chi tiết</Link></td>
              </tr>)}</tbody>
            </table></section>)}
      </section>
    </div>
  );
}
