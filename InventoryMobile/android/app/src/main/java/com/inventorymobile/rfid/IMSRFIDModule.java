package com.inventorymobile.rfid;

import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.seuic.uhf.EPC;
import com.seuic.uhf.IReadTagsListener;
import com.seuic.uhf.UHFService;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

public final class IMSRFIDModule extends ReactContextBaseJavaModule {
    private enum ReaderState {
        CLOSED,
        OPENING,
        READY,
        STARTING,
        SCANNING,
        STOPPING,
        ERROR,
        CLOSING
    }

    private static final String TAG = "IMSRFID";
    private static final String MODULE_NAME = "IMSRFID";
    private static final String EVENT_TAGS = "onTags";
    private static final String EVENT_TRIGGER = "onTrigger";
    private static final String EVENT_ERROR = "onError";

    private final ReactApplicationContext reactContext;
    private final Object stateLock = new Object();
    private final ReentrantLock operationLock = new ReentrantLock();
    private final IMSScanKeyHelper scanKeyHelper;

    private UHFService uhfService;
    private ReaderState state = ReaderState.CLOSED;
    private boolean tagListenerRegistered;
    private boolean stopRequested;
    private boolean inventoryMayBeActive;

    private final IReadTagsListener readTagsListener = new IReadTagsListener() {
        @Override
        public void tagsRead(List<EPC> epcs) {
            synchronized (stateLock) {
                if (state != ReaderState.SCANNING) {
                    return;
                }
            }

            WritableArray tags = Arguments.createArray();
            Set<String> batchEpcs = new HashSet<>();
            if (epcs != null) {
                for (EPC sdkTag : epcs) {
                    if (sdkTag == null) {
                        continue;
                    }
                    String rawEpc = sdkTag.getId();
                    String normalizedEpc = normalizeEpc(rawEpc);
                    if (normalizedEpc == null || !batchEpcs.add(normalizedEpc)) {
                        continue;
                    }

                    WritableMap tag = Arguments.createMap();
                    tag.putString("rawEpc", rawEpc);
                    tag.putString("epc", normalizedEpc);
                    tag.putInt("rssi", sdkTag.rssi);
                    tags.pushMap(tag);
                }
            }
            if (tags.size() > 0) {
                emit(EVENT_TAGS, tags);
            }
        }
    };

    public IMSRFIDModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.scanKeyHelper = new IMSScanKeyHelper(new IMSScanKeyHelper.Listener() {
            @Override
            public void onTrigger(String action, int keyCode) {
                ReaderState stateBefore;
                synchronized (stateLock) {
                    stateBefore = state;
                }
                Log.i(TAG, "trigger=" + action + " key=" + keyCode +
                    " stateBefore=" + stateBefore);

                WritableMap payload = Arguments.createMap();
                payload.putString("action", action);
                payload.putInt("keyCode", keyCode);
                emit(EVENT_TRIGGER, payload);
            }

            @Override
            public void onError(String message, Throwable throwable) {
                emitError(message, throwable);
            }
        });
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void initialize(Promise promise) {
        if (!beginOperation("initialize", promise)) {
            return;
        }
        try {
            synchronized (stateLock) {
                if (state == ReaderState.READY
                    || state == ReaderState.STARTING
                    || state == ReaderState.SCANNING
                    || state == ReaderState.STOPPING) {
                    Log.i(TAG, "initialize ignored state=" + state);
                    promise.resolve(true);
                    return;
                }
                if (state != ReaderState.CLOSED) {
                    Log.w(TAG, "initialize ignored state=" + state);
                    promise.resolve(false);
                    return;
                }
                transitionToLocked(ReaderState.OPENING, "initialize");
            }

            boolean readerOpened = false;
            try {
                Log.i(TAG, "before UHFService.getInstance");
                UHFService service = UHFService.getInstance();
                Log.i(TAG, "after UHFService.getInstance result=" + (service != null));
                if (service == null) {
                    throw new IllegalStateException("UHFService.getInstance() returned null");
                }
                synchronized (stateLock) {
                    uhfService = service;
                }

                Log.i(TAG, "before isOpen");
                boolean alreadyOpen = service.isOpen();
                Log.i(TAG, "after isOpen result=" + alreadyOpen);
                if (alreadyOpen) {
                    readerOpened = true;
                } else {
                    Log.i(TAG, "before open");
                    readerOpened = service.open();
                    Log.i(TAG, "after open result=" + readerOpened);
                }
                if (!readerOpened) {
                    synchronized (stateLock) {
                        clearClosedStateLocked("open returned false");
                    }
                    emitError("UHFService.open() returned false", null);
                    promise.resolve(false);
                    return;
                }

                if (!scanKeyHelper.register()) {
                    closeServiceOutsideStateLock();
                    synchronized (stateLock) {
                        clearClosedStateLocked("trigger registration failed");
                    }
                    promise.resolve(false);
                    return;
                }

                synchronized (stateLock) {
                    transitionToLocked(ReaderState.READY, "initialize complete");
                }
                promise.resolve(true);
            } catch (Throwable throwable) {
                Log.e(TAG, "initialize exception", throwable);
                scanKeyHelper.unregister();
                if (readerOpened) {
                    closeServiceOutsideStateLock();
                }
                synchronized (stateLock) {
                    clearClosedStateLocked("initialize exception");
                }
                emitError("Failed to initialize UHFService", throwable);
                promise.resolve(false);
            }
        } finally {
            operationLock.unlock();
        }
    }

