import type { ReactNode } from 'react';
import styles from './ota-home-motion.module.css';

export function OtaHomeMotion({ children }: { children: ReactNode }) {
  return <main id="content" data-living-home className={styles.layeredCanvas}>{children}</main>;
}
