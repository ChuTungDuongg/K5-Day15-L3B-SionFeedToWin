// Màu, font, khoảng cách theo brand Vintrip: tông hoàng hôn cam hồng.
// Web đọc qua CSS variables trong tokens.css; mobile import object này.
// Sửa ở đây thì sửa cả tokens.css (test kiểm hai file khớp nhau).

export const colors = {
  // Brand
  coral: '#D9365A', // màu chính: nút, điểm nhấn
  coralSoft: '#FB7185',
  sun: '#FFC531', // vàng mặt trời: huy hiệu, ưu đãi
  teal: '#C2410C', // cam đất hoàng hôn: màu phụ, đường đi
  tealSoft: '#FFEDD5',
  navy: '#141B3D', // chữ chính, logo chữ
  // Nền và chữ
  background: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceMuted: '#F1F5F9',
  border: '#E2E8F0',
  text: '#141B3D',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
  // Trạng thái
  success: '#15803D',
  warning: '#FFC531',
  danger: '#E5484D',
  ink: '#18242B',
  warmMist: '#FFF7ED',
  seaMist: '#FFF4EC',
  tealInk: '#9A3412',
  coralInk: '#BE123C',
  sunSoft: '#FFF6D8',
  coralTint: '#FFE4E6',
  overlay: '#18242B80',
  overlayHeavy: '#18242BCC',
  tabBar: '#000000',
  composeStart: '#F97316',
  composeEnd: '#E11D48',
  composeIconShadow: '#60180E47',
  transparent: 'transparent',
} as const;

export const fonts = {
  sans: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif',
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
