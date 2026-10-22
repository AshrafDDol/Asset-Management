import { NativeModules, Platform, Vibration } from 'react-native';

import { loadRFIDSettings } from '../settings/RFIDSettingsService';

interface NativeScanFeedbackModule {
  playScanSound(): void;
}

const nativeFeedback = NativeModules.IMSScanFeedback as
  | NativeScanFeedbackModule
  | undefined;

const VIBRATION_MIN_INTERVAL_MS = 180;
let settingsPromise: ReturnType<typeof loadRFIDSettings> | null = null;
let lastVibrationAt = 0;

const cachedSettings = () => {
  if (!settingsPromise) {
    settingsPromise = loadRFIDSettings().catch(error => {
      settingsPromise = null;
      throw error;
    });
  }
  return settingsPromise;
};

export const invalidateScanFeedbackSettings = (): void => {
  settingsPromise = null;
};

export const prepareScanFeedback = async (): Promise<void> => {
  await cachedSettings();
};

const vibrateStockTakeIfAllowed = (): void => {
  const now = Date.now();
  if (now - lastVibrationAt < VIBRATION_MIN_INTERVAL_MS) return;
  lastVibrationAt = now;
  Vibration.vibrate(50);
};

export const playStockTakeFeedback = async (
  expected: boolean,
  isGenerationActive: () => boolean,
): Promise<void> => {
  try {
    const settings = await cachedSettings();
    if (!isGenerationActive()) return;
    if (expected && settings.soundEnabled && Platform.OS === 'android') {
      nativeFeedback?.playScanSound();
    }
    if (settings.vibrationEnabled && isGenerationActive()) vibrateStockTakeIfAllowed();
  } catch {
    // Feedback must never interrupt scan acceptance or synchronization.
  }
};

export const playAcceptedScanFeedback = async (): Promise<void> => {
  try {
    const settings = await loadRFIDSettings();

    if (settings.soundEnabled && Platform.OS === 'android') {
      nativeFeedback?.playScanSound();
    }

    if (settings.vibrationEnabled) {
      Vibration.vibrate(50);
    }
  } catch {
    // Feedback must never interrupt scan acceptance or business processing.
  }
};

export const playFindAssetStartVibration = async (isGenerationActive: () => boolean): Promise<void> => {
  try {
    const settings = await cachedSettings();
    if (settings.vibrationEnabled && isGenerationActive()) Vibration.vibrate(50);
  } catch {
    // Proximity feedback must never interrupt RFID lifecycle handling.
  }
};

export const playFindAssetBeep = async (isGenerationActive: () => boolean): Promise<void> => {
  try {
    const settings = await cachedSettings();
    const generationActive = isGenerationActive();
    const nativeAvailable = Boolean(nativeFeedback);
    console.info('[FindAssetAudio] beep attempt', {
      soundEnabled: settings.soundEnabled,
      generationActive,
      nativeAvailable,
      platform: Platform.OS,
    });
    if (settings.soundEnabled && Platform.OS === 'android' && generationActive) {
      if (nativeFeedback) nativeFeedback.playScanSound();
      else console.warn('[FindAssetAudio] native sound module is unavailable');
    }
  } catch (error) {
    console.warn('[FindAssetAudio] beep failed', error);
  }
};
