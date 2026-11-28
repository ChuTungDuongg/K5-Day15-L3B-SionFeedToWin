import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { StaffGate } from '@/features/staff/staff-context';
import { StaffShell } from '@/features/staff/staff-shell';

export const metadata: Metadata = {
  title: 'Cổng nhân viên khách sạn | Vintrip',
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><StaffGate><StaffShell>{children}</StaffShell></StaffGate></Suspense>;
}
