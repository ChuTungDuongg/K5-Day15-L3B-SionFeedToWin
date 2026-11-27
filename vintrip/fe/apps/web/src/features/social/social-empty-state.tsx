import type { ReactNode } from 'react';
import Image from 'next/image';
import styles from './social-empty-state.module.css';

export function SocialEmptyState({ children, action }: { children?: ReactNode; action: ReactNode }) {
  return <div className={styles.empty}>
    <Image src="/brand/vini/vini-guide.png" alt="" width={140} height={140} />
    <h3>Chưa có bài nào</h3>
    {children && <div className={styles.hint}>{children}</div>}
    {action}
  </div>;
}
