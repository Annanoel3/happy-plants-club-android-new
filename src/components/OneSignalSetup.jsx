import { useEffect } from 'react';

// Helper function to detect if running in Capacitor mobile app
function isRunningInCapacitor() {
    return window.Capacitor?.isNativePlatform?.() ?? false;
}

export default function OneSignalSetup({ user }) {
  useEffect(() => {
    // Load OneSignal SDK for web if not in Capacitor
    if (!isRunningInCapacitor() && !window.OneSignalDeferred) {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      document.head.appendChild(script);

      console.log('[OneSignal] Loading web SDK...');
    }
  }, []);

  useEffect(() => {
    const syncOneSignal = async () => {
      if (!user) {
        console.log('[OneSignal] No user provided to OneSignalSetup');
        return;
      }

      const userEmail = user?.email;

      let externalId;
      if (userEmail && userEmail.includes('@')) {
        externalId = userEmail;
        console.log('[OneSignal] ✅ Using real email as external ID:', externalId);
      } else if (user?.id) {
        externalId = `${user.id}@happyplants.club`;
        console.log('[OneSignal] ⚠️ No email found, using generated ID:', externalId);
      } else {
        console.error('[OneSignal] No email or user ID available, skipping');
        return;
      }

      if (isRunningInCapacitor()) {
        // Running in Capacitor native app - call NotifyBridge plugin directly
        console.log('[OneSignal] Running in Capacitor mobile app');
        const NotifyBridge = window.Capacitor?.Plugins?.NotifyBridge;

        if (!NotifyBridge) {
          console.warn('[OneSignal] NotifyBridge plugin not found');
          return;
        }

        if (externalId) {
          console.log('[OneSignal] ✅ Calling NotifyBridge.login() with:', externalId);
          await NotifyBridge.requestPermission();
          await NotifyBridge.login({ externalId: externalId });
        } else {
          console.log('[OneSignal] Calling NotifyBridge.logout()');
          await NotifyBridge.logout();
        }
      } else {
        // Running in web browser - use web SDK
        console.log('[OneSignal] Running in web browser');

        // Wait for OneSignal SDK to load
        const initOneSignal = () => {
          if (!window.OneSignalDeferred) {
            console.log('[OneSignal] ⏳ Waiting for SDK to load...');
            setTimeout(initOneSignal, 500);
            return;
          }

          window.OneSignalDeferred.push(async function(OneSignal) {
            try {
              await OneSignal.init({
                appId: "3f0b6a12-b2d3-4c56-8e76-de9baafc41de",
                allowLocalhostAsSecureOrigin: true,
                notifyButton: {
                  enable: false
                }
              });

              console.log('[OneSignal] ✅ SDK initialized');

              if (externalId) {
                await OneSignal.login(externalId);
                console.log('[OneSignal] ✅ User logged in with:', externalId);
              }
            } catch (error) {
              console.error('[OneSignal] Initialization error:', error);
            }
          });
        };

        initOneSignal();
      }
    };

    syncOneSignal();
  }, [user]);

  return null;
}