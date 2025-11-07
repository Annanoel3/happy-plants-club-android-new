import { useEffect } from 'react';

// Helper function to detect if running in Capacitor mobile app
function isRunningInCapacitor() {
    return window !== window.parent;
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

      // CRITICAL: Verify we have an email, not an ID
      if (!userEmail || !userEmail.includes('@')) {
        console.error('[OneSignal] INVALID EMAIL:', userEmail);
        console.error('[OneSignal] User object:', user);
        return;
      }

      console.log('[OneSignal] ✅ Valid email confirmed:', userEmail);
      console.log('[OneSignal] User ID (NOT being sent):', user.id);

      if (isRunningInCapacitor()) {
        // Running in mobile app - send to native wrapper
        console.log('[OneSignal] Running in Capacitor mobile app');
        
        if (userEmail) {
          console.log('[OneSignal] ✅ Sending EMAIL (not ID) via postMessage:', userEmail);
          
          window.parent.postMessage({
            type: 'setOneSignalExternalUserId',
            externalUserId: userEmail
          }, '*');
        } else {
          console.log('[OneSignal] User logged out in mobile app');
          window.parent.postMessage({
            type: 'oneSignalLogout'
          }, '*');
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
              
              if (userEmail) {
                await OneSignal.login(userEmail);
                console.log('[OneSignal] ✅ User logged in with EMAIL:', userEmail);
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