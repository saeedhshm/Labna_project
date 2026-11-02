import React from 'react';

import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useTranslation,
} from 'react-i18next';

import {
  colors,
  sizes,
  spacing,
  typography,
} from '@src/theme';

const launcherLogo = require(
  '../../assets/images/labna-launcher-logo.png',
);

export function LabnaLogo() {
  const { t, i18n } = useTranslation();

  const isArabic =
    i18n.resolvedLanguage === 'ar';

  const accessibilityLabel = [
    t('brand.name'),
    t('brand.tagline'),
  ].join(', ');

  return (
    <View
      accessible
      accessibilityLabel={
        accessibilityLabel
      }
      style={[
        styles.container,
        isArabic
          ? styles.containerRTL
          : undefined,
      ]}
    >
      <Image
        accessible={false}
        source={launcherLogo}
        resizeMode="cover"
        style={styles.logo}
      />

      <View
        style={[
          styles.textContainer,
          isArabic
            ? styles.textContainerRTL
            : undefined,
        ]}
      >
        <Text
          accessible={false}
          style={[
            styles.name,
            isArabic
              ? styles.textRTL
              : styles.textLTR,
          ]}
        >
          {t('brand.name')}
        </Text>

        <Text
          accessible={false}
          style={[
            styles.tagline,
            isArabic
              ? styles.textRTL
              : styles.textLTR,
          ]}
        >
          {t('brand.tagline')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },

  containerRTL: {
    flexDirection: 'row-reverse',
  },

  logo: {
    width: sizes.logo,
    height: sizes.logo,
    borderRadius: sizes.logoRadius,
  },

  textContainer: {
    alignItems: 'flex-start',
  },

  textContainerRTL: {
    alignItems: 'flex-end',
  },

  name: {
    ...typography.brand,
    color: colors.labnaInk,
  },

  tagline: {
    ...typography.caption,
    color: colors.labnaMuted,
  },

  textLTR: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },

  textRTL: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});