import { ApiErrorNotice } from '../../shared/api-state';
import { SocialEmptyState } from '../social-empty-state';
import styles from './social-feed.module.css';

interface FeedStatusProps {
  loading: boolean;
  error?: unknown;
  empty: boolean;
  emptyHint: string;
  onRetry: () => void;
  onCompose: () => void;
}

/** Trạng thái trang đầu; tải thêm vẫn giữ nguyên các bài đang hiển thị. */
export function FeedStatus({ loading, error, empty, emptyHint, onRetry, onCompose }: FeedStatusProps) {
  if (error) return <ApiErrorNotice error={error} retry={onRetry} />;
  if (loading) return (
    <div className={styles.feedLoadingGrid} role="status" aria-label="Đang tải bảng tin cảm hứng">
      {Array.from({ length: 6 }, (_, index) => <div key={index} />)}
    </div>
  );
  if (!empty) return null;
  return (
    <SocialEmptyState action={<button type="button" className="primary-button" onClick={onCompose}>Chia sẻ chuyến đi</button>}>
      <p>{emptyHint}</p>
    </SocialEmptyState>
  );
}
