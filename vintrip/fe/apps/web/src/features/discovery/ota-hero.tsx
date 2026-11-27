import Image from 'next/image';
import Link from 'next/link';
import { vi } from '@tripflix/i18n';
import { ViniMascot } from '@/features/mascot/tripi-mascot';
import { TornPaperDivider } from './torn-paper';
import styles from './ota-hero.module.css';

const HERO_DESTINATIONS = [
  {
    tag: 'Gần VinUni',
    destination: 'Ocean Park • Hồ Ngọc Trai',
    query: 'Hà Nội',
  },
  {
    tag: 'Ocean City',
    destination: 'Mega Grand World • Venice',
    query: 'Hà Nội',
  },
  {
    tag: '10 phút đi xe',
    destination: 'Làng Gốm Bát Tràng',
    query: 'Hà Nội',
  },
  {
    tag: 'Kỳ quan',
    destination: 'Vịnh Hạ Long',
    query: 'Quảng Ninh',
  },
  {
    tag: 'Non nước',
    destination: 'Tràng An • Ninh Bình',
    query: 'Ninh Bình',
  },
  {
    tag: 'Biển xanh',
    destination: 'Đảo Ngọc Phú Quốc',
    query: 'Phú Quốc',
  },
  {
    tag: 'Đà Nẵng',
    destination: 'Cầu Vàng Bà Nà',
    query: 'Đà Nẵng',
  },
  {
    tag: 'Di sản',
    destination: 'Phố cổ Hội An',
    query: 'Hội An',
  },
] as const;

const [SLOGAN_FIRST, SLOGAN_SECOND] = vi.app.slogan.split(', ');

export function OtaHero() {
  return (
    <header className={styles.hero} data-home-banner data-home-hero>
      <div className={styles.backdropImageWrapper} data-hero-layer="scenery" aria-hidden="true">
        <picture>
          <source media="(max-width: 640px)" srcSet="/brand/ocean-park/mega-grand-world-venice.jpg" />
          <Image
            src="/brand/ocean-park/mega-grand-world-venice.jpg"
            alt=""
            fill
            fetchPriority="high"
            loading="eager"
            unoptimized
            className={styles.backdropImg}
          />
        </picture>
      </div>

      <div className={styles.typographyLayer} data-hero-layer="typography">
        <Image
          src="/brand/vintrip-logo-white.svg"
          alt={vi.app.name}
          width={180}
          height={44}
          loading="eager"
          className={styles.typographyImage}
        />
        <nav aria-label="Khám phá danh thắng Việt Nam">
          <div className={styles.letterHotspots}>
            {HERO_DESTINATIONS.map((item) => (
              <Link
                prefetch={false}
                href={`/search?q=${encodeURIComponent(item.query)}`}
                className={styles.letterHotspot}
                key={item.query}
                aria-label={item.tag + ", " + item.destination}
              >
                {item.tag}
                <span className={styles.letterBadge} aria-hidden="true">
                  <strong className={styles.badgeName}>{item.destination}</strong>
                </span>
              </Link>
            ))}
          </div>
        </nav>
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
