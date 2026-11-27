'use client';

import { useInHouseBookings } from '@vintrip/api-client';
import Link from 'next/link';
import { useState } from 'react';
import { useStaffPortal } from './staff-context';
import { filterBookings, formatDateTimeInTz } from './staff-format';
import { bookingDetailHref, bookingUpgradeHref } from './staff-path';
import { StaffEmpty, StaffError, StaffLoading, StaffStatusPill } from './staff-shell';
import styles from './staff.module.css';

export { filterBookings } from './staff-format';

export function BookingsScreen() {
  const { activeHotel } = useStaffPortal();
  const bookings = useInHouseBookings(activeHotel.hotelId);
  const data = bookings.data;
  const [search, setSearch] = useState('');
  const filtered = filterBookings(data?.items ?? [], search);
  return (
    <div className={styles.stack}>
      <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{activeHotel.hotelName}</p><h1>Khách đang lưu trú</h1><p>Tra cứu booking và chuẩn bị yêu cầu nâng hạng phòng.</p></div></div>
      <section className={styles.card} aria-label="Danh sách booking đang lưu trú">
        <div className={styles.toolbar}>
          <div className={styles.searchField}><label htmlFor="staff-booking-search">Tìm booking</label><input id="staff-booking-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo mã booking hoặc số phòng, vd: C2-0001, 101..." /></div>
          {search && <button type="button" className={styles.secondaryButton} onClick={() => setSearch('')}>Xóa tìm kiếm</button>}
          <button type="button" className={styles.secondaryButton} disabled={bookings.isFetching} onClick={() => void bookings.refetch()}>{bookings.isFetching ? 'Đang tải…' : 'Tải lại'}</button>
        </div>
        {bookings.isPending ? <StaffLoading label="Đang tải booking đang lưu trú…" />
          : bookings.isError ? <StaffError error={bookings.error} retrying={bookings.isFetching} onRetry={() => void bookings.refetch()} />
          : data && <>
            <output className={styles.resultCount}>{data.items.length} booking đang lưu trú{search.trim() && ` · ${filtered.length} kết quả phù hợp`}</output>
            {filtered.length === 0 ? <StaffEmpty title={search.trim() ? 'Không có booking khớp tìm kiếm' : 'Chưa có booking đang lưu trú'}><p>{search.trim() ? 'Thử mã booking, số phòng hoặc hạng phòng khác.' : 'Booking sẽ xuất hiện tại đây khi khách đang lưu trú tại khách sạn.'}</p>{search.trim() && <button type="button" className={styles.secondaryButton} onClick={() => setSearch('')}>Xóa tìm kiếm</button>}</StaffEmpty>
              : <section className={styles.tableScroll} aria-label="Booking đang lưu trú"><table className={styles.table}>
                <thead><tr><th scope="col">Mã booking</th><th scope="col">Phòng</th><th scope="col">Hạng phòng</th><th scope="col">Nhận phòng</th><th scope="col">Trả phòng</th><th scope="col">Trạng thái</th><th scope="col">Khách</th><th scope="col">Thao tác</th></tr></thead>
                <tbody>{filtered.map((booking) => <tr key={booking.bookingCode}>
                  <th scope="row"><Link prefetch={false} className={`${styles.textLink} ${styles.mono}`} href={bookingDetailHref(booking.bookingCode)}>{booking.bookingCode}</Link></th><td className={styles.mono}>{booking.roomNumber}</td><td className={styles.mono}>{booking.roomTypeId}</td><td className={styles.dateCell}>{formatDateTimeInTz(booking.checkInAt, data.hotel.timezone)}</td><td className={styles.dateCell}>{formatDateTimeInTz(booking.checkOutAt, data.hotel.timezone)}</td><td><StaffStatusPill meta={{ label: 'Đang lưu trú', tone: 'success' }} /></td><td className={styles.dateCell}>{booking.guests} khách</td><td className={styles.rowActionsCell}><Link prefetch={false} className={styles.textLink} href={bookingDetailHref(booking.bookingCode)}>Chi tiết</Link><Link prefetch={false} className={styles.textLink} href={bookingUpgradeHref(booking.bookingCode)}>Yêu cầu nâng hạng</Link></td>
                </tr>)}</tbody>
              </table></section>}
          </>}
      </section>
    </div>
  );
}
