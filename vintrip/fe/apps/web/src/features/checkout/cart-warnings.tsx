'use client';
import { countBookingCartGuests, findUnderCapacityStays, type BookingCart } from '@vintrip/app-core';
import { vi } from '@vintrip/i18n';
import styles from './cart.module.css';

const copy = vi.commerce;

export function CartWarnings({ cart }: { cart: BookingCart }) {
  return findUnderCapacityStays(cart).map((stay) => (
    <p key={stay.propertyName} role="alert" className={styles.warning}>
      <svg className={styles.warningIcon} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path d="M12 3 2.5 19.5h19L12 3Z" strokeLinejoin="round" />
        <path d="M12 9.5v4.5M12 16.5h.01" strokeLinecap="round" />
      </svg>
      <span>
        {stay.propertyName}:{' '}
        {stay.reason === 'adults'
          ? `${copy.cartNeedAdults} ${stay.rooms} ${copy.cartRooms}, ${cart.adults} ${copy.cartAdultsUnit}.`
          : `${copy.cartUnderCapacity} ${stay.capacity}/${countBookingCartGuests(cart)} ${copy.guests}.`}
      </span>
    </p>
  ));
}
