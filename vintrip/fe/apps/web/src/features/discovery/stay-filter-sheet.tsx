'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './hotel-listing.module.css';

/** Một bộ điều khiển lọc duy nhất: cột trên desktop, bảng trượt modal trên mobile. */
export function StayFilterSheet({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => {
      dialog.current?.close();
      if (!query.matches) dialog.current?.show();
      setMobile(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return <>
    <button ref={toggle} className={'secondary-button ' + styles.mobileFilters} type="button"
      aria-haspopup="dialog" aria-controls="stay-filter-sheet" onClick={() => dialog.current?.showModal()}>
      Bộ lọc
    </button>
    <dialog id="stay-filter-sheet" ref={dialog} open={!mobile} className={styles.filterSheet}
      aria-labelledby="stay-filter-title"
      onClose={() => { if (mobile) toggle.current?.focus(); }}
      onClick={(event) => { if (event.target === event.currentTarget && mobile) dialog.current?.close(); }}>
      <div className={styles.sheetContent}>
        <button type="button" className={'secondary-button ' + styles.closeFilters} onClick={() => dialog.current?.close()}>Đóng bộ lọc</button>
        {children}
      </div>
    </dialog>
  </>;
}
