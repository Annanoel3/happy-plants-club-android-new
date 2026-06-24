import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";


export default function Feed() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = localStorage.getItem('theme') || 'light';
      setTheme(currentTheme);
    };
    
    handleThemeChange();
    window.addEventListener('storage', handleThemeChange);
    const interval = setInterval(handleThemeChange, 100);
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      clearInterval(interval);
    };
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-black/40 backdrop-blur-md border border-green-700/40';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    if (theme === 'kawaii') return 'bg-white/60 backdrop-blur-md border border-pink-200/50';
    return 'bg-white/60 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical') return 'text-white/80';
    return 'text-gray-600';
  };

  return (
    <div className="min-h-screen theme-bg p-6 flex items-center justify-center">
      <div className="max-w-2xl w-full text-center">
        <Card className={getThemedClasses()}>
          <CardHeader className="pt-12 pb-6">
            <div className="text-6xl mb-4">🌱</div>
            <CardTitle className={`text-4xl mb-4 ${getTextColor()}`}>Community Coming Soon</CardTitle>
            <CardDescription className={`text-lg ${getSecondaryTextColor()}`}>
              We're building an amazing community experience where you can share your gardens, connect with other plant lovers, and get inspired.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-12 space-y-4">
            <p className={`text-base ${getSecondaryTextColor()}`}>
              🚀 <span className="font-semibold">Open Beta</span> — Now available on the Play Store for all users
            </p>
            <p className={`text-base ${getSecondaryTextColor()}`}>
              📖 Coming soon, the Community tab will include:
            </p>
            <ul className={`text-left space-y-2 max-w-sm mx-auto ${getSecondaryTextColor()}`}>
              <li>✨ Share your plants and plant photos</li>
              <li>💬 Connect with other plant enthusiasts</li>
              <li>👥 Find friends and explore their gardens</li>
              <li>🏆 Celebrate milestones together</li>
            </ul>
            <p className={`text-sm pt-4 ${getSecondaryTextColor()}`}>
              Stay tuned! We'll notify you when it's ready to launch.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}