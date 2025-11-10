
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User, MapPin, LogOut, Bell, Lock, Eye, FileText, CreditCard, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
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
  const [notificationsWeather, setNotificationsWeather] = useState(true); // New weather notification state

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
      setNotificationsWeather(currentUser?.notifications_weather !== false); // Initialize new weather notification state

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

  // Calculate trial status
  const getTrialStatus = () => {
    if (!user) return null;
    
    if (user.subscription_active) {
      return { status: 'subscribed', message: 'Active Subscription' };
    }
    
    if (!user.trial_start_date) {
      return { status: 'no_trial', message: 'No trial started' };
    }
    
    const now = new Date();
    const trialEnd = new Date(user.trial_end_date);
    const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft > 0) {
      return { status: 'trial', message: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in trial`, daysLeft };
    } else {
      return { status: 'expired', message: 'Trial expired' };
    }
  };

  const trialStatus = getTrialStatus();

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

  const updateLocationMutation = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({ location: location.trim() });
    },
    onSuccess: () => {
      toast.success('Location updated!');
      loadUser();
    },
    onError: () => {
      toast.error('Failed to update location');
    }
  });

  const handleUpdateLocation = () => {
    updateLocationMutation.mutate();
  };

  // Generic mutation for notifications
  const updateNotificationMutation = useMutation({
    mutationFn: async (settings) => {
      await base44.auth.updateMe(settings);
    },
    onSuccess: () => {
      loadUser();
      toast.success('Notification settings updated!');
    },
    onError: () => {
      toast.error('Failed to update notification settings');
    }
  });

  const handleToggleNotification = (key, value) => {
    if (key === 'notifications_watering') setNotificationsWatering(value);
    if (key === 'notifications_reminders') setNotificationsReminders(value);
    if (key === 'notifications_comments') setNotificationsComments(value);
    if (key === 'notifications_follows') setNotificationsFollows(value);
    if (key === 'notifications_weather') setNotificationsWeather(value);
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
    if (!feedbackText.trim()) {
      toast.error('Please enter your feedback');
      return;
    }

    setIsSendingFeedback(true);
    try {
      await base44.integrations.Core.SendEmail({
        to: 'annabairdballew@gmail.com',
        subject: `Happy Plants Feedback from ${user.full_name}`,
        body: `From: ${user.full_name} (${user.email})\n\n${feedbackText}`
      });
      toast.success('Feedback sent! Thank you! 🌿');
      setFeedbackText("");
    } catch (error) {
      toast.error('Failed to send feedback');
    } finally {
      setIsSendingFeedback(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Logout from OneSignal (web)
      await window.OneSignal?.logout();
      
      // Logout from OneSignal (native/Capacitor via legacy function)
      if (window.onNativePushLogout) {
        window.onNativePushLogout();
      }
      
      // Also call the Capacitor bridge directly
      try {
        await window.Capacitor?.Plugins?.NotifyBridge?.logout();
        console.log("✅ Successfully unlinked device from OneSignal");
      } catch (err) {
        console.error("❌ Failed to unlink device from OneSignal", err);
      }
      
      // Perform actual logout from base44
      await base44.auth.logout();
      
      // Reload page to clear state and re-initialize
      window.location.reload();
    } catch (error) {
      console.error("Error logging out:", error);
      toast.error("Failed to logout");
    }
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

        {/* Subscription Status Card */}
        <Card className={`${getThemedClasses()} mb-6`}>
          <CardHeader>
            <CardTitle className={getTextColor()}>
              <CreditCard className="w-5 h-5 inline mr-2" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trialStatus && (
              <div className="space-y-4">
                {trialStatus.status === 'trial' && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className={`font-semibold ${getTextColor()}`}>
                        Free Trial Active
                      </p>
                      <p className={`text-sm ${getSecondaryTextColor()} mt-1`}>
                        {trialStatus.message}
                      </p>
                      <p className={`text-sm ${getSecondaryTextColor()} mt-2`}>
                        After your trial ends, subscription is $5.99/month
                      </p>
                    </div>
                  </div>
                )}
                
                {trialStatus.status === 'subscribed' && (
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className={`font-semibold ${getTextColor()}`}>
                        Premium Subscription
                      </p>
                      <p className={`text-sm ${getSecondaryTextColor()} mt-1`}>
                        $5.99/month
                      </p>
                      {user.subscription_expires_at && (
                        <p className={`text-sm ${getSecondaryTextColor()} mt-1`}>
                          Renews on {new Date(user.subscription_expires_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {trialStatus.status === 'expired' && (
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className={`font-semibold ${getTextColor()}`}>
                        Trial Expired
                      </p>
                      <p className={`text-sm ${getSecondaryTextColor()} mt-1`}>
                        Subscribe to continue using Happy Plants
                      </p>
                      <Button className="mt-3 bg-green-600 hover:bg-green-700 text-white">
                        Subscribe for $5.99/month
                      </Button>
                      <p className={`text-xs ${getSecondaryTextColor()} mt-2`}>
                        Note: Play Store billing integration coming soon
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Manage Subscription Button (for subscribed users) */}
                {trialStatus.status === 'subscribed' && (
                  <Button
                    variant="outline"
                    className={`w-full ${getThemedClasses()}`}
                    onClick={() => {
                      // TODO: Implement Play Store billing management
                      alert('Subscription management through Play Store will be implemented');
                    }}
                  >
                    Manage Subscription
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Profile Settings */}
          <Card className={getThemedClasses()}>
            <CardContent className="p-6">
              <h2 className={`text-2xl font-bold mb-4 ${getTextColor()}`}>Profile Settings</h2>
              
              <div className="space-y-4">
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
                  <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>
                    Used for climate-specific plant advice
                  </p>
                </div>
                <Button
                  onClick={handleUpdateLocation}
                  disabled={updateLocationMutation.isPending}
                  className={getPrimaryButtonClasses()}
                >
                  {updateLocationMutation.isPending ? 'Saving...' : 'Save Location'}
                </Button>

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

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${getTextColor()}`}>Custom Reminders</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Get notified about scheduled tasks</p>
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
                    <p className={`font-medium ${getTextColor()}`}>Daily Weather</p>
                    <p className={`text-sm ${getSecondaryTextColor()}`}>Get daily weather updates for your plants</p>
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
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Share your thoughts, ideas, or report issues..."
                  className={`rounded-lg p-3 w-full min-h-[120px] resize-none ${getInputClasses()}`}
                />
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
                className="w-full"
              >
                Log Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
