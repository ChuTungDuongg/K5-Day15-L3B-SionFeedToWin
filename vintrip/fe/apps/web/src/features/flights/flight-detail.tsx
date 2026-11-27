'use client';

import {
  HttpError,
  getFlightPassengerMix,
  useApiSession,
  useFlightOffer,
  type FlightSearch,
} from '@vintrip/api-client';
import { t, vi } from '@vintrip/i18n';
import Image from 'next/image';
import Link from 'next/link';
import { ApiErrorNotice } from '@/features/shared/api-state';
import { formatPrice } from '@/features/discovery/trip-card';
import { FlightIcon } from './flight-icon';
import { FlightCard, StaySuggestion, formatFlightDate, useFlightHold } from './flight-results';
import { toAirportOption } from './flight-search-form';
import { formatPassengerMix } from './passenger-picker';
import styles from './flights.module.css';

const copy = vi.flights;

interface FlightDetailProps {
  productId: string;
  date: string;
  passengers: number;
  /** Trẻ em và em bé; không đặt tên children vì trùng prop đặc biệt của React. */
  childCount: number;
  infantCount: number;
  initialFareCode: string;
}

export function FlightDetail(props: FlightDetailProps) {
  const { user } = useApiSession();
  return <Detail key={user?.id ?? 'guest'} {...props} />;
}

