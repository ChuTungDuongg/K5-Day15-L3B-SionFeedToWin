import { vi } from '@vintrip/i18n';
import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="content" className="ota-container empty-state">
      <Image src="/brand/vini/vini-sad.png" alt="Linh vật ngồi buồn" width={200} height={200} />
      <h1>Không tìm thấy trang này</h1>
      <p>{vi.demo.web.notFoundBody}</p>
      <Link prefetch={false} href="/" className="primary-button">
        Về trang chủ
      </Link>
    </main>
  );
}