    @ReactMethod
    public void startScan(Promise promise) {
        if (!beginOperation("startScan", promise)) {
            return;
        }
        try {
            UHFService service;
            synchronized (stateLock) {
                if (state == ReaderState.STARTING || state == ReaderState.SCANNING) {
                    Log.i(TAG, "startScan ignored state=" + state);
                    promise.resolve(state == ReaderState.SCANNING);
                    return;
                }
                if (state != ReaderState.READY || uhfService == null) {
                    Log.w(TAG, "startScan ignored state=" + state);
                    promise.resolve(false);
                    return;
                }
                service = uhfService;
                stopRequested = false;
                transitionToLocked(ReaderState.STARTING, "start accepted");
            }

            try {
                Log.i(TAG, "before registerReadTags");
                service.registerReadTags(readTagsListener);
                Log.i(TAG, "after registerReadTags");
                synchronized (stateLock) {
                    tagListenerRegistered = true;
                }

                Log.i(TAG, "before inventoryStart");
                boolean started = service.inventoryStart();
                Log.i(TAG, "after inventoryStart result=" + started);
                if (!started) {
                    boolean listenerRemoved = unregisterTagListenerOutsideStateLock(service);
                    synchronized (stateLock) {
                        transitionToLocked(
                            listenerRemoved ? ReaderState.READY : ReaderState.ERROR,
                            listenerRemoved ? "inventoryStart returned false" :
                                "start failed and listener removal not confirmed"
                        );
                    }
                    emitError("UHFService.inventoryStart() returned false", null);
                    promise.resolve(false);
                    return;
                }

                boolean shouldStop;
                synchronized (stateLock) {
                    inventoryMayBeActive = true;
                    transitionToLocked(ReaderState.SCANNING, "inventory started");
                    shouldStop = stopRequested;
                    stopRequested = false;
                    if (shouldStop) {
                        transitionToLocked(ReaderState.STOPPING, "deferred stop");
                    }
                }

                if (shouldStop) {
                    Log.i(TAG, "processing deferred stop after inventoryStart");
                    boolean stopResult = stopVendorAndCommit(service);
                    resolveStopPromise(promise, stopResult, "deferred-start");
                } else {
                    promise.resolve(true);
                }
            } catch (Throwable throwable) {
                Log.e(TAG, "startScan exception", throwable);
                boolean cleanupStopped = stopAfterFailedStart(service);
                boolean listenerRemoved = unregisterTagListenerOutsideStateLock(service);
                synchronized (stateLock) {
                    stopRequested = false;
                    transitionToLocked(
                        cleanupStopped && listenerRemoved ?
                            ReaderState.READY : ReaderState.ERROR,
                        cleanupStopped && listenerRemoved ? "start exception cleaned up" :
                            "start cleanup not confirmed"
                    );
                }
                emitError("Failed to start RFID inventory", throwable);
                promise.resolve(false);
            }
        } finally {
            operationLock.unlock();
        }
    }

    @ReactMethod
    public void stopScan(Promise promise) {
        synchronized (stateLock) {
            Log.i(TAG, "command=stopScan stateBefore=" + state);
            if (state == ReaderState.STARTING) {
                stopRequested = true;
                Log.i(TAG, "stopScan deferred stopRequested=true");
                resolveStopPromise(promise, true, "stop-requested-during-start");
                return;
            }
        }

        Log.i(TAG, "stopScan waiting for operation guard");
        operationLock.lock();
        Log.i(TAG, "stopScan acquired operation guard");
        try {
            UHFService service;
            synchronized (stateLock) {
                if (state != ReaderState.SCANNING) {
                    Log.i(TAG, "stopScan ignored state=" + state);
                    resolveStopPromise(promise, true, "ignored-" + state);
                    return;
                }
                service = uhfService;
                transitionToLocked(ReaderState.STOPPING, "stop accepted");
            }
            boolean stopResult = stopVendorAndCommit(service);
            resolveStopPromise(promise, stopResult, "normal-stop");
        } finally {
            operationLock.unlock();
        }
    }

