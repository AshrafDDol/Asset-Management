import {
  EmitterSubscription,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

import { RFIDTag } from '../../types/RFIDTag';
import { loadRFIDSettings } from '../settings/RFIDSettingsService';

type TriggerAction = 'DOWN' | 'UP';
type RFIDLifecycleState =
  | 'CLOSED'
  | 'OPENING'
  | 'READY'
  | 'STARTING'
  | 'SCANNING'
  | 'STOPPING'
  | 'ERROR'
  | 'CLOSING';

export interface RFIDTriggerEvent {
  action: TriggerAction;
  keyCode: 250 | 251;
  startsSession?: boolean;
}

interface NativeRFIDError {
  message?: string;
  detail?: string;
}

interface NativeIMSRFIDModule {
  initialize(): Promise<boolean>;
  startScan(): Promise<boolean>;
  stopScan(): Promise<boolean>;
  isScanning(): Promise<boolean>;
  setPower(power: number): Promise<boolean>;
  getPower(): Promise<number>;
  release(): Promise<boolean>;
}

type TagsListener = (tags: RFIDTag[]) => void;
type TriggerListener = (event: RFIDTriggerEvent) => void;
type ErrorListener = (message: string) => void;

export type RFIDPowerApplicationResult =
  | { status: 'applied'; readerPower: number }
  | { status: 'deferred' }
  | { status: 'failed'; message: string; readerPower?: number };

const nativeModule = NativeModules.IMSRFID as NativeIMSRFIDModule | undefined;
const NATIVE_OPERATION_TIMEOUT_MS = 8000;

class IMSRFIDService {
  private readonly eventEmitter = nativeModule
    ? new NativeEventEmitter(NativeModules.IMSRFID)
    : null;

  private nativeSubscriptions: EmitterSubscription[] = [];
  private tagListeners = new Set<TagsListener>();
  private triggerListeners = new Set<TriggerListener>();
  private errorListeners = new Set<ErrorListener>();
  private sessionTags = new Map<string, RFIDTag>();
  private activeTriggerKeys = new Set<number>();
  private state: RFIDLifecycleState = 'CLOSED';
  private releaseRequested = false;
  private startIntentPending = false;
  private stopRequested = false;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.attachNativeSubscriptions();
  }

  async initialize(): Promise<boolean> {
    this.attachNativeSubscriptions();
    return this.enqueueOperation(async () => {
      if (this.releaseRequested) {
        return false;
      }
      if (!nativeModule || Platform.OS !== 'android') {
        this.notifyError('IMSRFID native module is unavailable on this platform');
        return false;
      }
      if (this.state === 'SCANNING') {
        return true;
      }

      if (this.state === 'READY') {
        await this.applySavedPowerWithinQueue();
        return true;
      }

      this.state = 'OPENING';
      try {
        const initialized = await this.withNativeTimeout(
          nativeModule.initialize(),
          'initialize',
        );
        this.state = initialized ? 'READY' : 'CLOSED';
        if (initialized) {
          await this.applySavedPowerWithinQueue();
        }
        return initialized;
      } catch (error) {
        this.state = 'ERROR';
        this.notifyError(this.errorMessage(error));
        return false;
      }
    });
  }

  async startScan(): Promise<boolean> {
    return this.enqueueOperation(async () => {
      this.startIntentPending = false;
      if (this.releaseRequested) {
        return false;
      }
      if (this.stopRequested) {
        this.stopRequested = false;
        return false;
      }
      if (!nativeModule) {
        this.notifyError('IMSRFID native module is unavailable');
        return false;
      }
      if (this.state === 'STARTING' || this.state === 'SCANNING') {
        return true;
      }
      if (this.state !== 'READY') {
        this.notifyError(`RFID reader is not ready (state: ${this.state})`);
        return false;
      }

      this.sessionTags.clear();
      this.state = 'STARTING';
      try {
        const started = await this.withNativeTimeout(
          nativeModule.startScan(),
          'startScan',
        );
        if (!started) {
          this.state = 'READY';
          this.stopRequested = false;
          return false;
        }

        this.state = 'SCANNING';
        if (this.stopRequested) {
          this.stopRequested = false;
          await this.stopWithinQueue();
        }
        return started;
      } catch (error) {
        this.state = 'ERROR';
        this.stopRequested = false;
        this.notifyError(this.errorMessage(error));
        return false;
      }
    });
  }

  async stopScan(): Promise<boolean> {
    if (this.startIntentPending || this.state === 'STARTING') {
      this.stopRequested = true;
      return true;
    }

    return this.enqueueOperation(async () => {
      if (this.state === 'STARTING') {
        this.stopRequested = true;
        return true;
      }
      if (!nativeModule || this.state !== 'SCANNING') {
        return true;
      }
      return this.stopWithinQueue();
    });
  }

  async isScanning(): Promise<boolean> {
    return this.enqueueOperation(async () => {
      if (!nativeModule || this.state !== 'SCANNING') {
        return false;
      }
      try {
        const scanning = await this.withNativeTimeout(
          nativeModule.isScanning(),
          'isScanning',
        );
        if (!scanning) {
          this.state = 'READY';
        }
        return scanning;
      } catch (error) {
        this.notifyError(this.errorMessage(error));
        return false;
      }
    });
  }

  async setPower(power: number): Promise<boolean> {
    return this.enqueueOperation(async () => {
      if (!nativeModule || !this.isReaderUsable()) {
        this.notifyError('RFID reader is not ready');
        return false;
      }
      try {
        return await this.setPowerWithinQueue(power);
      } catch (error) {
        this.state = 'ERROR';
        this.notifyError(this.errorMessage(error));
        return false;
      }
    });
  }

  async getPower(): Promise<number> {
    return this.enqueueOperation(async () => {
      if (!nativeModule || !this.isReaderUsable()) {
        throw new Error('RFID reader is not ready');
      }
      return this.withNativeTimeout(nativeModule.getPower(), 'getPower');
    });
  }

  async applyPowerWhenReady(power: number): Promise<RFIDPowerApplicationResult> {
    return this.enqueueOperation(() => this.applyPowerWithinQueue(power));
  }

  onTags(listener: TagsListener): () => void {
    this.attachNativeSubscriptions();
    this.tagListeners.add(listener);
    return () => this.tagListeners.delete(listener);
  }

  onTrigger(listener: TriggerListener): () => void {
    this.attachNativeSubscriptions();
    this.triggerListeners.add(listener);
    return () => this.triggerListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.attachNativeSubscriptions();
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  getSessionTags(): RFIDTag[] {
    return Array.from(this.sessionTags.values());
  }

  async release(): Promise<void> {
    this.releaseRequested = true;
    this.startIntentPending = false;
    this.stopRequested = true;
    this.activeTriggerKeys.clear();
    return this.enqueueOperation(async () => {
      if (!nativeModule || this.state === 'CLOSED' || this.state === 'CLOSING') {
        this.state = 'CLOSED';
        this.releaseRequested = false;
        this.stopRequested = false;
        return;
      }

      this.state = 'CLOSING';
      try {
        const released = await this.withNativeTimeout(
          nativeModule.release(),
          'release',
        );
        this.state = released ? 'CLOSED' : 'ERROR';
        if (!released) {
          this.notifyError('Native RFID release was not confirmed');
        }
      } catch (error) {
        this.state = 'ERROR';
        this.notifyError(this.errorMessage(error));
      } finally {
        this.releaseRequested = false;
        this.stopRequested = false;
      }
    });
  }

  async destroy(): Promise<void> {
    this.detachNativeSubscriptions();
    this.tagListeners.clear();
    this.triggerListeners.clear();
    this.errorListeners.clear();
    this.sessionTags.clear();
    await this.release();
  }

  private attachNativeSubscriptions(): void {
    if (!this.eventEmitter || this.nativeSubscriptions.length > 0) {
      return;
    }

    this.nativeSubscriptions = [
      this.eventEmitter.addListener('onTags', payload =>
        this.handleTags(payload as unknown as RFIDTag[]),
      ),
      this.eventEmitter.addListener('onTrigger', payload =>
        this.handleTrigger(payload as unknown as RFIDTriggerEvent),
      ),
      this.eventEmitter.addListener('onError', this.handleError),
    ];
  }

  private detachNativeSubscriptions(): void {
    this.nativeSubscriptions.forEach(subscription => subscription.remove());
    this.nativeSubscriptions = [];
  }

  private handleTags = (batch: RFIDTag[]): void => {
    if (
      this.releaseRequested ||
      this.state !== 'SCANNING' ||
      !Array.isArray(batch)
    ) {
      return;
    }

    const newUniqueTags: RFIDTag[] = [];
    const callbackEpcs = new Set<string>();
    batch.forEach(tag => {
      const rawEpc = typeof tag?.rawEpc === 'string' ? tag.rawEpc : tag?.epc;
      const epc = typeof tag?.epc === 'string' ? tag.epc.trim().toUpperCase() : '';
      if (
        !epc ||
        /^0+$/.test(epc) ||
        callbackEpcs.has(epc) ||
        this.sessionTags.has(epc)
      ) {
        return;
      }

      callbackEpcs.add(epc);
      const uniqueTag: RFIDTag = {
        epc,
        ...(typeof rawEpc === 'string' ? { rawEpc } : {}),
        ...(typeof tag.rssi === 'number' ? { rssi: tag.rssi } : {}),
      };
      this.sessionTags.set(epc, uniqueTag);
      newUniqueTags.push(uniqueTag);
    });

    if (newUniqueTags.length > 0) {
      this.tagListeners.forEach(listener => listener(newUniqueTags));
    }
  };

  private handleTrigger = (event: RFIDTriggerEvent): void => {
    if (!event || (event.action !== 'DOWN' && event.action !== 'UP')) {
      return;
    }

    let startsSession = false;
    if (event.action === 'DOWN') {
      const isFirstActiveKey = this.activeTriggerKeys.size === 0;
      const isNewKeyDown = !this.activeTriggerKeys.has(event.keyCode);
      this.activeTriggerKeys.add(event.keyCode);
      if (
        isFirstActiveKey &&
        isNewKeyDown &&
        this.state === 'READY' &&
        !this.startIntentPending &&
        !this.releaseRequested
      ) {
        startsSession = true;
        this.startIntentPending = true;
        this.startScan().catch(error => this.notifyError(this.errorMessage(error)));
      }
    } else {
      const wasActive = this.activeTriggerKeys.delete(event.keyCode);
      if (wasActive && this.activeTriggerKeys.size === 0) {
        if (this.startIntentPending || this.state === 'STARTING') {
          this.stopRequested = true;
        } else if (this.state === 'SCANNING') {
          this.stopScan().catch(error => this.notifyError(this.errorMessage(error)));
        }
      }
    }

    const reportedEvent = { ...event, startsSession };
    this.triggerListeners.forEach(listener => listener(reportedEvent));
  };

  private async stopWithinQueue(): Promise<boolean> {
    if (!nativeModule || this.state !== 'SCANNING') {
      return true;
    }

    this.state = 'STOPPING';
    try {
      const stopped = await this.withNativeTimeout(
        nativeModule.stopScan(),
        'stopScan',
      );
      this.state = stopped ? 'READY' : 'ERROR';
      if (!stopped) {
        this.notifyError('RFID inventory stop was not confirmed');
      }
      return stopped;
    } catch (error) {
      this.state = 'ERROR';
      this.notifyError(this.errorMessage(error));
      return false;
    }
  }

  private async applySavedPowerWithinQueue(): Promise<void> {
    try {
      const settings = await loadRFIDSettings();
      const result = await this.applyPowerWithinQueue(settings.rfidPower);
      if (result.status === 'failed') {
        this.notifyError(result.message);
      }
    } catch (error) {
      this.notifyError(`Failed to load RFID power setting: ${this.errorMessage(error)}`);
    }
  }

  private async applyPowerWithinQueue(
    power: number,
  ): Promise<RFIDPowerApplicationResult> {
    if (!nativeModule || this.state !== 'READY') {
      return { status: 'deferred' };
    }

    try {
      const applied = await this.setPowerWithinQueue(power);
      if (!applied) {
        return { status: 'failed', message: 'RFID reader did not accept the power setting.' };
      }

      const readerPower = await this.withNativeTimeout(
        nativeModule.getPower(),
        'getPower',
      );
      if (readerPower !== power) {
        return {
          status: 'failed',
          message: `RFID reader reported ${readerPower} dBm after applying ${power} dBm.`,
          readerPower,
        };
      }

      return { status: 'applied', readerPower };
    } catch (error) {
      return {
        status: 'failed',
        message: `Failed to apply RFID power: ${this.errorMessage(error)}`,
      };
    }
  }

  private setPowerWithinQueue(power: number): Promise<boolean> {
    return this.withNativeTimeout(nativeModule!.setPower(power), 'setPower');
  }

  private handleError = (error: NativeRFIDError | string): void => {
    const message =
      typeof error === 'string'
        ? error
        : [error?.message, error?.detail].filter(Boolean).join(': ') ||
          'Unknown RFID error';
    this.notifyError(message);
  };

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async withNativeTimeout<T>(
    nativePromise: Promise<T>,
    operation: string,
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `Native RFID ${operation} did not resolve within ${NATIVE_OPERATION_TIMEOUT_MS}ms`,
          ),
        );
      }, NATIVE_OPERATION_TIMEOUT_MS);
    });

    try {
      return await Promise.race([nativePromise, timeoutPromise]);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private isReaderUsable(): boolean {
    return this.state === 'READY' || this.state === 'SCANNING';
  }

  private notifyError(message: string): void {
    this.errorListeners.forEach(listener => listener(message));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export default new IMSRFIDService();
