import React, {
    useState,
  } from 'react';
  
  import {
    StyleSheet,
    View,
  } from 'react-native';
  
  import {
    useTranslation,
  } from 'react-i18next';
  
  import type {
    Product,
  } from '@src/api/contracts/catalog';
  
  import {
    sizes,
    spacing,
  } from '@src/theme';
  
  import {
    ProductCard,
  } from './ProductCard';
  
  type ProductGridProps = {
    products: Product[];
  
    onOpen: (
      product: Product,
    ) => void;
  
    onQuickAdd: (
      product: Product,
    ) => void;
  };
  
  export function ProductGrid({
    products,
    onOpen,
    onQuickAdd,
  }: ProductGridProps) {
    const { i18n } = useTranslation();
  
    const isArabic =
      i18n.resolvedLanguage === 'ar';
  
    const [
      containerWidth,
      setContainerWidth,
    ] = useState(0);
  
    const columnCount =
      calculateColumnCount(
        containerWidth,
      );
  
    const cardWidth =
      calculateCardWidth(
        containerWidth,
        columnCount,
      );
  
    if (!products.length) {
      return null;
    }
  
    return (
      <View
        testID="product.grid"
        style={styles.measurementContainer}
        onLayout={event => {
          const nextWidth =
            event.nativeEvent.layout.width;
  
          setContainerWidth(
            currentWidth =>
              Math.abs(
                currentWidth -
                  nextWidth,
              ) >= 1
                ? nextWidth
                : currentWidth,
          );
        }}
      >
        {containerWidth > 0 ? (
          <View
            style={[
              styles.grid,
  
              isArabic
                ? styles.gridRTL
                : styles.gridLTR,
            ]}
          >
            {products.map(product => (
              <View
                key={product.id}
                style={{
                  width: cardWidth,
                }}
              >
                <ProductCard
                  product={product}
                  onOpen={() => {
                    onOpen(product);
                  }}
                  onQuickAdd={() => {
                    onQuickAdd(product);
                  }}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  
  function calculateColumnCount(
    availableWidth: number,
  ): number {
    if (availableWidth <= 0) {
      return 1;
    }
  
    const minimumCardWidth =
      sizes.productGridMinimumWidth;
  
    const gap = spacing.medium;
  
    return Math.max(
      1,
      Math.floor(
        (availableWidth + gap) /
          (minimumCardWidth + gap),
      ),
    );
  }
  
  function calculateCardWidth(
    availableWidth: number,
    columnCount: number,
  ): number {
    if (availableWidth <= 0) {
      return 0;
    }
  
    const gap = spacing.medium;
  
    const totalGapWidth =
      gap * (columnCount - 1);
  
    const distributedWidth =
      (availableWidth -
        totalGapWidth) /
      columnCount;
  
    return Math.min(
      sizes.productGridMaximumWidth,
      distributedWidth,
    );
  }
  
  const styles = StyleSheet.create({
    measurementContainer: {
      width: '100%',
    },
  
    grid: {
      width: '100%',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: spacing.medium,
    },
  
    gridLTR: {
      flexDirection: 'row',
    },
  
    gridRTL: {
      flexDirection: 'row-reverse',
    },
  });