    @ReactMethod
    public void isScanning(Promise promise) {
        synchronized (stateLock) {
            promise.resolve(state == ReaderState.SCANNING || state == ReaderState.STOPPING);
        }
    }

    @ReactMethod
    public void setPower(int power, Promise promise) {
        if (!beginOperation("setPower(" + power + ")", promise)) {
            return;
        }
        try {
            UHFService service;
            synchronized (stateLock) {
                if (!isReaderUsableLocked()) {
                    promise.resolve(false);
                    return;
                }
                service = uhfService;
            }
            try {
                Log.i(TAG, "before setPower value=" + power);
                boolean success = service.setPower(power);
                Log.i(TAG, "after setPower result=" + success);
                promise.resolve(success);
            } catch (Throwable throwable) {
                Log.e(TAG, "setPower exception", throwable);
                emitError("Failed to set RFID power", throwable);
                promise.resolve(false);
            }
        } finally {
            operationLock.unlock();
        }
    }

    @ReactMethod
    public void getPower(Promise promise) {
        if (!beginOperation("getPower", promise)) {
            return;
        }
        try {
            UHFService service;
            synchronized (stateLock) {
                if (!isReaderUsableLocked()) {
                    promise.reject("RFID_NOT_READY", "RFID reader is not ready");
                    return;
                }
                service = uhfService;
            }
            try {
                Log.i(TAG, "before getPower");
                int power = service.getPower();
                Log.i(TAG, "after getPower result=" + power);
                promise.resolve(power);
            } catch (Throwable throwable) {
                Log.e(TAG, "getPower exception", throwable);
                emitError("Failed to get RFID power", throwable);
                promise.reject("RFID_GET_POWER_FAILED", throwable);
            }
        } finally {
            operationLock.unlock();
        }
    }

    @ReactMethod
    public void release(Promise promise) {
        if (!beginOperation("release", promise)) {
            return;
        }
        try {
            releaseVendorAndCommit();
            promise.resolve(true);
        } finally {
            operationLock.unlock();
        }
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required by NativeEventEmitter.
    }

    @ReactMethod
    public void removeListeners(double count) {
        // Required by NativeEventEmitter.
    }

    @Override
    public void invalidate() {
        Log.i(TAG, "command=invalidate");
        if (operationLock.tryLock()) {
            try {
                releaseVendorAndCommit();
            } finally {
                operationLock.unlock();
            }
        } else {
            Log.w(TAG, "invalidate cleanup skipped operationBusy=true");
        }
        super.invalidate();
    }

    private void releaseVendorAndCommit() {
        ReaderState stateBefore;
        boolean shouldStop;
        boolean readerAlreadyClosed;
        synchronized (stateLock) {
            stateBefore = state;
            if (state == ReaderState.CLOSING) {
                Log.i(TAG, "release ignored state=" + state);
                return;
            }
            readerAlreadyClosed = state == ReaderState.CLOSED;
            shouldStop = inventoryMayBeActive;
            if (!readerAlreadyClosed) {
                transitionToLocked(ReaderState.CLOSING, "release from " + stateBefore);
            }
        }

        if (readerAlreadyClosed) {
            Log.i(TAG, "reader already closed; verifying trigger callback cleanup");
            scanKeyHelper.unregister();
            return;
        }

        if (shouldStop) {
            try {
                UHFService service = serviceSnapshot();
                Log.i(TAG, "before inventoryStop release");
                boolean stopped = service != null && service.inventoryStop();
                Log.i(TAG, "after inventoryStop release result=" + stopped);
            } catch (Throwable throwable) {
                Log.e(TAG, "inventoryStop release exception", throwable);
                emitError("Failed to stop inventory during release", throwable);
            }
        }

        UHFService service = serviceSnapshot();
        unregisterTagListenerOutsideStateLock(service);
        scanKeyHelper.unregister();
        closeServiceOutsideStateLock();
        synchronized (stateLock) {
            clearClosedStateLocked("release complete");
        }
    }

    private boolean stopVendorAndCommit(UHFService service) {
        boolean stopped = false;
        try {
            Log.i(TAG, "before inventoryStop");
            stopped = service != null && service.inventoryStop();
            Log.i(TAG, "after inventoryStop result=" + stopped);
        } catch (Throwable throwable) {
            Log.e(TAG, "inventoryStop exception", throwable);
            emitError("Failed to stop RFID inventory", throwable);
        }

        // Deliberately separate from inventoryStop and never under stateLock.
        Log.i(TAG, "inventoryStop phase complete; proceeding to unregisterReadTags");
        boolean listenerRemoved = unregisterTagListenerOutsideStateLock(service);

        synchronized (stateLock) {
            if (stopped && listenerRemoved) {
                inventoryMayBeActive = false;
                transitionToLocked(ReaderState.READY, "inventory stopped and listener removed");
            } else {
                inventoryMayBeActive = !stopped;
                transitionToLocked(ReaderState.ERROR, "stop cleanup not confirmed");
            }
        }
        if (!stopped || !listenerRemoved) {
            emitError("RFID stop cleanup did not fully succeed", null);
        }
        return stopped && listenerRemoved;
    }

