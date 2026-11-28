'use client';

import { useApiSession, useStaffContext, HttpError, type StaffHotelAssignment } from '@vintrip/api-client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { readSafeReturnTo, withReturnTo } from '@/features/auth/auth-return';
import { selectStaffHotel } from './staff-path';
import styles from './staff.module.css';

interface StaffPortalContextValue {
  activeHotel: StaffHotelAssignment;
  assignments: readonly StaffHotelAssignment[];
  selectHotel: (hotelId: string) => void;
  isMock: boolean;
  userId: string;
}

const StaffPortalContext = createContext<StaffPortalContextValue | null>(null);

export function useStaffPortal(): StaffPortalContextValue {
  const context = useContext(StaffPortalContext);
  if (!context) throw new Error('StaffGate is required');
  return context;
}

function StaffLogin({ expired = false }: { expired?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const returnTo = readSafeReturnTo(search ? `${pathname}?${search}` : pathname);
  return (
    <main className={styles.gate}>
      <p className={styles.eyebrow}>Vintrip · Cổng nhân viên khách sạn</p>
      <h1>{expired ? 'Phiên đăng nhập đã hết hạn' : 'Đăng nhập để vào cổng nhân viên'}</h1>
      <p>Quyền truy cập khách sạn sẽ được xác minh sau khi đăng nhập.</p>
      <Link prefetch={false} className={styles.primaryButton} href={withReturnTo('/login', returnTo)}>
        Đăng nhập
      </Link>
      <Link prefetch={false} className={styles.textLink} href="/">Về trang khách hàng</Link>
    </main>
  );
}

/** No role inferred from the customer session grants hotel access. The API is authoritative. */
export function StaffGate({ children }: { children: ReactNode }) {
  const { user, isReady } = useApiSession();
  const staffContext = useStaffContext();
  const data = staffContext.data;
  const [selection, setSelection] = useState<{ userId: string; hotelId: string } | null>(null);
  const activeHotel = selectStaffHotel(data, selection?.userId === user?.id ? selection?.hotelId ?? null : null);

  if (!isReady || (user && staffContext.isPending)) {
    return <main className={styles.gate} aria-busy="true"><output>Đang xác minh quyền truy cập khách sạn…</output></main>;
  }
  if (!user) return <StaffLogin />;
  if (staffContext.error instanceof HttpError && staffContext.error.status === 401) return <StaffLogin expired />;
  if (staffContext.isError) {
    const forbidden = staffContext.error instanceof HttpError && staffContext.error.status === 403;
    return (
      <main className={styles.gate}>
        <h1>{forbidden ? 'Bạn chưa được cấp quyền truy cập khách sạn' : 'Chưa thể xác minh quyền truy cập'}</h1>
        <p role="alert">{forbidden ? 'Liên hệ quản lý để kiểm tra phân công khách sạn.' : 'Kiểm tra kết nối rồi thử lại.'}</p>
        <button type="button" className={styles.secondaryButton} disabled={staffContext.isFetching} onClick={() => void staffContext.refetch()}>Thử lại</button>
        <Link prefetch={false} className={styles.textLink} href="/">Về trang khách hàng</Link>
      </main>
    );
  }
  if (!data?.hasAccess || !activeHotel) {
    return (
      <main className={styles.gate}>
        <h1>Bạn chưa được phân công khách sạn</h1>
        <p>Liên hệ quản lý để được cấp vai trò lễ tân hoặc quản lý tại khách sạn.</p>
        <button type="button" className={styles.secondaryButton} disabled={staffContext.isFetching} onClick={() => void staffContext.refetch()}>Kiểm tra lại quyền truy cập</button>
        <Link prefetch={false} className={styles.textLink} href="/">Về trang khách hàng</Link>
      </main>
    );
  }
  const selectHotel = (hotelId: string) => {
    if (data.assignments.some((assignment) => assignment.hotelId === hotelId)) {
      setSelection({ userId: user.id, hotelId });
    }
  };
  return (
    <StaffPortalContext.Provider value={{ activeHotel, assignments: data.assignments, selectHotel, isMock: data.isMock, userId: data.userId }}>
      <div key={`${user.id}:${activeHotel.hotelId}`}>{children}</div>
    </StaffPortalContext.Provider>
  );
}
