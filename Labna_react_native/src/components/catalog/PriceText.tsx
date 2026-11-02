import React from 'react';

import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useTranslation,
} from 'react-i18next';

import {
  formatPrice,
} from '@src/features/catalog/catalogFormatting';

import type {
  AppLanguage,
} from '@src/i18n';

import {
  colors,
  spacing,
  typography,
} from '@src/theme';

type PriceTextProps = {
  minorUnits: number;
  currencyCode: string;
  prefix?: string;
  color?: string;
};

export function PriceText({
  minorUnits,
  currencyCode,
  prefix,
  color = colors.labnaGreen,
}: PriceTextProps) {
  const { i18n } = useTranslation();

  const language: AppLanguage =
    i18n.resolvedLanguage === 'ar'
      ? 'ar'
      : 'en';

  const formattedPrice =
    formatPrice(
      minorUnits,
      currencyCode,
      language,
    );

  const accessibilityLabel = prefix
    ? `${prefix} ${formattedPrice}`
    : formattedPrice;

  return (
    <View
      accessible
      accessibilityLabel={
        accessibilityLabel
      }
      style={styles.container}
    >
      {prefix ? (
        <Text
          accessible={false}
          style={[
            styles.prefix,
            {
              color,
            },
          ]}
        >
          {prefix}
        </Text>
      ) : null}

      <Text
        accessible={false}
        style={[
          styles.price,
          {
            color,
          },
        ]}
      >
        {formattedPrice}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.extraSmall,
  },

  prefix: {
    ...typography.price,
    opacity: 0.72,
  },

  price: {
    ...typography.price,
  },
});