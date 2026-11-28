'use client';

import { useBookingContext, type RoomUpgradeBooking } from '@vintrip/api-client';
import Link from 'next/link';
import { useStaffPortal } from './staff-context';
import { formatDateInTz, formatDateTimeInTz, formatRoomFeature, formatVnd } from './staff-format';
import { bookingUpgradeHref } from './staff-path';
import { StaffEmpty, StaffError, StaffLoading, StaffStatusPill } from './staff-shell';
import type { StaffStatusMeta } from './staff-status';
import styles from './staff.module.css';

const BOOKING_STATUS_META = {
  IN_HOUSE: { label: 'Đang lưu trú', tone: 'success' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'info' },
  CHECKED_OUT: { label: 'Đã trả phòng', tone: 'neutral' },
} satisfies Record<RoomUpgradeBooking['status'], StaffStatusMeta>;

export function BookingDetailScreen({ bookingCode }: { bookingCode: string }) {
  const { activeHotel } = useStaffPortal();
  const context = useBookingContext(activeHotel.hotelId, bookingCode);
  const data = context.data;
  const currentRoom = data?.roomTypes.find((roomType) => roomType.id === data.booking.roomTypeId);
  return (
    <div className={styles.stack}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn booking"><Link prefetch={false} className={styles.textLink} href="/staff/bookings">Khách đang lưu trú</Link><span aria-hidden="true">/</span><span className={styles.mono} aria-current="page">{bookingCode}</span></nav>
      <h1 className={styles.detailTitle}>Chi tiết booking</h1>
      {context.isPending ? <StaffLoading label="Đang tải chi tiết booking…" />
        : context.isError ? <StaffError booking error={context.error} retrying={context.isFetching} onRetry={() => void context.refetch()} />
        : data && <>
          <section className={`${styles.card} ${styles.bookingHeader}`} aria-labelledby="booking-heading">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Mã booking</p><h2 id="booking-heading" className={styles.mono}>{data.booking.bookingCode}</h2></div><StaffStatusPill meta={BOOKING_STATUS_META[data.booking.status]} /></div>
            <dl className={styles.facts}>
              <div><dt>Phòng</dt><dd className={styles.mono}>{data.booking.roomNumber}</dd></div>
              <div><dt>Hạng phòng hiện tại</dt><dd>{currentRoom?.name ?? data.booking.roomTypeId} <span className={styles.mono}>({data.booking.roomTypeId})</span></dd></div>
              <div><dt>Khách</dt><dd>{data.booking.guests} khách</dd></div>
              <div><dt>Nhận phòng</dt><dd>{formatDateTimeInTz(data.booking.checkInAt, data.hotel.timezone)}</dd></div>
              <div><dt>Trả phòng</dt><dd>{formatDateTimeInTz(data.booking.checkOutAt, data.hotel.timezone)}</dd></div>
            </dl>
            <div className={styles.tags}>{currentRoom?.features.map((feature) => <span key={feature} className={styles.tag}>{formatRoomFeature(feature)}</span>)}</div>
            <div className={styles.bookingHeaderFooter}><p className={styles.muted}>Giờ khách sạn: {data.hotel.timezone}</p><Link prefetch={false} className={styles.primaryButton} href={bookingUpgradeHref(data.booking.bookingCode)}>Yêu cầu nâng hạng với Vini Copilot</Link></div>
          </section>
          <div className={styles.detailGrid}>
            <section className={styles.card} aria-labelledby="booking-nights-title">
              <div className={styles.sectionHeading}><h2 id="booking-nights-title">Giá trị booking gốc từng đêm</h2></div>
              {data.booking.nights.length === 0 ? <StaffEmpty title="Chưa có dữ liệu giá trị từng đêm" />
                : <section className={styles.tableScroll} aria-label="Giá trị booking từng đêm"><table className={styles.table}>
                  <thead><tr><th scope="col">Ngày</th><th scope="col">Tiền gốc đã trả</th><th scope="col">Đối trừ đủ điều kiện</th><th scope="col">Thuế</th><th scope="col">Nguồn</th></tr></thead>
                  <tbody>{data.booking.nights.map((night) => <tr key={night.date}>
                    <th scope="row" className={styles.dateCell}>{formatDateInTz(night.date, data.hotel.timezone)}{(night.paidVnd === null || night.creditEligibleVnd === null) && <div className={styles.cellNote}><StaffStatusPill meta={{ label: 'Thiếu dữ liệu', tone: 'warning' }} /></div>}</th><td className={styles.money}>{formatVnd(night.paidVnd)}</td><td className={styles.money}>{formatVnd(night.creditEligibleVnd)}</td><td className={styles.dateCell}>{night.taxIncluded ? 'Đã gồm thuế' : 'Chưa gồm thuế'}</td><td className={`${styles.mono} ${styles.sourceRef}`}>{night.sourceRef}</td>
                  </tr>)}</tbody>
                </table></section>}
              <p className={styles.cardNote}>Dấu — là thiếu dữ liệu. Giá trị đối trừ theo dữ liệu booking gốc.</p>
            </section>
            <section className={styles.card} aria-labelledby="booking-benefits-title">
              <div className={styles.sectionHeading}><h2 id="booking-benefits-title">Quyền lợi thành viên</h2></div>
              {data.benefits.length === 0 ? <StaffEmpty title="Booking chưa có quyền lợi thành viên" />
                : <ul className={styles.benefitList}>{data.benefits.map((benefit) => <li key={benefit.id}>
                  <div className={styles.benefitHeading}><strong className={styles.mono}>{benefit.code}</strong><StaffStatusPill meta={{ label: benefit.verifiedAt === null ? 'Chưa xác minh' : 'Đã xác minh', tone: benefit.verifiedAt === null ? 'warning' : 'success' }} /></div>
                  <dl className={styles.benefitFacts}><div><dt>Mức giảm</dt><dd className={styles.mono}>{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(benefit.discountBps / 100)}%</dd></div><div><dt>Hạng phòng áp dụng</dt><dd className={styles.mono}>{benefit.roomTypeIds.join(', ') || 'Chưa có hạng phòng áp dụng'}</dd></div><div><dt>Hiệu lực</dt><dd>{formatDateTimeInTz(benefit.validFrom, data.hotel.timezone)} – {formatDateTimeInTz(benefit.validUntil, data.hotel.timezone)}</dd></div>{benefit.verifiedAt && <div><dt>Xác minh lúc</dt><dd>{formatDateTimeInTz(benefit.verifiedAt, data.hotel.timezone)}</dd></div>}</dl>
                </li>)}</ul>}
            </section>
          </div>
          <section className={styles.card} aria-labelledby="booking-rooms-title">
            <div className={styles.sectionHeading}><h2 id="booking-rooms-title">Danh mục hạng phòng của khách sạn</h2></div>
            {data.roomTypes.length === 0 ? <StaffEmpty title="Chưa có danh mục hạng phòng" />
              : <section className={styles.tableScroll} aria-label="Danh mục hạng phòng"><table className={styles.table}>
                <thead><tr><th scope="col">ID</th><th scope="col">Tên hạng phòng</th><th scope="col">Cấp bậc</th><th scope="col">Sức chứa tối đa</th><th scope="col">Tiện nghi</th></tr></thead>
                <tbody>{data.roomTypes.map((roomType) => <tr key={roomType.id} data-current={roomType.id === data.booking.roomTypeId || undefined}><th scope="row" className={styles.mono}>{roomType.id}</th><td>{roomType.name}{roomType.id === data.booking.roomTypeId && <div className={styles.cellNote}><StaffStatusPill meta={{ label: 'Hạng phòng hiện tại', tone: 'info' }} /></div>}</td><td className={styles.mono}>{roomType.rank}</td><td>{roomType.maxGuests} khách</td><td><div className={styles.tags}>{roomType.features.length ? roomType.features.map((feature) => <span className={styles.tag} key={feature}>{formatRoomFeature(feature)}</span>) : '—'}</div></td></tr>)}</tbody>
              </table></section>}
          </section>
        </>}
    </div>
  );
}
