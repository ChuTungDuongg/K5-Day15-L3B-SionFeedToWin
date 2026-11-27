'use client';
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { commerceApi, useApiSession } from '@vintrip/api-client';
import { t, vi } from '@vintrip/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/features/discovery/trip-card';
import { CheckoutError } from './checkout-error';
import { CheckoutIcon } from './checkout-icon';
import styles from './checkout.module.css';
import { BusyLabel } from '@/features/shared/loading-dots';

const copy = vi.commerce;
/** Đơn nhiều mục không kéo dài thẻ (và cả hàng thẻ): chỉ hiện chừng này mục, còn lại xem ở chi tiết đơn. */
const MAX_ITEMS_PER_CARD = 2;
const formatDate = (date: string) => date.split('-').reverse().join('/');
type BookingTab = 'upcoming' | 'past' | 'cancelled';

const BOOKING_TABS: ReadonlyArray<{ id: BookingTab; label: string }> = [
  { id: 'upcoming', label: 'Sắp tới' },
  { id: 'past', label: 'Đã qua' },
  { id: 'cancelled', label: 'Đã huỷ' },
];

function classifyTrip(status: string, tripStatus?: string | null): BookingTab {
  if (status === 'cancelled' || status === 'expired' || status === 'failed' || status === 'refunded') {
    return 'cancelled';
  }
  if (tripStatus === 'completed') return 'past';
  return 'upcoming';
}

function getStatusVisual(status: string, tripStatus?: string | null): { tone: 'paid' | 'pending' | 'cancelled'; icon: 'check' | 'refresh' | 'x' } {
  if (status === 'cancelled' || status === 'expired' || status === 'failed' || status === 'refunded') {
    return { tone: 'cancelled', icon: 'x' };
  }
  if (status === 'paid' || tripStatus === 'completed') {
    return { tone: 'paid', icon: 'check' };
  }
  return { tone: 'pending', icon: 'refresh' };
}

/** Chuyến đi của tôi: mọi đơn của người đang đăng nhập, mới đặt trước. */
export function BookingsScreen() {
  const router = useRouter();
  const { user, isReady } = useApiSession();

  useEffect(() => {
    if (isReady && !user) {
      router.replace('/login?returnTo=%2Fbookings');
    }
  }, [isReady, user, router]);

  if (!isReady || !user) {
    return (
      <main className={`ota-container ${styles.page}`} aria-busy="true">
        <div className={styles.skeletonBar} style={{ width: '220px', height: '32px', marginBottom: '20px' }} />
        <div className={styles.trips}>
          <div className={styles.skeletonTrip} />
          <div className={styles.skeletonTrip} />
        </div>
      </main>
    );
  }

  return (
    <main className={`ota-container ${styles.page}`}>
      <h1 className={styles.title}>{copy.booked}</h1>
      <BookingsList />
    </main>
  );
}

/** Danh sách chuyến đã đặt, không có khung trang: dùng ở /bookings và mục "Chuyến đã đặt" của /account. */
export function BookingsList() {
  const { user, isReady } = useApiSession();
  const [activeTab, setActiveTab] = useState<BookingTab>('upcoming');
  const query = useInfiniteQuery({
    queryKey: ['commerce', 'trips', user?.id],
    enabled: isReady && !!user,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => commerceApi.listTrips(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const trips = query.data?.pages.flatMap((page) => page.trips) ?? [];
  const counts: Record<BookingTab, number> = {
    upcoming: trips.filter((trip) => classifyTrip(trip.status, trip.tripStatus) === 'upcoming').length,
    past: trips.filter((trip) => classifyTrip(trip.status, trip.tripStatus) === 'past').length,
    cancelled: trips.filter((trip) => classifyTrip(trip.status, trip.tripStatus) === 'cancelled').length,
  };
  const visibleTrips = trips.filter((trip) => classifyTrip(trip.status, trip.tripStatus) === activeTab);

  return (
    <>
      <div className={styles.segmentedTabs} role="tablist" aria-label={copy.booked}>
        {BOOKING_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={styles.segmentedTab}
              data-active={isSelected || undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              {query.isSuccess && <span className={styles.tabCount}>{counts[tab.id]}</span>}
            </button>
          );
        })}
      </div>
      {query.isPending && !!user && (
        <div className={styles.trips} aria-busy="true">
          <div className={styles.skeletonTrip} />
          <div className={styles.skeletonTrip} />
        </div>
      )}
      <CheckoutError error={query.error} retry={() => void query.refetch()} />
      {query.isSuccess && !visibleTrips.length && (
        <div className={styles.bookingsEmpty}>
          {/* oxlint-disable-next-line nextjs/no-img-element -- mascot Vini trạng thái chưa có chuyến đi */}
          <img className={styles.emptyMascot} src="/brand/vini/vini-guide.png" alt="" width={140} height={140} />
          <h3>{trips.length ? 'Không có chuyến nào ở mục này' : 'Bạn chưa có chuyến nào'}</h3>
          <p>{copy.noTripsHint}</p>
          <Link prefetch={false} className="primary-button" href="/search">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            {copy.findHotel}
          </Link>
        </div>
      )}
      <div className={styles.trips}>
        {visibleTrips.map((trip) => {
          const visual = getStatusVisual(trip.status, trip.tripStatus);
          const statusText =
            trip.tripStatus === 'completed'
              ? copy.tripCompleted
              : (copy.status[trip.status as keyof typeof copy.status] ?? trip.status);
          return (
            <Link prefetch={false} key={trip.orderId} href={`/checkout/${trip.orderId}`} className={styles.trip}>
              <div className={styles.tripMediaRow}>
                <span className={styles.tripThumb} aria-hidden="true">
                  <CheckoutIcon name={trip.items[0]?.productType === 'flight' ? 'plane' : 'bed'} size={22} />
                </span>
                <div className={styles.summaryHead}>
                  <span className={styles.status} data-tone={visual.tone}>
                    <CheckoutIcon name={visual.icon} size={13} />
                    <span>{statusText}</span>
                  </span>
                  {trip.confirmationCode && <code>{trip.confirmationCode}</code>}
                </div>
              </div>
              {trip.items.slice(0, MAX_ITEMS_PER_CARD).map((item) => (
                <div key={item.id}>
                  {item.propertyName && <p className={styles.property}>{item.propertyName}</p>}
                  <h2>{item.productName}</h2>
                  <p className={styles.tripMeta}>
                    {item.productType === 'flight'
                      ? `${formatDate(item.date)} · ${t('flights.passengers', { count: item.qty })} · `
                      : `${formatDate(item.date)} → ${formatDate(item.dateTo)} · ${item.nights} ${copy.nights} · ${item.qty} × `}
                    {item.ratePlanName}
                  </p>
                </div>
              ))}
              {trip.items.length > MAX_ITEMS_PER_CARD && (
                <p className={styles.moreItems}>
                  {t('commerce.moreItems', { count: trip.items.length - MAX_ITEMS_PER_CARD })}
                </p>
              )}
              <p className={styles.total}>
                <span>{copy.total}</span>
                <strong>{formatPrice(trip.total)}</strong>
              </p>
            </Link>
          );
        })}
      </div>
      {query.hasNextPage && (
        <button
          type="button"
          className="secondary-button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <BusyLabel isBusy={query.isFetchingNextPage}>{vi.api.next}</BusyLabel>
        </button>
      )}
    </>
  );
}
