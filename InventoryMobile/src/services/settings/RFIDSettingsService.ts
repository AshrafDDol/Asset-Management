import AsyncStorage from '@react-native-async-storage/async-storage';

export const RFID_SETTINGS_KEY = 'ims.rfidSettings';
export const RFID_POWER_MIN = 1;
export const RFID_POWER_MAX = 33;
export const DEFAULT_RFID_POWER = 30;

export interface RFIDSettings {
  rfidPower: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const DEFAULT_FEEDBACK_ENABLED = true;

const normalizePower = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return DEFAULT_RFID_POWER;
  }

  return Math.min(RFID_POWER_MAX, Math.max(RFID_POWER_MIN, value));
};

export const loadRFIDSettings = async (): Promise<RFIDSettings> => {
  const stored = await AsyncStorage.getItem(RFID_SETTINGS_KEY);
  if (!stored) {
    return {
      rfidPower: DEFAULT_RFID_POWER,
      soundEnabled: DEFAULT_FEEDBACK_ENABLED,
      vibrationEnabled: DEFAULT_FEEDBACK_ENABLED,
    };
  }

  try {
    const parsed = JSON.parse(stored) as {
      rfidPower?: unknown;
      soundEnabled?: unknown;
      vibrationEnabled?: unknown;
    };
    return {
      rfidPower: normalizePower(parsed?.rfidPower),
      soundEnabled:
        typeof parsed?.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_FEEDBACK_ENABLED,
      vibrationEnabled:
        typeof parsed?.vibrationEnabled === 'boolean'
          ? parsed.vibrationEnabled
          : DEFAULT_FEEDBACK_ENABLED,
    };
  } catch {
    return {
      rfidPower: DEFAULT_RFID_POWER,
      soundEnabled: DEFAULT_FEEDBACK_ENABLED,
      vibrationEnabled: DEFAULT_FEEDBACK_ENABLED,
    };
  }
};

export const saveRFIDSettings = async (
  settings: RFIDSettings,
): Promise<RFIDSettings> => {
  const normalized = {
    rfidPower: normalizePower(settings.rfidPower),
    soundEnabled:
      typeof settings.soundEnabled === 'boolean'
        ? settings.soundEnabled
        : DEFAULT_FEEDBACK_ENABLED,
    vibrationEnabled:
      typeof settings.vibrationEnabled === 'boolean'
        ? settings.vibrationEnabled
        : DEFAULT_FEEDBACK_ENABLED,
  };
  await AsyncStorage.setItem(RFID_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
};
