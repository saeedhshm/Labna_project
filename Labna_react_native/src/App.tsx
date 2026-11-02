import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  CatalogProvider,
} from '@src/features/catalog/CatalogContext';
import {
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';

import {
  SplashOverlay,
} from '@src/components/splash';

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import {
  AuthProvider,
} from '@src/features/auth/AuthContext';

import {
  initializeI18n,
} from '@src/i18n';

import {
  RootNavigator,
} from '@src/navigation/RootNavigator';

import {
  colors,
} from '@src/theme';

function App() {
  const [i18nReady, setI18nReady] =
    useState(false);

  const [
    splashVisible,
    setSplashVisible,
  ] = useState(true);

  useEffect(() => {
    initializeI18n().finally(() => {
      setI18nReady(true);
    });
  }, []);

  const handleSplashFinished =
    useCallback(() => {
      setSplashVisible(false);
    }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={styles.container}>
          <StatusBar
            animated
            barStyle="dark-content"
          />

          {i18nReady ? (
             <CatalogProvider>
            <RootNavigator />
          </CatalogProvider>
          ) : (
            <View
              style={styles.initializing}
            />
          )}

          {splashVisible ? (
            <SplashOverlay
              ready={i18nReady}
              onFinished={
                handleSplashFinished
              }
            />
          ) : null}
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },

  initializing: {
    flex: 1,
    backgroundColor: colors.labnaCream,
  },
});

export default App;
