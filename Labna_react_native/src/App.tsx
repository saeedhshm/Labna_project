
import React from 'react';
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

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
      />

      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>
            Welcome to Labna
          </Text>

          <Text style={styles.description}>
            My first React Native application
          </Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6dada',
  },

  card: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#222222',
  },

  description: {
    fontSize: 16,
    color: '#666666',
    marginTop: 30,
  },
});

export default App;
