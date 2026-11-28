import { CopilotScreen } from '@/features/staff/copilot-screen';

export default async function StaffRoomUpgradesPage({ searchParams }: {
  searchParams: Promise<{ booking?: string | string[] }>;
}) {
  const { booking } = await searchParams;
  const bookingCode = typeof booking === 'string' ? booking : null;
  return <CopilotScreen key={bookingCode ?? 'auto'} initialBookingCode={bookingCode} />;
}
