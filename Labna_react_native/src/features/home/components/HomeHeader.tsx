import React, {
    useEffect,
    useRef,
  } from 'react';
  
  import {
    Animated,
    Easing,
    Keyboard,
    Pressable,
    StyleSheet,
    View,
  } from 'react-native';
  
  import {
    Ionicons,
  } from '@react-native-vector-icons/ionicons/static';
  
  import {
    useTranslation,
  } from 'react-i18next';
  
  import {
    LabnaLogo,
  } from '@src/components/brand';
  
  import {
    LabnaSearchField,
  } from '@src/components/forms';
  
  import {
    animations,
    colors,
    sizes,
    spacing,
  } from '@src/theme';
  
  type HomeHeaderProps = {
    searchText: string;
  
    onSearchTextChange: (
      value: string,
    ) => void;
  
    searchExpanded: boolean;
  
    onExpandSearch: () => void;
  
    onCollapseSearch: () => void;
  };
  
  export function HomeHeader({
    searchText,
    onSearchTextChange,
    searchExpanded,
    onExpandSearch,
    onCollapseSearch,
  }: HomeHeaderProps) {
    const { t, i18n } = useTranslation();
  
    const isArabic =
      i18n.resolvedLanguage === 'ar';
  
    const entryProgress = useRef(
      new Animated.Value(1),
    ).current;
  
    useEffect(() => {
      entryProgress.setValue(0);
  
      Animated.timing(
        entryProgress,
        {
          toValue: 1,
          duration:
            animations.searchTransitionDuration,
          easing: Easing.inOut(
            Easing.ease,
          ),
          useNativeDriver: true,
        },
      ).start();
    }, [
      entryProgress,
      searchExpanded,
    ]);
  
    function closeSearch() {
      Keyboard.dismiss();
      onSearchTextChange('');
      onCollapseSearch();
    }
  
    return (
      <Animated.View
        style={[
          styles.header,
  
          isArabic
            ? styles.headerRTL
            : styles.headerLTR,
  
          {
            opacity: entryProgress,
  
            transform: [
              {
                translateY:
                  entryProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-8, 0],
                  }),
              },
            ],
          },
        ]}
      >
        {searchExpanded ? (
          <>
            <LabnaSearchField
              value={searchText}
              autoFocus
              onChangeText={
                onSearchTextChange
              }
            />
  
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'action.close',
              )}
              hitSlop={4}
              onPress={closeSearch}
              style={({ pressed }) => [
                styles.circleButton,
  
                pressed
                  ? styles.circleButtonPressed
                  : undefined,
              ]}
            >
              <Ionicons
                accessible={false}
                name="close"
                size={22}
                color={colors.labnaInk}
              />
            </Pressable>
          </>
        ) : (
          <>
            <LabnaLogo />
  
            <View style={styles.spacer} />
  
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'search.prompt',
              )}
              testID="home.search.open"
              hitSlop={4}
              onPress={onExpandSearch}
              style={({ pressed }) => [
                styles.circleButton,
  
                pressed
                  ? styles.circleButtonPressed
                  : undefined,
              ]}
            >
              <Ionicons
                accessible={false}
                name="search"
                size={21}
                color={colors.labnaInk}
              />
            </Pressable>
          </>
        )}
      </Animated.View>
    );
  }
  
  const styles = StyleSheet.create({
    header: {
      width: '100%',
      minHeight:
        sizes.buttonMinimumHeight,
  
      alignItems: 'center',
      gap: spacing.small,
  
      paddingHorizontal: spacing.large,
    },
  
    headerLTR: {
      flexDirection: 'row',
    },
  
    headerRTL: {
      flexDirection: 'row-reverse',
    },
  
    spacer: {
      flex: 1,
    },
  
    circleButton: {
      width: sizes.minimumTouchTarget,
      height: sizes.minimumTouchTarget,
  
      alignItems: 'center',
      justifyContent: 'center',
  
      borderRadius:
        sizes.minimumTouchTarget / 2,
  
      borderWidth: 1,
      borderColor: colors.labnaBorder,
  
      backgroundColor: colors.white,
    },
  
    circleButtonPressed: {
      opacity: 0.82,
  
      transform: [
        {
          scale: 0.98,
        },
      ],
    },
  });