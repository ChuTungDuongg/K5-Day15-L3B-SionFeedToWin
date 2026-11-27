import type { Metadata } from 'next';
import { vi } from '@vintrip/i18n';
import { TermsPage } from '@/features/legal/terms-page';

export const metadata: Metadata = { title: `${vi.terms.title} | Vintrip` };

export default function Page() {
  return <TermsPage />;
}
