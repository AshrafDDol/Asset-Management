export const FIND_ASSET_RSSI_ALPHA = 0.6;
export const FIND_ASSET_RSSI_WEAK = -55;
export const FIND_ASSET_RSSI_STRONG = -10;
export const FIND_ASSET_STALE_MS = 1500;
export const FIND_ASSET_RENDER_INTERVAL_MS = 100;
export const FIND_ASSET_SCANNING_BEEP_MS = 900;
export const FIND_ASSET_WEAK_BEEP_MS = 700;
export const FIND_ASSET_MODERATE_BEEP_MS = 400;
export const FIND_ASSET_STRONG_BEEP_MS = 200;
export const FIND_ASSET_AUDIO_WINDOW_MS = 700;
export const FIND_ASSET_AUDIO_EVALUATION_MS = 400;
export const FIND_ASSET_AUDIO_DWELL_MS = 400;
export const FIND_ASSET_AUDIO_MIN_SAMPLES = 1;
export const FIND_ASSET_TREND_DELTA = 3;

const MODERATE_ENTER_STRENGTH = 0.42;
const MODERATE_EXIT_STRENGTH = 0.35;
const STRONG_ENTER_STRENGTH = 0.62;
const STRONG_EXIT_STRENGTH = 0.56;

export type ProximityCategory = 'WEAK' | 'MODERATE' | 'STRONG';
export type SignalTrend = 'IMPROVING' | 'STABLE' | 'WEAKENING';
export type SignalFreshness = 'LIVE' | 'UNCERTAIN' | 'NO SIGNAL';
export type AudioSignalSnapshot = {
  category: ProximityCategory;
  median: number;
  strength: number;
  trend: SignalTrend;
};

export type ProximityReading = { raw: number; smoothed: number; strength: number; category: ProximityCategory; observedAt: number };

export type FindAssetVisualSignal = {
  raw: number;
  strength: number;
  category: ProximityCategory;
};

export const visualSignalForReading = (
  reading: ProximityReading | null,
): FindAssetVisualSignal | null => reading
  ? { raw: reading.raw, strength: reading.strength, category: reading.category }
  : null;

export const freshnessForReading = (
  reading: ProximityReading | null,
  now: number,
): SignalFreshness => {
  if (!reading || now - reading.observedAt > FIND_ASSET_STALE_MS) return 'NO SIGNAL';
  return now - reading.observedAt > FIND_ASSET_AUDIO_EVALUATION_MS
    ? 'UNCERTAIN'
    : 'LIVE';
};

export const isFindAssetFeedbackActive = (
  readerLifecycle: string,
  trigger: 'DOWN' | 'UP',
  manualIntent: boolean,
  manualLifecycle: string | null,
): boolean =>
  (readerLifecycle === 'SCANNING' && trigger === 'DOWN') ||
  (manualIntent && manualLifecycle === 'SCANNING');

export const relativeStrength = (rssi: number): number =>
  Math.max(0, Math.min(1, (rssi - FIND_ASSET_RSSI_WEAK) / (FIND_ASSET_RSSI_STRONG - FIND_ASSET_RSSI_WEAK)));

export const beepIntervalForCategory = (category: ProximityCategory): number =>
  category === 'STRONG'
    ? FIND_ASSET_STRONG_BEEP_MS
    : category === 'MODERATE'
      ? FIND_ASSET_MODERATE_BEEP_MS
      : FIND_ASSET_WEAK_BEEP_MS;

export class FindAssetSignalTracker {
  private reading: ProximityReading | null = null;
  private category: ProximityCategory = 'WEAK';

  accept(raw: unknown, observedAt: number): ProximityReading | null {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const previous = this.reading;
    const stale = previous === null || observedAt - previous.observedAt > FIND_ASSET_STALE_MS;
    const smoothed = stale ? raw : FIND_ASSET_RSSI_ALPHA * raw + (1 - FIND_ASSET_RSSI_ALPHA) * previous.smoothed;
    const strength = relativeStrength(smoothed);
    this.updateCategory(strength);
    this.reading = { raw, smoothed, strength, category: this.category, observedAt };
    return this.reading;
  }

