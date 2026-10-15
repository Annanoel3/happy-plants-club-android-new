import { useEffect } from 'react';
import { saveMyPlayerId } from '@/functions/saveMyPlayerId';
import { setOneSignalExternalUserId } from '@/functions/setOneSignalExternalUserId';

// Helper function to detect if running in Capacitor mobile app
function isRunningInCapacitor() {
    return window.Capacitor?.isNativePlatform?.() ?? false;
}

export default function OneSignalSetup({ user }) {
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
          // requestPermission can throw if already granted or dialog is dismissed — that's OK, we still need to login
          try {
            await NotifyBridge.requestPermission();
            console.log('[OneSignal] ✅ Permission granted/already set');
          } catch (permErr) {
            console.warn('[OneSignal] requestPermission threw (may already be granted):', permErr);
          }
          // Always call login regardless of permission result
          const loginResult = await NotifyBridge.login({ externalId: externalId });
          console.log('[OneSignal] ✅ login() sent for:', externalId);
          const playerId = loginResult?.playerId;
          if (playerId) {
            console.log('[OneSignal] ✅ Got playerId:', playerId, '— saving & linking external_id');
            // Save player ID locally
            await saveMyPlayerId({ playerId });
            // Force-link external_id to this player via REST API
            await setOneSignalExternalUserId({ playerId, externalId });
          }
        } else {
          console.log('[OneSignal] Calling NotifyBridge.logout()');
          await NotifyBridge.logout();
        }
      }
      // Phone app only: no browser push. (The web OneSignal SDK used to load here for desktop/web visitors.)
    };

    syncOneSignal();
  }, [user]);

  return null;
}