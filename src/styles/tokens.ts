import type { ThemeConfig } from 'antd';

// ── Color Tokens ────────────────────────────────────────────────────
export const colors = {
  bg: {
    base: '#0a1220',
    card: '#121c2f',
    surface: '#0f1726',
    elevated: '#1a2744',
  },
  border: {
    default: '#2d3e59',
    muted: 'rgba(142, 164, 189, 0.12)',
    active: '#4aa8ff',
  },
  text: {
    primary: '#dbe7f5',
    secondary: '#8ea4bd',
    muted: '#6b7f96',
  },
  status: {
    success: '#2ec5a2',
    warning: '#eab54f',
    danger: '#ef5b6b',
    info: '#4aa8ff',
    successBg: 'rgba(46, 197, 162, 0.18)',
    warningBg: 'rgba(234, 181, 79, 0.18)',
    dangerBg: 'rgba(239, 91, 107, 0.18)',
    infoBg: 'rgba(74, 168, 255, 0.15)',
  },
  chart: {
    csi: '#21c7a8',
    activity: '#2ea0ff',
    threshold: '#95a6b8',
    danger: '#ef5b6b',
    warning: '#eab54f',
  },
} as const;

// ── Spacing Tokens ───────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

// ── Typography Tokens ────────────────────────────────────────────────
export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 14,
  xl: 18,
  xxl: 24,
  hero: 32,
} as const;

export const fontFamily = {
  sans: `"IBM Plex Sans SC", "Source Han Sans CN", "Noto Sans SC", "Segoe UI", sans-serif`,
  mono: `"IBM Plex Mono", "Consolas", monospace`,
} as const;

export const borderRadius = {
  sm: 0,
  md: 0,
  lg: 0,
  xl: 0,
} as const;

// ── Thresholds ───────────────────────────────────────────────────────
export const thresholds = {
  activityLow: 0.35,
  activityHigh: 0.7,
  fallConfidence: 0.75,
} as const;

// ── Light Theme Colors ──────────────────────────────────────────────
export const lightColors = {
  bg: { base: '#f5f7fa', card: '#ffffff', surface: '#fafbfc', elevated: '#ffffff' },
  border: { default: '#e2e8f0', muted: 'rgba(148, 163, 184, 0.2)', active: '#1890ff' },
  text: { primary: '#1e293b', secondary: '#64748b', muted: '#94a3b8' },
  status: {
    success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#2563eb',
    successBg: 'rgba(22, 163, 74, 0.1)', warningBg: 'rgba(217, 119, 6, 0.1)',
    dangerBg: 'rgba(220, 38, 38, 0.1)', infoBg: 'rgba(37, 99, 235, 0.1)',
  },
  chart: { csi: '#0d9488', activity: '#2563eb', threshold: '#94a3b8', danger: '#dc2626', warning: '#d97706' },
} as const;

// ── Ant Design Theme Configuration ───────────────────────────────────

function buildAntdTheme(dark: boolean): ThemeConfig {
  const c = dark ? colors : lightColors;
  return {
    algorithm: undefined, // set via ConfigProvider
    token: {
      colorBgBase: c.bg.base,
      colorBgContainer: c.bg.card,
      colorBgElevated: c.bg.elevated,
      colorBorder: c.border.default,
      colorBorderSecondary: c.border.muted,
      colorText: c.text.primary,
      colorTextSecondary: c.text.secondary,
      colorTextTertiary: c.text.muted,
      colorPrimary: c.status.info,
      colorSuccess: c.status.success,
      colorWarning: c.status.warning,
      colorError: c.status.danger,
      borderRadius: borderRadius.md,
      fontFamily: fontFamily.sans,
      fontSize: fontSize.lg,
    },
    components: {
      Layout: {
        bodyBg: c.bg.base,
        headerBg: dark ? 'rgba(10, 18, 32, 0.92)' : 'rgba(255,255,255,0.94)',
        siderBg: dark ? 'rgba(10, 18, 32, 0.96)' : '#ffffff',
        triggerBg: dark ? 'rgba(18, 28, 47, 0.94)' : '#f8fafc',
      },
      Menu: {
        darkItemBg: 'transparent',
        darkItemColor: colors.text.secondary,
        darkItemSelectedBg: colors.status.infoBg,
        darkItemSelectedColor: colors.status.info,
        darkSubMenuItemBg: 'transparent',
        itemBg: 'transparent',
        itemColor: c.text.secondary,
        itemSelectedBg: c.status.infoBg,
        itemSelectedColor: c.status.info,
        subMenuItemBg: 'transparent',
      },
      Table: {
        headerBg: dark ? 'rgba(13, 24, 39, 0.94)' : '#f8fafc',
        headerColor: dark ? '#9ab4cf' : '#64748b',
        headerSortActiveBg: c.status.infoBg,
        bodySortBg: dark ? 'rgba(74, 168, 255, 0.04)' : 'rgba(37, 99, 235, 0.04)',
        rowHoverBg: dark ? 'rgba(74, 168, 255, 0.06)' : 'rgba(37, 99, 235, 0.04)',
        borderColor: c.border.default,
        cellPaddingBlock: 10,
        cellPaddingInline: 12,
      },
      Card: {
        colorBgContainer: c.bg.surface,
        colorBorderSecondary: c.border.muted,
      },
      Button: {
        primaryShadow: dark ? '0 0 8px rgba(74, 168, 255, 0.3)' : '0 0 8px rgba(37, 99, 235, 0.2)',
        defaultBorderColor: c.border.default,
        defaultBg: dark ? 'rgba(18, 28, 47, 0.9)' : '#ffffff',
      },
      Tag: {
        defaultBg: c.bg.elevated,
        defaultColor: c.text.secondary,
      },
      Drawer: {
        colorBgElevated: c.bg.card,
      },
      Modal: {
        colorBgElevated: c.bg.card,
      },
      Notification: {
        colorBgElevated: c.bg.elevated,
      },
      Select: {
        colorBgElevated: c.bg.elevated,
        colorBgContainer: c.bg.surface,
        optionSelectedBg: c.status.infoBg,
      },
      Input: {
        colorBgContainer: c.bg.surface,
        activeBorderColor: c.status.info,
        hoverBorderColor: c.border.active,
      },
      Statistic: {
        contentFontSize: 24,
      },
    },
  };
}

export const antdThemeDark = buildAntdTheme(true);
export const antdThemeLight = buildAntdTheme(false);

// Keep default alias for backward compat
export const antdTheme = antdThemeDark;

export type ThemeColors = typeof colors;

export function getThemeColors(dark: boolean): ThemeColors {
  return dark ? colors : (lightColors as unknown as ThemeColors);
}
