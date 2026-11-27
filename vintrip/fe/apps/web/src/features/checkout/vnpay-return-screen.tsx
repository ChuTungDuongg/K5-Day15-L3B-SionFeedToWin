'use client';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { commerceApi, useApiSession } from '@vintrip/api-client';
import { vi } from '@vintrip/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckoutError } from './checkout-error';
import styles from './checkout.module.css';

const copy = vi.commerce;

/** VNPay chuyển trình duyệt về đây; xác nhận chữ ký với backend rồi mở lại đơn để xem trạng thái thật. */
export function VnpayReturnScreen({ queryString }: { queryString: string }) {
  const router = useRouter();
  const { isReady } = useApiSession();
  const query = useQuery({
    queryKey: ['commerce', 'vnpay-return', queryString],
    enabled: isReady && !!queryString,
    retry: false,
    queryFn: () => commerceApi.confirmVnpay(queryString),
  });
  const orderId = query.data?.orderId;
  useEffect(() => {
    if (orderId) router.replace(`/checkout/${encodeURIComponent(orderId)}`);
  }, [orderId, router]);

  const hasFailure = !queryString || Boolean(query.error) || Boolean(query.data && !query.data.orderId);
  const isVerifying = Boolean(queryString) && !hasFailure && !orderId;

  return (
    <main className={`ota-container ${styles.page}`}>
      <div className={`${styles.card} ${styles.vnpayCard}`}>
        <h1 className={styles.cardTitle}>{copy.vnpay}</h1>
        {isVerifying && (
          <div className={styles.vnpayLoading} aria-busy="true">
            <div className={styles.skeletonBar} style={{ width: '140px', height: '140px', borderRadius: '999px' }} />
            <p className={styles.verifyingText}>{copy.verifyingPayment}</p>
          </div>
        )}
        {hasFailure && (
          <div className={styles.vnpayResult}>
            {/* oxlint-disable-next-line nextjs/no-img-element -- mascot Vini trạng thái thanh toán thất bại, fallback nếu chưa có asset */}
            <img
              className={styles.resultMascot}
              src="/brand/vini/vini-sad.png"
              alt=""
              width={140}
              height={140}
              onError={(event) => {
                if (event.currentTarget.dataset.fallback) return;
                event.currentTarget.dataset.fallback = '1';
                event.currentTarget.src = '/brand/vini/vini-curious.png';
              }}
            />
            {!queryString && (
              <p role="alert" className={styles.error}>
                <svg className={styles.alertIcon} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
                </svg>
                <span>{copy.missingPaymentReturn}</span>
              </p>
            )}
            {query.data && !query.data.orderId && (
              <p role="alert" className={styles.error}>
                <svg className={styles.alertIcon} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
                </svg>
                <span>{copy.vnpayFailed}</span>
              </p>
            )}
            <CheckoutError error={query.error} retry={() => void query.refetch()} />
            <div className={styles.actions}>
              {query.error ? (
                <button type="button" className="primary-button" onClick={() => void query.refetch()}>
                  {vi.api.retry}
                </button>
              ) : (
                <Link prefetch={false} className="primary-button" href="/cart">
                  {vi.api.retry}
                </Link>
              )}
              <Link prefetch={false} className="secondary-button" href="/bookings">
                {copy.viewTrips}
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
