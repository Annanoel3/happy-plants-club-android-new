
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Droplets, AlertCircle, Sparkles, Mic, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, differenceInDays, parseISO } from "date-fns";
import DailyWeatherPopup from "@/components/DailyWeatherPopup";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });
  const [selectedTags, setSelectedTags] = useState([]);

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

  const checkAuthentication = async () => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      
      if (isAuth) {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        
        if (!currentUser?.location) {
          window.location.href = '/Welcome';
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

  const plantsList = Array.isArray(plants) ? plants : [];
  
  const allTags = React.useMemo(() => {
    const tagSet = new Set();
    plantsList.forEach(plant => {
      if (plant.tags && Array.isArray(plant.tags)) {
        plant.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [plantsList]);

  const filteredPlants = React.useMemo(() => {
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
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center max-w-md px-6">
          <div className={`rounded-3xl p-8 ${getThemedClasses()}`}>
            <div className="w-24 h-24 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <h1 className={`text-3xl font-bold mb-3 ${getTextColor()}`}>Welcome to Happy Plants</h1>
            <p className={`mb-8 ${getSecondaryTextColor()}`}>Please log in to manage your garden</p>
            <button 
              onClick={() => base44.auth.redirectToLogin()}
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

  return (
    <>
      <DailyWeatherPopup />
      
      <div className="min-h-screen theme-bg p-6">
        <div className="max-w-6xl mx-auto">
          <div className={`mb-8 rounded-2xl p-6 inline-block ${getThemedClasses()}`}>
            <h1 className={`text-5xl font-bold mb-2 ${getTextColor()}`}>My Garden</h1>
            <p className={`text-lg ${getSecondaryTextColor()}`}>{plantsList.length} happy plants</p>
          </div>

          {eventsList.length > 0 && (
            <div className="mb-6 theme-card border-2 border-red-500 rounded-3xl p-6 shadow-xl animate-pulse">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-red-600 mb-2">⚠️ Weather Emergency!</h3>
                  {eventsList.map(event => (
                    <p key={event.id} className="theme-text mb-2">{event.message}</p>
                  ))}
                  <p className="theme-text-secondary text-sm">Water the affected plants to help them recover!</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mb-8">
            <button 
              onClick={() => navigate('/AddPlant')} 
              className={`flex-1 h-14 rounded-2xl flex items-center justify-center text-lg font-semibold shadow-lg transition-all hover:scale-[1.03] ${
                theme === 'botanical' 
                  ? 'bg-green-800/80 backdrop-blur-md border border-green-600/40 text-white hover:bg-green-700/90' 
                  : theme === 'halloween'
                  ? 'bg-black/70 backdrop-blur-md border border-orange-500/30 text-white hover:bg-black/80'
                  : theme === 'kawaii'
                  ? 'bg-pink-100/80 backdrop-blur-md border border-pink-200/50 text-pink-700 hover:bg-pink-200/90'
                  : theme === 'dark'
                  ? 'bg-white/20 backdrop-blur-md border border-white/20 text-white hover:bg-white/30'
                  : 'bg-[#9ca89f] hover:bg-[#8a9a8d] text-white'
              }`}
            >
              <Plus className="w-5 h-5 mr-2" /> Add Plants
            </button>
            <button 
              onClick={() => navigate('/VoiceLog')} 
              className={`flex-1 h-14 rounded-2xl flex items-center justify-center text-lg font-semibold shadow-lg transition-all hover:scale-[1.03] ${
                theme === 'botanical' 
                  ? 'bg-green-800/80 backdrop-blur-md border border-green-600/40 text-white hover:bg-green-700/90' 
                  : theme === 'halloween'
                  ? 'bg-black/70 backdrop-blur-md border border-orange-500/30 text-white hover:bg-black/80'
                  : theme === 'kawaii'
                  ? 'bg-pink-100/80 backdrop-blur-md border border-pink-200/50 text-pink-700 hover:bg-pink-200/90'
                  : theme === 'dark'
                  ? 'bg-white/20 backdrop-blur-md border border-white/20 text-white hover:bg-white/30'
                  : 'bg-[#9ca89f] hover:bg-[#8a9a8d] text-white'
              }`}
            >
              <Mic className="w-5 h-5 mr-2" /> Quick Log
            </button>
          </div>

          {/* Tags Filter */}
          {allTags.length > 0 && (
            <div className={`mb-6 rounded-2xl p-4 ${getThemedClasses()}`}>
              <div className="flex items-center gap-2 mb-3">
                <Filter className={`w-5 h-5 ${getTextColor()}`} />
                <h3 className={`font-semibold text-base ${getTextColor()}`}>Filter by Tags</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`cursor-pointer transition-all ${
                      selectedTags.includes(tag)
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : theme === 'kawaii'
                        ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                        : theme === 'halloween'
                        ? 'bg-orange-500/20 text-orange-500 hover:bg-orange-500/30'
                        : theme === 'dark' || theme === 'botanical' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'fall'
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {tag}
                  </Badge>
                ))}
                {selectedTags.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedTags([])}
                    className={`h-7 ${
                      theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'fall'
                        ? 'text-white/70 hover:bg-white/10'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {selectedTags.length > 0 && (
                <p className={`text-sm mt-2 ${getSecondaryTextColor()}`}>
                  Showing {filteredPlants.length} of {plantsList.length} plants
                </p>
              )}
            </div>
          )}

          {filteredPlants.length === 0 && selectedTags.length > 0 ? (
            <div className={`text-center py-20 rounded-3xl shadow-xl p-12 ${getThemedClasses()}`}>
              <p className={`text-lg ${getTextColor()}`}>No plants match the selected tags</p>
              <Button
                onClick={() => setSelectedTags([])}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white"
              >
                Clear Filters
              </Button>
            </div>
          ) : plantsList.length === 0 ? (
            <div className={`text-center py-20 rounded-3xl shadow-xl p-12 ${getThemedClasses()}`}>
              <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-16 h-16 text-green-600" />
              </div>
              <h2 className={`text-4xl font-bold mb-4 ${getTextColor()}`}>Start Your Garden</h2>
              <p className={`text-lg mb-8 max-w-md mx-auto ${getSecondaryTextColor()}`}>
                Add your first plant using your camera, voice, or by typing the name
              </p>
              <button onClick={() => navigate('/AddPlant')}>
                <div className="inline-block bg-green-600 hover:bg-green-700 text-white h-14 px-10 rounded-xl text-lg shadow-xl flex items-center">
                  <Plus className="w-6 h-6 mr-2" /> Add Your First Plant
                </div>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredPlants.map((plant) => {
                if (!plant || !plant.id) return null;
                
                const wateringStatus = getWateringStatus(plant);
                const StatusIcon = wateringStatus.icon;
                const needsWaterToday = wateringStatus.status === 'today' || wateringStatus.status === 'overdue' || plant.status === 'wilted';
                
                let displayName = '';
                if (plant.nickname) {
                  displayName = plant.nickname;
                } else {
                  displayName = plant.name || 'Unknown Plant';
                  if (plant.scientific_name) {
                    displayName += ` ${plant.scientific_name}`;
                  }
                  if (plant.hybrid_name) {
                    displayName += ` '${plant.hybrid_name}'`;
                  }
                }
                
                return (
                  <button key={plant.id} onClick={() => navigate(`/PlantDetail?id=${plant.id}`)} className="group text-left">
                    <div className={`theme-card rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.03] border-2 ${
                      plant.status === 'wilted' ? 'border-red-500 animate-pulse' : 'border-transparent hover:border-green-300'
                    }`}>
                      <div className="relative h-48 bg-green-50 overflow-hidden">
                        {plant.image_url ? (
                          <img 
                            src={plant.image_url} 
                            alt={displayName}
                            className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${
                              plant.status === 'wilted' ? 'grayscale' : ''
                            }`}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Droplets className="w-16 h-16 text-green-300" />
                          </div>
                        )}
                        
                        {needsWaterToday && (
                          <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-[2px] flex items-center justify-center">
                            <div className="text-center">
                              <Droplets className="w-16 h-16 text-blue-600 mx-auto mb-2 animate-bounce" />
                              <p className="text-2xl font-bold text-blue-900 drop-shadow-lg">
                                I'm thirsty! 💧
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {StatusIcon && !needsWaterToday && (
                          <Badge className={`absolute top-3 right-3 ${wateringStatus.color} text-xs px-2.5 py-1 shadow-lg font-semibold`}>
                            {wateringStatus.text}
                          </Badge>
                        )}
                      </div>
                      <div className={`p-4 ${getPlantCardFooterBgClass()}`}>
                        <h3 className={`font-bold text-base line-clamp-2 mb-1 ${getPlantCardTextColor()}`}>
                          {displayName}
                        </h3>
                        {plant.environment && (
                          <div className="flex items-center gap-1 mt-2">
                            <span className={`text-xs font-medium ${getPlantCardSecondaryTextColor()}`}>{plant.environment}</span>
                          </div>
                        )}
                        {plant.tags && plant.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {plant.tags.map(tag => (
                              <Badge key={tag} className={`text-xs px-2 py-0.5 rounded-full ${
                                theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'fall'
                                  ? 'bg-white/20 text-white'
                                  : 'bg-gray-200 text-gray-700'
                              }`}>
                                {tag}
                              </Badge>
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

          <div className="mt-8 flex justify-center">
            <button
              onClick={cycleSecretTheme}
              className="text-[10px] opacity-30 hover:opacity-60 transition-opacity theme-text-secondary px-2 py-1"
            >
              don't click this
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
