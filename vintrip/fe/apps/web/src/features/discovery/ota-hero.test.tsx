import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OtaHero } from './ota-hero';

vi.mock('@/features/mascot/tripi-mascot', () => ({ ViniMascot: () => null }));

// Next supplies the JSX runtime in the app; Vitest's default transform uses React.
beforeAll(() => { vi.stubGlobal('React', React); });
afterAll(() => { vi.unstubAllGlobals(); });

function destinationLinks(node: ReactNode): ReactElement<{ href: string }>[] {
  const links: ReactElement<{ href: string }>[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<{ href?: string; children?: ReactNode }>(child)) return;
    if (child.props.href?.startsWith('/search?q=')) {
      links.push(child as ReactElement<{ href: string }>);
    }
    links.push(...destinationLinks(child.props.children));
  });
  return links;
}

describe('OtaHero', () => {
  it('keeps destination shortcuts out of the hero', () => {
    expect(destinationLinks(OtaHero())).toEqual([]);
  });
});
