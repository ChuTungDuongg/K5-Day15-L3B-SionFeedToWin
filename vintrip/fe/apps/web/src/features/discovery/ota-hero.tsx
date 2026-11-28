import Image from 'next/image';
import { vi } from '@vintrip/i18n';
import { ViniMascot } from '@/features/mascot/tripi-mascot';
import styles from './ota-hero.module.css';

export function OtaHero() {
  return (
    <header className={styles.hero} data-home-banner data-home-hero>
      <Image src="/brand/ocean-park/ocean-park-beach.jpg" alt="" fill
        fetchPriority="high" loading="eager" sizes="(min-width: 1440px) 1280px, 100vw"
        className={styles.backdropImg} />
      <div className={styles.copy}>
        <h1>VinTrip</h1>
        <p>{vi.app.slogan}</p>
      </div>
      <ViniMascot pose="hero-welcome" size={160} alt="" className={styles.mascot} />
    </header>
  );
}
