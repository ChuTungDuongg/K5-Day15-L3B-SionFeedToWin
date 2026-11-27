import { vi } from '@vintrip/i18n';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthCardBody } from './auth-card-body';
import { AuthSplitFrame } from './auth-split-frame';
import styles from './auth.module.css';

function AuthLogo() {
  return (
    <Link className={styles.logo} href="/" prefetch={false} aria-label={vi.api.authHomeLink}>
      <Image src="/brand/vintrip-logo.svg" alt={vi.demo.common.logo} width={142} height={42} priority />
    </Link>
  );
}

/**
 * Khung của nhóm trang app/(auth): trái là ảnh du lịch + lớp phủ nhạt + vini-welcome.png + lời chào;
 * phải là thẻ trắng tối đa 420px. Điện thoại: thu nửa trái thành dải ảnh 120px ở trên cùng.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <AuthSplitFrame>
      <section className={styles.hero}>
        <span className={styles.heroBg} aria-hidden="true">
          <Image src="/brand/destinations/quang-ninh-view.jpg" alt="" fill sizes="(max-width: 900px) 100vw, 50vw" priority />
        </span>
        <div className={styles.heroTop}>
          <AuthLogo />
        </div>
        <div className={styles.heroCenter}>
          <span className={styles.mascotFrame}>
            <Image src="/brand/vini/vini-welcome.png" alt="" width={144} height={144} priority />
          </span>
          <h1 className={styles.headline}>
            <span>{vi.api.authHeroFirst}</span> <em>{vi.api.authHeroSecond}</em>
          </h1>
          <p className={styles.greeting}>{vi.api.accountGuestBody}</p>
        </div>
        <div className={styles.heroBottom} aria-hidden="true" />
      </section>
      <section className={styles.panel}>
        <div className={styles.card}>
          <AuthCardBody>{children}</AuthCardBody>
        </div>
      </section>
    </AuthSplitFrame>
  );
}
