
import React, {
  useEffect,
  useState,
} from 'react';

import {
  initializeI18n,
} from '@src/i18n';

import {ThemeExample} from '@src/ThemeExample';



import {
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { AuthProvider } from '@src/features/auth/AuthContext';

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
          barStyle="dark-content"
        />

        <SafeAreaView >
          <ThemeExample />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}


export default App;
