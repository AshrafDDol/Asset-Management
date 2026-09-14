import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, AUTH_TOKEN_KEY, unwrap } from './client';

type LoginResponse = {
  token: string;
  user: { id: number; username: string; fullName: string };
};

export async function login(usernameOrEmail: string, password: string) {
  const result = unwrap<LoginResponse>(
    await api.post('/auth/login', { usernameOrEmail, password }),
  );
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, result.token);
  return result;
}
