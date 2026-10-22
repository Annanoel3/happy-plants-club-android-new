import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User, MapPin, LogOut, Bell, Eye, FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { billingAvailable, isPlusCached } from "@/lib/premium";
import { syncWateringPopups } from "@/lib/wateringPopups";
import { saveLocation } from "@/lib/weather";
import { usePlus } from "@/lib/plus";
import { COMMUNITY_OPEN } from "@/pages/Feed";
import { getPushPermission, requestPushPermission } from "@/components/OneSignalSetup";
import NotificationsOffNote from "@/components/NotificationsOffNote";

const FEEDBACK_MAX = 2000;
const DEFAULT_WEATHER_HOUR = 8; // sendDailyWeather's default: 8 AM local
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [plusReady, setPlusReady] = useState(false);
  const plus = usePlus();
  const [notificationsCare, setNotificationsCare] = useState(true);
  const [notificationsFrost, setNotificationsFrost] = useState(true);
  const [notificationsTips, setNotificationsTips] = useState(true);
  useEffect(() => {
    billingAvailable().then((b) => setPlusReady(!!b.available)).catch(() => {});
    if (isPlusCached()) setPlusReady(true); // subscribers can always reach Manage/Restore
  }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  // New state variables for individual settings
  const [locationPublic, setLocationPublic] = useState(false);
  const [gardenPublic, setGardenPublic] = useState(true);
  const [profilePrivate, setProfilePrivate] = useState(false);

  const [notificationsWatering, setNotificationsWatering] = useState(true);
  const [notificationsReminders, setNotificationsReminders] = useState(true);
  const [notificationsComments, setNotificationsComments] = useState(true);
  const [notificationsFollows, setNotificationsFollows] = useState(true);
  const [notificationsWeather, setNotificationsWeather] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true); // Community engagement notifications
  const [weatherHour, setWeatherHour] = useState(DEFAULT_WEATHER_HOUR); // hour of the day, user's local time
  const [pushPerm, setPushPerm] = useState('unknown'); // can this phone show our notifications?
  const [pushBusy, setPushBusy] = useState(false);

  // Re-check when coming back from the phone's settings
  useEffect(() => {
    const check = () => { getPushPermission().then(setPushPerm).catch(() => {}); };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const handleTurnOnPush = async () => {
    setPushBusy(true);
    try {
      const result = await requestPushPermission();
      setPushPerm(result);
      if (result === 'granted') toast.success('Notifications are on.');
      else if (result === 'denied') toast("To turn them on, go to your phone's Settings > Apps > Happy Plants > Notifications.");
    } finally {
      setPushBusy(false);
    }
  };

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
    window.addEventListener('hp-theme-change', handleThemeChange); // was a 100ms poll
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
    };
  }, []);

  const loadUser = async () => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (!isAuth) {
        navigate('/');
        return;
      }
      
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setLocation(currentUser?.location || "");

      // Initialize individual notification states
      setNotificationsWatering(currentUser?.notifications_watering !== false);
      setNotificationsReminders(currentUser?.notifications_reminders !== false);
      setNotificationsComments(currentUser?.notifications_comments !== false);
      setNotificationsFollows(currentUser?.notifications_follows !== false);
      setNotificationsWeather(currentUser?.notifications_weather !== false);
      setNotificationsEnabled(currentUser?.notifications_enabled !== false);
      setNotificationsCare(currentUser?.notifications_care !== false);
      setNotificationsFrost(currentUser?.notifications_frost !== false);
      setNotificationsTips(currentUser?.notifications_tips !== false);

      // Weather push hour, in the user's own time. Older saves only have the UTC hour.
      const localSaved = Number(currentUser?.weather_local_hour);
      if (currentUser?.weather_local_hour != null && Number.isInteger(localSaved) && localSaved >= 0 && localSaved < 24) {
        setWeatherHour(localSaved);
      } else if (currentUser?.weather_notification_hour !== undefined && currentUser?.weather_notification_hour !== null) {
        const localDate = new Date();
        localDate.setUTCHours(Number(currentUser.weather_notification_hour), 0, 0, 0);
        setWeatherHour(localDate.getHours());
      } else {
        setWeatherHour(DEFAULT_WEATHER_HOUR);
      }

      // Initialize individual privacy states
      setProfilePrivate(currentUser?.profile_private === true);
      setGardenPublic(currentUser?.garden_public !== false);
      setLocationPublic(currentUser?.location_public === true);

    } catch (error) {
      console.error('Error loading user:', error);
      navigate('/');
    } finally {
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

  const getInputClasses = () => {
    // Dark themes - dark inputs with light text
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'stpatricks' || theme === 'valentines' || theme === 'fall') {
      return 'bg-white/10 text-white border-white/20 placeholder:text-white/50';
    }
    // Light themes - light inputs with dark text
    return 'bg-white text-gray-900 border-gray-300';
  };

  // Saves the city and looks it up on the map, so weather is for the right place
  const updateLocationMutation = useMutation({
    mutationFn: async () => saveLocation(location.trim()),
    onSuccess: (r) => {
      if (r?.status === 'ok') toast.success(`📍 ${r.label || 'Location updated!'}`);
      else if (r?.status === 'too_broad') toast(`Saved ${r.label || ''}. Add your city for local weather.`);
      else if (r?.status === 'not_found') toast.error("Saved, but we couldn't find that place on the map. Try “City, State”.");
      else toast.success('Location updated!');
      loadUser();
    },
    onError: () => {
      toast.error('Failed to update location');
    }
  });

  const handleUpdateLocation = () => {
    // An empty location sends the app back to the sign-up screens, so keep the old one
    if (!location.trim()) {
      setLocation(user?.location || "");
      toast.error('Add your city so we can tailor watering to your weather.');
      return;
    }
    updateLocationMutation.mutate();
  };

  // Generic mutation for notifications
  const updateNotificationMutation = useMutation({
    mutationFn: async (settings) => {
      await base44.auth.updateMe(settings);
    },
    onSuccess: (_d, settings) => {
      loadUser();
      // Watering on/off also turns the phone's own watering pop-up on/off
      if (settings && 'notifications_watering' in settings) syncWateringPopups();
      toast.success('Notification settings updated!');
    },
    onError: () => {
      toast.error('Failed to update notification settings');
    }
  });

  const handleSaveWeatherHour = (value) => {
    const localHour = Number(value);
    if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) return;
    setWeatherHour(localHour);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // weather_local_hour is a LOCAL hour: the backend reads it in the user's own
    // time zone (user.timezone), so it stays right across daylight saving.
    // weather_notification_hour (UTC) is still written for the current
    // sendDailyWeather, which reads that one until it switches to the local hour.
    const localDate = new Date();
    localDate.setHours(localHour, 0, 0, 0);
    const patch = { weather_local_hour: localHour, weather_notification_hour: localDate.getUTCHours() };
    if (tz && user?.timezone !== tz) patch.timezone = tz;
    updateNotificationMutation.mutate(patch);
  };

  const handleToggleNotification = (key, value) => {
    if (key === 'notifications_watering') setNotificationsWatering(value);
    if (key === 'notifications_reminders') setNotificationsReminders(value);
    if (key === 'notifications_comments') setNotificationsComments(value);
    if (key === 'notifications_follows') setNotificationsFollows(value);
    if (key === 'notifications_weather') setNotificationsWeather(value);
    if (key === 'notifications_enabled') setNotificationsEnabled(value);
    if (key === 'notifications_care') setNotificationsCare(value);
    if (key === 'notifications_frost') setNotificationsFrost(value);
    if (key === 'notifications_tips') setNotificationsTips(value);
    updateNotificationMutation.mutate({ [key]: value });
  };

  // Generic mutation for privacy
  const updatePrivacyMutation = useMutation({
    mutationFn: async (settings) => {
      await base44.auth.updateMe(settings);
    },
    onSuccess: () => {
      loadUser();
      toast.success('Privacy settings updated!');
    },
    onError: () => {
      toast.error('Failed to update privacy settings');
    }
  });

  const handleTogglePrivacy = (key, value) => {
    if (key === 'profile_private') setProfilePrivate(value);
    if (key === 'garden_public') setGardenPublic(value);
    if (key === 'location_public') setLocationPublic(value);
    updatePrivacyMutation.mutate({ [key]: value });
  };


  const [feedbackText, setFeedbackText] = useState("");
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  const handleSendFeedback = async () => {
    const text = feedbackText.trim();
    if (!text) {
      toast.error('Please write a little something first.');
      return;
    }
    if (text.length > FEEDBACK_MAX) {
      toast.error('Please keep it under 2,000 characters.');
      return;
    }

    setIsSendingFeedback(true);
    try {
      // Sent by the server: a browser SendEmail can't reach our inbox and costs credits
      const res = await base44.functions.invoke('sendFeedback', { kind: 'feedback', message: text });
      const data = res?.data ?? res;
      if (!data?.success) throw new Error('not_sent');
      toast.success('Thanks! We got your feedback. 🌿');
      setFeedbackText("");
    } catch (error) {
      const msg = error?.response?.data?.error;
      toast.error(typeof msg === 'string' && msg ? msg : "Couldn't send your feedback. Please try again later.");
    } finally {
      setIsSendingFeedback(false);
    }
  };

  // base44.auth.logout also unlinks this phone from pushes (see api/base44Client.js)
  const handleLogout = async () => {
    await base44.auth.logout();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen theme-bg p-6 pb-24">
      <div className="max-w-4xl mx-auto">
        <div className={`mb-8 rounded-2xl p-6 inline-block ${getThemedClasses()}`}>
          <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>Settings</h1>
          <p className={getSecondaryTextColor()}>Manage your account and preferences</p>
        </div>

        <div className="space-y-6">
          {/* Happy Plants Plus — only shown once this install can actually buy it */}
          {plusReady && <button
            onClick={() => navigate('/Premium')}
            className="w-full text-left rounded-2xl p-5 text-white bg-gradient-to-br from-green-700 to-emerald-900 shadow flex items-center justify-between gap-4"
          >
            <div>
              <p className="font-bold text-lg">🌿 Happy Plants Plus</p>
              <p className="text-green-50 text-sm">No ads and way more AI. Manage or restore your subscription.</p>
            </div>
            <span className="shrink-0 rounded-full bg-white text-green-800 font-semibold text-sm px-3 py-1.5">Open</span>
          </button>}

          {/* Profile Settings */}
           <Card className={getThemedClasses()}>
             <CardContent className="p-6">
               <h2 className={`text-2xl font-bold mb-4 ${getTextColor()}`}>Profile Settings</h2>

               <div className="space-y-4">
                 <div>
                   <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                     Email
                   </label>
                   <div className={`px-4 py-3 rounded-lg ${getInputClasses()} opacity-60 cursor-not-allowed`}>
                     {user.email}
                   </div>
                   <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>
                     Your email cannot be changed
                   </p>
                 </div>

                 <div>
                   <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                     Location
                   </label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Austin, TX"
                    className={getInputClasses()}
                  />
                  {user.location && user.location === location.trim() && user.location_status === 'ok' && user.location_label ? (
                    <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>📍 Using {user.location_label} for weather</p>
                  ) : user.location && user.location === location.trim() && user.location_status === 'too_broad' ? (
                    <p className="text-xs mt-1 text-amber-600">Using the middle of {user.location_label || user.location}. Add your city for local weather.</p>
                  ) : user.location && user.location === location.trim() && user.location_status === 'not_found' ? (
                    <p className="text-xs mt-1 text-amber-600">We couldn't find this place on the map. Try “City, State” or a ZIP code.</p>
                  ) : (
                    <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>
                      City and state, or a ZIP code. Used for local weather.
                    </p>
                  )}
                  <p className={`text-[10px] mt-1 opacity-70 ${getSecondaryTextColor()}`}>Place search © OpenStreetMap contributors · Weather data from MET Norway</p>
                </div>
                <Button
                  onClick={handleUpdateLocation}
                  disabled={updateLocationMutation.isPending}
                  className={getPrimaryButtonClasses()}
                >
                  {updateLocationMutation.isPending ? 'Saving...' : 'Save Location'}
                </Button>

                {/* Profile privacy only matters while the Community is open */}
                {COMMUNITY_OPEN && (<>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Show Location on Profile
                    </p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Let others see your location</p>
                  </div>
                  <button
                    onClick={() => handleTogglePrivacy('location_public', !locationPublic)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      locationPublic ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        locationPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>
                      <Eye className="w-4 h-4 inline mr-1" />
                      Public Garden
                    </p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Let others see your plants</p>
                  </div>
                  <button
                    onClick={() => handleTogglePrivacy('garden_public', !gardenPublic)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      gardenPublic ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        gardenPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>Private Profile</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Require approval for followers</p>
                  </div>
                  <button
                    onClick={() => handleTogglePrivacy('profile_private', !profilePrivate)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      profilePrivate ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        profilePrivate ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                </>)}
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className={getThemedClasses()}>
            <CardContent className="p-6">
              <h2 className={`text-2xl font-bold mb-4 ${getTextColor()}`}>
                <Bell className="inline w-6 h-6 mr-2" />
                Notifications
              </h2>
              
              <div className="space-y-4">
                {pushPerm === 'denied' && (
                  <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-4">
                    <p className="font-medium text-amber-900">Notifications are off on this phone</p>
                    <p className="text-sm text-amber-800 mt-1">Turn them on so we can remind you to water.</p>
                    <Button
                      onClick={handleTurnOnPush}
                      disabled={pushBusy}
                      className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {pushBusy ? 'Opening...' : 'Turn on notifications'}
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>Watering Reminders</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Get notified when plants need water</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotification('notifications_watering', !notificationsWatering)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      notificationsWatering ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        notificationsWatering ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {notificationsWatering && <NotificationsOffNote popupsOnly />}

                {plus && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${getTextColor()}`}>Plant Care (Plus)</p>
                      <p className={`text-sm ${getSecondaryTextColor()}`}>Fertilize, mist, rotate and repot reminders. One a day at most.</p>
                    </div>
                    <button
                      onClick={() => handleToggleNotification('notifications_care', !notificationsCare)}
                      className={`w-12 h-6 shrink-0 rounded-full transition-colors ${
                        notificationsCare ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full transition-transform ${
                          notificationsCare ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}

                {plus && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${getTextColor()}`}>Frost Alerts (Plus)</p>
                      <p className={`text-sm ${getSecondaryTextColor()}`}>A heads-up around 4 PM when it will freeze tonight and you have outdoor plants.</p>
                    </div>
                    <button
                      onClick={() => handleToggleNotification('notifications_frost', !notificationsFrost)}
                      aria-label="Frost alerts"
                      className={`w-12 h-6 shrink-0 rounded-full transition-colors ${
                        notificationsFrost ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full transition-transform ${
                          notificationsFrost ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>Tips and reminders to come back</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>A short tip now and then, and a nudge if you haven't checked on your plants in a while.</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotification('notifications_tips', !notificationsTips)}
                    aria-label="Tips and reminders to come back"
                    className={`w-12 h-6 shrink-0 rounded-full transition-colors ${
                      notificationsTips ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        notificationsTips ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>Custom Reminders</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Fertilizing, repotting, pruning & other plant care tasks you schedule</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotification('notifications_reminders', !notificationsReminders)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      notificationsReminders ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        notificationsReminders ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Community switches: hidden while the Community is closed */}
                {COMMUNITY_OPEN && (<>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>Comments</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Get notified when someone comments</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotification('notifications_comments', !notificationsComments)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      notificationsComments ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        notificationsComments ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                   <div>
                     <p className={`font-medium ${getTextColor()}`}>Follows</p>
                     <p className={`text-sm ${getSecondaryTextColor()}`}>Get notified about new followers</p>
                   </div>
                   <button
                     onClick={() => handleToggleNotification('notifications_follows', !notificationsFollows)}
                     className={`w-12 h-6 rounded-full transition-colors ${
                       notificationsFollows ? 'bg-green-600' : 'bg-gray-300'
                     }`}
                   >
                     <div
                       className={`w-5 h-5 bg-white rounded-full transition-transform ${
                         notificationsFollows ? 'translate-x-6' : 'translate-x-1'
                       }`}
                     />
                   </button>
                 </div>

                <div className="flex items-center justify-between">
                   <div>
                     <p className={`font-medium ${getTextColor()}`}>Community Engagement</p>
                     <p className={`text-sm ${getSecondaryTextColor()}`}>Likes and comments on your posts</p>
                   </div>
                   <button
                     onClick={() => handleToggleNotification('notifications_enabled', !notificationsEnabled)}
                     className={`w-12 h-6 rounded-full transition-colors ${
                       notificationsEnabled ? 'bg-green-600' : 'bg-gray-300'
                     }`}
                   >
                     <div
                       className={`w-5 h-5 bg-white rounded-full transition-transform ${
                         notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                       }`}
                     />
                   </button>
                 </div>
                </>)}

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>Daily Weather</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Get a push notification with plant weather each morning</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotification('notifications_weather', !notificationsWeather)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      notificationsWeather ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        notificationsWeather ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {notificationsWeather && (
                  <div className={`ml-4 pl-4 border-l-2 border-green-500/30 flex items-center gap-3`}>
                    <div>
                      <p className={`text-sm font-medium ${getTextColor()}`}>Notification Time</p>
                      <p className={`text-xs ${getSecondaryTextColor()}`}>What time should we send it?</p>
                    </div>
                    {/* Whole hours only: the push goes out once an hour */}
                    <select
                      value={weatherHour}
                      onChange={(e) => handleSaveWeatherHour(e.target.value)}
                      aria-label="Daily weather time"
                      className={`rounded-lg px-3 py-2 text-sm border ${getInputClasses()}`}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h} className="text-gray-900">{hourLabel(h)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={`mb-6 ${getThemedClasses()}`}>
            <CardContent className="p-6">
              <h2 className={`text-xl font-bold mb-4 ${getTextColor()}`}>
                <FileText className="inline w-5 h-5 mr-2" />
                Legal
              </h2>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/PrivacyPolicy')}
                  className={`block w-full text-left p-3 rounded-lg hover:bg-white/10 transition-colors ${getTextColor()}`}
                >
                  Privacy Policy
                </button>
                <button
                  onClick={() => navigate('/TermsAndConditions')}
                  className={`block w-full text-left p-3 rounded-lg hover:bg-white/10 transition-colors ${getTextColor()}`}
                >
                  Terms & Conditions
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className={`mb-6 ${getThemedClasses()}`}>
            <CardContent className="p-6">
              <h2 className={`text-xl font-bold mb-4 ${getTextColor()}`}>
                <Bell className="inline w-5 h-5 mr-2" />
                Feedback
              </h2>
              <div>
                <Label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                  Help us improve Happy Plants!
                </Label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value.slice(0, FEEDBACK_MAX))}
                  maxLength={FEEDBACK_MAX}
                  placeholder="Share your thoughts, ideas, or report issues..."
                  className={`rounded-lg p-3 w-full min-h-[120px] resize-none ${getInputClasses()}`}
                />
                {feedbackText.length > FEEDBACK_MAX - 200 && (
                  <p className={`text-xs mt-1 text-right ${getSecondaryTextColor()}`}>{feedbackText.length} / {FEEDBACK_MAX}</p>
                )}
              </div>
              <Button
                onClick={handleSendFeedback}
                disabled={isSendingFeedback}
                className={`${getPrimaryButtonClasses()} w-full mt-4`}
              >
                {isSendingFeedback ? 'Sending...' : 'Send Feedback'}
              </Button>
            </CardContent>
          </Card>

          <Card className={getThemedClasses()}>
            <CardContent className="p-6">
              <h2 className={`text-xl font-bold mb-4 text-red-600`}>
                <LogOut className="inline w-5 h-5 mr-2" />
                Account Actions
              </h2>
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="w-full mb-3"
              >
                Log Out
              </Button>

              <Button 
                variant="outline" 
                className="w-full border-red-500 text-red-500 hover:bg-red-50"
                onClick={() => navigate('/DeleteAccount')}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}