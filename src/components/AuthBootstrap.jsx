import { useEffect } from 'react';
import { User } from "@/entities/User"; // This is part of your web app
import { useNavigate, useLocation } from "react-router-dom"; // This is part of your web app
import { createPageUrl } from "@/utils"; // This is part of your web app

// --- We no longer import any Capacitor plugins here ---

export default function AuthBootstrap() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // This function will now run safely in any environment.
    initializeApp();
    checkAuth();
  }, [location.pathname]);

  const initializeApp = () => {
    // Safely check if we are in a Capacitor environment before doing anything.
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      
      // 1. Hide the splash screen
      if (window.Capacitor.Plugins.SplashScreen) {
        window.Capacitor.Plugins.SplashScreen.hide();
        console.log("Splash screen hidden by web app.");
      }

      // 2. Initialize the OneSignal Cordova plugin
      document.addEventListener('deviceready', () => {
        if (window.plugins && window.plugins.OneSignal) {
          window.plugins.OneSignal.setAppId("3f0b6a12-b2d3-4c56-8e76-de9baafc41de");
          console.log("OneSignal Initialized via Cordova plugin.");
        }
      }, false);
    }
  };

  const checkAuth = async () => {
    if (location.pathname === createPageUrl("AuthCallback")) {
      return;
    }

    try {
      const user = await User.me();
    
      // This is the full, correct flow for the native app.
      // These checks ensure this code only runs inside your mobile app.
      if (window.Capacitor && window.Capacitor.isNativePlatform() && user?.email) {
        
        // A. Set the external user ID for OneSignal
        if (window.plugins && window.plugins.OneSignal) {
          window.plugins.OneSignal.setExternalUserId(user.email);
          console.log("[OneSignal] Cordova setExternalUserId call sent for:", user.email);
        }

        // B. Call your custom native plugin to trigger the test reminder
        if (window.Capacitor.Plugins.Notify) {
          await window.Capacitor.Plugins.Notify.sendTestReminder({ email: user.email });
          console.log("[OneSignal] Test reminder sent via native plugin for", user.email);
        }
      }
      
      if (location.pathname.includes('/login') || location.pathname.includes('/auth')) {
        navigate(createPageUrl("Home"));
      }
    } catch (error) {
      console.log("User not authenticated, ignoring...");
    }
  };

  return null;
}