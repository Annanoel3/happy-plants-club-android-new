
import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Camera, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Added theme state to dynamically apply styles based on the user's theme preference.
  // Defaulting to 'botanical' for this plant-focused application, but could be loaded from user settings.
  const [theme, setTheme] = useState('botanical'); 

  // --- Theme-related helper functions ---
  // These functions define the styling for different theme elements
  // based on the selected 'theme' state.

  const getBackgroundColor = () => {
    // Defines the background for the main screen container.
    if (theme === 'botanical') return 'bg-gradient-to-br from-green-50 to-emerald-100';
    if (theme === 'kawaii') return 'bg-pink-50';
    if (theme === 'dark') return 'bg-gray-900';
    return 'bg-gray-50'; // Default light theme background
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-green-950/50 backdrop-blur-md border border-green-900/50';
    if (theme === 'kawaii') return 'bg-pink-100/80 backdrop-blur-md border border-pink-200/50';
    if (theme === 'halloween') return 'bg-purple-950/70 backdrop-blur-md border border-purple-900/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    return 'bg-white border border-gray-200 shadow-xl'; // light
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween') return 'text-gray-300';
    return 'text-gray-600';
  };

  const getInputClasses = () => {
      // Defines full styling for input fields (background, border, text, placeholder, focus).
      if (theme === 'dark') return 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-green-500 focus:border-green-500';
      if (theme === 'botanical') return 'bg-green-50 border-green-200 text-green-900 placeholder-green-400 focus:ring-emerald-500 focus:border-emerald-500';
      if (theme === 'kawaii') return 'bg-pink-50 border-pink-200 text-pink-800 placeholder-pink-400 focus:ring-pink-400 focus:border-pink-400';
      return 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'; // Default light theme input style
  };
  // --- End of Theme-related helper functions ---


  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // If profile setup is already complete, redirect to Dashboard
      if (currentUser.profile_setup_complete) {
        navigate('/Dashboard');
        return;
      }
      
      // Generate handle if they don't have one
      if (!currentUser.handle) {
        const { data } = await base44.functions.invoke('generateHandle');
        setHandle(data.handle);
      } else {
        setHandle(currentUser.handle);
      }

      setBio(currentUser.bio || "");
      setProfilePicture(currentUser.profile_picture || "");
      setIsPrivate(currentUser.profile_private || false);
      
      // In a real application, you might load the user's theme preference here
      // if (currentUser.themePreference) {
      //   setTheme(currentUser.themePreference);
      // }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setProfilePicture(file_url);
      toast.success('Profile picture uploaded!');
    } catch (error) {
      toast.error('Failed to upload profile picture');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!handle.trim()) {
      toast.error('Please enter a handle');
      return;
    }

    setIsSaving(true);
    try {
      // Check if handle is taken (if changed)
      if (handle !== user.handle) {
        try {
          const existing = await base44.entities.User.filter({ handle });
          if (existing.length > 0 && existing[0].email !== user.email) {
            toast.error('Handle already taken');
            setIsSaving(false);
            return;
          }
        } catch (error) {
          console.log('Could not check handle uniqueness:', error);
        }
      }

      await base44.auth.updateMe({
        handle,
        bio,
        profile_picture: profilePicture,
        profile_private: isPrivate,
        profile_setup_complete: true
      });

      toast.success('Profile setup complete! 🌿');
      navigate('/Dashboard');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Error saving profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    // Mark profile setup as complete even if skipped
    await base44.auth.updateMe({ profile_setup_complete: true });
    navigate('/Dashboard');
  };

  if (!user) return (
    <div className={`min-h-screen flex items-center justify-center ${getBackgroundColor()}`}>
      <p className={getTextColor()}>Loading...</p>
    </div>
  );

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${getBackgroundColor()}`}>
      <Card className={`max-w-lg w-full ${getThemedClasses()}`}>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className={`text-3xl font-bold mb-2 ${getTextColor()}`}>Setup Your Profile</h1>
            <p className={getSecondaryTextColor()}>Let's personalize your plant journey</p>
          </div>

          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <Avatar className="w-32 h-32">
                  <AvatarImage src={profilePicture} className="object-cover" />
                  <AvatarFallback className="text-4xl bg-green-100">
                    <Sparkles className="w-12 h-12 text-green-600" />
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 bg-green-600 text-white p-2 rounded-full shadow-lg hover:bg-green-700"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureUpload}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Handle</label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${getSecondaryTextColor()}`}>@</span>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.replace(/[^a-z0-9]/g, ''))}
                  placeholder="yourhandle"
                  className={`pl-8 ${getInputClasses()}`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Bio (optional)</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about your plant journey..."
                className={getInputClasses()}
                rows={3}
              />
            </div>

            <div className={`flex items-center justify-between p-4 rounded-xl ${getThemedClasses()}`}>
              <div>
                <p className={`font-medium ${getTextColor()}`}>Private Profile</p>
                <p className={`text-sm ${getSecondaryTextColor()}`}>Require approval for new followers</p>
              </div>
              <button
                onClick={() => setIsPrivate(!isPrivate)}
                className={`w-12 h-6 rounded-full transition-colors ${isPrivate ? 'bg-green-600' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleSkip}
                className="flex-1"
              >
                Skip for Now
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isSaving ? 'Saving...' : 'Complete Setup'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
