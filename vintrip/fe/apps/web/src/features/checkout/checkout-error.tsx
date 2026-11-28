'use client';
import { HttpError } from '@vintrip/api-client';
import { ApiErrorNotice } from '@/features/shared/api-state';
import styles from './checkout.module.css';

/**
 * Lỗi nghiệp vụ của commerce (4xx) và 503 có message tiếng Việt từ backend; lỗi khác dùng thông báo chung.
 * 500 mặc định của Nest có message tiếng Anh "Internal server error" nên không hiện nguyên văn.
 */
export function CheckoutError({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  if (error instanceof HttpError && (error.status < 500 || error.status === 503) && error.body && typeof error.body === 'object' && 'message' in error.body) {
    const body = error.body as { message?: unknown };
    if (typeof body.message === 'string')
      return (
        <p role="alert" className={styles.error}>
          <svg className={styles.alertIcon} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
          <span>{body.message}</span>
        </p>
      );
  }
  return <ApiErrorNotice error={error} retry={retry} />;
}
