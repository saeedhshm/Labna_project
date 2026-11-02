import React, {
  useRef,
} from 'react';

import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

import type {
  PressableProps,
} from 'react-native';

import {
  animations,
  colors,
  radii,
  sizes,
  spacing,
  typography,
} from '@src/theme';

type LabnaButtonVariant =
  | 'primary'
  | 'secondary';

type LabnaButtonProps = Omit<
  PressableProps,
  'children' | 'disabled'
> & {
  title: string;
  variant: LabnaButtonVariant;
  disabled?: boolean;
  isLoading?: boolean;
};

export type PrimaryButtonProps = Omit<
  LabnaButtonProps,
  'variant'
>;

export type SecondaryButtonProps = Omit<
  LabnaButtonProps,
  'variant'
>;

function LabnaButton({
  title,
  variant,
  disabled = false,
  isLoading = false,
  accessibilityLabel,
  accessibilityState,
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...pressableProps
}: LabnaButtonProps) {
  const scale = useRef(
    new Animated.Value(1),
  ).current;

  const isDisabled =
    disabled || isLoading;

  function animateScale(
    nextScale: number,
  ) {
    scale.stopAnimation();

    Animated.timing(scale, {
      toValue: nextScale,
      duration:
        animations.buttonPressDuration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? title
      }
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled,
        busy: isLoading,
      }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={event => {
        if (!isDisabled) {
          animateScale(
            animations.buttonPressedScale,
          );
        }

        onPressIn?.(event);
      }}
      onPressOut={event => {
        animateScale(1);
        onPressOut?.(event);
      }}
      style={state => [
        styles.pressable,

        typeof style === 'function'
          ? style(state)
          : style,

        isDisabled
          ? styles.disabled
          : undefined,
      ]}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.content,

            variant === 'primary'
              ? styles.primary
              : styles.secondary,

            pressed &&
              !isDisabled &&
              (variant === 'primary'
                ? styles.primaryPressed
                : styles.secondaryPressed),

            {
              transform: [
                {
                  scale,
                },
              ],
            },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator
              accessible={false}
              size="small"
              color={
                variant === 'primary'
                  ? colors.white
                  : colors.labnaGreen
              }
            />
          ) : (
            <Text
              style={[
                styles.title,

                variant === 'primary'
                  ? styles.primaryTitle
                  : styles.secondaryTitle,
              ]}
            >
              {title}
            </Text>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

export function PrimaryButton(
  props: PrimaryButtonProps,
) {
  return (
    <LabnaButton
      {...props}
      variant="primary"
    />
  );
}

export function SecondaryButton(
  props: SecondaryButtonProps,
) {
  return (
    <LabnaButton
      {...props}
      variant="secondary"
    />
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
    borderRadius: radii.medium,
  },

  content: {
    minHeight: sizes.buttonMinimumHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
    borderRadius: radii.medium,
  },

  primary: {
    backgroundColor: colors.labnaGreen,
  },

  primaryPressed: {
    backgroundColor: colors.green82,
  },

  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.labnaBorder,
  },

  secondaryPressed: {
    backgroundColor: colors.labnaMint,
  },

  title: {
    ...typography.headline,
    textAlign: 'center',
  },

  primaryTitle: {
    color: colors.white,
  },

  secondaryTitle: {
    color: colors.labnaGreen,
  },

  disabled: {
    opacity: 0.45,
  },
});