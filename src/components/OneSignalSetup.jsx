import { useEffect } from 'react';

export default function OneSignalSetup({ user }) {

  useEffect(() => {
    // This function will run whenever the 'user' object changes.
    const syncUserWithOneSignal = () => {
      // Find our custom plugin on the global window object.
      // The name "NotifyBridge" now matches the name in your Java file.
      const NotifyBridge = window.Capacitor?.Plugins?.NotifyBridge;

      // If the plugin isn't found, we can't do anything.
      // This is the most likely reason for failure if `npx cap sync` was not run.
      if (!NotifyBridge) {
        console.error("[OneSignal] Critical Error: The native 'NotifyBridge' plugin was not found. The app cannot communicate with OneSignal.");
        return;
      }

      // --- Handle User Login ---
      if (user && user.email) {
        console.log(`[OneSignal] User is present. Attempting to log in user: ${user.email}`);
        NotifyBridge.login({ externalId: user.email })
          .then(() => {
            console.log(`[OneSignal] Successfully called native login for: ${user.email}`);
          })
          .catch(e => {
            console.error('[OneSignal] Native login call failed:', e);
          });
      } 
      // --- Handle User Logout ---
      else {
        console.log('[OneSignal] User is not present. Attempting to log out.');
        NotifyBridge.logout()
          .then(() => {
            console.log('[OneSignal] Successfully called native logout.');
          })
          .catch(e => {
            console.error('[OneSignal] Native logout call failed:', e);
          });
      }
    };

    // To combat any timing issues with the bridge initializing,
    // we'll wait a moment after the component loads before trying to sync.
    const timer = setTimeout(() => {
      syncUserWithOneSignal();
    }, 500); // Wait 500ms for the native bridge to be ready.

    // Cleanup the timer if the component unmounts
    return () => clearTimeout(timer);

  }, [user]); // This logic re-runs every time the user prop changes.

  // This component does not render anything visible.
  return null;
}