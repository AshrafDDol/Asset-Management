import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKEND_URL_KEY = 'ims.backendUrl';
export const DEFAULT_BACKEND_URL = 'http://192.168.100.4:4000/api';

export const normalizeBackendUrl = (value: string): string =>
  value.trim().replace(/\/+$/, '');

export const isValidBackendUrl = (value: string): boolean => {
  const normalized = normalizeBackendUrl(value);
  return normalized.length > 0 && /^https?:\/\//i.test(normalized);
};

export const loadBackendUrl = async (): Promise<string> => {
  try {
    const savedUrl = await AsyncStorage.getItem(BACKEND_URL_KEY);
    return savedUrl && isValidBackendUrl(savedUrl)
      ? normalizeBackendUrl(savedUrl)
      : DEFAULT_BACKEND_URL;
  } catch {
    return DEFAULT_BACKEND_URL;
  }
};

export const saveBackendUrl = async (value: string): Promise<string> => {
  const normalized = normalizeBackendUrl(value);
  if (!isValidBackendUrl(normalized)) {
    throw new Error('Backend URL must start with http:// or https://.');
  }

  await AsyncStorage.setItem(BACKEND_URL_KEY, normalized);
  return normalized;
};
