'use client';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { commerceApi, getFutureDate, HttpError, useApiSession } from '@vintrip/api-client';
import { isValidTripDate, shiftTripDate } from '@vintrip/app-core';
import { t, vi } from '@vintrip/i18n';
import Image from 'next/image';
import Link from 'next/link';
import { BOOKING_CART_MAX_ROOMS, calculateChildStayDiscount, countRoomsForGuests } from '@vintrip/app-core';

import { BookRateButton } from '@/features/checkout/book-rate-button';
import { CartBar } from '@/features/checkout/cart-bar';
import { ApiErrorNotice } from '@/features/shared/api-state';
import { formatPrice } from '@/features/discovery/trip-card';
import { HotelGallery } from './hotel-gallery';
import { HotelIcon } from './hotel-icon';
import { HotelReviews } from './hotel-reviews';
import styles from './hotel.module.css';

const copy = vi.hotel;
const hasValue = (value: unknown) => value !== null && value !== undefined && value !== '';
const getLabel = (labels: Record<string, string>, key: string) => labels[key] ?? key;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const formatStayDay = (iso: string) =>
  `${WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()]}, ${iso.split('-').reverse().join('/')}`;
type Stay = { checkIn: string; checkOut: string; adults: number; children: number; infants: number };
function isValidStay(stay: Stay): boolean {
  return (
    isValidTripDate(stay.checkIn, shiftTripDate(getFutureDate(0), -1)) &&
    isValidTripDate(stay.checkOut, stay.checkIn) &&
    stay.checkOut > stay.checkIn &&
    Number.isInteger(stay.adults) &&
    stay.adults >= 1 &&
    Number.isInteger(stay.children) &&
    stay.children >= 0 &&
    Number.isInteger(stay.infants) &&
    stay.infants >= 0 &&
    stay.adults + stay.children + stay.infants <= 9
  );
}

/** Giá gợi ý cho số phòng đủ chỗ cả đoàn; tiền thật tính theo số phòng khách chọn. */
function RateTotal({
  totalPrice,
  surcharge,
  roomCount,
  guestCount,
}: {
  totalPrice: number;
  surcharge: number;
  roomCount: number;
  guestCount: number;
}) {
  return (
    <>
      <p>
        {copy.total} ({roomCount} {copy.roomsUnit}, {guestCount} {copy.guests}) ·{' '}
        <b>{formatPrice(totalPrice - surcharge)}</b>
      </p>
      {surcharge > 0 && (
        <p>
          {copy.childSurchargeIncluded} {formatPrice(surcharge)}
        </p>
      )}
    </>
  );
}

