import { describe, expect, it } from 'vitest';
import { notificationTitle } from './notification-title';

describe('notification tab title', () => {
  it('preserves route titles and replaces counts without stacking', () => {
    expect(notificationTitle('(2) Chuyến đi | Vintrip', 4)).toBe('(4) Chuyến đi | Vintrip');
    expect(notificationTitle('Trang cá nhân | Vintrip', 1)).toBe('(1) Trang cá nhân | Vintrip');
  });
  it('removes the count on read/logout and caps large counts', () => {
    expect(notificationTitle('(99+) Vintrip', 0)).toBe('Vintrip');
    expect(notificationTitle('Vintrip', 1000)).toBe('(99+) Vintrip');
  });
});
