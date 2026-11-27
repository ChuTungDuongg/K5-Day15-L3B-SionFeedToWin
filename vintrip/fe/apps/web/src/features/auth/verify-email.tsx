'use client';

import { getApiErrorKind, useApiSession } from '@vintrip/api-client';
import { emailVerificationControllerVerify } from '@vintrip/api-client/core-api/auth/auth';
import { vi } from '@vintrip/i18n';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { ApiErrorNotice } from '@/features/shared/api-state';
import styles from './auth.module.css';

export function VerifyEmail({ token }: { token?: string }) {
  const { session, isReady, user } = useApiSession();
  const refresh = useMutation({ mutationFn: () => session.refreshUser() });
  const verify = useMutation({
    mutationFn: (code: string) =>
      emailVerificationControllerVerify({ token: code }, { skipAuthRefresh: true, skipAuthorization: true }),
    onSuccess: () => {
      if (user) refresh.mutate();
    },
  });
  const isInvalid = !token || getApiErrorKind(verify.error) === 'invalid';

  return (
    <>
      <h2 className={styles.title}>{vi.api.verifyEmailTitle}</h2>
      {verify.isSuccess ? (
        <>
          <output className={styles.successBox}>{vi.api.verifyEmailSuccess}</output>
          <ApiErrorNotice error={refresh.error} retry={() => refresh.mutate()} />
        </>
      ) : isInvalid ? (
        <p role="alert" className={styles.errorBox}>
          {vi.api.verifyEmailLinkInvalid}
        </p>
      ) : (
        <>
          <p className="auth-hint">{vi.api.verifyEmailBody}</p>
          <ApiErrorNotice error={verify.error} />
          <button
            type="button"
            className={`primary-button auth-submit ${styles.submitBtn}`}
            disabled={!isReady || verify.isPending}
            onClick={() => verify.mutate(token)}
          >
            {verify.isPending ? vi.api.loggingIn : vi.api.verifyEmailSubmit}
          </button>
        </>
      )}
      <Link prefetch={false} className={styles.switchLink} href="/account">
        {vi.api.verifyEmailAccount}
      </Link>
    </>
  );
}
