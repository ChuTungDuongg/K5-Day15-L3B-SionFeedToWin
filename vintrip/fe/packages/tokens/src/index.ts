// Màu, font, khoảng cách theo brand Vintrip: xanh rừng, xanh ngọc và nền sương sáng.
// Web đọc qua CSS variables trong tokens.css; mobile import object này.
// Sửa ở đây thì sửa cả tokens.css (test kiểm hai file khớp nhau).

export const colors = {
  // Brand
  coral: '#166553', // giữ tên token để tương thích; màu chính xanh rừng
  coralSoft: '#79B89B',
  sun: '#FFC531', // vàng mặt trời: huy hiệu, ưu đãi
  teal: '#1D7A70', // xanh ngọc: màu phụ, đường đi
  tealSoft: '#D9EFD9',
  navy: '#173D35', // chữ chính, logo chữ
  // Nền và chữ
  background: '#FFFFFF',
  surface: '#F5F8F5',
  surfaceMuted: '#EBF1EC',
  border: '#D5E2D9',
  text: '#173D35',
  textMuted: '#5F7469',
  textSubtle: '#8A9E92',
  // Trạng thái
  success: '#15803D',
  warning: '#FFC531',
  danger: '#E5484D',
  ink: '#183B32',
  warmMist: '#F7F8EE',
  seaMist: '#F0F6F0',
  tealInk: '#164D43',
  coralInk: '#12513F',
  sunSoft: '#F7F3DC',
  coralTint: '#E4F0E5',
  overlay: '#153D3580',
  overlayHeavy: '#153D35CC',
  tabBar: '#000000',
  composeStart: '#3C9171',
  composeEnd: '#166553',
  composeIconShadow: '#103B2C47',
  transparent: 'transparent',
} as const;

export const fonts = {
  sans: '"Nunito", "Segoe UI", system-ui, sans-serif',
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
