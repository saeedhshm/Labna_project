import React, {
  useEffect,
  useState,
} from 'react';

import {
  StatusBar,
} from 'react-native';

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

  useEffect(() => {
    initializeI18n().finally(() => {
      setI18nReady(true);
    });
  }, []);

  if (!i18nReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar
          animated
          barStyle="dark-content"
        />

        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;