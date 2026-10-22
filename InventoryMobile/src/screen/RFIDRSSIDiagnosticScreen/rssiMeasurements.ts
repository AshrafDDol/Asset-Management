export interface RSSISample {
  id: number;
  rssi: number | null;
  timestamp: number;
}

export interface RSSIMeasurements {
  count: number;
  latest: number | null;
  minimum: number | null;
  maximum: number | null;
  recent: RSSISample[];
}

export const MAX_RECENT_RSSI_SAMPLES = 20;

export const emptyRSSIMeasurements = (): RSSIMeasurements => ({
  count: 0,
  latest: null,
  minimum: null,
  maximum: null,
  recent: [],
});

export const addRSSIObservation = (
  current: RSSIMeasurements,
  rssi: number | undefined,
  timestamp: number,
): RSSIMeasurements => {
  const value = typeof rssi === 'number' && Number.isFinite(rssi) ? rssi : null;
  return {
    count: current.count + 1,
    latest: value ?? current.latest,
    minimum:
      value === null
        ? current.minimum
        : current.minimum === null
          ? value
          : Math.min(current.minimum, value),
    maximum:
      value === null
        ? current.maximum
        : current.maximum === null
          ? value
          : Math.max(current.maximum, value),
    recent: [
      { id: current.count + 1, rssi: value, timestamp },
      ...current.recent,
    ].slice(0, MAX_RECENT_RSSI_SAMPLES),
  };
};
