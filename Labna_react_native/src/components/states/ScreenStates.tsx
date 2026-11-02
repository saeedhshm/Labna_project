import React from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Ionicons,
} from '@react-native-vector-icons/ionicons/static';

import type {
  ComponentProps,
} from 'react';

import {
  PrimaryButton,
} from '@src/components/buttons';

import {
  colors,
  spacing,
  typography,
} from '@src/theme';

type IoniconName = ComponentProps<
  typeof Ionicons
>['name'];

type LoadingStateProps = {
  title: string;
};

export function LoadingState({
  title,
}: LoadingStateProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={title}
      style={styles.stateContainer}
    >
      <ActivityIndicator
        accessible={false}
        size="large"
        color={colors.labnaGreen}
      />

      <Text
        accessible={false}
        style={styles.message}
      >
        {title}
      </Text>
    </View>
  );
}

type ErrorStateProps = {
  title: string;
  message: string;
  retryTitle: string;
  onRetry: () => void;
};

export function ErrorState({
  title,
  message,
  retryTitle,
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.stateContainer}>
      <Ionicons
        accessible={false}
        name="sync-circle-outline"
        size={52}
        color={colors.labnaGreen}
      />

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.message}>
        {message}
      </Text>

      <View style={styles.action}>
        <PrimaryButton
          title={retryTitle}
          onPress={onRetry}
        />
      </View>
    </View>
  );
}

type EmptyStateProps = {
  title: string;
  message: string;
  icon?: IoniconName;
  actionTitle?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  message,
  icon = 'cube-outline',
  actionTitle,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.stateContainer}>
      <Ionicons
        accessible={false}
        name={icon}
        size={52}
        color={colors.labnaGreen}
      />

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.message}>
        {message}
      </Text>

      {actionTitle && onAction ? (
        <View style={styles.action}>
          <PrimaryButton
            title={actionTitle}
            onPress={onAction}
          />
        </View>
      ) : null}
    </View>
  );
}

type OfflineNoticeProps = {
  message: string;
};

export function OfflineNotice({
  message,
}: OfflineNoticeProps) {
  return (
    <View
      accessible
      accessibilityLabel={message}
      style={styles.offlineNotice}
    >
      <Ionicons
        accessible={false}
        name="cloud-offline-outline"
        size={18}
        color={colors.labnaGreen}
      />

      <Text
        accessible={false}
        style={styles.offlineText}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.large,
    backgroundColor: colors.cream25,
  },

  title: {
    ...typography.title,
    color: colors.labnaInk,
    textAlign: 'center',
  },

  message: {
    ...typography.body,
    color: colors.labnaMuted,
    textAlign: 'center',
  },

  action: {
    width: '100%',
    marginTop: spacing.small,
  },

  offlineNotice: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    backgroundColor: colors.labnaMint,
  },

  offlineText: {
    ...typography.caption,
    flex: 1,
    color: colors.labnaGreen,
  },
});