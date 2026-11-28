'use client';

import { useMutation } from '@tanstack/react-query';
import { HttpError, useApiSession } from '@vintrip/api-client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStaffPortal } from './staff-context';
import { formatRoleLabel, formatShortRoleLabel } from './staff-format';
import type { StaffStatusMeta } from './staff-status';
import styles from './staff.module.css';

const NAVIGATION = [
  { href: '/staff', label: 'Tổng quan', icon: 'dashboard' },
  { href: '/staff/bookings', label: 'Khách đang lưu trú', icon: 'bookings' },
  { href: '/staff/room-upgrades', label: 'Vini AI Copilot', icon: 'copilot' },
  { href: '/staff/proposals', label: 'Quản lý đề xuất', icon: 'proposals' },
] as const;

function NavIcon({ name }: { name: (typeof NAVIGATION)[number]['icon'] }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'dashboard' && <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
      {name === 'bookings' && <path d="M3 20V5m18 15V10M3 16h18M3 10h18v6M7 10V7h5v3" />}
      {name === 'copilot' && <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />}
      {name === 'proposals' && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v4H9zm0 9h6m-6 4h4" /></>}
    </svg>
  );
}

export function StaffStatusPill({ meta }: { meta: StaffStatusMeta }) {
  return <span className={styles.pill} data-tone={meta.tone}>{meta.label}</span>;
}

export function StaffLoading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <div className={styles.loading} aria-busy="true">
      <output>{label}</output>
      <div className={styles.skeleton} aria-hidden="true" />
      <div className={styles.skeleton} aria-hidden="true" />
      <div className={styles.skeleton} aria-hidden="true" />
    </div>
  );
}

export function StaffError({ error, onRetry, retrying = false, booking = false }: {
  error: unknown; onRetry: () => void; retrying?: boolean; booking?: boolean;
}) {
  const status = error instanceof HttpError ? error.status : null;
  const message = status === 404 && booking ? 'Không tìm thấy booking trong khách sạn này'
    : status === 403 ? 'Bạn không có quyền truy cập dữ liệu tại khách sạn này.'
    : status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    : 'Chưa tải được dữ liệu. Kiểm tra kết nối rồi thử lại.';
  return (
    <div className={styles.empty}>
      <p role="alert">{message}</p>
      <button type="button" className={styles.secondaryButton} onClick={onRetry} disabled={retrying}>
        {retrying ? 'Đang tải lại…' : 'Thử lại'}
      </button>
      {booking && <Link prefetch={false} className={styles.textLink} href="/staff/bookings">Về danh sách booking</Link>}
      {status === 401 && <Link prefetch={false} className={styles.textLink} href="/login?returnTo=%2Fstaff">Đăng nhập lại</Link>}
    </div>
  );
}

export function StaffEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.empty}><strong>{title}</strong>{children}</div>;
}

export function StaffShell({ children }: { children: ReactNode }) {
  const { activeHotel, assignments, selectHotel, isMock } = useStaffPortal();
  const { user, session } = useApiSession();
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logout = useMutation({ mutationFn: () => session.logout(), onSuccess: () => router.replace('/login') });

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onDesktop = () => { if (media.matches) dialog.current?.close(); };
    media.addEventListener('change', onDesktop);
    return () => media.removeEventListener('change', onDesktop);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  const closeDrawer = () => dialog.current?.close();
  const navigation = (variant: 'desktop' | 'drawer') => (
    <>
      <div className={styles.sidebarBrand}>
        <Link prefetch={false} href="/staff" onClick={closeDrawer} aria-label="Vintrip · Tổng quan nhân viên">
          <Image src="/brand/vintrip-logo.svg" width={128} height={38} alt="Vintrip" />
        </Link>
        {variant === 'drawer' && <button ref={closeButton} type="button" className={styles.iconButton} aria-label="Đóng menu điều hướng" onClick={closeDrawer}>×</button>}
      </div>
      <p className={styles.sidebarCaption}>Cổng nhân viên khách sạn</p>
      <div className={styles.hotelScope}>
        {assignments.length > 1 ? (
          <>
            <label htmlFor={`staff-hotel-${variant}`}>Khách sạn được phân công</label>
            <select
              id={`staff-hotel-${variant}`}
              value={activeHotel.hotelId}
              onChange={(event) => {
                selectHotel(event.target.value);
                closeDrawer();
              }}
            >
              {assignments.map((assignment) => (
                <option key={assignment.hotelId} value={assignment.hotelId}>{assignment.hotelName}</option>
              ))}
            </select>
          </>
        ) : <><span className={styles.muted}>Khách sạn được phân công</span><strong>{activeHotel.hotelName}</strong></>}
        <span className={styles.scopeRole}>{formatRoleLabel(activeHotel.staffRole)}</span>
      </div>
      <nav className={styles.navigation} aria-label="Điều hướng cổng nhân viên">
        {NAVIGATION.map((item) => {
          const active = pathname === item.href || (item.href !== '/staff' && pathname.startsWith(`${item.href}/`));
          return <Link prefetch={false} key={item.href} href={item.href} aria-current={active ? 'page' : undefined} onClick={closeDrawer}><NavIcon name={item.icon} />{item.label}</Link>;
        })}
      </nav>
      <div className={styles.sidebarFoot}>
        <p className={styles.identity}>{user?.displayName}<span>{user?.email}</span></p>
        <StaffStatusPill meta={{ label: formatShortRoleLabel(activeHotel.staffRole), tone: 'neutral' }} />
        {logout.isError && <p role="alert" className={styles.logoutError}>Chưa đăng xuất được. Vui lòng thử lại.</p>}
        <button type="button" className={styles.secondaryButton} disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
        <Link prefetch={false} className={styles.textLink} href="/">Trang khách hàng</Link>
      </div>
    </>
  );

  const currentPage = NAVIGATION.find((item) => item.href !== '/staff' && pathname.startsWith(item.href))?.label ?? 'Tổng quan';
  return (
    <div className={styles.portal}>
      <a href="#staff-main" className={styles.skipLink}>Đến nội dung chính</a>
      <aside className={styles.sidebar}>{navigation('desktop')}</aside>
      <dialog id="staff-navigation-drawer" className={styles.drawer} ref={dialog} aria-label="Menu cổng nhân viên" onClose={() => setDrawerOpen(false)} onPointerDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
        <div className={styles.drawerPanel}>{navigation('drawer')}</div>
      </dialog>
      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <button type="button" className={`${styles.iconButton} ${styles.menuButton}`} aria-label="Mở menu điều hướng" aria-expanded={drawerOpen} aria-controls="staff-navigation-drawer" onClick={() => { dialog.current?.showModal(); setDrawerOpen(true); closeButton.current?.focus(); }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className={styles.headerTitle}><span>Vận hành khách sạn</span><strong>{currentPage}</strong></div>
          <div className={styles.headerScope}><strong>{activeHotel.hotelName}</strong><span>{formatShortRoleLabel(activeHotel.staffRole)}</span></div>
        </header>
        {isMock && <div className={styles.sandbox} role="note"><strong>Sandbox</strong><span>Dữ liệu mô phỏng · Mọi quyết định chỉ duyệt đề xuất báo giá, không giữ phòng hay thu tiền</span></div>}
        <main id="staff-main" className={styles.content} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
