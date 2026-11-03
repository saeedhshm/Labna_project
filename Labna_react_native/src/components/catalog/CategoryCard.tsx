import React from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useTranslation,
} from 'react-i18next';

import type {
  Category,
} from '@src/api/contracts/catalog';

import {
  localizedText,
} from '@src/features/catalog/catalogFormatting';

import type {
  AppLanguage,
} from '@src/i18n';

import {
  colors,
  radii,
  spacing,
  typography,
} from '@src/theme';

import {
  ProductImage,
} from './ProductImage';

type CategoryCardProps = {
  category: Category;
  onPress: () => void;
};

export function CategoryCard({
  category,
  onPress,
}: CategoryCardProps) {
  const { i18n } = useTranslation();

  const language: AppLanguage =
    i18n.resolvedLanguage === 'ar'
      ? 'ar'
      : 'en';

  const name = localizedText(
    category.name,
    language,
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      testID={`category.${category.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed
          ? styles.pressed
          : undefined,
      ]}
    >
      <View style={styles.image}>
        <ProductImage
          url={category.imageURL}
          aspectRatio={1.25}
          allowsRetry={false}
        />
      </View>

      <Text
        numberOfLines={2}
        style={[
          styles.name,
          language === 'ar'
            ? styles.textRTL
            : styles.textLTR,
        ]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    gap: spacing.small,
    padding: spacing.small,

    borderRadius: radii.large,

    borderWidth: 1,
    borderColor: colors.labnaBorder,

    backgroundColor: colors.white,
  },

  image: {
    overflow: 'hidden',
    borderRadius: radii.medium,
  },

  name: {
    ...typography.headline,
    minHeight:
      typography.headline.lineHeight * 2,
    color: colors.labnaInk,
  },

  textLTR: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },

  textRTL: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  pressed: {
    opacity: 0.82,
  },
});