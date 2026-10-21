import React, { useState, useEffect, useRef } from "react";
import { usePhotoSource } from "@/components/PhotoSourceSheet";
import { asChangeEvent } from "@/lib/photoPicker";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Camera, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { community } from "@/lib/community";

// Profile setup after sign-up, and the profile editor (/ProfileSetup?edit=1, from "Edit
// Profile"). Saving goes through the community function, which checks the handle is free
// and runs the handle, bio and photo through moderateContent before saving.
const BIO_MAX = 300;

export default function ProfileSetup() {
  const navigate = useNavigate();
  const editing = new URLSearchParams(window.location.search).get('edit') === '1';
  const [user, setUser] = useState(null);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const avatarPhoto = usePhotoSource((files) => handleProfilePictureUploadRef.current?.(asChangeEvent(files)), { title: 'Profile picture' });
  const handleProfilePictureUploadRef = useRef(null);
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
    window.addEventListener('hp-theme-change', handleThemeChange); // was a 100ms poll
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
    };
  }, []);

  // --- Theme-related helper functions ---
  const getBackgroundColor = () => {
    if (theme === 'botanical') return 'bg-gradient-to-br from-green-50 to-emerald-100';
    if (theme === 'kawaii') return 'bg-pink-50';
    if (theme === 'dark') return 'bg-gray-900';
    return 'bg-gray-50';
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
      if (theme === 'dark') return 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-green-500 focus:border-green-500';
      if (theme === 'botanical') return 'bg-green-50 border-green-200 text-green-900 placeholder-green-400 focus:ring-emerald-500 focus:border-emerald-500';
      if (theme === 'kawaii') return 'bg-pink-50 border-pink-200 text-pink-800 placeholder-pink-400 focus:ring-pink-400 focus:border-pink-400';
      return 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500';
  };
  // --- End of Theme-related helper functions ---

  const leave = () => {
    if (editing) {
      if (window.history.length > 1) navigate(-1);
      else navigate('/MyProfile');
    } else {
      navigate('/Dashboard');
    }
  };

  const loadUser = async () => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (!isAuth) {
        base44.auth.redirectToLogin(window.location.pathname + window.location.search);
        return;
      }

      const currentUser = await base44.auth.me();

      if (!editing) {
        // New accounts set their location first (Welcome), then come here once
        if (!currentUser.location) {
          navigate('/Welcome');
          return;
        }
        if (currentUser.profile_setup_complete) {
          navigate('/Dashboard');
          return;
        }
      }

      // A starter handle, unique across all accounts (checked on the server)
      let startHandle = currentUser.handle || '';
      if (!startHandle) {
        try {
          const { data } = await base44.functions.invoke('generateHandle');
          startHandle = data?.handle || '';
        } catch {
          startHandle = '';
        }
      }

      setUser(currentUser);
      setHandle(startHandle);
      setBio(currentUser.bio || "");
      setProfilePicture(currentUser.profile_picture || "");
      setIsPrivate(currentUser.profile_private === true);
    } catch {
      base44.auth.redirectToLogin(window.location.pathname + window.location.search);
    }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setProfilePicture(file_url);
    } catch {
      toast.error("That photo didn't upload. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };
  handleProfilePictureUploadRef.current = handleProfilePictureUpload;

  const handleSave = async () => {
    const clean = handle.trim().toLowerCase();
    if (clean.length < 3) {
      toast.error('Pick a handle with at least 3 letters or numbers.');
      return;
    }

    setIsSaving(true);
    try {
      await community('save_profile', {
        handle: clean,
        bio: bio.trim(),
        photo: profilePicture || '',
        private: isPrivate,
        finish: true,
      });
      toast.success(editing ? 'Profile saved! 🌿' : 'Profile setup complete! 🌿');
      // Give the account a moment to update before the next screen reads it
      setTimeout(leave, 400);
    } catch (error) {
      // Friendly reasons from the server: handle taken, rules, or "try again"
      toast.error(error.message || "Your profile didn't save. Please try again.");
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    if (editing) {
      leave();
      return;
    }
    try {
      // Keep the starter handle (it was made unique on the server)
      if (!user?.handle) {
        try { await base44.functions.invoke('generateHandle'); } catch { /* they can set one later */ }
      }
      await base44.auth.updateMe({ profile_setup_complete: true });
      setTimeout(() => navigate('/Dashboard'), 300);
    } catch {
      toast.error("That didn't go through. Please try again.");
    }
  };

  if (!user) return (
    <div className={`min-h-screen flex items-center justify-center ${getBackgroundColor()}`}>
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className={getTextColor()}>Loading...</p>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${getBackgroundColor()}`} style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
      <Card className={`max-w-lg w-full ${getThemedClasses()}`}>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className={`text-3xl font-bold mb-2 ${getTextColor()}`}>{editing ? 'Edit Your Profile' : 'Setup Your Profile'}</h1>
            <p className={getSecondaryTextColor()}>{editing ? 'Your photo, handle and bio are what other plant people see' : "Let's personalize your plant journey"}</p>
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
                  onClick={avatarPhoto.openPicker}
                  aria-label="Change profile picture"
                  disabled={isUploading}
                  className="absolute bottom-0 right-0 bg-green-600 text-white p-2 rounded-full shadow-lg ring-2 ring-white hover:bg-green-700"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                </button>
                {avatarPhoto.sheet}
              </div>
            </div>
            {profilePicture && (
              <div className="text-center -mt-3">
                <button onClick={() => setProfilePicture('')} className={`text-xs underline ${getSecondaryTextColor()}`}>Remove photo</button>
              </div>
            )}

            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Handle</label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${getSecondaryTextColor()}`}>@</span>
                <Input
                  value={handle}
                  // Capital letters become lowercase instead of disappearing
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30))}
                  placeholder="yourhandle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={`pl-8 ${getInputClasses()}`}
                />
              </div>
              <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>Letters and numbers, 3 to 30 long.</p>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Bio (optional)</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                placeholder="Tell us about your plant journey..."
                className={getInputClasses()}
                rows={3}
              />
              <p className={`text-xs mt-1 text-right ${getSecondaryTextColor()}`}>{bio.length}/{BIO_MAX}</p>
            </div>

            <div className={`flex items-center justify-between p-4 rounded-xl ${getThemedClasses()}`}>
              <div>
                <p className={`font-medium ${getTextColor()}`}>Private Profile</p>
                <p className={`text-sm ${getSecondaryTextColor()}`}>Require approval for new followers</p>
              </div>
              <button
                onClick={() => setIsPrivate(!isPrivate)}
                aria-label="Private profile"
                aria-pressed={isPrivate}
                className={`w-12 h-6 rounded-full transition-colors ${isPrivate ? 'bg-green-600' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={isSaving}
                className="flex-1"
              >
                {editing ? 'Cancel' : 'Skip for Now'}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || isUploading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : editing ? 'Save' : 'Complete Setup'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
