
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function Welcome() {
  const navigate = useNavigate();
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null); // New state for user
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    checkIfAlreadySet();
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

  const checkIfAlreadySet = async () => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      
      if (!isAuth) {
        console.log('❌ User not authenticated, redirecting to login');
        base44.auth.redirectToLogin(window.location.pathname);
        return;
      }

      const currentUser = await base44.auth.me();
      setUser(currentUser); // Set the user state

      console.log('✅ User authenticated:', currentUser.email);
      console.log('📍 User location:', currentUser.location);
      console.log('✅ Profile setup complete:', currentUser.profile_setup_complete);
      
      if (currentUser?.location) {
        if (currentUser.profile_setup_complete) {
          navigate("/Dashboard");
        } else {
          navigate("/ProfileSetup");
        }
      }
    } catch (error) {
      console.error("❌ Error checking user:", error);
      base44.auth.redirectToLogin(window.location.pathname);
    }
  };

  const handleSubmit = async () => {
    if (!location.trim()) {
      toast.error("Please enter your location");
      return;
    }

    setIsLoading(true);
    try {
      console.log('💾 Saving location:', location.trim());
      
      await base44.auth.updateMe({ 
        location: location.trim()
      });
      
      console.log('✅ Location saved successfully');
      toast.success("Welcome to Happy Plants! 🌿");
      
      // Wait a moment for the update to propagate
      setTimeout(() => {
        navigate("/ProfileSetup");
      }, 500);
    } catch (error) {
      console.error('❌ Error saving location:', error);
      toast.error("Error saving location: " + (error.message || "Unknown error"));
      setIsLoading(false);
    }
  };

  const getThemedClasses = () => {
    // Dark container themes - adjusted opacity
    if (theme === 'botanical') return 'bg-black/40 backdrop-blur-md border border-green-700/40';
    if (theme === 'christmas') return 'bg-black/40 backdrop-blur-md border border-red-700/50';
    if (theme === 'valentines') return 'bg-black/40 backdrop-blur-md border border-pink-500/30';
    if (theme === 'newyears') return 'bg-black/40 backdrop-blur-md border border-purple-500/30';
    if (theme === 'stpatricks') return 'bg-black/40 backdrop-blur-md border border-green-500/30';
    if (theme === 'fall') return 'bg-black/40 backdrop-blur-md border border-orange-700/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    if (theme === 'halloween') return 'bg-black/40 backdrop-blur-md border border-orange-500/30';
    if (theme === 'fourthofjuly') return 'bg-black/45 backdrop-blur-md border border-red-500/30';
    
    // Light themes
    if (theme === 'kawaii') return 'bg-white/60 backdrop-blur-md border border-pink-200/50';
    if (theme === 'summer') return 'bg-white/60 backdrop-blur-md border border-orange-300/50';
    if (theme === 'spring') return 'bg-white/60 backdrop-blur-md border border-purple-300/50';
    if (theme === 'winter') return 'bg-white/60 backdrop-blur-md border border-blue-300/50';
    return 'bg-white/60 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    // Dark themes - white text
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white';
    // Light themes - dark text
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    // Dark themes - light secondary text
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') return 'text-white/80';
    // Light themes - dark secondary text
    return 'text-gray-600';
  };

  const getPrimaryButtonClasses = () => {
    if (theme === 'botanical') return 'bg-green-700 hover:bg-green-800 text-white';
    if (theme === 'kawaii') return 'bg-pink-500 hover:bg-pink-600 text-white';
    if (theme === 'halloween') return 'bg-orange-600 hover:bg-orange-700 text-white';
    if (theme === 'christmas') return 'bg-red-700 hover:bg-red-800 text-white';
    if (theme === 'valentines') return 'bg-pink-600 hover:bg-pink-700 text-white';
    if (theme === 'newyears') return 'bg-purple-600 hover:bg-purple-700 text-white';
    if (theme === 'stpatricks') return 'bg-green-600 hover:bg-green-700 text-white';
    if (theme === 'fourthofjuly') return 'bg-red-600 hover:bg-red-700 text-white';
    if (theme === 'summer') return 'bg-orange-500 hover:bg-orange-600 text-white';
    if (theme === 'spring') return 'bg-purple-500 hover:bg-purple-600 text-white';
    if (theme === 'fall') return 'bg-orange-600 hover:bg-orange-700 text-white';
    if (theme === 'winter') return 'bg-blue-600 hover:bg-blue-700 text-white';
    if (theme === 'dark') return 'bg-green-600 hover:bg-green-700 text-white';
    return 'bg-green-600 hover:bg-green-700 text-white';
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text text-gray-700 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center theme-bg p-6">
      <Card className={`max-w-md w-full rounded-3xl ${getThemedClasses()}`}>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h1 className={`text-3xl font-bold mb-2 ${getTextColor()}`}>Welcome to Happy Plants!</h1>
            <p className={getSecondaryTextColor()}>Let's personalize your plant care experience</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                Where do your plants live?
              </label>
              <div className="relative">
                <MapPin className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${getSecondaryTextColor()}`} />
                <Input
                  placeholder="e.g., San Francisco, CA or London, UK"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                  className="pl-10"
                />
              </div>
              <p className={`text-xs mt-2 ${getSecondaryTextColor()}`}>
                This helps us give you climate-specific advice for your plants
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className={`w-full ${getPrimaryButtonClasses()}`}
            >
              {isLoading ? "Saving..." : "Get Started"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