    private void resolveStopPromise(Promise promise, boolean result, String path) {
        Log.i(TAG, "before resolving stop path=" + path + " result=" + result);
        promise.resolve(result);
        Log.i(TAG, "after resolving stop path=" + path + " result=" + result);
    }

    private boolean stopAfterFailedStart(UHFService service) {
        if (service == null) {
            synchronized (stateLock) {
                inventoryMayBeActive = false;
            }
            return true;
        }
        try {
            Log.i(TAG, "before inventoryStop start-failure cleanup");
            boolean stopped = service.inventoryStop();
            Log.i(TAG, "after inventoryStop start-failure cleanup result=" + stopped);
            synchronized (stateLock) {
                inventoryMayBeActive = !stopped;
            }
            return stopped;
        } catch (Throwable throwable) {
            Log.e(TAG, "inventoryStop start-failure cleanup exception", throwable);
            synchronized (stateLock) {
                inventoryMayBeActive = true;
            }
            return false;
        }
    }

    private boolean unregisterTagListenerOutsideStateLock(UHFService service) {
        boolean shouldUnregister;
        synchronized (stateLock) {
            shouldUnregister = tagListenerRegistered;
        }
        if (!shouldUnregister) {
            Log.i(TAG, "unregisterReadTags ignored listenerRegistered=false");
            return true;
        }

        try {
            if (service != null) {
                Log.i(TAG, "before unregisterReadTags");
                service.unregisterReadTags(readTagsListener);
                Log.i(TAG, "after unregisterReadTags");
            } else {
                Log.w(TAG, "unregisterReadTags skipped service=null");
                return false;
            }
            synchronized (stateLock) {
                tagListenerRegistered = false;
            }
            return true;
        } catch (Throwable throwable) {
            Log.e(TAG, "unregisterReadTags exception", throwable);
            emitError("Failed to unregister RFID tag listener", throwable);
            // Keep the flag true so release can make another cleanup attempt.
            return false;
        }
    }

    private void closeServiceOutsideStateLock() {
        UHFService service;
        synchronized (stateLock) {
            service = uhfService;
            uhfService = null;
        }
        if (service == null) {
            Log.i(TAG, "close ignored service=null");
            return;
        }
        try {
            Log.i(TAG, "before close");
            service.close();
            Log.i(TAG, "after close");
        } catch (Throwable throwable) {
            Log.e(TAG, "close exception", throwable);
            emitError("Failed to close UHFService", throwable);
        }
    }

    private UHFService serviceSnapshot() {
        synchronized (stateLock) {
            return uhfService;
        }
    }

    private boolean beginOperation(String command, Promise promise) {
        ReaderState stateBefore;
        synchronized (stateLock) {
            stateBefore = state;
        }
        Log.i(TAG, "command=" + command + " stateBefore=" + stateBefore);
        if (!operationLock.tryLock()) {
            Log.w(TAG, "command=" + command + " ignored operationBusy=true state=" +
                stateBefore);
            promise.resolve(false);
            return false;
        }
        return true;
    }

    private boolean isReaderUsableLocked() {
        return uhfService != null
            && (state == ReaderState.READY || state == ReaderState.SCANNING);
    }

    private void clearClosedStateLocked(String reason) {
        uhfService = null;
        tagListenerRegistered = false;
        stopRequested = false;
        inventoryMayBeActive = false;
        transitionToLocked(ReaderState.CLOSED, reason);
    }

    private void transitionToLocked(ReaderState nextState, String reason) {
        ReaderState previousState = state;
        state = nextState;
        Log.i(TAG, "state " + previousState + " -> " + nextState + " reason=" + reason);
    }

    private static String normalizeEpc(String rawEpc) {
        if (rawEpc == null) {
            return null;
        }
        String epc = rawEpc.trim().toUpperCase(Locale.ROOT);
        if (epc.isEmpty() || epc.matches("0+")) {
            return null;
        }
        return epc;
    }

    private void emitError(String message, Throwable throwable) {
        WritableMap payload = Arguments.createMap();
        payload.putString("message", message);
        if (throwable != null && throwable.getMessage() != null) {
            payload.putString("detail", throwable.getMessage());
        }
        emit(EVENT_ERROR, payload);
    }

    private void emit(String eventName, Object payload) {
        if (!reactContext.hasActiveReactInstance()) {
            return;
        }
        reactContext.runOnUiQueueThread(() -> {
            if (reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, payload);
            }
        });
    }
}
