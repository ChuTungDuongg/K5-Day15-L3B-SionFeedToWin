import { describeDevice } from '@vintrip/app-core';

function hasControlOrSpace(value: string, includeSpace: boolean): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x7f || code < (includeSpace ? 0x21 : 0x20)) return true;
  }
  return false;
}

/** Chỉ quay lại các trang của web, không chuyển hướng sang địa chỉ lạ truyền qua ?returnTo=. */
export function readSafeReturnTo(returnTo: string): string {
  // A staff return path must survive URL normalization inside the same route tree.
  // Reject encoded separators, dot segments and control characters before routing.
  if (/^\/staff(?:\/|$|[?#])/.test(returnTo)) {
    const pathname = returnTo.split(/[?#]/, 1)[0] ?? '';
    try {
      const decoded = decodeURIComponent(pathname);
      if (decoded.includes('\\') || hasControlOrSpace(decoded, true) || decoded.includes('%')) return '/account';
      if (decoded.split('/').some((segment) => segment === '.' || segment === '..')) return '/account';
      if (decoded !== pathname || hasControlOrSpace(returnTo, false)) return '/account';
      return returnTo;
    } catch {
      return '/account';
    }
  }
  // Trang chủ và Cảm hứng: khách hết lượt chat Tripi đăng nhập xong quay về đúng trang đang xem (TF31).
  return /^\/(?:account(?:\/moderation)?|trips\/[^/?#]+|search|flights|bookings|hotels\/[^/?#]+|checkout\/[^/?#]+|inspiration)?(?:$|[?#])/.test(
    returnTo,
  )
    ? returnTo
    : '/account';
}

/** Giữ ?returnTo= khi chuyển qua lại giữa trang đăng nhập và trang đăng ký. */
export function withReturnTo(path: '/login' | '/register', returnTo: string | undefined): string {
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
}

export const readDeviceName = () => describeDevice(navigator.userAgent) ?? undefined;
