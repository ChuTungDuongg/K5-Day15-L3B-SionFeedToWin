import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { vi as copy } from '@vintrip/i18n';
import { FeedStatus } from './feed-status';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

const props = {
  loading: false,
  empty: false,
  emptyHint: 'Chưa có bài viết nào phù hợp với bộ lọc hiện tại.',
  onRetry: vi.fn(),
  onCompose: vi.fn(),
};

describe('Trạng thái bảng tin cảm hứng khi chưa có dữ liệu', () => {
  it('giữ chỗ khi đang tải, không báo rỗng trước khi nhận kết quả', () => {
    const html = renderToStaticMarkup(createElement(FeedStatus, { ...props, loading: true, empty: true }));
    expect(html).toContain('role="status"');
    expect(html).toContain('Đang tải bảng tin cảm hứng');
    expect(html).not.toContain('Chưa có bài nào');
    expect(html).not.toContain('role="alert"');
  });

  it('backend không chạy: hiện ApiErrorNotice và nút Thử lại, không báo rỗng', () => {
    const html = renderToStaticMarkup(createElement(FeedStatus, { ...props, error: new TypeError('Failed to fetch'), empty: true }));
    expect(html).toContain('role="alert"');
    expect(html).toContain(copy.api.network);
    expect(html).toContain('Thử lại</button>');
    expect(html).not.toContain('Chưa có bài nào');
  });

  it('API trả danh sách rỗng: hiện ảnh guide, thông báo và nút chính', () => {
    const html = renderToStaticMarkup(createElement(FeedStatus, { ...props, empty: true }));
    expect(html).toContain('/brand/vini/vini-guide.png');
    expect(html).toContain('Chưa có bài nào');
    expect(html).toContain(props.emptyHint);
    expect(html).toContain('class="primary-button"');
    expect(html).toContain('Chia sẻ chuyến đi</button>');
  });

  it('khi có bài thì không chèn trạng thái thay thế', () => {
    expect(renderToStaticMarkup(createElement(FeedStatus, props))).toBe('');
  });
});
