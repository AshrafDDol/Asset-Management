const mockPlayScanSound = jest.fn();
const mockVibrate = jest.fn();
const mockLoadRFIDSettings = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: { IMSScanFeedback: { playScanSound: mockPlayScanSound } },
  Platform: { OS: 'android' },
  Vibration: { vibrate: mockVibrate },
}));

jest.mock('../src/services/settings/RFIDSettingsService', () => ({
  loadRFIDSettings: () => mockLoadRFIDSettings(),
}));

const enabledSettings = {
  rfidPower: 30,
  soundEnabled: true,
  vibrationEnabled: true,
};

describe('ScanFeedbackService', () => {
  beforeEach(() => {
    jest.resetModules();
    mockPlayScanSound.mockReset();
    mockVibrate.mockReset();
    mockLoadRFIDSettings.mockReset();
    mockLoadRFIDSettings.mockResolvedValue(enabledSettings);
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => jest.restoreAllMocks());

  it('preserves unthrottled feedback and per-call settings reads for existing workflows', async () => {
    const { playAcceptedScanFeedback } = require('../src/services/feedback/ScanFeedbackService');

    await playAcceptedScanFeedback();
    await playAcceptedScanFeedback();

    expect(mockLoadRFIDSettings).toHaveBeenCalledTimes(2);
    expect(mockPlayScanSound).toHaveBeenCalledTimes(2);
    expect(mockVibrate).toHaveBeenCalledTimes(2);
    expect(mockVibrate).toHaveBeenNthCalledWith(1, 50);
    expect(mockVibrate).toHaveBeenNthCalledWith(2, 50);
  });

  it('throttles vibration only for Stock Take feedback', async () => {
    const { playStockTakeFeedback } = require('../src/services/feedback/ScanFeedbackService');

    await playStockTakeFeedback(true, () => true);
    await playStockTakeFeedback(true, () => true);

    expect(mockLoadRFIDSettings).toHaveBeenCalledTimes(1);
    expect(mockPlayScanSound).toHaveBeenCalledTimes(2);
    expect(mockVibrate).toHaveBeenCalledTimes(1);
  });

  it('retries a failed cached settings read on the next Stock Take request', async () => {
    mockLoadRFIDSettings
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(enabledSettings);
    const { playStockTakeFeedback } = require('../src/services/feedback/ScanFeedbackService');

    await playStockTakeFeedback(true, () => true);
    await playStockTakeFeedback(true, () => true);

    expect(mockLoadRFIDSettings).toHaveBeenCalledTimes(2);
    expect(mockPlayScanSound).toHaveBeenCalledTimes(1);
    expect(mockVibrate).toHaveBeenCalledTimes(1);
  });

  it('continues to respect disabled sound and vibration settings', async () => {
    mockLoadRFIDSettings.mockResolvedValue({
      ...enabledSettings,
      soundEnabled: false,
      vibrationEnabled: false,
    });
    const { playAcceptedScanFeedback, playStockTakeFeedback } = require('../src/services/feedback/ScanFeedbackService');

    await playAcceptedScanFeedback();
    await playStockTakeFeedback(true, () => true);

    expect(mockPlayScanSound).not.toHaveBeenCalled();
    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it('provides generation-safe Find Asset vibration and beep feedback', async () => {
    const {
      playFindAssetBeep,
      playFindAssetStartVibration,
    } = require('../src/services/feedback/ScanFeedbackService');

    await playFindAssetStartVibration(() => true);
    await playFindAssetBeep(() => true);
    await playFindAssetStartVibration(() => false);
    await playFindAssetBeep(() => false);

    expect(mockVibrate).toHaveBeenCalledTimes(1);
    expect(mockVibrate).toHaveBeenCalledWith(50);
    expect(mockPlayScanSound).toHaveBeenCalledTimes(1);
  });

  it('respects disabled sound for Find Asset beeps', async () => {
    mockLoadRFIDSettings.mockResolvedValue({
      ...enabledSettings,
      soundEnabled: false,
    });
    const { playFindAssetBeep } = require('../src/services/feedback/ScanFeedbackService');

    await playFindAssetBeep(() => true);

    expect(mockPlayScanSound).not.toHaveBeenCalled();
  });
});
