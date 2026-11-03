import React, {
    useEffect,
    useRef,
    useState,
  } from 'react';
  
  import {
    AccessibilityInfo,
    Animated,
    Pressable,
    StyleSheet,
  } from 'react-native';
  
  import {
    Ionicons,
  } from '@react-native-vector-icons/ionicons/static';
  
  import {
    useTranslation,
  } from 'react-i18next';
  
  import {
    useFavorites,
  } from '@src/features/favorites/FavoritesContext';
  
  import {
    colors,
    sizes,
  } from '@src/theme';
  
  type FavoriteButtonProps = {
    productID: string;
  };
  
  export function FavoriteButton({
    productID,
  }: FavoriteButtonProps) {
    const { t } = useTranslation();
  
    const {
      isFavorite,
      pendingProductIDs,
      toggleFavorite,
    } = useFavorites();
  
    const scale = useRef(
      new Animated.Value(1),
    ).current;
  
    const [
      reduceMotion,
      setReduceMotion,
    ] = useState(false);
  
    const favorite =
      isFavorite(productID);
  
    const pending =
      pendingProductIDs.includes(
        productID,
      );
  
    useEffect(() => {
      AccessibilityInfo
        .isReduceMotionEnabled()
        .then(setReduceMotion);
  
      const subscription =
        AccessibilityInfo.addEventListener(
          'reduceMotionChanged',
          setReduceMotion,
        );
  
      return () => {
        subscription.remove();
      };
    }, []);
  
    function handlePress() {
      if (!reduceMotion) {
        scale.setValue(0.86);
  
        Animated.spring(scale, {
          toValue: 1,
          speed: 24,
          bounciness: 7,
          useNativeDriver: true,
        }).start();
      }
  
      toggleFavorite(productID);
    }
  
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          favorite
            ? 'favorites.remove'
            : 'favorites.add',
        )}
        accessibilityState={{
          selected: favorite,
          disabled: pending,
        }}
        disabled={pending}
        testID={`favorite.${productID}`}
        onPress={handlePress}
      >
        <Animated.View
          style={[
            styles.button,
            {
              transform: [
                {
                  scale,
                },
              ],
            },
          ]}
        >
          <Ionicons
            accessible={false}
            name={
              favorite
                ? 'heart'
                : 'heart-outline'
            }
            size={22}
            color={
              favorite
                ? colors.labnaGreen
                : colors.labnaInk
            }
          />
        </Animated.View>
      </Pressable>
    );
  }
  
  const styles = StyleSheet.create({
    button: {
      width: sizes.minimumTouchTarget,
      height: sizes.minimumTouchTarget,
  
      alignItems: 'center',
      justifyContent: 'center',
  
      borderRadius:
        sizes.minimumTouchTarget / 2,
  
      backgroundColor: colors.white94,
  
      borderWidth: 1,
      borderColor: colors.labnaBorder,
    },
  });