import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import PlantdokuEgg from "@/components/PlantdokuEgg";
import CommunityFeed from "@/components/community/CommunityFeed";
import CommunityTerms, { useCommunityTerms } from "@/components/community/CommunityTerms";
import { useGameTheme } from "@/lib/games/common";

// Community: restored Oct 19, 2026, opened Oct 20, 2026 (Anna: "put community back in", with a
// note that it may be quiet while the app grows: see QuietNote). Set to false to show the old
// "Coming soon" screen again. People agree to the community rules the first time they open
// it. Report and Block are in (posts, comments, profiles, messages), and every post,
// comment and message is checked by moderateContent on the server (functions/community).
// The like/comment badge in the menu is on again (Layout.jsx, feedNotifications).
// Closed again the same night: the readiness check found members' emails visible to everyone,
// other people's gardens never loading, and test posts in the feed. Reopen (true; the menu's
// Find Friends and like/comment badge follow this flag) once those are fixed.
export const COMMUNITY_OPEN = false;

export default function Feed() {
  return COMMUNITY_OPEN ? <CommunityGate /> : <ComingSoon />;
}

function CommunityGate() {
  const { state, agree } = useCommunityTerms();
  const { dark } = useGameTheme();
  if (state === 'checking') return <div className="min-h-screen theme-bg" />;
  // The hidden games' egg lives on this screen some days: keep it reachable on the rules screen too
  if (state === 'needed') return <><CommunityTerms onAgree={agree} dark={dark} /><PlantdokuEgg page="community" className="pb-24" /></>;
  return <CommunityFeed />;
}

function ComingSoon() {
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
    window.addEventListener('hp-theme-change', handleThemeChange); // was a 100ms poll
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
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
              We're putting the finishing touches on a place to share your plants with other plant people.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-12 space-y-4">
            <p className={`text-base ${getSecondaryTextColor()}`}>
              📖 When it opens, you'll be able to:
            </p>
            <ul className={`text-left space-y-2 max-w-sm mx-auto ${getSecondaryTextColor()}`}>
              <li>✨ Share photos of your plants</li>
              <li>💬 Like and comment on other people's posts</li>
              <li>👥 Find friends and see their gardens</li>
            </ul>
            <p className={`text-sm pt-4 ${getSecondaryTextColor()}`}>
              Check back soon!
            </p>
            <PlantdokuEgg page="community" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}