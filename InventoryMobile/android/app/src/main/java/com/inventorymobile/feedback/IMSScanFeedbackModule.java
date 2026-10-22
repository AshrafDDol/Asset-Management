package com.inventorymobile.feedback;

import android.media.AudioAttributes;
import android.media.SoundPool;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.inventorymobile.R;

public final class IMSScanFeedbackModule extends ReactContextBaseJavaModule {
    private static final String TAG = "FindAssetAudio";
    private SoundPool soundPool;
    private int scanSoundId;
    private boolean soundLoaded;

    public IMSScanFeedbackModule(ReactApplicationContext reactContext) {
        super(reactContext);

        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        soundPool = new SoundPool.Builder()
            .setMaxStreams(1)
            .setAudioAttributes(attributes)
            .build();
        soundPool.setOnLoadCompleteListener((pool, sampleId, status) -> {
            soundLoaded = status == 0 && sampleId == scanSoundId;
            Log.i(TAG, "SoundPool load complete: sampleId=" + sampleId
                + ", status=" + status + ", loaded=" + soundLoaded);
        });
        scanSoundId = soundPool.load(reactContext, R.raw.ims_scan_beep, 1);
    }

    @Override
    public String getName() {
        return "IMSScanFeedback";
    }

    @ReactMethod
    public void playScanSound() {
        if (soundPool != null && soundLoaded && scanSoundId != 0) {
            int streamId = soundPool.play(scanSoundId, 1.0f, 1.0f, 1, 0, 1.0f);
            Log.i(TAG, "SoundPool play: sampleId=" + scanSoundId + ", streamId=" + streamId);
        } else {
            Log.w(TAG, "SoundPool play skipped: pool=" + (soundPool != null)
                + ", loaded=" + soundLoaded + ", sampleId=" + scanSoundId);
        }
    }

    @Override
    public void invalidate() {
        if (soundPool != null) {
            soundPool.release();
            soundPool = null;
        }
        soundLoaded = false;
        scanSoundId = 0;
        super.invalidate();
    }
}
