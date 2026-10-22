import {
  beepIntervalForCategory,
  FIND_ASSET_AUDIO_WINDOW_MS,
  FIND_ASSET_MODERATE_BEEP_MS,
  FIND_ASSET_SCANNING_BEEP_MS,
  FIND_ASSET_STRONG_BEEP_MS,
  FIND_ASSET_WEAK_BEEP_MS,
  FIND_ASSET_STALE_MS,
  FindAssetAudioFilter,
  FindAssetSignalTracker,
  freshnessForReading,
  isFindAssetFeedbackActive,
  ProximityBeepScheduler,
  relativeStrength,
  visualSignalForReading,
} from '../src/services/rfid/FindAssetProximity';

describe('Find Asset proximity processing', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('smooths valid RSSI and ignores invalid samples', () => {
    const tracker = new FindAssetSignalTracker();
    expect(tracker.accept(-46, 1000)?.smoothed).toBe(-46);
    expect(tracker.accept(-24, 1100)?.smoothed).toBeCloseTo(-32.8);
    expect(tracker.accept(Number.NaN, 1200)).toBeNull();
    expect(tracker.current(1200)?.raw).toBe(-24);
  });

  it('expires signal and resets smoothing after the stale timeout', () => {
    const tracker = new FindAssetSignalTracker();
    tracker.accept(-46, 1000);
    expect(tracker.current(1000 + FIND_ASSET_STALE_MS)).not.toBeNull();
    expect(tracker.current(1001 + FIND_ASSET_STALE_MS)).toBeNull();
    expect(tracker.accept(-20, 1001 + FIND_ASSET_STALE_MS)?.smoothed).toBe(-20);
  });

  it('keeps intermittent readings uncertain through 900-1200ms gaps', () => {
    const tracker = new FindAssetSignalTracker();
    const reading = tracker.accept(-17, 1000)!;

    expect(freshnessForReading(reading, 1100)).toBe('LIVE');
    expect(freshnessForReading(reading, 1900)).toBe('UNCERTAIN');
    expect(freshnessForReading(reading, 2200)).toBe('UNCERTAIN');
    expect(freshnessForReading(reading, 1000 + FIND_ASSET_STALE_MS + 1)).toBe('NO SIGNAL');
  });

  it('maps stable categories to distinct configured beep intervals', () => {
    expect(relativeStrength(-55)).toBe(0);
    expect(relativeStrength(-10)).toBe(1);
    expect(FIND_ASSET_SCANNING_BEEP_MS).toBe(900);
    expect(beepIntervalForCategory('WEAK')).toBe(FIND_ASSET_WEAK_BEEP_MS);
    expect(beepIntervalForCategory('MODERATE')).toBe(FIND_ASSET_MODERATE_BEEP_MS);
    expect(beepIntervalForCategory('STRONG')).toBe(FIND_ASSET_STRONG_BEEP_MS);
  });

  it('derives raw RSSI, category, and meter strength from one visual reading', () => {
    const tracker = new FindAssetSignalTracker();
    const reading = tracker.accept(-17, 1000)!;
    const visual = visualSignalForReading(reading);

    expect(visual).toEqual({
      raw: -17,
      category: 'STRONG',
      strength: relativeStrength(-17),
    });
    expect(Math.round(visual!.strength * 100)).toBe(84);
  });

  it('activates target audio from one valid observation', () => {
    const filter = new FindAssetAudioFilter();
    filter.add(-17, 1000);

    expect(filter.evaluate(1000)).toMatchObject({
      category: 'STRONG',
      median: -17,
      strength: relativeStrength(-17),
    });
  });

  it('keeps feedback active during manual scanning after trigger release', () => {
    expect(isFindAssetFeedbackActive('READY', 'UP', true, 'SCANNING')).toBe(true);
    expect(isFindAssetFeedbackActive('SCANNING', 'DOWN', false, null)).toBe(true);
    expect(isFindAssetFeedbackActive('SCANNING', 'UP', false, null)).toBe(false);
  });

  it('falls back to the latest valid sample when observations are irregular', () => {
    const filter = new FindAssetAudioFilter();
    filter.add(-45, 1000);
    expect(filter.evaluate(1000)?.category).toBe('WEAK');

    filter.add(-15, 1750);
    expect(filter.evaluate(1750)?.category).toBe('STRONG');
  });

  it('responds immediately from Weak to Strong and Strong to Weak', () => {
    const tracker = new FindAssetSignalTracker();
    expect(tracker.accept(-50, 1000)?.category).toBe('WEAK');
    expect(tracker.accept(-10, 1010)?.category).toBe('STRONG');
    expect(tracker.accept(-55, 1020)?.category).toBe('WEAK');
  });

  it('uses EMA to limit a single spike and minimal boundary hysteresis', () => {
    const tracker = new FindAssetSignalTracker();
    tracker.accept(-46, 1000);
    const spike = tracker.accept(-10, 1010)!;
    expect(spike.smoothed).toBeCloseTo(-24.4);
    expect(spike.smoothed).not.toBe(spike.raw);

    tracker.reset();
    expect(tracker.accept(-36, 2000)?.category).toBe('MODERATE');
    expect(tracker.accept(-39, 2010)?.category).toBe('MODERATE');
    expect(tracker.accept(-42, 2020)?.category).toBe('WEAK');
  });

  it('cancels all future beeps after stop', async () => {
    jest.useFakeTimers();
    const play = jest.fn(async () => undefined);
    const scheduler = new ProximityBeepScheduler(play, () => 180);
    scheduler.start();
    await jest.advanceTimersByTimeAsync(1);
    expect(play).toHaveBeenCalledTimes(1);
    scheduler.stop();
    await jest.advanceTimersByTimeAsync(1000);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('reschedules cadence promptly without retaining the old timer', async () => {
    jest.useFakeTimers();
    let interval = FIND_ASSET_SCANNING_BEEP_MS;
    const play = jest.fn(async () => undefined);
    const scheduler = new ProximityBeepScheduler(play, () => interval);

    scheduler.start();
    scheduler.start();
    await jest.advanceTimersByTimeAsync(1);
    expect(play).toHaveBeenCalledTimes(1);
    interval = FIND_ASSET_STRONG_BEEP_MS;
    scheduler.reschedule();
    await jest.advanceTimersByTimeAsync(FIND_ASSET_STRONG_BEEP_MS - 1);
    expect(play).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(play).toHaveBeenCalledTimes(2);
    scheduler.stop();
    await jest.advanceTimersByTimeAsync(FIND_ASSET_SCANNING_BEEP_MS);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('invalidates an in-flight scheduler generation when cadence changes', async () => {
    jest.useFakeTimers();
    let resolveFirst: (() => void) | undefined;
    let interval = FIND_ASSET_SCANNING_BEEP_MS;
    const play = jest
      .fn<Promise<void>, [() => boolean]>()
      .mockImplementationOnce(
        () => new Promise<void>(resolve => { resolveFirst = resolve; }),
      )
      .mockResolvedValue(undefined);
    const scheduler = new ProximityBeepScheduler(play, () => interval);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(play).toHaveBeenCalledTimes(1);
    interval = FIND_ASSET_STRONG_BEEP_MS;
    scheduler.reschedule();
    resolveFirst?.();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(FIND_ASSET_STRONG_BEEP_MS);
    expect(play).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('rejects isolated strong and weak audio spikes with a recent median', () => {
    const weakFilter = new FindAssetAudioFilter();
    [-46, -45, -10, -44].forEach((rssi, index) => weakFilter.add(rssi, index * 100));
    expect(weakFilter.evaluate(400)?.category).toBe('WEAK');

    const strongFilter = new FindAssetAudioFilter();
    [-12, -14, -50, -13].forEach((rssi, index) => strongFilter.add(rssi, index * 100));
    expect(strongFilter.evaluate(400)?.category).toBe('STRONG');
  });

  it('responds to sustained improvement and reduction on the next audio evaluation', () => {
    const filter = new FindAssetAudioFilter();
    [-47, -46, -45].forEach((rssi, index) => filter.add(rssi, index * 100));
    expect(filter.evaluate(300)?.category).toBe('WEAK');
    [-13, -12, -11].forEach((rssi, index) => filter.add(rssi, 500 + index * 100));
    expect(filter.evaluate(800)?.category).toBe('STRONG');
    [-48, -47, -46].forEach((rssi, index) => filter.add(rssi, 900 + index * 100));
    expect(filter.evaluate(1300)?.category).toBe('WEAK');
  });

  it('handles irregular samples and expires old audio evidence', () => {
    const filter = new FindAssetAudioFilter();
    filter.add(-30, 0);
    filter.add(-28, 275);
    filter.add(-29, 640);
    expect(filter.evaluate(650)).not.toBeNull();
    expect(filter.evaluate(650 + FIND_ASSET_AUDIO_WINDOW_MS + 1)).toBeNull();
  });
});
