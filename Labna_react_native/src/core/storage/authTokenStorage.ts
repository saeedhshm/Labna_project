import * as Keychain from 'react-native-keychain';

const AUTH_TOKEN_SERVICE = 'com.labna.auth.access-token';
const USER_NAME = 'labna_customer';

export async function saveAuthToken(token: string): Promise<void> {
  await Keychain.setGenericPassword(USER_NAME, token, {
    service: AUTH_TOKEN_SERVICE,
  });
}

export async function getAuthToken(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({
    service: AUTH_TOKEN_SERVICE,
  });

  return credentials ? credentials.password : null;
}

export async function removeAuthToken(): Promise<void> {
  await Keychain.resetGenericPassword({
    service: AUTH_TOKEN_SERVICE,
  });
}
