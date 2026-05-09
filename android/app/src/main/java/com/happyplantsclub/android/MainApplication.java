package com.happyplantsclub.android;

import android.app.Application;

import com.onesignal.OneSignal;
import com.onesignal.debug.LogLevel;

public class MainApplication extends Application {

    private static final String ONESIGNAL_APP_ID = "3f0b6a12-b2d3-4c56-8e76-de9baafc41de";

    @Override
    public void onCreate() {
        super.onCreate();

        // Enable verbose logging only for debug builds
        if (BuildConfig.DEBUG) {
            OneSignal.getDebug().setLogLevel(LogLevel.VERBOSE);
        }

        // Initialize OneSignal
        // NOTE: Always initialize in Application class, not MainActivity
        OneSignal.initWithContext(this, ONESIGNAL_APP_ID);

        // NOTE: Do NOT call requestPermission() here — it causes a NullPointerException
        // due to missing coroutine context. Call it from the web app via
        // NotifyBridge.requestPermission() instead.
    }
}
