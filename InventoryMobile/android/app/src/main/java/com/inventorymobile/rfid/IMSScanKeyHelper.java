package com.inventorymobile.rfid;

import android.util.Log;

import com.seuic.scankey.IKeyEventCallback;
import com.seuic.scankey.ScanKeyService;

import java.util.HashSet;
import java.util.Set;

/** Registers only the two RFID trigger keys exposed by the RFD-9917. */
final class IMSScanKeyHelper {
    private static final String TAG = "IMSRFID";
    interface Listener {
        void onTrigger(String action, int keyCode);

        void onError(String message, Throwable throwable);
    }

    private static final int TRIGGER_KEY_250 = 250;
    private static final int TRIGGER_KEY_251 = 251;
    private static final String REGISTERED_KEYS = "250,251";

    private final Listener listener;
    private final Set<Integer> pressedKeys = new HashSet<>();
    private ScanKeyService scanKeyService;
    private boolean registered;

    private final IKeyEventCallback callback = new IKeyEventCallback.Stub() {
        @Override
        public void onKeyDown(int keyCode) {
            if (!isSupportedKey(keyCode)) {
                return;
            }

            synchronized (IMSScanKeyHelper.this) {
                if (!pressedKeys.add(keyCode)) {
                    Log.d(TAG, "Ignoring repeated trigger DOWN key=" + keyCode);
                    return;
                }
            }
            Log.d(TAG, "Trigger DOWN key=" + keyCode);
            listener.onTrigger("DOWN", keyCode);
        }

        @Override
        public void onKeyUp(int keyCode) {
            if (!isSupportedKey(keyCode)) {
                return;
            }

            synchronized (IMSScanKeyHelper.this) {
                if (!pressedKeys.remove(keyCode)) {
                    Log.d(TAG, "Ignoring trigger UP without active DOWN key=" + keyCode);
                    return;
                }
            }
            Log.d(TAG, "Trigger UP key=" + keyCode);
            listener.onTrigger("UP", keyCode);
        }
    };

    IMSScanKeyHelper(Listener listener) {
        this.listener = listener;
    }

    boolean register() {
        Log.i(TAG, "Registering trigger callback for keys " + REGISTERED_KEYS);
        synchronized (this) {
            if (registered) {
                Log.i(TAG, "Trigger callback already registered");
                return true;
            }
        }

        try {
            Log.i(TAG, "vendor ScanKeyService.getInstance before");
            ScanKeyService service = ScanKeyService.getInstance();
            Log.i(TAG, "vendor ScanKeyService.getInstance after result=" +
                (service != null));
            if (service == null) {
                listener.onError("ScanKeyService.getInstance() returned null", null);
                return false;
            }
            Log.i(TAG, "vendor registerCallback before keys=" + REGISTERED_KEYS);
            service.registerCallback(callback, REGISTERED_KEYS);
            Log.i(TAG, "vendor registerCallback after");
            synchronized (this) {
                scanKeyService = service;
                registered = true;
            }
            Log.i(TAG, "Trigger callback registered");
            return true;
        } catch (Throwable throwable) {
            synchronized (this) {
                scanKeyService = null;
                registered = false;
            }
            Log.e(TAG, "Trigger callback registration failed", throwable);
            listener.onError("Failed to register RFID trigger keys", throwable);
            return false;
        }
    }

    void unregister() {
        Log.i(TAG, "Unregistering trigger callback");
        ScanKeyService service;
        synchronized (this) {
            pressedKeys.clear();
            if (!registered || scanKeyService == null) {
                registered = false;
                scanKeyService = null;
                Log.i(TAG, "Trigger callback already unregistered");
                return;
            }
            service = scanKeyService;
        }

        try {
            Log.i(TAG, "vendor unregisterCallback before");
            service.unregisterCallback(callback);
            Log.i(TAG, "vendor unregisterCallback after");
            Log.i(TAG, "Trigger callback unregistered");
            synchronized (this) {
                registered = false;
                scanKeyService = null;
            }
        } catch (Throwable throwable) {
            Log.e(TAG, "Trigger callback unregister failed", throwable);
            listener.onError("Failed to unregister RFID trigger keys", throwable);
            // Retain the registration state so a later release can retry cleanup.
        }
    }

    private static boolean isSupportedKey(int keyCode) {
        return keyCode == TRIGGER_KEY_250 || keyCode == TRIGGER_KEY_251;
    }
}
