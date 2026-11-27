import { vi } from '@vintrip/i18n';
import Image from 'next/image';
import Link from 'next/link';
import { OtaHomeRecommendations } from './ota-home-recommendations';
import { HomeStayPreview, HomeStoryPreview } from './ota-home-previews';
import { WashiTape, TravelPostmarkStamp } from './torn-paper';
import styles from './ota-home.module.css';

const OCEAN_PARK_SPOTS = [
  {
    tag: 'Lưu trú sát VinUni',
    title: 'Masteri Waterfront Homestay',
    subtitle: 'Tòa H1–H2 đối diện VinUni · Từ 650.000đ/đêm',
    image: '/brand/ocean-park/stay-masteri-vinuni.jpg',
    href: '/search?placeId=ha-noi&q=Ocean%20Park',
  },
  {
    tag: 'Căn hộ Staycation',
    title: 'The Sapphire Ocean Park',
    subtitle: 'Sát Hồ Ngọc Trai 24,5ha · Từ 550.000đ/đêm',
    image: '/brand/ocean-park/stay-sapphire-ocean.jpg',
    href: '/search?placeId=ha-noi&q=Ocean%20Park',
  },
  {
    tag: 'Ẩm thực quanh VinUni',
    title: 'Hải Sản & Bếp Thái Hải Âu – San Hô',
    subtitle: 'Trọng Hải Sản, Koh Yam, HaoChi · 3 phút từ VinUni',
    image: '/brand/ocean-park/food-ocean-park-1.jpg',
    href: '/inspiration',
  },
  {
    tag: 'Trải nghiệm 10 phút',
    title: 'Mega Grand World & Làng Gốm Bát Tràng',
    subtitle: 'Kênh Venice, Biển hồ cát trắng & vuốt gốm cổ truyền',
    image: '/brand/ocean-park/bat-trang-village.jpg',
    href: '/inspiration',
  },
] as const;

export function OtaHomeSections() {
  return (
    <>
      <section className={`ota-container ${styles.section}`} aria-labelledby="ocean-park-nearby-title" data-home-reveal>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.nearbyEyebrow}>
              Gần VinUni · Vinhomes Ocean Park
            </p>
            <h2 id="ocean-park-nearby-title">
              Ăn ngon, nghỉ đẹp quanh Ocean Park
            </h2>
          </div>
          <Link prefetch={false} href="/search?placeId=ha-noi&q=Ocean%20Park" className={styles.textLink}>
            Xem nơi lưu trú gần VinUni →
          </Link>
        </div>
        <div className={styles.nearbyGrid}>
          {OCEAN_PARK_SPOTS.map((spot) => (
            <Link
              key={spot.title}
              prefetch={false}
              href={spot.href}
              className={styles.nearbyCard}
            >
              <div className={styles.nearbyPhoto}>
                <Image src={spot.image} alt={spot.title} fill sizes="(max-width: 760px) 100vw, 25vw" style={{ objectFit: 'cover' }} />
              </div>
              <div className={styles.nearbyCopy}>
                <span>
                  {spot.tag}
                </span>
                <h3>{spot.title}</h3>
                <p>{spot.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <OtaHomeRecommendations />
      <HomeStayPreview />
      <section
        className={`ota-container ${styles.section}`}
        aria-labelledby="home-tripi-title"
        data-home-reveal
      >
        <div className={styles.tripiBanner} data-home-banner>
          <div className={styles.tripiCopy}>
            <h2 id="home-tripi-title">{vi.ota.tripiTitle}</h2>
            <p className={styles.tripiIntro}>{vi.ota.tripiIntro}</p>
            <Link prefetch={false} href="/inspiration" className={`ripple-button ${styles.tripiAction}`}>
              {vi.ota.tripiAction}
            </Link>
          </div>
          <div className={styles.tripiCollage} aria-hidden="true">
            <svg className={styles.tripiRoute} viewBox="0 0 500 360" fill="none">
              <path d="M 24 263 C 6 144 95 47 213 53 S 434 31 474 122 C 522 231 367 327 237 311 S 52 274 82 223" />
              <circle cx="24" cy="263" r="5" />
              <circle cx="82" cy="223" r="5" />
            </svg>
            <div className={`${styles.tripiPostcard} ${styles.tripiBeach}`}>
              <WashiTape color="gold" angle={-8} className={styles.tripiTapeBeach} />
              <div className={styles.tripiPrint}>
                <Image src="/brand/ocean-park/ocean-park-lagoon.jpg" alt="" fill sizes="(max-width: 760px) 42vw, 240px" />
              </div>
              <span>Hồ Ngọc Trai</span>
            </div>
            <div className={`${styles.tripiPostcard} ${styles.tripiTown}`}>
              <WashiTape color="teal" angle={6} className={styles.tripiTapeTown} />
              <div className={styles.tripiPrint}>
                <Image
                  src="/brand/ocean-park/vincom-ocean-city.jpg"
                  alt=""
                  fill
                  sizes="(max-width: 760px) 42vw, 240px"
                />
              </div>
              <span>Ocean City</span>
            </div>
            {/* Con dấu bưu chính du lịch đóng đè phong cách Scrapbook */}
            <TravelPostmarkStamp city="OCEAN PARK" year="2026" className={styles.tripiPostmark} />
            <Image
              className={styles.tripiMascot}
              src="/brand/vini/vini-curious.png"
              alt=""
              width={340}
              height={340}
              sizes="(max-width: 760px) 55vw, 340px"
            />
            <span className={styles.tripiStamp}>✦</span>
          </div>
        </div>
      </section>
      <HomeStoryPreview />
    </>
  );
}
