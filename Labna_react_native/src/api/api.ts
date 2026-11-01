import { Platform } from "react-native";

const DEVELOPMENT_HOST = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";

export const API_BASE_URL = __DEV__ ? `http://${DEVELOPMENT_HOST}:3001` : "https://api.example.com";

export const API_TIMEOUT_MS = 30_000;

// export const API_RETRY_COUNT = 3;

export const CUSTOMER_AUTH_ORIGIN = "http://localhost:5174"

export const REFRESH_COOKIE_NAME = 'labna_customer_refresh';
