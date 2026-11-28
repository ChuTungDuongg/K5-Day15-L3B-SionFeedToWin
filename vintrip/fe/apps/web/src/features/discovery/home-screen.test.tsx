import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import HomeScreen from './home-screen';
import styles from './inspiration-page.module.css';

vi.mock('../social/inspiration-view', () => ({
  InspirationView: () => createElement('section', { 'aria-label': 'Bảng tin du lịch' }, 'Nội dung bảng tin'),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

describe('Lớp nền trang cảm hứng không che bảng tin', () => {
  it('có class định vị riêng cho nội dung và ảnh fill, không phụ thuộc CSS trang chủ đã xoá', () => {
    const html = renderToStaticMarkup(createElement(HomeScreen));
    expect(styles.page).toBeTruthy();
    expect(styles.content).toBeTruthy();
    expect(styles.backdrop).toBeTruthy();
    expect(html).toContain(`class="${styles.content}"`);
    expect(html).toContain(`class="${styles.backdrop}" aria-hidden="true"`);
    expect(html).toContain('Nội dung bảng tin');
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'inspiration-page.module.css'), 'utf8');
    expect(css).toMatch(/\.page\s*\{[^}]*position: relative;[^}]*isolation: isolate;/);
    expect(css).toMatch(/\.backdrop\s*\{[^}]*z-index: -1;[^}]*pointer-events: none;/);
  });
});
