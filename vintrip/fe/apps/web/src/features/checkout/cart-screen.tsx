'use client';
import { useEffect } from 'react';
import { useApiSession } from '@vintrip/api-client';
import {
  calculateBookingCartChildDiscount,
  calculateBookingCartTotal,
  countBookingCartGuests,
  findUnderCapacityStays,
  getBookingCartItemKey,
  listBookingCartLineTotals,
  setBookingCartItemQty,
} from '@vintrip/app-core';
import { vi } from '@vintrip/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/features/discovery/trip-card';
import { CheckoutError } from './checkout-error';
import { CheckoutIcon } from './checkout-icon';
import { saveBookingCart, useBookingCart } from './cart-store';
import styles from './cart.module.css';
import { CartWarnings } from './cart-warnings';
import { useHoldCart } from './use-hold-cart';
import { BusyLabel } from '@/features/shared/loading-dots';

const copy = vi.commerce;
const formatDate = (date: string) => date.split('-').reverse().join('/');

export function CartScreen() {
  const router = useRouter();
  const cart = useBookingCart();
  const { user, isReady } = useApiSession();
  const hold = useHoldCart(cart, saveBookingCart);

  // Chưa đăng nhập thì không được xem hay dùng giỏ hàng: chuyển thẳng về trang đăng nhập
  useEffect(() => {
    if (isReady && !user) {
      router.replace('/login?returnTo=%2Fcart');
    }
  }, [isReady, user, router]);

  if (!isReady || !user) {
    return (
      <main className={`ota-container ${styles.page}`} aria-busy="true">
        <div className={styles.skeletonBar} style={{ width: '220px', height: '28px' }} />
        <div className={styles.layout}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonSummary} />
        </div>
      </main>
    );
  }

  const hasItems = cart.items.length > 0;
  const underCapacity = findUnderCapacityStays(cart);
  const surcharge = calculateBookingCartChildDiscount(cart);
  const lineTotals = listBookingCartLineTotals(cart);
  const total = calculateBookingCartTotal(cart);

  return (
    <main className={`ota-container ${styles.page}`}>
      <h1 className={styles.title}>{copy.cartTitle}</h1>
      <p className={styles.subtitle}>
        {hasItems ? `${countBookingCartGuests(cart)} ${copy.guests} · ${copy.cartNoHold}` : copy.cartEmptyCount}
      </p>
      <div className={styles.layout}>
        {hasItems ? (
          <ul className={styles.items}>
            {cart.items.map((line, lineIndex) => {
              const key = getBookingCartItemKey(line);
              const setQty = (qty: number) => saveBookingCart(setBookingCartItemQty(cart, key, qty));
              return (
                <li key={key} className={styles.item}>
                  <div className={styles.itemLead}>
                    <span className={styles.itemThumb} aria-hidden="true">
                      <CheckoutIcon name="bed" size={24} />
                    </span>
                    <div className={styles.itemMeta}>
                      <p className={styles.property}>{line.propertyName}</p>
                      <h2>{line.roomName}</h2>
                      <p className={styles.itemSub}>
                        {line.ratePlanName} · {formatDate(line.checkIn)} → {formatDate(line.checkOut)}
                      </p>
                      <p className={styles.itemSub}>
                        {countBookingCartGuests(cart)} {copy.guests}
                      </p>
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <div className={styles.stepper}>
                      <button type="button" aria-label={copy.cartDecrease} onClick={() => setQty(line.qty - 1)}>
                        −
                      </button>
                      <span className={styles.stepperValue}>
                        {line.qty} {copy.cartRooms}
                      </span>
                      <button
                        type="button"
                        aria-label={copy.cartIncrease}
                        disabled={line.qty >= line.maxQty}
                        onClick={() => setQty(line.qty + 1)}
                      >
                        +
                      </button>
                    </div>
                    <b className={styles.linePrice}>{formatPrice(lineTotals[lineIndex] ?? 0)}</b>
                    <button type="button" className={styles.remove} onClick={() => setQty(0)}>
                      {copy.cartRemove}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.emptyCard}>
            {/* oxlint-disable-next-line nextjs/no-img-element -- mascot Vini trạng thái giỏ hàng trống */}
            <img className={styles.emptyMascot} src="/brand/vini/vini-curious.png" alt="" width={140} height={140} />
            <h2>{copy.cartEmpty}</h2>
            <p>{copy.cartEmptyHint}</p>
            <Link className={`primary-button ${styles.primaryCta}`} href="/search">
              {copy.findHotel}
            </Link>
          </div>
        )}

        <aside className={styles.summary}>
          <h2>{copy.cartSummaryTitle}</h2>
          {surcharge > 0 && (
            <p className={styles.surcharge}>
              <span>{copy.cartChildSurcharge}</span>
              <span>{formatPrice(surcharge)}</span>
            </p>
          )}
          <p className={styles.total}>
            <span>{copy.cartSubtotal}</span>
            <strong>{formatPrice(total)}</strong>
          </p>
          {hasItems && <CartWarnings cart={cart} />}
          <CheckoutError error={hold.error} />
          {isReady && !user ? (
            <Link className="primary-button" href="/login?returnTo=%2Fcart">
              {copy.login}
            </Link>
          ) : hasItems ? (
            <button
              type="button"
              className="primary-button"
              disabled={!isReady || hold.isPending || underCapacity.length > 0}
              onClick={() => hold.mutate()}
            >
              <BusyLabel isBusy={hold.isPending}>{copy.cartBook}</BusyLabel>
            </button>
          ) : (
            <p className={styles.summaryHint}>{copy.cartSummaryEmpty}</p>
          )}
        </aside>
      </div>
    </main>
  );
}
