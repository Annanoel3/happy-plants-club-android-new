package com.happyplantsclub.android;

import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.Uri;
import android.util.Log;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "HappyPlantsAuth";

    private static final String[] IN_APP_DOMAINS = {
        "happyplants.club",
        "base44.app",
        "www.base44.app",
        "app.base44.app",
        "accounts.google.com",
        "oauth2.googleapis.com",
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register NotifyBridge BEFORE super.onCreate() so Capacitor picks it up
        registerPlugin(NotifyBridge.class);
        super.onCreate(savedInstanceState);
        setupInAppNavigation();
        setupBackButton();
    }

    /**
     * Hardware/gesture back: step back through the app's own history instead of
     * closing the app. On the first screen, send the app to the background
     * (like pressing Home) rather than killing it, so it reopens where it was.
     */
    private void setupBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    private boolean isInAppDomain(String url) {
        if (url == null) return false;
        for (String domain : IN_APP_DOMAINS) {
            if (url.contains(domain)) {
                Log.d(TAG, "Keeping in WebView: " + url);
                return true;
            }
        }
        if (url.contains(".google.com") || url.contains(".googleapis.com")) {
            Log.d(TAG, "Keeping Google URL in WebView: " + url);
            return true;
        }
        Log.d(TAG, "Would open externally: " + url);
        return false;
    }

    private void setupInAppNavigation() {
        WebView webView = getBridge().getWebView();

        // Remove "; wv" so Google doesn't block OAuth via "disallowed_useragent"
        String ua = webView.getSettings().getUserAgentString();
        webView.getSettings().setUserAgentString(ua.replace("; wv", ""));

        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);

        final WebChromeClient originalChromeClient =
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                        ? webView.getWebChromeClient()
                        : null;

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                Log.d(TAG, "onCreateWindow triggered");
                WebView tempView = new WebView(MainActivity.this);
                tempView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        Log.d(TAG, "window.open target URL: " + url);
                        webView.loadUrl(url);
                        return true;
                    }

                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        Log.d(TAG, "window.open target URL (legacy): " + url);
                        webView.loadUrl(url);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tempView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView wv,
                                             ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (originalChromeClient != null) {
                    return originalChromeClient.onShowFileChooser(wv, filePathCallback, fileChooserParams);
                }
                return super.onShowFileChooser(wv, filePathCallback, fileChooserParams);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (originalChromeClient != null) {
                    originalChromeClient.onPermissionRequest(request);
                } else {
                    request.grant(request.getResources());
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (originalChromeClient != null) {
                    return originalChromeClient.onConsoleMessage(consoleMessage);
                }
                return super.onConsoleMessage(consoleMessage);
            }
        });

        // Extend Capacitor's own client instead of replacing it. A plain WebViewClient
        // here drops Capacitor's request interception, which is what injects the native
        // bridge into the page - without it window.Capacitor.isNativePlatform() is false
        // and native plugins (AdMob, NotifyBridge, voice recorder) never get called.
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                Log.d(TAG, "shouldOverrideUrlLoading: " + url);
                if (isInAppDomain(url)) {
                    return false; // keep app + Google sign-in pages inside the WebView
                }
                return super.shouldOverrideUrlLoading(view, request); // let Capacitor open outside links externally
            }
        });
    }
}
