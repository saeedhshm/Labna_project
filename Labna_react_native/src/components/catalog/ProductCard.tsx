import React from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Ionicons,
} from '@react-native-vector-icons/ionicons/static';

import {
  useTranslation,
} from 'react-i18next';

import type {
  Product,
} from '@src/api/contracts/catalog';

import {
  formatPrice,
  getAvailableVariants,
  getStartingPrice,
  isProductAvailable,
  localizedText,
} from '@src/features/catalog/catalogFormatting';

import type {
  AppLanguage,
} from '@src/i18n';

import {
  colors,
  radii,
  sizes,
  spacing,
  typography,
} from '@src/theme';

import {
  FavoriteButton,
} from './FavoriteButton';

import {
  PriceText,
} from './PriceText';

import {
  ProductImage,
} from './ProductImage';

type ProductCardProps = {
  product: Product;
  onOpen: () => void;
  onQuickAdd: () => void;
};

export function ProductCard({
  product,
  onOpen,
  onQuickAdd,
}: ProductCardProps) {
  const { t, i18n } = useTranslation();

  const language: AppLanguage =
    i18n.resolvedLanguage === 'ar'
      ? 'ar'
      : 'en';

  const name = localizedText(
    product.name,
    language,
  );

  const availableVariants =
    getAvailableVariants(product);

  const startingPrice =
    getStartingPrice(product);

  const currencyCode =
    availableVariants[0]
      ?.currencyCode;

  const available =
    isProductAvailable(product);

  const priceAccessibilityLabel =
    startingPrice !== null &&
    currencyCode
      ? formatPrice(
          startingPrice,
          currencyCode,
          language,
        )
      : t('product.unavailable');

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <View style={styles.imageContainer}>
          <Pressable
            accessible={false}
            onPress={onOpen}
          >
            <ProductImage
              url={
                product.imageURLs[0]
              }
              allowsRetry={false}
            />
          </Pressable>

          <View
            style={[
              styles.favorite,
              language === 'ar'
                ? styles.favoriteRTL
                : styles.favoriteLTR,
            ]}
          >
            <FavoriteButton
              productID={product.id}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            `${name}, ${priceAccessibilityLabel}`
          }
          accessibilityHint={t(
            'product.open',
          )}
          testID={`product.${product.id}`}
          onPress={onOpen}
          style={({ pressed }) => [
            styles.details,
            pressed
              ? styles.pressed
              : undefined,
          ]}
        >
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

          {startingPrice !== null &&
          currencyCode ? (
            <PriceText
              minorUnits={
                startingPrice
              }
              currencyCode={
                currencyCode
              }
              prefix={
                availableVariants.length >
                1
                  ? t('price.from')
                  : undefined
              }
            />
          ) : (
            <Text
              style={[
                styles.unavailable,
                language === 'ar'
                  ? styles.textRTL
                  : styles.textLTR,
              ]}
            >
              {t(
                'product.unavailable',
              )}
            </Text>
          )}
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          'product.add',
        )}
        accessibilityState={{
          disabled: !available,
        }}
        disabled={!available}
        testID={`quickAdd.${product.id}`}
        onPress={onQuickAdd}
        style={({ pressed }) => [
          styles.addButton,

          !available
            ? styles.addButtonDisabled
            : undefined,

          pressed && available
            ? styles.addButtonPressed
            : undefined,
        ]}
      >
        <Ionicons
          accessible={false}
          name="add"
          size={20}
          color={colors.white}
        />

        <Text style={styles.addButtonTitle}>
          {t('product.add')}
        </Text>
      </Pressable>
    </View>
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

  content: {
    gap: spacing.small,
  },

  imageContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radii.medium,
  },

  favorite: {
    position: 'absolute',
    top: spacing.small,
  },

  favoriteLTR: {
    right: spacing.small,
  },

  favoriteRTL: {
    left: spacing.small,
  },

  details: {
    width: '100%',
    gap: spacing.small,
  },

  name: {
    ...typography.headline,
    minHeight:
      typography.headline.lineHeight * 2,
    color: colors.labnaInk,
  },

  unavailable: {
    ...typography.headline,
    color: colors.labnaMuted,
  },

  addButton: {
    minHeight:
      sizes.minimumTouchTarget,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: spacing.extraSmall,
    paddingHorizontal: spacing.medium,

    borderRadius: radii.medium,
    backgroundColor: colors.labnaGreen,
  },

  addButtonPressed: {
    backgroundColor: colors.green82,
  },

  addButtonDisabled: {
    opacity: 0.45,
  },

  addButtonTitle: {
    ...typography.headline,
    color: colors.white,
  },

  pressed: {
    opacity: 0.82,
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