import React, {
    useEffect,
    useState,
  } from 'react';
  
  import {
    ActivityIndicator,
    Image,
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
    colors,
  } from '@src/theme';
  
  type ProductImageProps = {
    url?: string | null;
    aspectRatio?: number;
    allowsRetry?: boolean;
  };
  
  export function ProductImage({
    url,
    aspectRatio = 1,
    allowsRetry = true,
  }: ProductImageProps) {
    const { t } = useTranslation();
  
    const [isLoading, setIsLoading] =
      useState(Boolean(url));
  
    const [hasFailed, setHasFailed] =
      useState(!url);
  
    const [retryID, setRetryID] =
      useState(0);
  
    useEffect(() => {
      setIsLoading(Boolean(url));
      setHasFailed(!url);
      setRetryID(0);
    }, [url]);
  
    function retry() {
      if (!url) {
        return;
      }
  
      setHasFailed(false);
      setIsLoading(true);
  
      setRetryID(
        current => current + 1,
      );
    }
  
    return (
      <View
        style={[
          styles.container,
          {
            aspectRatio,
          },
        ]}
      >
        {url && !hasFailed ? (
          <Image
            key={`${url}-${retryID}`}
            accessible={false}
            source={{
              uri: url,
            }}
            resizeMode="cover"
            style={styles.image}
            onLoadStart={() => {
              setIsLoading(true);
            }}
            onLoad={() => {
              setIsLoading(false);
              setHasFailed(false);
            }}
            onError={() => {
              setIsLoading(false);
              setHasFailed(true);
            }}
          />
        ) : null}
  
        {isLoading && !hasFailed ? (
          <View
            accessible
            accessibilityLabel={t(
              'image.loading',
            )}
            style={styles.overlay}
          >
            <ActivityIndicator
              accessible={false}
              color={colors.labnaGreen}
            />
          </View>
        ) : null}
  
        {hasFailed ? (
          <Pressable
            accessible
            accessibilityRole={
              allowsRetry
                ? 'button'
                : 'image'
            }
            accessibilityLabel={t(
              'image.unavailable',
            )}
            disabled={
              !allowsRetry || !url
            }
            onPress={retry}
            style={styles.overlay}
          >
            <Ionicons
              accessible={false}
              name={
                allowsRetry && url
                  ? 'refresh-outline'
                  : 'image-outline'
              }
              size={30}
              color={colors.labnaMuted}
            />
          </Pressable>
        ) : null}
      </View>
    );
  }
  
  const styles = StyleSheet.create({
    container: {
      width: '100%',
      overflow: 'hidden',
      backgroundColor: colors.labnaCream,
    },
  
    image: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  
    overlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
  
      alignItems: 'center',
      justifyContent: 'center',
    },
  });