import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, User, UserPlus, UserMinus, Lock, MapPin, Sparkles, ShieldX, Flag, Clock, Loader2 } from "lucide-react";
import { community, communityToast, displayName } from "@/lib/community";
import ReportSheet from "@/components/community/ReportSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Someone's profile: /Profile?id=<userId>. (Old /Profile?email= links only open your own.)
// Everything comes from the community function's 'profile' action, which decides what you may
// see: blocked either way shows nothing, and the garden follows their switches in Settings
// ("Public Garden" off: nobody sees it; "Private Profile" on: only approved followers do).
export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [data, setData] = useState(null); // community('profile') result
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(null); // 'follow' | 'block'
  const [reporting, setReporting] = useState(false);
  const [theme, setTheme] = useState('light');

  const urlParams = new URLSearchParams(window.location.search);
  const profileId = urlParams.get('id');
  const profileEmail = urlParams.get('email'); // your own old links only

  useEffect(() => {
    const currentTheme = document.documentElement.dataset.theme || localStorage.getItem('theme') || 'light';
    setTheme(currentTheme);
  }, []);

  const tierEmojis = {
    'New Sprout': '🌱',
    'Green Thumb': '🪴',
    'Gold Thumb': '🏵️',
    'Master Gardener': '🌳',
    'Plant Whisperer': '✨',
    'Legendary Botanist': '👑'
  };

  const getBackgroundColor = () => "bg-background";

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-green-950/50 backdrop-blur-md border border-green-900/50';
    if (theme === 'kawaii') return 'bg-pink-100/80 backdrop-blur-md border border-pink-200/50';
    if (theme === 'halloween') return 'bg-purple-950/70 backdrop-blur-md border border-purple-900/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    return 'bg-white border border-gray-200'; // light
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween') return 'text-gray-300';
    return 'text-gray-600';
  };

  const load = useCallback(async () => {
    try {
      const args = profileId ? { user_id: profileId } : profileEmail ? { email: profileEmail } : null;
      if (!args) {
        setData({ unavailable: true });
        return;
      }
      setData(await community('profile', args));
    } catch {
      setData({ error: true });
    } finally {
      setIsLoading(false);
    }
  }, [profileId, profileEmail]);

  useEffect(() => { setIsLoading(true); load(); }, [load]);

  const person = data?.person;
  const isOwnProfile = !!data?.is_me;
  const isFollowing = !!data?.i_follow;
  const hasRequested = !!data?.requested;
  const isBlocked = !!data?.i_blocked;
  const name = displayName(person);

  const toggleFollow = async () => {
    if (!person?.id || busy) return;
    setBusy('follow');
    try {
      if (isFollowing || hasRequested) {
        await community('unfollow', { user_id: person.id });
        toast.success(isFollowing ? 'Unfollowed' : 'Request canceled');
      } else {
        const r = await community('follow', { user_id: person.id });
        toast.success(r?.state === 'requested' ? 'Follow request sent!' : 'Now following!');
      }
      queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
      await load();
    } catch (e) {
      communityToast(e, navigate);
    } finally {
      setBusy(null);
    }
  };

  // Blocking also removes follows and follow requests in both directions (on the server)
  const toggleBlock = async () => {
    if (!person?.id || busy) return;
    setBusy('block');
    try {
      if (isBlocked) {
        await community('unblock', { user_id: person.id });
        toast.success('Unblocked');
      } else {
        await community('block', { user_id: person.id });
        toast.success(`${name} is blocked. Unblock anytime from Blocked people in your profile.`);
      }
      queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
      await load();
    } catch (e) {
      communityToast(e, navigate);
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center", getBackgroundColor())}>
        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className={getTextColor()}>Loading profile...</p>
      </div>
    );
  }

  if (!person) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center p-6 text-center", getBackgroundColor())}>
        <p className={cn("font-semibold", getTextColor())}>
          {data?.error ? 'This profile didn’t load. Please try again.' : 'This profile isn’t available.'}
        </p>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
          {data?.error && <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setIsLoading(true); load(); }}>Try again</Button>}
        </div>
      </div>
    );
  }

  const plants = data.plants || [];
  const canViewGarden = !!data.can_see_garden;

  return (
    <div className="min-h-screen theme-bg p-6 pb-24">
      {reporting && (
        <ReportSheet target={{ type: 'user', userId: person.id, name }}
          onClose={() => setReporting(false)} onBlocked={() => load()} />
      )}
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} aria-label="Back" className="mb-6 hover:opacity-70">
          <ArrowLeft className={cn("w-6 h-6", getTextColor())} />
        </button>

        {/* Profile Card */}
        <Card className={cn("mb-6 overflow-hidden", getThemedClasses())}>
          <CardContent className="p-0">
            <div className="text-center pt-8 pb-6 px-6">
              <Avatar className="w-32 h-32 mx-auto mb-4 border-4 border-white shadow-xl">
                <AvatarImage src={person.photo} className="object-cover" />
                <AvatarFallback className="text-4xl bg-green-100">
                  <User className="w-16 h-16 text-green-600" />
                </AvatarFallback>
              </Avatar>

              <h2 className={cn("text-2xl font-bold mb-1", getTextColor())}>{name}</h2>
              {person.handle && person.name !== person.handle && (
                <p className={cn("mb-4", getSecondaryTextColor())}>@{person.handle}</p>
              )}

              <div className="flex justify-center gap-8 mb-4">
                {data.counts?.plants !== null && data.counts?.plants !== undefined && (
                  <div className="text-center">
                    <p className={cn("text-2xl font-bold", getTextColor())}>{data.counts.plants}</p>
                    <p className={cn("text-sm", getSecondaryTextColor())}>Plants</p>
                  </div>
                )}
                <div className="text-center">
                  <p className={cn("text-2xl font-bold", getTextColor())}>{data.counts?.followers || 0}</p>
                  <p className={cn("text-sm", getSecondaryTextColor())}>Followers</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-2xl font-bold", getTextColor())}>{data.counts?.following || 0}</p>
                  <p className={cn("text-sm", getSecondaryTextColor())}>Following</p>
                </div>
              </div>

              {person.bio && (
                <p className={cn("text-center mb-4 max-w-md mx-auto leading-relaxed whitespace-pre-wrap", getTextColor())}>
                  {person.bio}
                </p>
              )}

              {person.location && (
                <div className={cn("flex items-center justify-center gap-2 mb-4", getSecondaryTextColor())}>
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">{person.location}</span>
                </div>
              )}

              {person.private && (
                <div className={cn("flex items-center justify-center gap-2 mb-4", getSecondaryTextColor())}>
                  <Lock className="w-4 h-4" />
                  <span className="text-sm">Private Profile</span>
                </div>
              )}

              {/* Follow + Block + Report */}
              {!isOwnProfile && (
                <div className="flex gap-2 w-full max-w-xs mx-auto">
                  <Button
                    onClick={toggleFollow}
                    disabled={!!busy || isBlocked}
                    className={cn(
                      "flex-1",
                      isFollowing || hasRequested ? "bg-gray-500 hover:bg-gray-600" : "bg-green-600 hover:bg-green-700"
                    )}
                    size="lg"
                  >
                    {busy === 'follow' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isFollowing ? (
                      <><UserMinus className="w-4 h-4 mr-2" /> Unfollow</>
                    ) : hasRequested ? (
                      <><Clock className="w-4 h-4 mr-2" /> Requested</>
                    ) : person.private ? (
                      <><UserPlus className="w-4 h-4 mr-2" /> Request to Follow</>
                    ) : (
                      <><UserPlus className="w-4 h-4 mr-2" /> Follow</>
                    )}
                  </Button>
                  <Button
                    onClick={toggleBlock}
                    disabled={!!busy}
                    variant="outline"
                    size="lg"
                    className={cn(isBlocked ? "border-green-500 text-green-600" : "border-red-400 text-red-500")}
                    title={isBlocked ? "Unblock" : "Block"}
                    aria-label={isBlocked ? "Unblock" : "Block"}
                  >
                    {busy === 'block' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />}
                  </Button>
                  <Button
                    onClick={() => setReporting(true)}
                    variant="outline"
                    size="lg"
                    className="border-gray-300"
                    title="Report"
                    aria-label="Report"
                  >
                    <Flag className={cn("w-4 h-4", getTextColor())} />
                  </Button>
                </div>
              )}
              {hasRequested && !isFollowing && (
                <p className={cn("text-xs mt-2", getSecondaryTextColor())}>Waiting for {name} to approve. Tap Requested to cancel.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {isBlocked && (
          <Card className={cn("mb-6", getThemedClasses())}>
            <CardContent className="p-6 text-center">
              <p className={cn("font-semibold", getTextColor())}>You blocked {name}.</p>
              <p className={cn("text-sm mt-1", getSecondaryTextColor())}>You won’t see each other’s posts or comments. Tap the shield to unblock.</p>
            </CardContent>
          </Card>
        )}

        {/* Stats: only when the garden is visible to you */}
        {canViewGarden && !isBlocked && (
          <Card className={cn("mb-6", getThemedClasses())}>
            <CardContent className="p-6">
              <h3 className={cn("text-lg font-bold mb-4 flex items-center gap-2", getTextColor())}>
                <Sparkles className="w-5 h-5 text-yellow-500" />
                Plant Care Stats
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl mb-2">{tierEmojis[person.tier || 'New Sprout'] || '🌱'}</div>
                  <p className={cn("text-sm font-bold", getTextColor())}>{person.tier || 'New Sprout'}</p>
                  <p className={cn("text-xs", getSecondaryTextColor())}>Current Tier</p>
                </div>
                <div>
                  <p className={cn("text-3xl font-bold mb-2", getTextColor())}>{person.waterings || 0}</p>
                  <p className={cn("text-xs", getSecondaryTextColor())}>Plants Watered</p>
                </div>
                <div>
                  <p className={cn("text-3xl font-bold mb-2", getTextColor())}>{person.growths || 0}</p>
                  <p className={cn("text-xs", getSecondaryTextColor())}>Growth Stages</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Garden */}
        {isBlocked ? null : canViewGarden ? (
          <div>
            <h3 className={cn("text-2xl font-bold mb-4", getTextColor())}>Garden</h3>
            {plants.length === 0 ? (
              <Card className={getThemedClasses()}>
                <CardContent className="p-12 text-center">
                  <p className={getSecondaryTextColor()}>No plants yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {plants.map((plant) => (
                  <Card key={plant.id} className={cn("overflow-hidden", getThemedClasses())}>
                    <CardContent className="p-0">
                      {plant.photo ? (
                        <img src={plant.photo} alt={plant.nickname || plant.name || 'Plant'} loading="lazy" className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center text-4xl bg-green-50">🪴</div>
                      )}
                      <div className="p-3">
                        {plant.nickname && (
                          <p className={cn("font-bold text-sm mb-1 line-clamp-1", getTextColor())}>{plant.nickname}</p>
                        )}
                        {plant.name && (
                          <p className={cn("font-semibold text-sm line-clamp-1", getTextColor())}>{plant.name}</p>
                        )}
                        {plant.scientific_name && (
                          <p className={cn("text-xs italic line-clamp-1", getSecondaryTextColor())}>{plant.scientific_name}</p>
                        )}
                        {plant.type && (
                          <p className={cn("text-xs mt-1", getSecondaryTextColor())}>{plant.type}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Card className={getThemedClasses()}>
            <CardContent className="p-12 text-center">
              <Lock className={cn("w-16 h-16 mx-auto mb-4 opacity-50", getSecondaryTextColor())} />
              {data.garden_note === 'hidden' ? (
                <>
                  <h3 className={cn("text-xl font-semibold mb-2", getTextColor())}>Private Garden</h3>
                  <p className={getSecondaryTextColor()}>{name} keeps their garden to themselves.</p>
                </>
              ) : (
                <>
                  <h3 className={cn("text-xl font-semibold mb-2", getTextColor())}>Private Profile</h3>
                  <p className={getSecondaryTextColor()}>
                    {hasRequested ? `You can see ${name}'s garden once they approve your request.` : `Ask to follow ${name} to see their garden.`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
