'use client';
import { useApiSession } from '@vintrip/api-client';
import { useMutation } from '@tanstack/react-query';
import { vi } from '@vintrip/i18n';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiErrorNotice } from '@/features/shared/api-state';
import { ProfileInfoCard } from './account-profile';
import { TravelPreferencesCard } from './travel-preferences';
import { AccountSecurity } from './account-security';
import { EmailVerificationNotice } from './email-verification-notice';
import { ACCOUNT_TABS, type AccountTab } from './account-tabs';
import { AvatarEditor } from './avatar-editor';
import styles from './account.module.css';

// Màn đăng nhập nằm ở login-form.tsx; giữ export ở đây để app/login/page.tsx không phải đổi.
export { LiveLogin } from './login-form';

/**
 * Trang tài khoản dạng hồ sơ: cột trái avatar 96px + nút Đổi ảnh + menu dọc (Hồ sơ · Bảo mật · Sở thích du lịch);
 * bên phải nội dung mục đang chọn. Điện thoại: menu thành tab cuộn ngang.
 */
export function LiveAccount({ initialTab = 'profile' }: { initialTab?: AccountTab }) {
  const { user, isReady, session } = useApiSession();
  const router = useRouter();
  const [tab, setTab] = useState<AccountTab>(initialTab);
  const logout = useMutation({
    mutationFn: () => session.logout(),
    onSuccess: () => router.push('/'),
  });

  useEffect(() => {
    if (isReady && !user) {
      router.replace('/login?returnTo=%2Faccount');
    }
  }, [isReady, user, router]);

  if (!isReady || !user)
    return (
      <main id="content" className={`ota-container results-page account-page ${styles.page}`} aria-busy="true">
        <div className={`profile-layout ${styles.layout}`}>
          <div className={styles.skeletonAside} />
          <div className={styles.skeletonCard} />
        </div>
      </main>
    );
  return (
    <main id="content" className={`ota-container results-page account-page ${styles.page}`}>
      <div className={`profile-layout ${styles.layout}`}>
        {user.emailVerified === false && (
          <div className="profile-notice">
            <EmailVerificationNotice key={`verify-${user.id}`} />
          </div>
        )}
        <aside className={`profile-aside ${styles.aside}`}>
          <div className={`profile-identity ${styles.avatarWrap}`}>
            <AvatarEditor user={user} />
            <h1>{user.displayName}</h1>
            <span className={`account-role ${styles.roleBadge}`}>{describeRole(user.role)}</span>
          </div>
          <nav className={`profile-nav ${styles.nav}`} aria-label={vi.api.accountNavLabel}>
            {ACCOUNT_TABS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={styles.navBtn}
                aria-current={tab === kind ? 'page' : undefined}
                onClick={() => setTab(kind)}
              >
                <NavIcon name={kind} />
                {TAB_LABELS[kind]}
              </button>
            ))}
            <button
              type="button"
              className={`is-logout ${styles.navLogout}`}
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <NavIcon name="logout" />
              {vi.api.logout}
            </button>
          </nav>
          <ApiErrorNotice error={logout.error} />
        </aside>
        <div className="profile-main">
          {tab === 'profile' ? (
            <ProfileInfoCard key={user.id} userId={user.id} />
          ) : tab === 'security' ? (
            <AccountSecurity key={user.id} userId={user.id} />
          ) : (
            <TravelPreferencesCard key={`travel-${user.id}`} userId={user.id} />
          )}
        </div>
      </div>
    </main>
  );
}

const TAB_LABELS: Record<AccountTab, string> = {
  profile: vi.api.profileSection,
  security: vi.api.accountNavSecurity,
  travel: vi.api.travelTitle,
};

const NAV_ICONS: Record<AccountTab | 'logout', ReactNode> = {
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  travel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5.3-5.3 2.2 2.2-5.3 5.3-2.2Z" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 16 6 12l4-4M6 12h10" />
    </>
  ),
};

function NavIcon({ name }: { name: keyof typeof NAV_ICONS }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      {NAV_ICONS[name]}
    </svg>
  );
}

/** Trang tài khoản khi chưa đăng nhập: giải thích trang này để làm gì, nút Đăng nhập và Tạo tài khoản. */
export function AccountGuest() {
  return (
    <section className={`account-guest ${styles.guestCard}`} aria-labelledby="account-guest-title">
      <div className="account-guest-body">
        <span className="eyebrow">{vi.api.authEyebrow}</span>
        <h1 id="account-guest-title">{vi.api.accountGuestTitle}</h1>
        <p>{vi.api.accountGuestBody}</p>
        <ul className="auth-benefits">
          {Object.values(vi.api.authBenefits).map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
        <div className="account-guest-actions">
          <Link prefetch={false} className={`primary-button ${styles.primaryBtn}`} href="/login?returnTo=/account">
            {vi.api.login}
          </Link>
          <Link prefetch={false} className={`secondary-button ${styles.secondaryBtn}`} href="/register?returnTo=%2Faccount">
            {vi.api.register}
          </Link>
        </div>
      </div>
      <Image
        className="account-guest-mascot"
        src="/brand/vini/vini-welcome.png"
        alt=""
        width={200}
        height={200}
      />
    </section>
  );
}

function describeRole(role: string): string {
  if (role === 'superadmin') return vi.api.superadmin;
  if (role === 'moderator') return vi.api.moderator;
  return vi.api.user;
}
