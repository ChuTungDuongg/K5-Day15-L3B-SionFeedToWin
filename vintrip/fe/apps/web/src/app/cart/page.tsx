import type { Metadata } from 'next';
import { vi } from '@vintrip/i18n';
import { CartScreen } from '@/features/checkout/cart-screen';

export const metadata: Metadata = { title: `${vi.commerce.cartTitle} | Vintrip` };

export default function CartPage() {
  return <CartScreen />;
}
