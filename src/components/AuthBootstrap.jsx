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
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      if (window.Capacitor.Plugins.SplashScreen) {
        window.Capacitor.Plugins.SplashScreen.hide();
        console.log("Splash screen hidden by web app.");
      }
    }
  };

  const checkAuth = async () => {
    if (location.pathname === createPageUrl("AuthCallback")) {
      return;
    }

    try {
      await User.me();

      if (location.pathname.includes('/login') || location.pathname.includes('/auth')) {
        navigate(createPageUrl("Home"));
      }
    } catch (error) {
      console.log("User not authenticated, ignoring...");
    }
  };

  return null;
}