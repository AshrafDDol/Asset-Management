import AsyncStorage from '@react-native-async-storage/async-storage';

import { recordStockTakeScans, StockTake } from '../../api/stockTakes';

const STORAGE_KEY = 'ims.stockTake.pendingScans.v1';
const MAX_BATCH_SIZE = 40;
const MAX_PENDING_PER_SESSION = 5000;
const BATCH_DELAY_MS = 180;
const MAX_RETRY_DELAY_MS = 30000;

type PersistedQueues = Record<string, string[]>;

export type StockTakeSyncSnapshot = {
  pendingCount: number;
  syncing: boolean;
  error: string | null;
};

type Listener = (snapshot: StockTakeSyncSnapshot, confirmed?: StockTake) => void;

type SessionQueue = {
  pending: string[];
  pendingSet: Set<string>;
  syncing: boolean;
  error: string | null;
  retryCount: number;
  listeners: Set<Listener>;
};

const normalize = (epc: string): string => epc.trim().toUpperCase();

class StockTakeSyncService {
  private queues = new Map<number, SessionQueue>();
  private hydratePromise: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private workerPromise: Promise<void> | null = null;
  private workerTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(sessionId: number): Promise<StockTakeSyncSnapshot> {
    await this.hydrate();
    const queue = this.queueFor(sessionId);
    this.scheduleWorker(0);
    return this.snapshot(queue);
  }

  subscribe(sessionId: number, listener: Listener): () => void {
    const queue = this.queueFor(sessionId);
    queue.listeners.add(listener);
    listener(this.snapshot(queue));
    return () => queue.listeners.delete(listener);
  }

  async enqueue(sessionId: number, epcs: string[]): Promise<string[]> {
    await this.hydrate();
    const queue = this.queueFor(sessionId);
    const accepted: string[] = [];

    const candidates = [...new Set(epcs.map(normalize).filter(epc => epc && !queue.pendingSet.has(epc)))];
    if (queue.pending.length + candidates.length > MAX_PENDING_PER_SESSION) {
      queue.error = `Pending scan limit (${MAX_PENDING_PER_SESSION}) reached. Keep this screen open and restore network connectivity.`;
      this.notify(queue);
      throw new Error(queue.error);
    }

    for (const epc of candidates) {
      queue.pending.push(epc);
      queue.pendingSet.add(epc);
      accepted.push(epc);
    }

    if (accepted.length) {
      queue.error = null;
      try {
        await this.persist();
      } catch (reason) {
        queue.error = `Pending scans remain in memory but durable storage failed: ${reason instanceof Error ? reason.message : String(reason)}`;
        this.notify(queue);
        this.scheduleWorker(BATCH_DELAY_MS);
        throw reason;
      }
      this.notify(queue);
      this.scheduleWorker(BATCH_DELAY_MS);
    }
    return accepted;
  }

  async synchronizeNow(sessionId: number): Promise<StockTakeSyncSnapshot> {
    await this.hydrate();
    await this.runWorker(true, sessionId);
    const snapshot = this.snapshot(this.queueFor(sessionId));
    if (snapshot.pendingCount > 0) {
      throw new Error(snapshot.error || `${snapshot.pendingCount} scan(s) are still waiting to synchronize.`);
    }
    return snapshot;
  }

  async persistNow(): Promise<void> {
    await this.hydrate();
    await this.persist();
  }

  getPendingEpcs(sessionId: number): string[] {
    return [...this.queueFor(sessionId).pending];
  }

  private queueFor(sessionId: number): SessionQueue {
    let queue = this.queues.get(sessionId);
    if (!queue) {
      queue = {
        pending: [],
        pendingSet: new Set(),
        syncing: false,
        error: null,
        retryCount: 0,
        listeners: new Set(),
      };
      this.queues.set(sessionId, queue);
    }
    return queue;
  }

  private hydrate(): Promise<void> {
    if (!this.hydratePromise) {
      this.hydratePromise = AsyncStorage.getItem(STORAGE_KEY).then(value => {
        if (!value) return;
        let stored: PersistedQueues;
        try {
          stored = JSON.parse(value) as PersistedQueues;
        } catch {
          return;
        }
        Object.entries(stored).forEach(([rawSessionId, epcs]) => {
          const sessionId = Number(rawSessionId);
          if (!Number.isInteger(sessionId) || !Array.isArray(epcs)) return;
          const queue = this.queueFor(sessionId);
          epcs.map(normalize).filter(Boolean).forEach(epc => {
            if (!queue.pendingSet.has(epc)) {
              queue.pending.push(epc);
              queue.pendingSet.add(epc);
            }
          });
        });
      });
    }
    return this.hydratePromise;
  }

  private persist(): Promise<void> {
    const persisted: PersistedQueues = {};
    this.queues.forEach((queue, sessionId) => {
      if (queue.pending.length) persisted[String(sessionId)] = [...queue.pending];
    });
    const write = () => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    this.persistChain = this.persistChain.then(write, write);
    return this.persistChain;
  }

  private scheduleWorker(delayMs: number): void {
    if (this.workerTimer) return;
    this.workerTimer = setTimeout(() => {
      this.workerTimer = null;
      this.runWorker(false).catch(() => undefined);
    }, delayMs);
  }

  private async runWorker(failFast: boolean, onlySessionId?: number): Promise<void> {
    if (this.workerPromise) {
      await this.workerPromise;
      if (onlySessionId !== undefined && this.queueFor(onlySessionId).pending.length) {
        return this.runWorker(failFast, onlySessionId);
      }
      return;
    }

    this.workerPromise = this.processQueues(failFast, onlySessionId);
    try {
      await this.workerPromise;
    } finally {
      this.workerPromise = null;
    }
  }

  private async processQueues(failFast: boolean, onlySessionId?: number): Promise<void> {
    const sessionIds = onlySessionId === undefined
      ? [...this.queues.keys()]
      : [onlySessionId];

    for (const sessionId of sessionIds) {
      const queue = this.queueFor(sessionId);
      while (queue.pending.length) {
        const batch = queue.pending.slice(0, MAX_BATCH_SIZE);
        queue.syncing = true;
        this.notify(queue);
        try {
          const confirmed = await recordStockTakeScans(sessionId, batch);
          const completed = new Set(batch);
          queue.pending = queue.pending.filter(epc => !completed.has(epc));
          completed.forEach(epc => queue.pendingSet.delete(epc));
          queue.error = null;
          queue.retryCount = 0;
          await this.persist();
          this.notify(queue, confirmed);
        } catch (reason) {
          queue.error = reason instanceof Error ? reason.message : String(reason);
          queue.retryCount += 1;
          await this.persist();
          this.notify(queue);
          const retryDelay = Math.min(
            MAX_RETRY_DELAY_MS,
            1000 * 2 ** Math.min(queue.retryCount - 1, 5),
          );
          this.scheduleWorker(retryDelay);
          if (failFast) throw reason;
          break;
        } finally {
          queue.syncing = false;
          this.notify(queue);
        }
      }
    }
  }

  private snapshot(queue: SessionQueue): StockTakeSyncSnapshot {
    return {
      pendingCount: queue.pending.length,
      syncing: queue.syncing,
      error: queue.error,
    };
  }

  private notify(queue: SessionQueue, confirmed?: StockTake): void {
    const snapshot = this.snapshot(queue);
    queue.listeners.forEach(listener => listener(snapshot, confirmed));
  }
}

export default new StockTakeSyncService();
