import { BookingDetailScreen } from '@/features/staff/booking-detail-screen';

export default async function StaffBookingDetailPage({ params }: {
  params: Promise<{ bookingCode: string }>;
}) {
  // Next already decodes dynamic segments; decoding twice corrupts literal percent signs.
  const { bookingCode } = await params;
  return <BookingDetailScreen bookingCode={bookingCode} />;
}
