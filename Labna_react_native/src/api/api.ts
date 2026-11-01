import { Platform } from 'react-native';

const DEVELOPMENT_HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

export const API_BASE_URL = __DEV__
  ? `http://${DEVELOPMENT_HOST}:3001/api/v1`
  : 'https://api.example.com/api/v1';

export const API_TIMEOUT_MS = 30_000;
