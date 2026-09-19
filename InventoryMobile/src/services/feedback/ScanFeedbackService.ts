import { NativeModules, Platform, Vibration } from 'react-native';

import { loadRFIDSettings } from '../settings/RFIDSettingsService';

interface NativeScanFeedbackModule {
  playScanSound(): void;
}

const nativeFeedback = NativeModules.IMSScanFeedback as
  | NativeScanFeedbackModule
  | undefined;

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
