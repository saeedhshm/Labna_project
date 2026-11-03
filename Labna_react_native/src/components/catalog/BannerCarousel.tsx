import React, {
    useEffect,
    useRef,
    useState,
  } from 'react';
  
  import {
    AccessibilityInfo,
    AppState,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
  } from 'react-native';
  
  import type {
    AppStateStatus,
    ListRenderItemInfo
  } from 'react-native';
  
  import LinearGradient from 'react-native-linear-gradient';
  
  import {
    useTranslation,
  } from 'react-i18next';
  
  import type {
    Banner,
  } from '@src/api/contracts/catalog';
  
  import {
    localizedText,
  } from '@src/features/catalog/catalogFormatting';
  
  import type {
    AppLanguage,
  } from '@src/i18n';
  
  import {
    animations,
    colors,
    spacing,
    typography,
  } from '@src/theme';
  
  import {
    ProductImage,
  } from './ProductImage';
  
  type BannerCarouselProps = {
    banners: Banner[];
  
    onBannerPress: (
      banner: Banner,
    ) => void;
  };
  
  const BANNER_ASPECT_RATIO = 1.65;

  function getInitialAppState():
AppStateStatus {
  const currentState =
    AppState.currentState;

  if (
    currentState === 'background' ||
    currentState === 'inactive'
  ) {
    return currentState;
  }

  return 'active';
}
  
  export function BannerCarousel({
    banners,
    onBannerPress,
  }: BannerCarouselProps) {
    const { i18n } = useTranslation();
  
    const { width } =
      useWindowDimensions();
  
    const language: AppLanguage =
      i18n.resolvedLanguage === 'ar'
        ? 'ar'
        : 'en';
  
    const isArabic =
      language === 'ar';
  
    const listRef =
      useRef<FlatList<Banner>>(null);
  
    const [selectedIndex, setSelectedIndex] =
      useState(0);
  
    const [reduceMotion, setReduceMotion] =
      useState(false);
  
      const [appState, setAppState] =
      useState<AppStateStatus>(
        getInitialAppState,
      );
    const carouselHeight =
      width / BANNER_ASPECT_RATIO;
  
  
  
  
  
    useEffect(() => {
      AccessibilityInfo
        .isReduceMotionEnabled()
        .then(setReduceMotion);
  
      const reduceMotionSubscription =
        AccessibilityInfo.addEventListener(
          'reduceMotionChanged',
          setReduceMotion,
        );
  
      const appStateSubscription =
        AppState.addEventListener(
          'change',
          setAppState,
        );
  
      return () => {
        reduceMotionSubscription.remove();
        appStateSubscription.remove();
      };
    }, []);
  
    useEffect(() => {
      if (
        banners.length <= 1 ||
        reduceMotion ||
        appState !== 'active'
      ) {
        return;
      }
  
      const timer = setTimeout(() => {
        const nextIndex =
          (selectedIndex + 1) %
          banners.length;
  
        setSelectedIndex(nextIndex);
  
        listRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
      }, animations.bannerInterval);
  
      return () => {
        clearTimeout(timer);
      };
    }, [
      appState,
      banners.length,
      reduceMotion,
      selectedIndex,
    ]);
  
    useEffect(() => {
      if (
        selectedIndex <
        banners.length
      ) {
        return;
      }
  
      setSelectedIndex(0);
  
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
    }, [
      banners.length,
      selectedIndex,
    ]);
  
    if (!banners.length) {
      return null;
    }
  
    function renderBanner({
      item,
      index,
    }: ListRenderItemInfo<Banner>) {
      const title = localizedText(
        item.title,
        language,
      );
  
      const subtitle = localizedText(
        item.subtitle,
        language,
      );
  
      const accessibilityLabel = [
        title,
        subtitle,
      ]
        .filter(Boolean)
        .join(', ');
  
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            accessibilityLabel
          }
          testID={`banner.${index}.${item.id}`}
          onPress={() => {
            onBannerPress(item);
          }}
          style={{
            width,
            height: carouselHeight,
          }}
        >
          <ProductImage
            url={item.imageURL}
            aspectRatio={
              BANNER_ASPECT_RATIO
            }
            allowsRetry={false}
          />
  
          <LinearGradient
            pointerEvents="none"
            colors={[
              colors.transparent,
              colors.black72,
            ]}
            locations={[0, 1]}
            start={{
              x: 0.5,
              y: 0,
            }}
            end={{
              x: 0.5,
              y: 1,
            }}
            style={styles.gradient}
          >
            <View
              style={[
                styles.textContainer,
  
                isArabic
                  ? styles.textContainerRTL
                  : styles.textContainerLTR,
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.title,
  
                  isArabic
                    ? styles.textRTL
                    : styles.textLTR,
                ]}
              >
                {title}
              </Text>
  
              <Text
                numberOfLines={2}
                style={[
                  styles.subtitle,
  
                  isArabic
                    ? styles.textRTL
                    : styles.textLTR,
                ]}
              >
                {subtitle}
              </Text>
            </View>
          </LinearGradient>
        </Pressable>
      );
    }
  
    return (
      <View
        style={[
          styles.container,
          {
            height: carouselHeight,
          },
        ]}
      >
        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          inverted={isArabic}
          bounces={false}
          showsHorizontalScrollIndicator={
            false
          }
          data={banners}
          keyExtractor={banner =>
            banner.id
          }
          renderItem={renderBanner}
          onMomentumScrollEnd={event => {
            const horizontalOffset =
              Math.abs(
                event.nativeEvent.contentOffset.x,
              );
          
            const nextIndex = Math.min(
              banners.length - 1,
              Math.max(
                0,
                Math.round(
                  horizontalOffset / width,
                ),
              ),
            );
          
            setSelectedIndex(nextIndex);
          }}
          getItemLayout={(
            _,
            index,
          ) => ({
            length: width,
            offset: width * index,
            index,
          })}
          onScrollToIndexFailed={info => {
            listRef.current
              ?.scrollToOffset({
                offset:
                  info.index * width,
                animated: true,
              });
          }}
        />
  
        {banners.length > 1 ? (
          <View
            pointerEvents="none"
            style={[
              styles.pageIndicator,
  
              isArabic
                ? styles.pageIndicatorRTL
                : styles.pageIndicatorLTR,
            ]}
          >
            {banners.map(
              (banner, index) => (
                <View
                  key={banner.id}
                  style={[
                    styles.pageDot,
  
                    index ===
                    selectedIndex
                      ? styles.pageDotSelected
                      : styles.pageDotUnselected,
                  ]}
                />
              ),
            )}
          </View>
        ) : null}
      </View>
    );
  }
  
  const styles = StyleSheet.create({
    container: {
      width: '100%',
      overflow: 'hidden',
      backgroundColor:
        colors.labnaCream,
    },
  
    gradient: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
  
      justifyContent: 'flex-end',
    },
  
    textContainer: {
      gap: spacing.extraSmall,
  
      paddingTop: spacing.large,
      paddingHorizontal: spacing.large,
  
      /**
       * The additional bottom spacing leaves
       * room for the page indicator.
       */
      paddingBottom:
        spacing.large +
        spacing.medium,
    },
  
    textContainerLTR: {
      alignItems: 'flex-start',
    },
  
    textContainerRTL: {
      alignItems: 'flex-end',
    },
  
    title: {
      ...typography.title,
      color: colors.white,
    },
  
    subtitle: {
      ...typography.body,
      color: colors.white,
    },
  
    textLTR: {
      textAlign: 'left',
      writingDirection: 'ltr',
    },
  
    textRTL: {
      textAlign: 'right',
      writingDirection: 'rtl',
    },
  
    pageIndicator: {
      position: 'absolute',
      right: 0,
      bottom: spacing.small,
      left: 0,
  
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
    },
  
    pageIndicatorLTR: {
      flexDirection: 'row',
    },
  
    pageIndicatorRTL: {
      flexDirection: 'row-reverse',
    },
  
    pageDot: {
      height: 7,
      borderRadius: 4,
    },
  
    pageDotSelected: {
      width: 18,
      backgroundColor: colors.white,
    },
  
    pageDotUnselected: {
      width: 7,
      backgroundColor:
        colors.white94,
      opacity: 0.55,
    },
  });