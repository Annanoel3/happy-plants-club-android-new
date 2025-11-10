
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, User, UserPlus, UserMinus, Lock, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasRequestedFollow, setHasRequestedFollow] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState('light'); // Added theme state

  const urlParams = new URLSearchParams(window.location.search);
  const profileEmail = urlParams.get('email');

  // Effect to determine the current theme from localStorage or document element
  useEffect(() => {
    // Attempt to read theme from the data-theme attribute on the html element
    // (common for theme providers like Next-themes or custom shadcn setups)
    const currentTheme = document.documentElement.dataset.theme || localStorage.getItem('theme') || 'light';
    setTheme(currentTheme);
  }, []);

  // Define tier emojis
  const tierEmojis = {
    'New Sprout': '🌱',
    'Green Thumb': '🪴',
    'Gold Thumb': '🏵️',
    'Master Gardener': '🌳',
    'Plant Whisperer': '✨',
    'Legendary Botanist': '👑'
  };

  // Helper functions for theme classes
  const getBackgroundColor = () => "bg-background"; // Kept as per original

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

  useEffect(() => {
    if (!profileEmail) {
      toast.error('No user identifier provided');
      navigate('/Search');
      return;
    }
    loadUsers();
  }, [profileEmail]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      const { data } = await base44.functions.invoke('getUserByEmail', { email: profileEmail });
      
      if (data.user) {
        console.log('👤 Profile user loaded:', data.user);
        console.log('📸 Profile picture URL:', data.user.profile_picture);
        setProfileUser(data.user);
      } else {
        toast.error('User not found');
        navigate('/Search');
        return;
      }

      const follows = await base44.entities.Follow.filter({ 
        follower_email: user.email, 
        following_email: profileEmail 
      });
      setIsFollowing(follows.length > 0);

      const requests = await base44.entities.FollowRequest.filter({
        requester_email: user.email,
        target_email: profileEmail,
        status: 'pending'
      });
      setHasRequestedFollow(requests.length > 0);
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
      navigate('/Search');
    } finally {
      setIsLoading(false);
    }
  };

  const isOwnProfile = currentUser?.email === profileEmail;
  // This logic determines if the garden section is viewable.
  // It allows the owner or followers to see a private profile's garden.
  const canViewGarden = !profileUser?.profile_private || isFollowing || isOwnProfile;

  // Modified userPlants query as per outline, ensuring existing privacy logic is maintained
  const { data: userPlants = [], isLoading: plantsLoading } = useQuery({
    queryKey: ['userPlants', profileUser?.email],
    queryFn: async () => {
      if (!profileUser?.email) {
        // This check is implicitly handled by `enabled` condition but harmless.
        console.log('❌ No profile user email provided for plant query.');
        return [];
      }
      try {
        console.log('🌱 Fetching plants for:', profileUser.email);
        // NEW: Filtering plants directly using base44.entities.Plant
        const plants = await base44.entities.Plant.filter({ created_by: profileUser.email });
        console.log('📦 Plants received (filtered):', plants.length || 0);
        return plants;
      } catch (err) {
        console.error("Error fetching user plants:", err);
        return [];
      }
    },
    // Preserve existing `enabled` condition to respect owner/follower viewing private gardens.
    // The outline's `profileUser?.garden_public` might imply a new, stricter privacy field,
    // but without full context, preserving existing functionality by using `canViewGarden` is safer.
    enabled: !!profileUser && canViewGarden,
  });

  const { data: followerCount = 0 } = useQuery({
    queryKey: ['followerCount', profileEmail],
    queryFn: async () => {
      const follows = await base44.entities.Follow.filter({ following_email: profileEmail });
      return follows.length;
    },
    enabled: !!profileUser,
  });

  const { data: followingCount = 0 } = useQuery({
    queryKey: ['followingCount', profileEmail],
    queryFn: async () => {
      const follows = await base44.entities.Follow.filter({ follower_email: profileEmail });
      return follows.length;
    },
    enabled: !!profileUser,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        const follows = await base44.entities.Follow.filter({ 
          follower_email: currentUser.email, 
          following_email: profileEmail 
        });
        if (follows.length > 0) {
          await base44.entities.Follow.delete(follows[0].id);
        }
      } else if (profileUser.profile_private) {
        await base44.entities.FollowRequest.create({
          requester_email: currentUser.email,
          requester_name: currentUser.full_name,
          requester_handle: currentUser.handle,
          target_email: profileEmail,
          status: 'pending'
        });
      } else {
        await base44.entities.Follow.create({
          follower_email: currentUser.email,
          following_email: profileEmail
        });
      }
    },
    onSuccess: () => {
      loadUsers();
      queryClient.invalidateQueries(['followerCount', profileEmail]);
      
      if (isFollowing) {
        toast.success('Unfollowed');
      } else if (profileUser.profile_private) {
        toast.success('Follow request sent!');
      } else {
        toast.success('Now following!');
      }
    },
  });

  if (isLoading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", getBackgroundColor())}>
        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className={getTextColor()}>Loading profile...</p>
      </div>
    );
  }

  if (!profileUser || !currentUser) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", getBackgroundColor())}>
        <p className={getTextColor()}>Profile not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-6 pb-24">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="mb-6 hover:opacity-70">
          <ArrowLeft className={cn("w-6 h-6", getTextColor())} />
        </button>

        {/* Profile Card */}
        <Card className={cn("mb-6 overflow-hidden", getThemedClasses())}>
          <CardContent className="p-0">
            <div className="text-center pt-8 pb-6 px-6">
              {/* Profile Picture */}
              <Avatar className="w-32 h-32 mx-auto mb-4 border-4 border-white shadow-xl">
                <AvatarImage src={profileUser.profile_picture} className="object-cover" />
                <AvatarFallback className="text-4xl bg-green-100">
                  <User className="w-16 h-16 text-green-600" />
                </AvatarFallback>
              </Avatar>

              {/* Name and Handle */}
              <h2 className={cn("text-2xl font-bold mb-1", getTextColor())}>
                {profileUser.full_name}
              </h2>
              <p className={cn("mb-4", getSecondaryTextColor())}>@{profileUser.handle}</p>

              {/* Follower Stats */}
              <div className="flex justify-center gap-8 mb-4">
                <div className="text-center">
                  <p className={cn("text-2xl font-bold", getTextColor())}>{userPlants.length}</p>
                  <p className={cn("text-sm", getSecondaryTextColor())}>Plants</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-2xl font-bold", getTextColor())}>{followerCount}</p>
                  <p className={cn("text-sm", getSecondaryTextColor())}>Followers</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-2xl font-bold", getTextColor())}>{followingCount}</p>
                  <p className={cn("text-sm", getSecondaryTextColor())}>Following</p>
                </div>
              </div>

              {/* Bio */}
              {profileUser.bio && (
                <p className={cn("text-center mb-4 max-w-md mx-auto leading-relaxed", getTextColor())}>
                  {profileUser.bio}
                </p>
              )}

              {/* Location */}
              {profileUser.location && profileUser.location_public && (
                <div className={cn("flex items-center justify-center gap-2 mb-4", getSecondaryTextColor())}>
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">{profileUser.location}</span>
                </div>
              )}

              {/* Private Badge */}
              {profileUser.profile_private && (
                <div className={cn("flex items-center justify-center gap-2 mb-4", getSecondaryTextColor())}>
                  <Lock className="w-4 h-4" />
                  <span className="text-sm">Private Profile</span>
                </div>
              )}

              {/* Follow Button */}
              {!isOwnProfile && (
                <Button
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending || hasRequestedFollow}
                  className={cn(
                    "w-full max-w-xs",
                    isFollowing 
                      ? "bg-gray-500 hover:bg-gray-600" 
                      : "bg-green-600 hover:bg-green-700"
                  )}
                  size="lg"
                >
                  {isFollowing ? (
                    <><UserMinus className="w-4 h-4 mr-2" /> Unfollow</>
                  ) : hasRequestedFollow ? (
                    'Request Pending'
                  ) : profileUser.profile_private ? (
                    <><UserPlus className="w-4 h-4 mr-2" /> Request to Follow</>
                  ) : (
                    <><UserPlus className="w-4 h-4 mr-2" /> Follow</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats Card - Only show if can view garden */}
        {canViewGarden && (
          <Card className={cn("mb-6", getThemedClasses())}>
            <CardContent className="p-6">
              <h3 className={cn("text-lg font-bold mb-4 flex items-center gap-2", getTextColor())}>
                <Sparkles className="w-5 h-5 text-yellow-500" />
                Plant Care Stats
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl mb-2">{tierEmojis[profileUser.current_tier || 'New Sprout']}</div>
                  <p className={cn("text-sm font-bold", getTextColor())}>{profileUser.current_tier || 'New Sprout'}</p>
                  <p className={cn("text-xs", getSecondaryTextColor())}>Current Tier</p>
                </div>
                <div>
                  <p className={cn("text-3xl font-bold mb-2", getTextColor())}>{profileUser.lifetime_waterings || 0}</p>
                  <p className={cn("text-xs", getSecondaryTextColor())}>Plants Watered</p>
                </div>
                <div>
                  <p className={cn("text-3xl font-bold mb-2", getTextColor())}>{profileUser.total_plant_growths || 0}</p>
                  <p className={cn("text-xs", getSecondaryTextColor())}>Plants Grown</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Garden Section */}
        {canViewGarden ? (
          <div>
            <h3 className={cn("text-2xl font-bold mb-4", getTextColor())}>Garden</h3>
            {plantsLoading ? (
               <Card className={getThemedClasses()}>
                 <CardContent className="p-12 text-center">
                   <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                   <p className={getSecondaryTextColor()}>Loading plants...</p>
                 </CardContent>
               </Card>
            ) : userPlants.length === 0 ? (
              <Card className={getThemedClasses()}>
                <CardContent className="p-12 text-center">
                  <p className={getSecondaryTextColor()}>No plants yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {userPlants.map((plant) => {
                  let displayName = '';
                  if (plant.nickname) {
                    displayName = plant.nickname;
                  } else {
                    displayName = plant.name || 'Unknown Plant';
                    if (plant.scientific_name) {
                      displayName += ` (${plant.scientific_name})`;
                    }
                    if (plant.hybrid_name) {
                      displayName += ` '${plant.hybrid_name}'`;
                    }
                  }
                  
                  return (
                    <Card key={plant.id} className={cn("overflow-hidden hover:shadow-lg transition-shadow", getThemedClasses())}>
                      <CardContent className="p-0">
                        {plant.image_url && (
                          <img src={plant.image_url} alt={displayName} className="w-full h-32 object-cover" />
                        )}
                        <div className="p-3">
                          {plant.nickname && (
                            <p className={cn("font-bold text-sm mb-1", getTextColor())}>
                              {plant.nickname}
                            </p>
                          )}
                          <p className={cn("font-semibold text-sm line-clamp-1", getTextColor())}>
                            {plant.name}
                          </p>
                          {plant.scientific_name && (
                            <p className={cn("text-xs italic line-clamp-1", getSecondaryTextColor())}>
                              {plant.scientific_name}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <Card className={getThemedClasses()}>
            <CardContent className="p-12 text-center">
              <Lock className={cn("w-16 h-16 mx-auto mb-4 opacity-50", getSecondaryTextColor())} />
              <h3 className={cn("text-xl font-semibold mb-2", getTextColor())}>Private Profile</h3>
              <p className={getSecondaryTextColor()}>Follow this user to see their garden</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
