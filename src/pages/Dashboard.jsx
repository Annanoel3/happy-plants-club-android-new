import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Droplets, AlertCircle, Sparkles, Mic, Filter, CheckCircle, Bell, BellOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { differenceInDays, parseISO } from "date-fns";
import DailyWeatherPopup from "@/components/DailyWeatherPopup";
import PullToRefresh from "@/components/PullToRefresh";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });
  const [selectedTags, setSelectedTags] = useState([]);
  const [wateringRemindersEnabled, setWateringRemindersEnabled] = useState(true);

  useEffect(() => {
    checkAuthentication();
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = localStorage.getItem('theme') || 'light';
      setTheme(currentTheme);
      document.documentElement.setAttribute('data-theme', currentTheme);
    };
    
    handleThemeChange();
    window.addEventListener('storage', handleThemeChange);
    const interval = setInterval(handleThemeChange, 100);
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      clearInterval(interval);
    };
  }, []);

  const toggleWateringRemindersMutation = useMutation({
    mutationFn: async (enabled) => {
      await base44.auth.updateMe({ notifications_watering: enabled });
    },
  });

  const handleToggleWateringReminders = () => {
    const newVal = !wateringRemindersEnabled;
    setWateringRemindersEnabled(newVal);
    toggleWateringRemindersMutation.mutate(newVal);
  };

  const checkAuthentication = async () => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      
      if (isAuth) {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        setWateringRemindersEnabled(currentUser?.notifications_watering !== false);
        
        if (!currentUser?.location) {
          navigate('/Welcome');
          return;
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth error:', error);
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const { data: plants, isLoading, error, refetch } = useQuery({
    queryKey: ['plants', user?.email],
    queryFn: async () => {
      try {
        console.log('🌱 Fetching plants for user:', user?.email);
        const result = await base44.entities.Plant.filter({ created_by: user.email });
        console.log('📦 Raw result:', result);
        console.log('📊 Is array?', Array.isArray(result));
        console.log('📏 Length:', Array.isArray(result) ? result.length : 'N/A');
        
        if (!result) {
          console.log('⚠️ No result returned');
          return [];
        }
        if (Array.isArray(result)) {
          console.log('✅ Returning array with', result.length, 'plants');
          return result;
        }
        if (result.data && Array.isArray(result.data)) {
          console.log('✅ Returning result.data with', result.data.length, 'plants');
          return result.data;
        }
        console.log('⚠️ Unknown result format, returning empty array');
        return [];
      } catch (err) {
        console.error("❌ Error fetching plants:", err);
        return [];
      }
    },
    initialData: [],
    enabled: authChecked && !!user && !!user.location,
    retry: 1,
    staleTime: 0,
    refetchOnMount: true,
  });

  console.log('🎨 Dashboard render - plants:', plants);
  console.log('🎨 Dashboard render - isLoading:', isLoading);
  console.log('🎨 Dashboard render - user:', user?.email);
  console.log('🎨 Dashboard render - authChecked:', authChecked);

  const { data: activeEvents = [] } = useQuery({
    queryKey: ['activeEvents', user?.email],
    queryFn: async () => {
      try {
        const result = await base44.entities.GameEvent.filter({ resolved: false });
        return Array.isArray(result) ? result : [];
      } catch (err) {
        console.error("Error fetching events:", err);
        return [];
      }
    },
    initialData: [],
    enabled: authChecked && !!user && !!user.location,
    retry: 1,
  });

  // Check for today's watering reminder
  const { data: todayReminder, refetch: refetchTodayReminder } = useQuery({
    queryKey: ['todayWateringReminder', user?.email],
    queryFn: async () => {
      if (!user?.email) return null; // Ensure user is available before fetching
      const today = new Date().toISOString().split('T')[0];
      const reminders = await base44.entities.DailyWateringReminder.filter({
        user_email: user.email,
        reminder_date: today
      });
      return reminders[0] || null;
    },
    enabled: !!user,
    refetchInterval: 60000, // Check every minute
    staleTime: 0, // Always consider this data stale
  });

  const dismissWateringReminder = async (status) => {
    if (!todayReminder) return;
    
    await base44.entities.DailyWateringReminder.update(todayReminder.id, {
      dismissed: true
    });
    
    // Refetch to update UI
    refetchTodayReminder(); // Use specific refetch for the reminder
    
    if (status === 'done') {
      // Optional: Show a nice message
      const event = new CustomEvent('showToast', { 
        detail: { message: '🌱 Great job watering your plants!', type: 'success' } 
      });
      window.dispatchEvent(event);
    }
  };

  const plantsList = Array.isArray(plants) ? plants : [];
  
  const allTags = useMemo(() => {
    const tagSet = new Set();
    plantsList.forEach(plant => {
      if (plant.tags && Array.isArray(plant.tags)) {
        plant.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [plantsList]);

  const filteredPlants = useMemo(() => {
    if (selectedTags.length === 0) return plantsList;
    
    return plantsList.filter(plant => {
      if (!plant.tags || !Array.isArray(plant.tags)) return false;
      return selectedTags.some(selectedTag => plant.tags.includes(selectedTag));
    });
  }, [plantsList, selectedTags]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const getWateringStatus = (plant) => {
    if (plant?.status === 'wilted') {
      return { status: 'wilted', color: 'bg-red-200 text-red-900', text: 'HELP!', icon: AlertCircle };
    }
    
    if (!plant?.next_watering_due) {
      return { status: 'unknown', color: 'bg-gray-100 text-gray-700', text: 'Not set' };
    }
    
    try {
      const today = new Date();
      const dueDate = parseISO(plant.next_watering_due);
      const daysUntil = differenceInDays(dueDate, today);
      
      const isDarkTheme = theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'stpatricks' || theme === 'summer' || theme === 'fall' || theme === 'winter' || theme === 'dark';
      
      if (daysUntil < 0) {
        return { status: 'overdue', color: 'bg-red-100 text-red-700', text: `${Math.abs(daysUntil)}d overdue`, icon: AlertCircle };
      } else if (daysUntil === 0) {
        return { status: 'today', color: 'bg-orange-100 text-orange-700', text: 'Today', icon: Droplets };
      } else if (daysUntil <= 2) {
        return { status: 'soon', color: isDarkTheme ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-700', text: `${daysUntil}d until watering`, icon: Droplets };
      } else {
        return { status: 'good', color: isDarkTheme ? 'bg-green-700 text-white' : 'bg-green-100 text-green-700', text: `${daysUntil}d until watering`, icon: Droplets };
      }
    } catch (e) {
      return { status: 'unknown', color: 'bg-gray-100 text-gray-700', text: 'Invalid' };
    }
  };

  // Helper functions for theming
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

  const getPlantCardFooterBgClass = () => {
    if (theme === 'botanical') return 'bg-green-950/70';
    if (theme === 'kawaii') return 'bg-pink-100/80';
    if (theme === 'halloween') return 'bg-orange-950/70';
    if (theme === 'dark') return 'bg-gray-900/70';
    if (theme === 'christmas') return 'bg-red-950/70';
    if (theme === 'valentines') return 'bg-pink-100/80';
    if (theme === 'newyears') return 'bg-purple-950/70';
    if (theme === 'stpatricks') return 'bg-green-100/80';
    if (theme === 'fourthofjuly') return 'bg-blue-950/70';
    if (theme === 'summer') return 'bg-orange-100/80';
    if (theme === 'spring') return 'bg-purple-100/80';
    if (theme === 'fall') return 'bg-amber-950/70';
    if (theme === 'winter') return 'bg-blue-100/80';
    return 'bg-white/90'; // light mode
  };

  const getPlantCardTextColor = () => {
    // Dark themes need white text on dark backgrounds
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'fall') return 'text-white';
    // Light themes
    return 'text-gray-900';
  };

  const getPlantCardSecondaryTextColor = () => {
    // Dark themes
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'fall') return 'text-white/90';
    // Light themes
    return 'text-gray-600';
  };

  const getSeasonalThemes = () => {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    
    // Kawaii is always available
    const themes = ['kawaii'];
    
    // January 1-2: New Years
    if (month === 1 && day <= 2) {
      themes.push('newyears');
    }
    // January 3 - February 7: Winter
    else if ((month === 1 && day >= 3) || (month === 2 && day <= 7)) {
      themes.push('winter');
    }
    // February 8-14: Valentine's
    else if (month === 2 && day >= 8 && day <= 14) {
      themes.push('valentines');
    }
    // February 15 - March 16: Winter
    else if ((month === 2 && day >= 15) || (month === 3 && day <= 16)) {
      themes.push('winter');
    }
    // March 17: St. Patrick's
    else if (month === 3 && day === 17) {
      themes.push('stpatricks');
    }
    // March 18 - June 21: Spring
    else if ((month === 3 && day >= 18) || month === 4 || month === 5 || (month === 6 && day <= 21)) {
      themes.push('spring');
    }
    // June 22 - July 3: Summer
    else if ((month === 6 && day >= 22) || (month === 7 && day <= 3)) {
      themes.push('summer');
    }
    // July 4: Fourth of July
    else if (month === 7 && day === 4) {
      themes.push('fourthofjuly');
    }
    // July 5 - August 20: Summer
    else if ((month === 7 && day >= 5) || (month === 8 && day <= 20)) {
      themes.push('summer');
    }
    // August 21 - September 30: Fall
    else if ((month === 8 && day >= 21) || month === 9) {
      themes.push('fall');
    }
    // October 1-31: Halloween
    else if (month === 10) {
      themes.push('halloween');
    }
    // November 1-30: Fall
    else if (month === 11) {
      themes.push('fall');
    }
    // December 1-25: Christmas
    else if (month === 12 && day <= 25) {
      themes.push('christmas');
    }
    // December 26-30: Winter
    else if (month === 12 && day >= 26 && day <= 30) {
      themes.push('winter');
    }
    // December 31 - January 1: New Years
    else if (month === 12 && day === 31) {
      themes.push('newyears');
    }
    
    return themes;
  };

  const cycleSecretTheme = () => {
    const secretThemes = getSeasonalThemes();
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    let nextTheme;
    if (secretThemes.includes(currentTheme)) {
      const currentIndex = secretThemes.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % secretThemes.length;
      nextTheme = secretThemes[nextIndex];
    } else {
      nextTheme = secretThemes[0]; // Default to first available (kawaii or seasonal)
    }
    
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    
    window.dispatchEvent(new Event('storage'));
  };

  const cycleAllThemes = () => {
    const allThemes = [
      'light', 'dark', 'botanical', 'kawaii', 'halloween', 'christmas',
      'valentines', 'newyears', 'stpatricks', 'fourthofjuly', 'summer', 'spring', 'fall', 'winter'
    ];
    const currentTheme = localStorage.getItem('theme') || 'light';
    const currentIndex = allThemes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % allThemes.length;
    const nextTheme = allThemes[nextIndex];
    
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    
    window.dispatchEvent(new Event('storage'));
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text">Loading your garden...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div 
        className="fixed inset-0 flex items-center justify-center theme-bg overflow-hidden"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="text-center max-w-md px-6 w-full">
          <div className={`rounded-3xl p-8 ${getThemedClasses()}`}>
            <div className="w-24 h-24 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <h1 className={`text-3xl font-bold mb-3 ${getTextColor()}`}>Welcome to Happy Plants</h1>
            <p className={`mb-8 ${getSecondaryTextColor()}`}>Please log in to manage your garden</p>
            <button 
              onClick={() => navigate('/Welcome')}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl shadow-lg text-lg"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  console.log('🌿 PlantsList:', plantsList.length, 'plants');
  const eventsList = Array.isArray(activeEvents) ? activeEvents : [];

  const growthEmojis = {
    seedling: '🌱',
    small: '🌿',
    medium: '🪴',
    large: '🌳',
    mature: '🌲'
  };

  const tierEmojis = {
    'New Sprout': '🌱',
    'Green Thumb': '🪴',
    'Gold Thumb': '🏵️',
    'Master Gardener': '🌳',
    'Plant Whisperer': '✨',
    'Legendary Botanist': '👑'
  };

  // Check if there are plants needing water today
  const plantsNeedingWaterToday = plantsList.filter(plant => {
    if (!plant?.next_watering_due) return false;
    const today = new Date().toISOString().split('T')[0];
    return plant.next_watering_due.startsWith(today); // Use startsWith for full date string
  });

  const showWateringReminder = todayReminder && 
                                !todayReminder.dismissed && 
                                plantsNeedingWaterToday.length > 0;

  // Watering status badge styling
  const getStatusBadgeStyle = (status) => {
    if (status === 'overdue' || status === 'wilted') return 'bg-red-500 text-white';
    if (status === 'today') return 'bg-orange-500 text-white';
    if (status === 'soon') return 'bg-amber-400 text-amber-900';
    return 'bg-emerald-500 text-white';
  };

  return (
    <>
      <DailyWeatherPopup />
      <PullToRefresh onRefresh={() => refetch()}>
      <div className="min-h-screen theme-bg pb-28">
        <div className="max-w-6xl mx-auto px-4 pt-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className={`text-xs font-medium uppercase tracking-widest mb-1 ${getSecondaryTextColor()}`}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h1 className={`text-3xl font-bold tracking-tight ${getTextColor()}`}>
                My Garden 🌿
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getThemedClasses()} ${getTextColor()}`}>
                {plantsList.length} plants
              </span>
              <button
                onClick={handleToggleWateringReminders}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  wateringRemindersEnabled
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                    : `${getThemedClasses()} ${getSecondaryTextColor()}`
                }`}
              >
                {wateringRemindersEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            <button 
              onClick={() => navigate('/AddPlant')} 
              className="flex-1 h-13 py-3.5 rounded-2xl flex items-center justify-center text-sm font-bold shadow-lg transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <Plus className="w-4 h-4" /> Add Plant
            </button>
            <button 
              onClick={() => navigate('/VoiceLog')} 
              className={`flex-1 h-13 py-3.5 rounded-2xl flex items-center justify-center text-sm font-bold shadow-md transition-all active:scale-95 gap-2 ${getThemedClasses()} ${getTextColor()}`}
            >
              <Mic className="w-4 h-4" /> Voice Log
            </button>
          </div>

          {/* Watering Reminder Banner */}
          {showWateringReminder && wateringRemindersEnabled && (
            <div className="mb-5 rounded-2xl overflow-hidden shadow-lg border border-blue-400/30 bg-gradient-to-r from-blue-500/20 to-cyan-500/10 backdrop-blur-md">
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Droplets className="w-5 h-5 text-blue-400 animate-bounce" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${getTextColor()}`}>Time to water!</p>
                  <p className={`text-xs ${getSecondaryTextColor()}`}>
                    {plantsNeedingWaterToday.length} {plantsNeedingWaterToday.length === 1 ? 'plant needs' : 'plants need'} water today
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => dismissWateringReminder('done')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold"
                  >
                    Done ✓
                  </button>
                  <button
                    onClick={() => dismissWateringReminder('not_yet')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${getThemedClasses()} ${getTextColor()}`}
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Emergency Alert */}
          {eventsList.length > 0 && (
            <div className="mb-5 rounded-2xl overflow-hidden shadow-lg border border-red-400/40 bg-gradient-to-r from-red-500/20 to-orange-500/10 backdrop-blur-md">
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${getTextColor()}`}>⚠️ Weather Emergency</p>
                  {eventsList.map(event => (
                    <p key={event.id} className={`text-xs ${getSecondaryTextColor()}`}>{event.message}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tags Filter */}
          {allTags.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      selectedTags.includes(tag)
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : `${getThemedClasses()} ${getTextColor()}`
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${getSecondaryTextColor()}`}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Plants Grid */}
          {filteredPlants.length === 0 && selectedTags.length > 0 ? (
            <div className={`text-center py-16 rounded-3xl ${getThemedClasses()}`}>
              <p className={`text-base font-semibold ${getTextColor()}`}>No plants match these tags</p>
              <button onClick={() => setSelectedTags([])} className="mt-3 text-emerald-500 text-sm font-bold">
                Clear Filters
              </button>
            </div>
          ) : plantsList.length === 0 ? (
            <div className={`text-center py-20 rounded-3xl ${getThemedClasses()} px-8`}>
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <Sparkles className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className={`text-2xl font-extrabold mb-2 ${getTextColor()}`}>Start Your Garden</h2>
              <p className={`text-sm mb-6 ${getSecondaryTextColor()}`}>
                Add your first plant using your camera, voice, or by name
              </p>
              <button
                onClick={() => navigate('/AddPlant')}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg"
              >
                <Plus className="w-4 h-4" /> Add Your First Plant
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredPlants.map((plant) => {
                if (!plant || !plant.id) return null;
                
                const wateringStatus = getWateringStatus(plant);
                const needsWaterToday = wateringStatus.status === 'today' || wateringStatus.status === 'overdue' || plant.status === 'wilted';
                const displayName = plant.nickname || plant.name || 'Unknown Plant';
                
                return (
                  <button key={plant.id} onClick={() => navigate(`/PlantDetail?id=${plant.id}`)} className="group text-left">
                    {/* Full-bleed photo card — name lives on the image */}
                    <div className={`relative rounded-3xl overflow-hidden shadow-lg active:scale-95 transition-all duration-200 ${
                      plant.status === 'wilted' ? 'ring-2 ring-red-500' : ''
                    }`} style={{ aspectRatio: '3/4' }}>

                      {/* Photo / placeholder */}
                      {plant.image_url ? (
                        <img
                          src={plant.image_url}
                          alt={displayName}
                          className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${plant.status === 'wilted' ? 'grayscale' : ''}`}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-emerald-900/30 flex items-center justify-center">
                          <span className="text-6xl">🪴</span>
                        </div>
                      )}

                      {/* Strong bottom gradient for text legibility */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Top-right: watering status pill */}
                      {!needsWaterToday && wateringStatus.status !== 'unknown' && (
                        <span className={`absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm ${getStatusBadgeStyle(wateringStatus.status)}`}>
                          {wateringStatus.text}
                        </span>
                      )}

                      {/* Top-left: growth stage */}
                      {plant.growth_stage && (
                        <span className="absolute top-2.5 left-2.5 text-base drop-shadow-md">
                          {growthEmojis[plant.growth_stage]}
                        </span>
                      )}

                      {/* Thirsty overlay */}
                      {needsWaterToday && wateringRemindersEnabled && (
                        <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1">
                          <Droplets className="w-9 h-9 text-white drop-shadow-lg animate-bounce" />
                          <span className="text-white text-xs font-bold tracking-wide drop-shadow-lg">Thirsty!</span>
                        </div>
                      )}

                      {/* Bottom text overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-white font-bold text-sm leading-tight line-clamp-1 drop-shadow-md">
                          {displayName}
                        </h3>
                        {plant.environment && (
                          <p className="text-white/70 text-[10px] mt-0.5 leading-tight">{plant.environment}</p>
                        )}
                        {plant.tags && plant.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {plant.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-medium backdrop-blur-sm">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-10 flex justify-center">
            <button
              onClick={cycleSecretTheme}
              className="text-[10px] opacity-20 hover:opacity-50 transition-opacity theme-text-secondary px-2 py-1"
            >
              don't click this
            </button>
          </div>
        </div>
      </div>
      </PullToRefresh>
    </>
  );
}