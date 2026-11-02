import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Animated,
  Easing,
  Image,
  StyleSheet,
} from 'react-native';

import {
  animations,
  colors,
  sizes,
} from '@src/theme';

type SplashOverlayProps = {
  /**
   * The splash cannot disappear until the application has
   * completed essential initialization such as loading the
   * persisted language.
   */
  ready: boolean;

  onFinished: () => void;
};

const launcherLogo = require(
  '../../assets/images/labna-launcher-logo.png',
);

export function SplashOverlay({
  ready,
  onFinished,
}: SplashOverlayProps) {
  const opacity = useRef(
    new Animated.Value(1),
  ).current;

  const dismissalStarted = useRef(false);

  const [
    minimumDurationElapsed,
    setMinimumDurationElapsed,
  ] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumDurationElapsed(true);
    }, animations.splashMinimumDuration);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (
      !ready ||
      !minimumDurationElapsed ||
      dismissalStarted.current
    ) {
      return;
    }

    dismissalStarted.current = true;

    const animation = Animated.timing(
      opacity,
      {
        toValue: 0,
        duration:
          animations.splashFadeDuration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      },
    );

    animation.start(({ finished }) => {
      if (finished) {
        onFinished();
      }
    });

    return () => {
      animation.stop();
    };
  }, [
    minimumDurationElapsed,
    onFinished,
    opacity,
    ready,
  ]);

  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.container,
        {
          opacity,
        },
      ]}
    >
      <Image
        source={launcherLogo}
        resizeMode="contain"
        style={styles.logo}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,

    zIndex: 999,
    elevation: 999,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: colors.labnaCream,
  },

  logo: {
    width: sizes.splashLogo,
    height: sizes.splashLogo,
  },
});