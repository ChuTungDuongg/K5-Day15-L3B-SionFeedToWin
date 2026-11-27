import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(directory, 'fe-shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = css.split('@media (max-width: 1023px)')[1] ?? '';
const layout = readFileSync(resolve(directory, '../../app/layout.tsx'), 'utf8');

function readRule(selector: string, source = css): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('mobile header CSS', () => {
  it('keeps the desktop header 72px with a translucent surface', () => {
    expect(readRule('body .ota-header .header-content')).toMatch(/min-height:\s*72px/);
    expect(css).toContain('backdrop-filter: blur(12px)');
    expect(css).toContain('var(--color-background) 85%');
  });

  it('keeps one 56px row with the cart accessible below 1024px', () => {
    expect(readRule('body .ota-header .header-content nav', phone)).toMatch(/display:\s*none/);
    const cart = readRule("body .ota-header .header-actions > a[href='/cart']", phone);
    expect(cart).toMatch(/display:\s*inline-flex/);
    expect(cart).toMatch(/min-height:\s*44px/);
    const content = readRule('body .ota-header .header-content', phone);
    expect(content).toMatch(/min-height:\s*56px/);
    expect(content).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  });

  it('preserves bottom safe area and reduced motion', () => {
    expect(phone).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('sticks to the top and slides away with translate when the header is hidden', () => {
    expect(css).toMatch(/\.ota-header\s*\{[^}]*position:\s*sticky/);
    expect(phone).toMatch(/\[data-header-hidden\][^{]*\{[^}]*translate:\s*0 -100%/);
  });

  it('is imported after globals.css so it wins over the older header rules', () => {
    const globalsAt = layout.indexOf("import './globals.css'");
    const mobileAt = layout.indexOf("import '@/features/shell/fe-shell.css'");
    expect(globalsAt).toBeGreaterThan(-1);
    expect(mobileAt).toBeGreaterThan(globalsAt);
    expect(layout).toMatch(/viewportFit:\s*'cover'/);
  });
});
