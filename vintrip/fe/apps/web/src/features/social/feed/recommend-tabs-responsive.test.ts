import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'social-feed.module.css'), 'utf8');

describe('Tab gợi ý Bài viết co giãn theo khung', () => {
  it('giới hạn băng chip trong cột và cuộn bên trong, không đẩy rộng viewport 390px', () => {
    const rule = css.match(/div\.recommendModeTabs\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('display: flex;');
    expect(rule).toContain('width: 100%;');
    expect(rule).toContain('min-width: 0;');
    expect(rule).toContain('max-width: 100%;');
    expect(rule).toContain('overflow-x: auto;');
    expect(rule).not.toContain('!important');
  });

  it('giữ nhãn nguyên vẹn và tô đúng tab đang chọn theo aria-selected', () => {
    expect(css).toMatch(/\.recommendModeTabs > button \{[^}]*flex: 0 0 auto;[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.recommendModeTabs > button\[aria-selected='true'\] \{[^}]*background: var\(--color-coral-soft\);/);
  });
});
