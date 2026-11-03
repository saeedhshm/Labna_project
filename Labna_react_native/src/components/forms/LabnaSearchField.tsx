import React, {
    useState,
  } from 'react';
  
  import {
    Pressable,
    StyleSheet,
    TextInput,
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
    radii,
    sizes,
    spacing,
    typography,
  } from '@src/theme';
  
  type LabnaSearchFieldProps = {
    value: string;
  
    onChangeText: (
      value: string,
    ) => void;
  
    autoFocus?: boolean;
  
    onSubmit?: () => void;
  };
  
  export function LabnaSearchField({
    value,
    onChangeText,
    autoFocus = false,
    onSubmit,
  }: LabnaSearchFieldProps) {
    const { t, i18n } = useTranslation();
  
    const [isFocused, setIsFocused] =
      useState(false);
  
    const isArabic =
      i18n.resolvedLanguage === 'ar';
  
    return (
      <View
        testID="catalog.search"
        style={[
          styles.container,
  
          isArabic
            ? styles.containerRTL
            : styles.containerLTR,
  
          isFocused
            ? styles.containerFocused
            : styles.containerResting,
        ]}
      >
        <Ionicons
          accessible={false}
          name="search-outline"
          size={20}
          color={colors.labnaMuted}
        />
  
        <TextInput
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={
            colors.labnaGreen
          }
          placeholder={t(
            'search.prompt',
          )}
          placeholderTextColor={
            colors.labnaMuted
          }
          accessibilityLabel={t(
            'search.prompt',
          )}
          testID="catalog.search.input"
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          onSubmitEditing={onSubmit}
          style={[
            styles.input,
  
            isArabic
              ? styles.inputRTL
              : styles.inputLTR,
          ]}
        />
  
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'search.clear',
            )}
            hitSlop={4}
            onPress={() => {
              onChangeText('');
            }}
            style={styles.clearButton}
          >
            <Ionicons
              accessible={false}
              name="close-circle"
              size={22}
              color={colors.labnaMuted}
            />
          </Pressable>
        ) : (
          /**
           * يحافظ على نفس حجم الحقل عند ظهور
           * واختفاء زر المسح.
           */
          <View
            pointerEvents="none"
            style={styles.clearPlaceholder}
          />
        )}
      </View>
    );
  }
  
  const styles = StyleSheet.create({
    container: {
      minHeight:
        sizes.buttonMinimumHeight,
  
      flex: 1,
      alignItems: 'center',
      gap: spacing.small,
  
      paddingStart: spacing.medium,
      paddingEnd: spacing.extraSmall,
  
      borderRadius: radii.medium,
      borderWidth: 1,
  
      backgroundColor: colors.cream65,
    },
  
    containerLTR: {
      flexDirection: 'row',
    },
  
    containerRTL: {
      flexDirection: 'row-reverse',
    },
  
    containerResting: {
      borderColor: colors.labnaBorder,
    },
  
    containerFocused: {
      borderWidth: 1.5,
      borderColor: colors.labnaGreen,
    },
  
    input: {
      ...typography.body,
  
      flex: 1,
      minWidth: 0,
      minHeight:
        sizes.minimumTouchTarget,
  
      paddingVertical: 0,
  
      color: colors.labnaInk,
    },
  
    inputLTR: {
      textAlign: 'left',
      writingDirection: 'ltr',
    },
  
    inputRTL: {
      textAlign: 'right',
      writingDirection: 'rtl',
    },
  
    clearButton: {
      width: sizes.minimumTouchTarget,
      height: sizes.minimumTouchTarget,
  
      alignItems: 'center',
      justifyContent: 'center',
    },
  
    clearPlaceholder: {
      width: spacing.extraSmall,
    },
  });