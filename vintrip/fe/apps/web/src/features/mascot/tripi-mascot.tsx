'use client';

import Image from 'next/image';
import { useState } from 'react';
import { TRIPI_ANIMATIONS, VINI_ASSETS, type TripiAnimation, type ViniPose } from './tripi-assets';
import styles from './tripi-live.module.css';

type ViniMascotProps = {
  pose?: ViniPose;
  animation?: TripiAnimation;
  size?: number;
  alt?: string;
  className?: string;
};

export function ViniMascot({
  pose = 'expr-curious',
  animation,
  size = 148,
  alt,
  className,
}: ViniMascotProps) {
  const motion = animation ? TRIPI_ANIMATIONS[animation] : undefined;
  const asset = VINI_ASSETS[motion?.fallback ?? pose];
  const [failedSrc, setFailedSrc] = useState<string>();

  return (
    <Image
      src={failedSrc === asset.src ? '/brand/vintrip-mark.svg' : asset.src}
      alt={alt ?? asset.label}
      width={size}
      height={size}
      className={[styles.still, motion && styles.bob, className].filter(Boolean).join(' ')}
      onError={() => setFailedSrc(asset.src)}
    />
  );
}

export { ViniMascot as TripiMascot };
