package com.happyplantsclub.android;

import android.app.Application;

import com.onesignal.OneSignal;
import com.onesignal.debug.LogLevel;

public class MainApplication extends Application {

    private static final String ONESIGNAL_APP_ID = "3f0b6a12-b2d3-4c56-8e76-de9baafc41de";

    @Override
    public void onCreate() {
        super.onCreate();

        if (BuildConfig.DEBUG) {
            OneSignal.getDebug().setLogLevel(LogLevel.VERBOSE);
        }

        OneSignal.initWithContext(this, ONESIGNAL_APP_ID);

        // NOTE: Do NOT call requestPermission() here — causes NullPointerException
        // due to missing coroutine context. Called from web app via NotifyBridge instead.
    }
}
