import type { Metadata } from 'next';
import { vi } from '@vintrip/i18n';
import { BookingsScreen } from '@/features/checkout/bookings-screen';

export const metadata: Metadata = { title: `${vi.commerce.booked} | Vintrip` };

export default function BookingsPage() {
  return <BookingsScreen />;
}
