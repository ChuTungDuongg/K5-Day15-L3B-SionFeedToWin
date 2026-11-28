'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isStaffPath } from '@/features/staff/staff-path';

export function CustomerHeader({ children }: { children: ReactNode }) {
  return isStaffPath(usePathname()) ? null : children;
}
