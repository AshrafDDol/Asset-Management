jest.mock('../src/services/settings/RFIDSettingsService', () => ({
  loadRFIDSettings: jest.fn(),
}));

import IMSRFIDService from '../src/services/rfid/IMSRFIDService';
import { RFIDTag } from '../src/types/RFIDTag';

type TestableRFIDService = {
  state: string;
  activeTriggerKeys: Set<number>;
  sessionTags: Map<string, RFIDTag>;
  handleTags(batch: RFIDTag[]): void;
  handleTrigger(event: { action: 'DOWN' | 'UP'; keyCode: 250 | 251 }): void;
  manualScanIntent: boolean;
  releaseRequested: boolean;
  startIntentPending: boolean;
  stopRequested: boolean;
};

const service = IMSRFIDService as unknown as TestableRFIDService;

describe('IMSRFIDService continuous target observations', () => {
  beforeEach(() => {
    service.state = 'SCANNING';
    service.activeTriggerKeys.clear();
    service.activeTriggerKeys.add(250);
    service.sessionTags.clear();
    service.manualScanIntent = false;
    service.releaseRequested = false;
    service.startIntentPending = false;
    service.stopRequested = false;
  });

  afterEach(() => jest.restoreAllMocks());

  it('delivers repeated normalized target observations while legacy tags stay unique', () => {
    const observations: RFIDTag[] = [];
    const legacyBatches: RFIDTag[][] = [];
    const removeObservations = IMSRFIDService.onTargetObservations(
      ' aa01 ',
      tag => observations.push(tag),
    );
    const removeTags = IMSRFIDService.onTags(tags => legacyBatches.push(tags));

    service.handleTags([{ epc: 'aa01', rssi: 20 }, { epc: 'BB02', rssi: 30 }]);
    service.handleTags([{ epc: 'AA01', rssi: 24 }, { epc: 'BB02', rssi: 31 }]);

    expect(observations.map(tag => [tag.epc, tag.rssi])).toEqual([
      ['AA01', 20],
      ['AA01', 24],
    ]);
    expect(legacyBatches).toHaveLength(1);
    expect(legacyBatches[0].map(tag => tag.epc)).toEqual(['AA01', 'BB02']);

    removeObservations();
    removeTags();
  });

  it('ignores unrelated EPCs and stops on trigger release or unsubscribe', () => {
    const observations: RFIDTag[] = [];
    const remove = IMSRFIDService.onTargetObservations('AA01', tag => observations.push(tag));

    service.handleTags([{ epc: 'BB02', rssi: 10 }]);
    service.handleTags([{ epc: 'AA01', rssi: 20 }]);
    service.activeTriggerKeys.clear();
    service.handleTags([{ epc: 'AA01', rssi: 21 }]);
    remove();
    service.activeTriggerKeys.add(250);
    service.handleTags([{ epc: 'AA01', rssi: 22 }]);

    expect(observations.map(tag => tag.rssi)).toEqual([20]);
  });

  it('keeps manual inventory intent active when the physical trigger is released', async () => {
    const stopSpy = jest.spyOn(IMSRFIDService, 'stopScan').mockResolvedValue(true);
    service.manualScanIntent = true;

    service.handleTrigger({ action: 'UP', keyCode: 250 });

    expect(stopSpy).not.toHaveBeenCalled();
    expect(service.manualScanIntent).toBe(true);
  });

  it('stopping manual intent does not stop a held physical-trigger scan', async () => {
    service.manualScanIntent = true;
    const stopSpy = jest.spyOn(IMSRFIDService, 'stopScan').mockResolvedValue(true);

    await IMSRFIDService.stopManualScan();

    expect(service.manualScanIntent).toBe(false);
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('starts manual intent on the existing scan and stops it when no trigger is held', async () => {
    const startSpy = jest.spyOn(IMSRFIDService, 'startScan').mockResolvedValue(true);
    await expect(IMSRFIDService.startManualScan()).resolves.toBe(true);
    expect(service.manualScanIntent).toBe(true);
    expect(startSpy).toHaveBeenCalledTimes(1);

    service.activeTriggerKeys.clear();
    const stopSpy = jest.spyOn(IMSRFIDService, 'stopScan').mockResolvedValue(true);
    await expect(IMSRFIDService.stopManualScan()).resolves.toBe(true);
    expect(service.manualScanIntent).toBe(false);
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it('delivers target observations for manual scanning without a held trigger', () => {
    service.activeTriggerKeys.clear();
    service.manualScanIntent = true;
    const observations: RFIDTag[] = [];
    const remove = IMSRFIDService.onTargetObservations('AA01', tag => observations.push(tag));

    service.handleTags([{ epc: 'AA01', rssi: -24 }]);

    expect(observations).toEqual([{ epc: 'AA01', rawEpc: 'AA01', rssi: -24 }]);
    remove();
  });
});
