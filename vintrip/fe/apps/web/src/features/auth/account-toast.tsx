'use client';
import { useEffect, useState } from 'react';
import styles from './account.module.css';

/**
 * Thông báo nhỏ (toast) xác nhận đã lưu: nền `--color-success`, chữ trắng, tự ẩn sau 3 giây.
 */
export function SaveToast({ message, showKey }: { message: string; showKey: number }) {
  const [visibleKey, setVisibleKey] = useState(0);

  useEffect(() => {
    if (!showKey) return;
    setVisibleKey(showKey);
    const timer = setTimeout(() => {
      setVisibleKey(0);
    }, 3000);
    return () => clearTimeout(timer);
  }, [showKey]);

  if (!showKey || visibleKey !== showKey) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
