import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError } from 'axios';

import {
  DEFAULT_BACKEND_URL,
  loadBackendUrl,
  normalizeBackendUrl,
} from '../services/settings/BackendSettingsService';

export const API_BASE_URL = DEFAULT_BACKEND_URL;
export const AUTH_TOKEN_KEY = 'ims.authToken';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
});

api.interceptors.request.use(async config => {
  config.baseURL = await loadBackendUrl();
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const testBackendConnection = async (
  backendUrl: string,
): Promise<boolean> => {
  try {
    const response = await axios.get('/health', {
      baseURL: normalizeBackendUrl(backendUrl),
      timeout: 8000,
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
};

export const apiErrorMessage = (reason: unknown): string => {
  if (reason instanceof AxiosError) {
    if (!reason.response) {
      return 'Could not reach the IMS server. Check the network connection and try again.';
    }
    const data = reason.response.data as { message?: string } | undefined;
    return data?.message || reason.message;
  }
  return reason instanceof Error ? reason.message : String(reason);
};

export const confirmationErrorMessage = (reason: unknown): string => {
  if (reason instanceof AxiosError && !reason.response) {
    return 'Confirmation could not be verified. Please try Confirm again.';
  }
  return apiErrorMessage(reason);
};

export const unwrap = <T>(response: { data?: { data?: T } }): T =>
  response.data?.data as T;