export function HotelScreen({
  id,
  checkIn,
  checkOut,
  adults,
  numChildren,
  numInfants,
  resultsHref,
}: {
  id: string;
  checkIn?: string;
  checkOut?: string;
  adults?: string;
  numChildren?: string;
  numInfants?: string;
  resultsHref?: string;
}) {
  const { isReady } = useApiSession();
  const initial = {
    checkIn: checkIn ?? getFutureDate(1),
    checkOut: checkOut ?? getFutureDate(3),
    adults: adults === undefined ? 2 : Number(adults),
    children: numChildren === undefined ? 0 : Number(numChildren),
    infants: numInfants === undefined ? 0 : Number(numInfants),
  };
  const [stay] = useState<Stay>(
    isValidStay(initial) ? initial : { checkIn: getFutureDate(1), checkOut: getFutureDate(3), adults: 2, children: 0, infants: 0 },
  );
  // Đổi ngày, số khách thì quay về trang tìm, giữ sẵn lựa chọn hiện tại.
  const changeStayHref =
    resultsHref ??
    `/search?${new URLSearchParams({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      adults: String(stay.adults),
      ...(stay.children > 0 ? { children: String(stay.children) } : {}),
      ...(stay.infants > 0 ? { infants: String(stay.infants) } : {}),
    })}`;
  const roomCount = (room: { maxGuests: number }) => countRoomsForGuests({ ...stay, maxGuests: room.maxGuests });
  const nights = Math.max(1, Math.round((Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86_400_000));
  // Giá mỗi phòng mỗi đêm hiển thị phải trừ phần giảm cho trẻ em của đoàn đang chọn.
  const getChildPricePerNight = (
    room: { maxGuests: number; roomsNeeded: number },
    rate: { totalPrice: number | null },
  ) => {
    if (!stay.children || rate.totalPrice === null || roomCount(room) > stay.adults) return 0;
    const rooms = roomCount(room);
    const surcharge = calculateChildStayDiscount({
      stayTotal: rooms * Math.round(rate.totalPrice / room.roomsNeeded),
      capacity: rooms * room.maxGuests,
      children: stay.children,
    });
    return -Math.round(surcharge / rooms / nights);
  };
  const query = useQuery({
    queryKey: ['commerce', 'hotel', id, stay],
    enabled: isReady,
    queryFn: ({ signal }) => commerceApi.getHotel(id, { checkIn: stay.checkIn, checkOut: stay.checkOut, adults: stay.adults }, signal),
    // Đổi ngày thì giữ trang đang xem: nếu hiện skeleton, trang co lại và nhảy lên đầu.
    placeholderData: keepPreviousData,
  });
  const hotel = query.data;
  const isMissing = query.error instanceof HttpError && query.error.status === 404;
  const featured = hotel?.amenities?.filter((amenity) => amenity.featured) ?? [];
  const groups = [...new Set(hotel?.amenities?.map((amenity) => amenity.group) ?? [])];
  const facts = Object.entries(hotel?.facts ?? {}).filter(([, value]) => hasValue(value));
  const policies = Object.entries(hotel?.policies ?? {}).filter(([, value]) => hasValue(value));
  const hasAmenities = groups.length > 0 || facts.length > 0 || !!hotel?.languages?.length;
  const hasPolicies = policies.length > 0 || !!hotel?.checkInTime || !!hotel?.checkOutTime;
  const [activeSection, setActiveSection] = useState<'overview' | 'rooms' | 'amenities' | 'policies' | 'reviews'>('overview');

  useEffect(() => {
    if (!hotel || typeof IntersectionObserver === 'undefined') return;
    const ids = ['overview', 'rooms', 'amenities', 'policies', 'reviews'] as const;
    const elements = ids
      .map((sectionId) => document.getElementById(sectionId))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) {
          setActiveSection(visible.target.id as (typeof ids)[number]);
        }
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [hotel]);

  const childPrices = hotel
    ? hotel.rooms.flatMap((room) =>
        room.ratePlans.flatMap((rate) =>
          rate.pricePerNight === null ? [] : [rate.pricePerNight + getChildPricePerNight(room, rate)],
        ),
      )
    : [];
  const priceFromDisplay =
    hotel && hotel.priceFrom !== null
      ? stay.children && childPrices.length > 0
        ? Math.min(...childPrices)
        : hotel.priceFrom
      : null;

  return (
    <main id="content" className={`ota-container ${styles.page}`}>
      <Link prefetch={false} href={resultsHref ?? '/search'} className={styles.back}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{resultsHref ? vi.ota.backToResults : copy.back}</span>
      </Link>
      {isMissing ? (
        <div className={styles.emptyStateCard}>
          <Image src="/brand/vini/vini-curious.png" alt="" width={140} height={140} />
          <h1>{copy.notFound}</h1>
          <Link prefetch={false} href="/search" className={styles.primaryCta}>
            Tìm khách sạn khác
          </Link>
        </div>
      ) : (
        <ApiErrorNotice
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {!hotel && !query.error && (
        <div className={styles.skeleton} role="status" aria-label={copy.loading}>
          <div className={styles.skeletonGallery} />
          <div className={styles.skeletonLines}>
            <span />
            <span />
            <span />
          </div>
          <div className={styles.skeletonRooms}>
            <div className={styles.skeletonRoom} />
            <div className={styles.skeletonRoom} />
          </div>
        </div>
      )}
      {hotel && (
        <>
          <HotelGallery
            images={hotel.images.length ? hotel.images : hotel.thumbnail ? [hotel.thumbnail] : []}
            name={hotel.name}
          />
          <header className={styles.heading}>
            <div className={styles.headingMain}>
              <p className={styles.headingEyebrow}>
                {hotel.province.name}
                {hotel.brand && ` · ${hotel.brand}`}
              </p>
              <h1>{hotel.name}</h1>
              {hotel.stars && (
                <p className={styles.stars} aria-label={`${hotel.stars} ★`}>
                  {'★'.repeat(hotel.stars)}
                </p>
              )}
              {hotel.address && (
                <p className={styles.address}>
                  {hotel.address}
                  {hotel.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${hotel.location.lat},${hotel.location.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.map} ↗
                    </a>
                  )}
                </p>
              )}
              {hotel.rating && (
                <p className={styles.rating}>
                  <strong>
                    {hotel.rating.average.toLocaleString('vi-VN')} {copy.outOfFive}
                  </strong>
                  <span>{t('hotel.reviewCount', { count: hotel.rating.count })}</span>
                  {hotel.rating.source && (
                    <span>
                      {copy.ratingSource}: {hotel.rating.source}
                    </span>
                  )}
                </p>
              )}
            </div>
            {priceFromDisplay !== null && (
              <div className={styles.headingPrice}>
                <span>{copy.from}</span>
                <strong>{formatPrice(priceFromDisplay)}</strong>
                <small>{copy.perNight}</small>
                <a href="#rooms" className={styles.primaryCta}>
                  {copy.chooseRoom}
                </a>
              </div>
            )}
          </header>
          <nav className={styles.sectionNav} aria-label={copy.title}>
            <a
              href="#overview"
              aria-current={activeSection === 'overview' ? 'true' : undefined}
              onClick={() => setActiveSection('overview')}
            >
              {copy.overview}
            </a>
            <a
              href="#rooms"
              aria-current={activeSection === 'rooms' ? 'true' : undefined}
              onClick={() => setActiveSection('rooms')}
            >
              {copy.rooms}
            </a>
            {hasAmenities && (
              <a
                href="#amenities"
                aria-current={activeSection === 'amenities' ? 'true' : undefined}
                onClick={() => setActiveSection('amenities')}
              >
                {copy.amenities}
              </a>
            )}
            {hasPolicies && (
              <a
                href="#policies"
                aria-current={activeSection === 'policies' ? 'true' : undefined}
                onClick={() => setActiveSection('policies')}
              >
                {copy.policies}
              </a>
            )}
            <a
              href="#reviews"
              aria-current={activeSection === 'reviews' ? 'true' : undefined}
              onClick={() => setActiveSection('reviews')}
            >
              {copy.reviews}
            </a>
          </nav>
          <div className={styles.overviewGrid} id="overview">
            <div>
              {hotel.description && (
                <section className={styles.section}>
                  <h2>{copy.introduction}</h2>
                  <p className={styles.description}>{hotel.description}</p>
                </section>
              )}
              {!!hotel.highlights?.length && (
                <section className={styles.section}>
                  <h2>{copy.highlights}</h2>
                  <ul className={styles.highlightList}>
                    {hotel.highlights.map((highlight, index) => (
                      <li key={`${highlight.text}-${index}`}>
                        <HotelIcon name="check" />
                        <span>{highlight.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {featured.length > 0 && (
                <section className={styles.section}>
                  <h2>{copy.featuredAmenities}</h2>
                  <ul className={styles.featured}>
                    {featured.map((amenity) => (
                      <li key={`${amenity.group}-${amenity.name}`}>
                        <HotelIcon name={amenity.icon} />
                        <span>{amenity.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            {(!!hotel.nearby?.length || hotel.checkInTime || hotel.checkOutTime) && (
              <div className={styles.overviewAside}>
                {(hotel.checkInTime || hotel.checkOutTime) && (
                  <div className={styles.checkTimesCard}>
                    {hotel.checkInTime && (
                      <p>
                        <span>{copy.checkIn}</span>
                        <strong>{hotel.checkInTime}</strong>
                      </p>
                    )}
                    {hotel.checkOutTime && (
                      <p>
                        <span>{copy.checkOut}</span>
                        <strong>{hotel.checkOutTime}</strong>
                      </p>
                    )}
                  </div>
                )}
                {!!hotel.nearby?.length && (
                  <aside className={styles.nearby}>
                    <h2>{copy.nearby}</h2>
                    <ul>
                      {hotel.nearby.map((place) => (
                        <li key={place.name}>
                          <span>{place.name}</span>
                          <strong>{place.distanceKm.toLocaleString('vi-VN')} km</strong>
                        </li>
                      ))}
                    </ul>
                    <small>{copy.mockNearby}</small>
                  </aside>
                )}
              </div>
            )}
          </div>
          <section id="rooms" className={styles.section}>
            <h2>{copy.rooms}</h2>
            {/* Ngày và số khách chọn ở trang tìm; ở đây chỉ nhắc lại để khách biết đang xem giá cho kỳ nào. */}
            <div className={styles.staySummary}>
              <div>
                <span>{copy.checkIn}</span>
                <strong>{formatStayDay(stay.checkIn)}</strong>
              </div>
              <div>
                <span>{copy.checkOut}</span>
                <strong>{formatStayDay(stay.checkOut)}</strong>
              </div>
              <div>
                <span>{copy.adults}</span>
                <strong>
                  {stay.adults} {copy.adultsLabel.toLowerCase()}
                  {stay.children > 0 && ` · ${stay.children} ${copy.childrenLabel.toLowerCase()}`}
                  {stay.infants > 0 && ` · ${stay.infants} ${copy.infantsLabel.toLowerCase()}`}
                </strong>
              </div>
              <div>
                <span>{copy.nightsLabel}</span>
                <strong>{nights}</strong>
              </div>
              <Link prefetch={false} className={styles.secondaryCta} href={changeStayHref}>
                {copy.changeStayDetails}
              </Link>
            </div>
            {!hotel.isAvailable && <p className={styles.notice}>{copy.unavailable}</p>}
            {!hotel.rooms.length && (
              <div className={styles.emptyStateCard}>
                <Image src="/brand/vini/vini-curious.png" alt="" width={120} height={120} />
                <p>{copy.noRooms}</p>
                <Link prefetch={false} href="/search" className={styles.secondaryCta}>
                  Tìm khách sạn khác
                </Link>
              </div>
            )}
            <div className={styles.rooms} aria-busy={query.isFetching}>
              {hotel.rooms.map((room) => {
                const availablePrices = room.isAvailable
                  ? room.ratePlans.flatMap((rate) =>
                      rate.pricePerNight !== null && rate.totalPrice !== null
                        ? [rate.pricePerNight + getChildPricePerNight(room, rate)]
                        : [],
                    )
                  : [];
                const lowestRatePrice = availablePrices.length > 0 ? Math.min(...availablePrices) : null;
                const bestRateIndex =
                  lowestRatePrice !== null
                    ? room.ratePlans.findIndex(
                        (candidate) =>
                          candidate.pricePerNight !== null &&
                          candidate.totalPrice !== null &&
                          candidate.pricePerNight + getChildPricePerNight(room, candidate) === lowestRatePrice,
                      )
                    : -1;
                return (
                  <article
                    className={styles.room}
                    key={room.productId}
                    data-unavailable={!room.isAvailable ? 'true' : undefined}
                  >
                    <div className={styles.roomInfo}>
                      <HotelGallery images={room.images ?? []} name={room.name} layout="carousel" />
                      <h3>{room.name}</h3>
                      <ul className={styles.roomFacts}>
                        {room.areaM2 !== null && room.areaM2 !== undefined && <li>{room.areaM2} m²</li>}
                        {room.bedType && <li>{room.bedType}</li>}
                        {room.view && <li>{getLabel(copy.views, room.view)}</li>}
                        <li title={copy.capacityHint}>
                          {copy.maxGuests} {room.maxGuests} {copy.guests}
                        </li>
                      </ul>
                      {!!room.amenities?.length && (
                        <ul className={styles.roomAmenities}>
                          {room.amenities.map((amenity) => (
                            <li key={amenity}>
                              <HotelIcon name="check" />
                              {amenity}
                            </li>
                          ))}
                        </ul>
                      )}
                      {room.remaining !== null && (
                        <p className={styles.roomMeta}>
                          {copy.remaining}: {room.remaining}
                        </p>
                      )}
                      <p className={styles.roomMeta}>
                        {copy.roomsNeeded}: {countRoomsForGuests({ ...stay, maxGuests: room.maxGuests })}
                      </p>
                      {!room.isAvailable && (
                        <p className={styles.notice}>
                          {room.reason ? vi.commerce.reasons[room.reason] : copy.unavailable}
                        </p>
                      )}
                    </div>
                    <div className={styles.rates}>
                      {room.ratePlans.map((rate, rateIndex) => {
                        const isBestRate = room.isAvailable && rateIndex === bestRateIndex;
                        const canBookRate = room.isAvailable && rate.totalPrice !== null;
                        return (
                          <div key={rate.code} className={styles.rate}>
                            <div className={styles.rateDetails}>
                              <div className={styles.rateHeader}>
                                <h4>{rate.name}</h4>
                                {isBestRate && <span className={styles.bestPriceBadge}>Giá tốt</span>}
                              </div>
                              {rate.perks?.length > 0 && (
                                <ul>
                                  {rate.perks.map((perk) => (
                                    <li key={perk}>
                                      <HotelIcon name="check" />
                                      {perk}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p className={styles.ratePolicy} data-refundable={rate.isRefundable}>
                                {rate.isRefundable && <HotelIcon name="check" />}
                                <span>
                                  {rate.isRefundable
                                    ? t('hotel.freeCancel', { days: rate.freeCancelDays })
                                    : copy.nonRefundable}
                                </span>
                              </p>
                            </div>
                            <div className={styles.ratePrice}>
                              <div className={styles.rateAmount}>
                                {rate.listPricePerNight !== null &&
                                  rate.pricePerNight !== null &&
                                  rate.listPricePerNight > rate.pricePerNight && (
                                    <del>{formatPrice(rate.listPricePerNight)}</del>
                                  )}
                                {rate.discountPct !== null && rate.discountPct > 0 && stay.children === 0 && (
                                  <span className={styles.discount}>-{rate.discountPct}%</span>
                                )}
                              </div>
                              {rate.pricePerNight !== null ? (
                                <div className={styles.rateAmount}>
                                  <strong>{formatPrice(rate.pricePerNight + getChildPricePerNight(room, rate))}</strong>
                                  <small>{copy.perNight}</small>
                                </div>
                              ) : (
                                <p className={styles.rateUnavailableText}>{copy.rateUnavailable}</p>
                              )}
                              {rate.totalPrice !== null && roomCount(room) > stay.adults && (
                                <p className={styles.roomMeta}>{copy.cannotFitParty}</p>
                              )}
                              {rate.totalPrice !== null && roomCount(room) <= stay.adults && (
                                <RateTotal
                                  totalPrice={roomCount(room) * Math.round(rate.totalPrice / room.roomsNeeded)}
                                  surcharge={calculateChildStayDiscount({
                                    stayTotal: roomCount(room) * Math.round(rate.totalPrice / room.roomsNeeded),
                                    capacity: roomCount(room) * room.maxGuests,
                                    children: stay.children,
                                  })}
                                  roomCount={roomCount(room)}
                                  guestCount={stay.adults + stay.children + stay.infants}
                                />
                              )}
                              {canBookRate ? (
                                <BookRateButton
                                  booking={{
                                    productId: room.productId,
                                    ratePlanCode: rate.code,
                                    checkIn: hotel.stay.checkIn,
                                    checkOut: hotel.stay.checkOut,
                                    propertyId: hotel.id,
                                    propertyName: hotel.name,
                                    roomName: room.name,
                                    ratePlanName: rate.name,
                                    maxGuests: room.maxGuests,
                                    stayPricePerRoom: Math.round(rate.totalPrice! / room.roomsNeeded),
                                    maxQty: Math.min(room.remaining ?? BOOKING_CART_MAX_ROOMS, BOOKING_CART_MAX_ROOMS),
                                  }}
                                  guests={{ adults: stay.adults, children: stay.children, infants: stay.infants }}
                                  isDisabled={query.isFetching}
                                />
                              ) : (
                                <button type="button" className={styles.soldOutBtn} disabled aria-disabled="true">
                                  Hết phòng
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          {priceFromDisplay !== null && (
            <div className={styles.mobilePriceBar}>
              <div className={styles.mobilePriceInfo}>
                <span>{copy.from}</span>
                <strong>
                  {formatPrice(priceFromDisplay)}
                  <small> {copy.perNightShort}</small>
                </strong>
              </div>
              <a href="#rooms" className={styles.primaryCta}>
                {copy.chooseRoom}
              </a>
            </div>
          )}
          <CartBar />
          {hasAmenities && (
            <section id="amenities" className={styles.section}>
              <h2>{copy.allAmenities}</h2>
              <div className={styles.amenityGroups}>
                {groups.map((group) => (
                  <div key={group}>
                    <h3>{getLabel(copy.groups, group)}</h3>
                    <ul>
                      {hotel.amenities
                        .filter((amenity) => amenity.group === group)
                        .map((amenity) => (
                          <li key={amenity.name}>
                            <HotelIcon name={amenity.icon} />
                            {amenity.name}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
              {facts.length > 0 && (
                <>
                  <h3>{copy.facts}</h3>
                  <dl className={styles.facts}>
                    {facts.map(([key, value]) => (
                      <div key={key}>
                        <dt>{getLabel(copy.factLabels, key)}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {!!hotel.languages?.length && (
                <p>
                  <strong>{copy.languages}: </strong>
                  {hotel.languages.map((language) => getLabel(copy.languageNames, language)).join(', ')}
                </p>
              )}
            </section>
          )}
          {hasPolicies && (
            <section id="policies" className={styles.section}>
              <h2>{copy.policies}</h2>
              <div className={styles.policyBox}>
                {(hotel.checkInTime || hotel.checkOutTime) && (
                  <div className={styles.checkTimes}>
                    {hotel.checkInTime && (
                      <p>
                        {copy.checkIn}
                        <strong>{hotel.checkInTime}</strong>
                      </p>
                    )}
                    {hotel.checkOutTime && (
                      <p>
                        {copy.checkOut}
                        <strong>{hotel.checkOutTime}</strong>
                      </p>
                    )}
                  </div>
                )}
                {policies.length > 0 && (
                  <dl className={styles.policyList}>
                    {policies.map(([key, value]) => (
                      <div key={key}>
                        <dt>{getLabel(copy.policyLabels, key)}</dt>
                        <dd>{key === 'depositAmount' ? formatPrice(Number(value)) : String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </section>
          )}
          <HotelReviews key={id} id={id} />
        </>
      )}
    </main>
  );
}
