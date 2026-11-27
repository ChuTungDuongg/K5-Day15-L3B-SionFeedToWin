'use client';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useHomeRecommendations } from '@vintrip/api-client';
import { vi } from '@vintrip/i18n';
import { buildCombosFromApi, RECOMMENDATION_COMBOS, DEFAULT_DESTINATION_IMAGE } from './ota-recommendation-combos';
import { formatPrice } from './trip-card';
import { isOptimizedImageUrl } from '@/lib/remote-images';
import { useNearViewport } from './use-near-viewport';
import styles from './ota-home.module.css';

function DestinationImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState<string>();
  const image = failed === src ? DEFAULT_DESTINATION_IMAGE : src;
  return <Image src={image} alt={name} fill sizes="(max-width: 639px) 76vw, (max-width: 1023px) 45vw, 22vw"
    unoptimized={!image.startsWith('/') && !isOptimizedImageUrl(image)} onError={() => setFailed(src)} />;
}

export function OtaHomeRecommendations() {
  const { ref, isNear } = useNearViewport();
  const { data } = useHomeRecommendations({ limit: 6 }, { enabled: isNear });
  const combos = useMemo(() => buildCombosFromApi(data ?? [], RECOMMENDATION_COMBOS), [data]);
  return (
    <section ref={ref} className={'ota-container ' + styles.section} aria-labelledby="recommendations-title">
      <div className={styles.sectionHead}>
        <div><h2 id="recommendations-title">{vi.ota.recommendationTitle}</h2><p>{vi.ota.recommendationIntro}</p></div>
        <Link prefetch={false} className={styles.textLink} href="/search">{vi.ota.browseHotels}</Link>
      </div>
      <div className={styles.destinations}>
        {combos.slice(0, 4).map((combo) => (
          <article key={combo.id} className={styles.destination}>
            <Link prefetch={false} href={combo.destination.href}>
              <div className={styles.destinationPhoto}><DestinationImage src={combo.destination.image} name={combo.destination.name} /></div>
              <div className={styles.destinationCopy}>
                <span>{combo.destination.region}</span><h3>{combo.destination.name}</h3>
                <p>{combo.destination.description}</p>
              </div>
            </Link>
            <Link prefetch={false} className={styles.destinationPrice} href={combo.stay.href}>
              {combo.stay.verifiedPrice ? 'Từ ' + formatPrice(combo.stay.priceFrom) : 'Xem giá theo ngày'} <span aria-hidden="true">→</span>
            </Link>
            <Link prefetch={false} className={styles.textLink} href={combo.experience.href}>{combo.experience.name}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
