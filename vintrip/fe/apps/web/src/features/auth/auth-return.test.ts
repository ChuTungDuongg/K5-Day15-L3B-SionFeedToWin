import { expect, it } from 'vitest';
import { readSafeReturnTo } from './auth-return';

it('đăng nhập quay lại trang kiểm duyệt và vẫn chặn redirect bên ngoài', () => {
  expect(readSafeReturnTo('/account/moderation')).toBe('/account/moderation');
  expect(readSafeReturnTo('/account/moderation?decision=123')).toBe('/account/moderation?decision=123');
  for (const path of [
    'https://evil.test',
    '//evil.test',
    '/account/moderation/../../evil',
    '/account/moderation-evil',
  ])
    expect(readSafeReturnTo(path)).toBe('/account');
});

it.each(['/staff', '/staff/', '/staff/room-upgrades?booking=C2-0001', '/staff/proposals/123'])(
  'accepts staff return path %s',
  (path) => expect(readSafeReturnTo(path)).toBe(path),
);

it.each([
  '//evil.com',
  'https://evil.com',
  '/staffing',
  '/staff/../account',
  '/staff/./bookings',
  '/staff/%2e%2e/account',
  '/staff/%252e%252e/account',
  '/staff/%2f%2fevil.com',
  '/staff/\\evil.com',
  '/staff/\nbookings',
  '/staff/bookings?x=\r\nevil',
  '/staff/%zz',
])('rejects unsafe staff return path %s', (path) => {
  expect(readSafeReturnTo(path)).toBe('/account');
});
