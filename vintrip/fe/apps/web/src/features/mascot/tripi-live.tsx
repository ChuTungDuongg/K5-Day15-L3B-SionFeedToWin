'use client';

import { useState } from 'react';
import { ViniMascot } from './tripi-mascot';
import styles from './tripi-live.module.css';

export function ViniLive({
  className,
  interactive = true,
}: {
  className?: string;
  interactive?: boolean;
}) {
  const [reaction, setReaction] = useState(0);
  const mascot = <ViniMascot animation="greeting" size={256} alt="" className={styles.liveImage} />;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {interactive ? (
        <button
          type="button"
          className={styles.player}
          aria-label="Chào Vini"
          onClick={() => setReaction((count) => count + 1)}
        >
          <span key={reaction} className={reaction ? styles.reaction : styles.reactionFrame}>
            {mascot}
          </span>
        </button>
      ) : (
        mascot
      )}
    </div>
  );
}

export { ViniLive as TripiLive };
