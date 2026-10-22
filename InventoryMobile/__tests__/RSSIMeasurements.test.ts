import {
  addRSSIObservation,
  emptyRSSIMeasurements,
  MAX_RECENT_RSSI_SAMPLES,
} from '../src/screen/RFIDRSSIDiagnosticScreen/rssiMeasurements';

describe('RSSI measurements', () => {
  it('counts observations and tracks latest, minimum, and maximum raw values', () => {
    let measurements = emptyRSSIMeasurements();
    measurements = addRSSIObservation(measurements, 41, 1000);
    measurements = addRSSIObservation(measurements, 27, 1100);
    measurements = addRSSIObservation(measurements, 53, 1200);

    expect(measurements).toMatchObject({
      count: 3,
      latest: 53,
      minimum: 27,
      maximum: 53,
    });
    expect(measurements.recent.map(sample => sample.rssi)).toEqual([53, 27, 41]);
  });

  it('counts missing RSSI observations without corrupting numeric statistics', () => {
    let measurements = addRSSIObservation(emptyRSSIMeasurements(), 42, 1000);
    measurements = addRSSIObservation(measurements, undefined, 1100);

    expect(measurements).toMatchObject({ count: 2, latest: 42, minimum: 42, maximum: 42 });
    expect(measurements.recent[0].rssi).toBeNull();
  });

  it('bounds the recent sample list', () => {
    let measurements = emptyRSSIMeasurements();
    for (let index = 0; index < MAX_RECENT_RSSI_SAMPLES + 5; index += 1) {
      measurements = addRSSIObservation(measurements, index, index);
    }
    expect(measurements.count).toBe(MAX_RECENT_RSSI_SAMPLES + 5);
    expect(measurements.recent).toHaveLength(MAX_RECENT_RSSI_SAMPLES);
  });
});
