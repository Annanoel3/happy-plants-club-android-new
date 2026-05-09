package com.happyplantsclub.android;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.onesignal.OneSignal;
import com.onesignal.user.subscriptions.IPushSubscription;

import kotlin.coroutines.Continuation;
import kotlin.coroutines.CoroutineContext;
import kotlin.coroutines.EmptyCoroutineContext;

import org.jetbrains.annotations.NotNull;

@CapacitorPlugin(name = "NotifyBridge")
public class NotifyBridge extends Plugin {

    private static final String TAG = "NotifyBridge";

    @Override
    public void load() {
        Log.d(TAG, "NotifyBridge loaded");
        super.load();
    }

    @PluginMethod
    public void login(PluginCall call) {
        String externalId = call.getString("externalId");
        if (externalId == null || externalId.isEmpty()) {
            call.reject("External ID is required");
            return;
        }
        try {
            OneSignal.login(externalId);
            String playerId = getPlayerId();
            JSObject result = new JSObject();
            result.put("playerId", playerId);
            result.put("externalId", externalId);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to login: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getPlayerId(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("playerId", getPlayerId());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get Player ID: " + e.getMessage());
        }
    }

    @PluginMethod
    public void logout(PluginCall call) {
        try {
            OneSignal.logout();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to logout: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            OneSignal.getNotifications().requestPermission(true, new Continuation<Boolean>() {
                @NotNull
                @Override
                public CoroutineContext getContext() {
                    return EmptyCoroutineContext.INSTANCE;
                }

                @Override
                public void resumeWith(@NotNull Object result) {
                    call.resolve();
                }
            });
        } catch (Exception e) {
            call.reject("Failed to request permission: " + e.getMessage());
        }
    }

    private String getPlayerId() {
        String id = OneSignal.getUser().getOnesignalId();
        if (id == null || id.isEmpty()) {
            IPushSubscription sub = OneSignal.getUser().getPushSubscription();
            if (sub != null) id = sub.getId();
        }
        return id != null ? id : "";
    }
}
