import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { vi as copy } from '@vintrip/i18n';

vi.mock('./ota-home-recommendations', () => ({
  OtaHomeRecommendations: () => createElement('section', { id: 'recommendations-title' }, 'Gợi ý cho bạn'),
}));
vi.mock('./ota-home-previews', () => ({
  HomeStayPreview: () => createElement('section', { id: 'home-stays-title' }, 'VINTRIP TICKET'),
  HomeStoryPreview: () => createElement('section'),
}));
vi.mock('./park-planner', () => ({ ParkPlanner: () => createElement('div', { 'data-planner': true }) }));
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt?: string }) => createElement('img', { src, alt }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) }));

import { OtaHomeSections } from './ota-home-sections';

it('đặt #lich-vui-choi sau Gợi ý cho bạn và trước dải VINTRIP TICKET, có heading và card dùng chung', () => {
  const html = renderToStaticMarkup(createElement(OtaHomeSections));
  const recommendations = html.indexOf('id="recommendations-title"');
  const planner = html.indexOf('id="lich-vui-choi"');
  const ticket = html.indexOf('id="home-stays-title"');
  expect(recommendations).toBeGreaterThan(-1);
  expect(planner).toBeGreaterThan(recommendations); expect(ticket).toBeGreaterThan(planner);
  expect(html).toContain('aria-labelledby="park-planner-title"');
  expect(html).toContain('id="park-planner-title"'); expect(html).toContain(copy.parkPlanner.title);
  expect(html).toContain(copy.parkPlanner.eyebrow); expect(html).toContain('data-planner="true"');
});
