import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Welcome() {
  const navigate = useNavigate();
  const [location, setLocation] = useState("");
  const [isSaving, setIsSaving] = useState(false); // Renamed from isLoading
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [loading, setLoading] = useState(true); // New state for initial loading

  useEffect(() => {
    checkAuth(); // Call the new checkAuth function
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

  const checkAuth = async () => { // Renamed from checkIfAlreadySet
    try {
      const isAuth = await base44.auth.isAuthenticated();
      
      if (isAuth) {
        const currentUser = await base44.auth.me();
        
        
        setUser(currentUser); // Set the user state
        console.log('✅ User authenticated:', currentUser.email);
        console.log('📍 User location:', currentUser.location);
        console.log('✅ Profile setup complete:', currentUser.profile_complete); // Using profile_complete as per outline

        // Navigation logic based on profile and location status
        if (currentUser.profile_complete && currentUser.location) {
          navigate('/Dashboard');
          return; // Stop further execution if navigating
        } else if (currentUser.location) { // User has location but not profile_complete
          navigate('/ProfileSetup');
          return; // Stop further execution if navigating
        }
        // If neither of the above, means user needs to set location (and possibly profile_complete is false or true but location missing)
        // So, component will render the location input form.
        
      } else {
        console.log('❌ User not authenticated, redirecting to login');
        base44.auth.redirectToLogin('/Welcome'); // Redirect to login, then back to Welcome after auth
        return; // Stop further execution if redirecting
      }
    } catch (error) {
      console.error("❌ Error checking user:", error);
      base44.auth.redirectToLogin('/Welcome'); // Redirect on error
    } finally {
      setLoading(false); // Always set loading to false when checkAuth finishes
    }
  };

  const handleLocationSave = async () => { // Renamed from handleSubmit
    if (!location.trim()) {
      toast.error("Please enter your location");
      return;
    }

    setIsSaving(true); // Use isSaving
    try {
      console.log('💾 Saving location:', location.trim());
      
      await base44.auth.updateMe({ 
        location: location.trim()
      });
      
      console.log('✅ Location saved successfully');
      toast.success("Welcome to Happy Plants! 🌿");
      
      // After saving location, the next step is typically ProfileSetup
      // The `checkAuth` logic would have already navigated to Dashboard if profile_complete was also true.
      // So, if we reach this point, profile_complete is likely false or not fully set up.
      // Therefore, navigate to ProfileSetup.
      setTimeout(() => {
        navigate("/ProfileSetup");
      }, 500);
    } catch (error) {
      console.error('❌ Error saving location:', error);
      toast.error("Error saving location: " + (error.message || "Unknown error"));
      setIsSaving(false); // Use isSaving
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

  if (loading) { // Use the new 'loading' state for initial check
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="theme-text text-gray-700 dark:text-gray-300">Loading...</p>
      </div>
    );
  }

  if (!user) return null; // If loading is done but no user, return null (should ideally not happen if auth check redirects)

  return (
    <div className="min-h-screen flex items-center justify-center theme-bg p-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
      {/* Replaced Card with div and applied styles directly */}
      <div className={`max-w-md w-full rounded-3xl p-8 shadow-2xl ${getThemedClasses()}`}>
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🌱</span> {/* Changed icon */}
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${getTextColor()}`}>Welcome to Happy Plants!</h1>
          <p className={`text-sm ${getSecondaryTextColor()}`}>Your free plant care companion</p>
        </div>
        
        <div className="space-y-4"> {/* Updated spacing */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
              Where are you located? {/* Updated label text */}
            </label>
            <div className="relative">
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLocationSave()} // Use new function name
                placeholder="e.g., New York, USA" // Updated placeholder
                className="theme-input w-full"
              />
            </div>
            <p className={`text-xs mt-2 ${getSecondaryTextColor()}`}>
              We use this for weather-based plant care recommendations {/* Updated text */}
            </p>
          </div>
          
          <Button
            onClick={handleLocationSave} // Use new function name
            disabled={!location || isSaving} // Use isSaving and check location validity
            className={`w-full ${getPrimaryButtonClasses()}`} // Use existing button classes logic
          >
            {isSaving ? 'Saving...' : 'Get Started →'}
          </Button>
          
          <p className={`text-xs text-center ${getSecondaryTextColor()}`}>
            Free forever. No subscriptions required.
          </p>
        </div>
      </div>
    </div>
  );
}