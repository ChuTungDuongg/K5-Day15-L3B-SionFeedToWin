// Màu, font, khoảng cách theo brand Vintrip: tông cam pastel (FE-01). Mọi cặp chữ/nền đã đo, đạt AA.
// Web đọc qua CSS variables trong tokens.css; mobile import object này.
// Sửa ở đây thì sửa cả tokens.css (test kiểm hai file khớp nhau).

export const colors = {
  // Brand
  coral: '#C2560F', // cam đậm: nút chữ trắng (4.53:1)
  coralSoft: '#FFB98A', // cam pastel: nút phụ, chữ nâu coralInk (5.65:1)
  sun: '#FFC978', // vàng mặt trời: huy hiệu, ưu đãi
  teal: '#A24A1E', // đất nung: màu phụ, đường đi
  tealSoft: '#FFE8D6',
  navy: '#3D2418', // chữ chính, logo chữ
  // Nền và chữ
  background: '#FFFFFF',
  surface: '#FFF8F2',
  surfaceMuted: '#FFF1E6',
  border: '#F3DCCB',
  text: '#3D2418',
  textMuted: '#8A5A44',
  textSubtle: '#A07B68',
  // Trạng thái
  success: '#2F7A5F',
  warning: '#FFC978',
  danger: '#C2413A',
  ink: '#3D2418',
  warmMist: '#FFF8F2',
  seaMist: '#FFF4EA',
  tealInk: '#7A2E0E',
  coralInk: '#7A2E0E',
  sunSoft: '#FFF3DF',
  coralTint: '#FFE8D6',
  overlay: '#3D241880',
  overlayHeavy: '#3D2418CC',
  tabBar: '#000000',
  composeStart: '#FFB98A',
  composeEnd: '#F28A54',
  composeIconShadow: '#7A2E0E47',
  transparent: 'transparent',
} as const;

export const fonts = {
  // Be Vietnam Pro (chữ chính) và Dancing Script (chỉ chữ VinTrip + slogan ở hero), cả hai OFL, có tiếng Việt.
  // app/layout.tsx nạp bằng next/font/google và đặt hai biến --font-be-vietnam-pro, --font-dancing-script.
  sans: 'var(--font-be-vietnam-pro), "Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
  script: 'var(--font-dancing-script), "Dancing Script", cursive',
  mono: '"JetBrains Mono", ui-monospace, Consolas, monospace',
} as const;

/** Bước khoảng cách theo lưới 4px. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** Native family names registered by Expo Font; keep web families unchanged. */
export const nativeFonts = {
  regular: 'BeVietnamPro-Regular',
  medium: 'BeVietnamPro-Medium',
  semibold: 'BeVietnamPro-Semibold',
  bold: 'BeVietnamPro-Bold',
  extraBold: 'BeVietnamPro-ExtraBold',
} as const;

export const mobileLayout = {
  gutter: 20,
  buttonHeight: 50,
  touchTarget: 44,
  inputRadius: 12,
  cardRadius: 20,
  sheetRadius: 24,
  contentWidth: 430,
} as const;

export type ColorToken = keyof typeof colors;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Tên CSS variable của một màu, ví dụ `coralSoft` → `--color-coral-soft`. */
export const cssVar = (token: ColorToken) => `--color-${kebab(token)}`;
