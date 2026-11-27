import Image from 'next/image';
import { vi } from '@vintrip/i18n';
import { ViniMascot } from '@/features/mascot/tripi-mascot';
import { TornPaperDivider } from './torn-paper';
import styles from './ota-hero.module.css';

const [SLOGAN_FIRST, SLOGAN_SECOND] = vi.app.slogan.split(', ');

export function OtaHero() {
  return (
    <header className={styles.hero} data-home-banner data-home-hero>
      <div className={styles.backdropImageWrapper} data-hero-layer="scenery" aria-hidden="true">
        <Image
          src="/brand/hero-river-landscape.jpg"
          alt=""
          fill
          sizes="100vw"
          fetchPriority="high"
          loading="eager"
          className={styles.backdropImg}
        />
      </div>

      <div className={styles.typographyLayer} data-hero-layer="typography">
        <span className={styles.wordmarkGlass} aria-hidden="true" />
        <Image
          src="/brand/hero-layered-v1/vintrip-destination-wordmark.svg"
          alt={vi.app.name}
          width={960}
          height={320}
          className={styles.wordmarkImage}
          loading="eager"
          unoptimized
        />
      </div>

      <div className={styles.rowerLayer} data-hero-layer="rower" aria-hidden="true">
        <ViniMascot pose="action-depart" size={160} alt="" className={styles.rowerImage} />
      </div>

      <div className={styles.vectorLayer} data-hero-layer="vectors" aria-hidden="true">
        <Image src="/brand/hero-layered-v1/seagulls-ribbon.svg?v=2" alt="" fill unoptimized loading="eager" />
      </div>

      <div className={`ota-container ${styles.inner}`} data-hero-layer="ui">
        <div className={styles.bottomSection}>
          <div className={styles.copy}>
            <h1>
              <span className={styles.titleFirst}>{SLOGAN_FIRST},</span>{' '}
              <span className={styles.titleSecond}>{SLOGAN_SECOND}</span>
            </h1>
          </div>
        </div>
      </div>

      {/* Mép xé giấy đại dương chuyển tiếp mượt mà xuống thanh tìm kiếm và thân trang */}
      <TornPaperDivider variant="hero-to-canvas" />
    </header>
  );
}
