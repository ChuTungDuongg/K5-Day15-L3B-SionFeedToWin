/**
 * Địa chỉ công khai của web (TF112): metadataBase, canonical, sitemap và robots dùng chung.
 * NEXT_PUBLIC_SITE_URL được nhúng lúc build; thiếu thì dùng địa chỉ web local.
 */
const DEFAULT_SITE_URL = 'http://localhost:3100';

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

/** Ghép đường dẫn trong site thành URL tuyệt đối, ví dụ `/hotels/abc` → `http://localhost:3100/hotels/abc`. */
export function toAbsoluteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Gateway mà server Next gọi khi dựng metadata và sitemap. API_INTERNAL_URL cho phép đi đường mạng nội bộ
 * (ví dụ http://gateway:8080 trong Docker); không có thì dùng cùng địa chỉ với trình duyệt.
 */
export function getServerApiUrl(): string {
  return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
}
