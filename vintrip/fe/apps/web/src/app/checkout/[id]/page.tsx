import type { Metadata } from 'next';
import { vi } from '@vintrip/i18n';
import { CheckoutScreen } from '@/features/checkout/checkout-screen';

export const metadata: Metadata = { title: `${vi.commerce.checkout} | Vintrip` };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CheckoutScreen key={id} id={id} />;
}