  current(now: number): ProximityReading | null {
    if (!this.reading || now - this.reading.observedAt > FIND_ASSET_STALE_MS) return null;
    return this.reading;
  }

  reset(): void {
    this.reading = null;
    this.category = 'WEAK';
  }

  private updateCategory(strength: number): void {
    if (this.category === 'STRONG') {
      if (strength < MODERATE_EXIT_STRENGTH) this.category = 'WEAK';
      else if (strength < STRONG_EXIT_STRENGTH) this.category = 'MODERATE';
      return;
    }
    if (this.category === 'WEAK') {
      if (strength >= STRONG_ENTER_STRENGTH) this.category = 'STRONG';
      else if (strength >= MODERATE_ENTER_STRENGTH) this.category = 'MODERATE';
      return;
    }
    if (strength >= STRONG_ENTER_STRENGTH) this.category = 'STRONG';
    else if (strength < MODERATE_EXIT_STRENGTH) this.category = 'WEAK';
  }
}

export class FindAssetAudioFilter {
  private samples: Array<{ rssi: number; observedAt: number }> = [];
  private category: ProximityCategory = 'WEAK';
  private lastCategoryChangeAt = 0;
  private previousMedian: number | null = null;

  add(raw: unknown, observedAt: number): void {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
    this.samples.push({ rssi: raw, observedAt });
    this.prune(observedAt);
  }

  evaluate(now: number): AudioSignalSnapshot | null {
    this.prune(now);
    if (this.samples.length < FIND_ASSET_AUDIO_MIN_SAMPLES) return null;
    const sorted = this.samples.map(sample => sample.rssi).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
    const strength = relativeStrength(median);
    const desired = this.classify(strength);
    if (
      desired !== this.category &&
      (this.lastCategoryChangeAt === 0 ||
        now - this.lastCategoryChangeAt >= FIND_ASSET_AUDIO_DWELL_MS)
    ) {
      this.category = desired;
      this.lastCategoryChangeAt = now;
    }
    const delta = this.previousMedian === null ? 0 : median - this.previousMedian;
    const trend: SignalTrend =
      delta >= FIND_ASSET_TREND_DELTA
        ? 'IMPROVING'
        : delta <= -FIND_ASSET_TREND_DELTA
          ? 'WEAKENING'
          : 'STABLE';
    this.previousMedian = median;
    return { category: this.category, median, strength, trend };
  }

  reset(): void {
    this.samples = [];
    this.category = 'WEAK';
    this.lastCategoryChangeAt = 0;
    this.previousMedian = null;
  }

  private prune(now: number): void {
    const oldest = now - FIND_ASSET_AUDIO_WINDOW_MS;
    this.samples = this.samples.filter(sample => sample.observedAt >= oldest);
  }

  private classify(strength: number): ProximityCategory {
    if (this.category === 'STRONG') {
      if (strength < MODERATE_EXIT_STRENGTH) return 'WEAK';
      if (strength < STRONG_EXIT_STRENGTH) return 'MODERATE';
      return 'STRONG';
    }
    if (this.category === 'WEAK') {
      if (strength >= STRONG_ENTER_STRENGTH) return 'STRONG';
      if (strength >= MODERATE_ENTER_STRENGTH) return 'MODERATE';
      return 'WEAK';
    }
    if (strength >= STRONG_ENTER_STRENGTH) return 'STRONG';
    if (strength < MODERATE_EXIT_STRENGTH) return 'WEAK';
    return 'MODERATE';
  }
}

export class ProximityBeepScheduler {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(private readonly play: (isActive: () => boolean) => Promise<void>, private readonly getInterval: () => number) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    const generation = ++this.generation;
    this.schedule(generation, 0);
  }

  stop(): void {
    this.active = false;
    this.generation += 1;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  reschedule(): void {
    if (!this.active) return;
    const generation = ++this.generation;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.schedule(generation, this.getInterval());
  }

  private schedule(generation: number, delay: number): void {
    this.timer = setTimeout(async () => {
      this.timer = null;
      const isActive = () => this.active && generation === this.generation;
      if (!isActive()) return;
      await this.play(isActive);
      if (isActive()) this.schedule(generation, this.getInterval());
    }, delay);
  }
}
