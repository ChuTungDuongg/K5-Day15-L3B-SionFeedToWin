import { LiveSearchScreen } from '@/features/discovery/live-search-screen';
import { parseSearchParams } from '@/features/discovery/search-params';
import { isStayInteger, MAX_STAY_GUESTS } from '@/features/discovery/stay-search-validation';
import { OTA_DESTINATIONS, getDestinationHref } from '@/features/discovery/ota-destinations';
import styles from '@/features/discovery/hotel-listing.module.css';
import { vi } from '@vintrip/i18n';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { NOINDEX_ROBOTS } from '@/features/seo/page-metadata';

export const metadata: Metadata = { title: vi.ota.listingTitle + ' | Vintrip', robots: NOINDEX_ROBOTS };

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const hasDestination = !!(read('q').trim() || read('placeId').trim());
  const { placeName, initialFilters } = parseSearchParams(read);
  const readCount = (key: string) => isStayInteger(read(key), 0, MAX_STAY_GUESTS) ? Number(read(key)) : 0;
  const initialGuests = { children: readCount('children'), infants: readCount('infants') };
  return (
    <main id="content" className={'ota-container ' + styles.page}>
      <header className={styles.banner}>
        <div className={styles.bannerMedia} aria-hidden="true">
          <Image src="/brand/hotel-resort-4k.webp" alt="" fill priority sizes="(min-width: 1440px) 1280px, 100vw" />
        </div>
        <div className={styles.bannerCopy}>
          <p className={styles.bannerEyebrow}>{vi.ota.listingEyebrow.toLocaleUpperCase('vi')}</p>
          <h1>{vi.ota.listingTitle}</h1>
          <p className={styles.bannerIntro}>{vi.ota.listingIntro}</p>
        </div>
      </header>
      {hasDestination ? <LiveSearchScreen initialGuests={initialGuests} initialQuery={placeName} initialFilters={initialFilters} /> : (
        <>
          <LiveSearchScreen isHomepage />
          <section className={styles.emptyStart} aria-labelledby="choose-destination-title">
            <Image src="/brand/vini/vini-curious.png" alt="" width={140} height={140} />
            <h2 id="choose-destination-title">Bạn muốn nghỉ ở đâu?</h2>
            <p>Chọn điểm đến để xem khách sạn và giá theo ngày.</p>
            <nav aria-label={vi.ota.findByPlace}>
              {OTA_DESTINATIONS.map((place) => <Link key={place.id} prefetch={false} className="secondary-button" href={getDestinationHref(place)}>{place.name}</Link>)}
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
