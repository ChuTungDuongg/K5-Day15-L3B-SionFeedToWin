import type { Metadata } from 'next';
import { vi } from '@vintrip/i18n';
import { PrivacyPage } from '@/features/legal/privacy-page';

export const metadata: Metadata = { title: `${vi.privacy.title} | Vintrip` };

export default function Page() {
  return <PrivacyPage />;
}
