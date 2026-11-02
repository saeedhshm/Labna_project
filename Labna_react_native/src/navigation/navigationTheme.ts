import {
  DefaultTheme,
} from '@react-navigation/native';

import type {
  Theme,
} from '@react-navigation/native';

import {
  colors,
} from '@src/theme';

export const labnaNavigationTheme: Theme = {
  ...DefaultTheme,

  dark: false,

  colors: {
    ...DefaultTheme.colors,

    primary: colors.labnaGreen,
    background: colors.white,
    card: colors.white,
    text: colors.labnaInk,
    border: colors.labnaBorder,
    notification: colors.labnaGreen,
  },
};