/** Một hạng ghế của một chuyến theo đường dẫn /flights/:id, dùng để mở thẳng hoặc chia sẻ. */
function Detail({
  productId,
  date,
  passengers,
  childCount,
  infantCount,
  initialFareCode,
}: FlightDetailProps) {
  const { user, isReady } = useApiSession();
  const passengerQuery = {
    passengers,
    ...(childCount ? { children: childCount } : {}),
    ...(infantCount ? { infants: infantCount } : {}),
  };
  const query = useFlightOffer(productId, { date, ...passengerQuery });
  const offer = query.data;
  // Khi chưa có dữ liệu thì chặng bay chưa biết; giữ chỗ chỉ cần ngày bay và số khách.
  const search: FlightSearch = {
    from: offer?.fromAirport ?? '',
    to: offer?.toAirport ?? '',
    date,
    ...passengerQuery,
  };
  const passengerMix = getFlightPassengerMix(search);
  const hold = useFlightHold(search);
  const isNotFound = query.error instanceof HttpError && query.error.status === 404;
  const selfPath =
    '/flights/' +
    encodeURIComponent(productId) +
    '?' +
    new URLSearchParams({
      date,
      ...Object.fromEntries(Object.entries(passengerQuery).map(([key, count]) => [key, String(count)])),
    });

  return (
    <section aria-labelledby="flight-detail" className={styles.results}>
      <header className={styles.resultsHeader}>
        <div>
          {offer && (
            <Link
              prefetch={false}
              className={styles.backLink}
              href={
                '/flights?' +
                new URLSearchParams({
                  from: search.from,
                  to: search.to,
                  date,
                  ...Object.fromEntries(
                    Object.entries(passengerQuery).map(([key, count]) => [key, String(count)]),
                  ),
                })
              }
            >
              <span aria-hidden="true">←</span>
              {t('flights.detailBack', { from: offer.fromAirport, to: offer.toAirport })}
            </Link>
          )}
          <h2 id="flight-detail">
            {offer
              ? toAirportOption(offer.fromAirport).city +
                ' → ' +
                toAirportOption(offer.toAirport, offer.destination.name).city
              : copy.detailTitle}
          </h2>
        </div>
        <div className={styles.resultsMeta}>
          <span>
            <FlightIcon name="calendar" size={16} />
            {formatFlightDate(date)}
          </span>
          <span>
            <FlightIcon name="users" size={16} />
            {formatPassengerMix(passengerMix)}
          </span>
        </div>
      </header>
      {query.isPending && (
        <div className={styles.skeletonList} role="status" aria-label={copy.loadingFlights}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      )}
      {isNotFound ? (
        <div className={styles.emptyState} role="alert">
          <Image src="/brand/vini/vini-curious.png" alt="" width={140} height={140} />
          <h3>{copy.detailNotFound}</h3>
          <Link prefetch={false} className={styles.bookButton} href="/flights">
            {copy.detailSearchAgain}
          </Link>
        </div>
      ) : (
        <ApiErrorNotice error={query.error} retry={() => void query.refetch()} />
      )}
      {offer && (
        <>
          <section className={styles.detailJourney} aria-label={copy.detailTitle}>
            <ol className={styles.detailTimeline}>
              <li className={styles.detailStep}>
                <span className={styles.detailDot} aria-hidden="true" />
                <div className={styles.detailStepInfo}>
                  <strong>
                    {offer.departTime?.slice(0, 5) ?? '--:--'} · {offer.fromAirport}
                  </strong>
                  <span>{toAirportOption(offer.fromAirport).city}</span>
                </div>
              </li>
              <li className={styles.detailStepMeta}>
                <span>
                  {offer.durationMinutes != null
                    ? t('flights.duration', {
                        hours: Math.floor(offer.durationMinutes / 60),
                        minutes: offer.durationMinutes % 60,
                      })
                    : ''}
                  {offer.durationMinutes != null ? ' · ' : ''}
                  {offer.stops > 0 ? t('flights.stops', { count: offer.stops }) : copy.direct}
                </span>
              </li>
              <li className={styles.detailStep}>
                <span className={styles.detailDot} aria-hidden="true" />
                <div className={styles.detailStepInfo}>
                  <strong>
                    {offer.arriveTime?.slice(0, 5) ?? '--:--'} · {offer.toAirport}
                  </strong>
                  <span>{toAirportOption(offer.toAirport, offer.destination.name).city}</span>
                </div>
              </li>
            </ol>
            {offer.fares[0] && (
              <ul className={styles.detailConditions}>
                {offer.fares[0].carryOnKg != null && (
                  <li>
                    <FlightIcon name="seat" size={18} />
                    <span>{t('flights.carryOn', { kg: offer.fares[0].carryOnKg })}</span>
                  </li>
                )}
                {offer.fares[0].checkedKg != null && (
                  <li>
                    <FlightIcon name="seat" size={18} />
                    <span>
                      {offer.fares[0].checkedKg > 0
                        ? t('flights.checked', { kg: offer.fares[0].checkedKg })
                        : copy.noChecked}
                    </span>
                  </li>
                )}
                <li>
                  <FlightIcon name="shield" size={18} />
                  <span>
                    {offer.fares[0].isRefundable && offer.fares[0].freeCancelDays > 0
                      ? t('flights.freeCancel', { count: offer.fares[0].freeCancelDays })
                      : offer.fares[0].isRefundable
                        ? copy.refundable
                        : vi.commerce.nonRefundable}
                  </span>
                </li>
                {offer.isPriceTaxIncluded && (
                  <li>
                    <FlightIcon name="check" size={18} />
                    <span>{copy.taxIncluded}</span>
                  </li>
                )}
              </ul>
            )}
          </section>
          <div id="flight-booking-section">
            <FlightCard
              flight={offer}
              cabins={[offer]}
              isLocked={!isReady || hold.isPending || hold.isSuccess}
              isHolding={hold.isPending}
              returnTo={user ? undefined : selfPath}
              initialProductId={productId}
              initialFareCode={initialFareCode}
              isInitiallyOpen
              date={date}
              passengers={passengers}
              passengerMix={passengerMix}
              onHold={(cabinId, fareCode) =>
                hold.mutate({ productId: cabinId, fareCode, flightKey: offer.flightKey })
              }
              error={hold.error}
            />
          </div>
          <StaySuggestion destination={offer.destination} search={search} />
          {offer.fares[0]?.totalPrice != null && (
            <div className={styles.detailMobileBar}>
              <div className={styles.detailMobilePrice}>
                <span>{vi.commerce.total}</span>
                <strong>{formatPrice(offer.fares[0].totalPrice)}</strong>
              </div>
              <a href="#flight-booking-section" className={styles.bookButton}>
                {copy.choose}
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}
