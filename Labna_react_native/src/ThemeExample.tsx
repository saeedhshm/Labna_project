import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  colors,
  radii,
  spacing,
  typography,
} from '@src/theme';

export function ThemeExample() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>
          Labna
        </Text>

        <Text style={styles.description}>
          Fresh dairy products
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream25,
    padding: spacing.large,
  },

  card: {
    padding: spacing.large,
    backgroundColor: colors.white,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.labnaBorder,
  },

  title: {
    ...typography.title,
    color: colors.labnaInk,
  },

  description: {
    ...typography.body,
    color: colors.labnaMuted,
    marginTop: spacing.small,
  },
});