import type {
  TextStyle,
  ViewStyle,
} from 'react-native';

/**
 * Labna design tokens
 *
 * Native source:
 * Labna/LabnaShared/DesignSystem/LabnaTheme.swift
 * Labna/Labna/Core/DesignSystem/LabnaButtonStyles.swift
 *
 * The native application is light-only.
 */

export const colors = {
  /**
   * Core brand palette
   */
  labnaGreen: '#144F3B',
  labnaMint: '#E8F5EB',
  labnaCream: '#FAF7ED',
  labnaInk: '#1A241F',
  labnaMuted: '#636E66',

  /**
   * labnaGreen with 12% opacity.
   */
  labnaBorder: 'rgba(20, 79, 59, 0.12)',

  /**
   * General interface colors
   */
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  /**
   * SwiftUI Color.red equivalent for the light interface.
   */
  error: '#FF3B30',

  /**
   * Common opacity variants used by native screens.
   */
  cream25: 'rgba(250, 247, 237, 0.25)',
  cream35: 'rgba(250, 247, 237, 0.35)',
  cream45: 'rgba(250, 247, 237, 0.45)',
  cream55: 'rgba(250, 247, 237, 0.55)',

  green12: 'rgba(20, 79, 59, 0.12)',
  green16: 'rgba(20, 79, 59, 0.16)',
  green82: 'rgba(20, 79, 59, 0.82)',

  white94: 'rgba(255, 255, 255, 0.94)',
  black08: 'rgba(0, 0, 0, 0.08)',
  black72: 'rgba(0, 0, 0, 0.72)',
} as const;

/**
 * Mirrors LabnaSpacing from the native application.
 */
export const spacing = {
  extraSmall: 4,
  small: 8,
  medium: 16,
  large: 24,
  extraLarge: 32,
} as const;

/**
 * Mirrors LabnaRadius from the native application.
 */
export const radii = {
  medium: 16,
  large: 24,
} as const;

/**
 * Shared measurements explicitly found in the native source.
 */
export const sizes = {
  minimumTouchTarget: 44,
  buttonMinimumHeight: 52,

  logo: 44,
  logoRadius: 14,
  splashLogo: 220,

  quickAddImage: 104,

  categoryCardWidth: 150,
  recentlyViewedCardWidth: 170,

  productGridMinimumWidth: 155,
  productGridMaximumWidth: 240,
} as const;

/**
 * React Native equivalents of Apple's default semantic text styles.
 *
 * React Native Text allows font scaling by default. Do not set
 * allowFontScaling={false} when using these styles.
 *
 * The native app does not use a custom font family.
 */
export const typography = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
  },

  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },

  brand: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },

  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },

  body: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
  },

  price: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },

  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
} satisfies Record<string, TextStyle>;

/**
 * Shared shadows.
 *
 * The add-to-cart toast is the main native component that uses
 * a visible shadow.
 */
export const shadows = {
  toast: {
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,

    // Android approximation.
    elevation: 4,
  },
} satisfies Record<string, ViewStyle>;

/**
 * Common animation values explicitly defined in the native app.
 */
export const animations = {
  buttonPressDuration: 120,
  buttonPressedScale: 0.98,

  searchTransitionDuration: 200,

  bannerInterval: 5000,
  bannerTransitionDuration: 450,
} as const;