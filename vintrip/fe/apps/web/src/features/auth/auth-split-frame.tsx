'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import styles from './auth.module.css';

/**
 * Thẻ <main> của khung đăng nhập/đăng ký: chia đôi trên máy tính, dải ảnh 120px + form trên điện thoại.
 */
export function AuthSplitFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <main
      id="content"
      className={`auth-fullscreen ${styles.split}`}
      data-mode={pathname === '/register' ? 'register' : 'login'}
    >
      {children}
    </main>
  );
}
