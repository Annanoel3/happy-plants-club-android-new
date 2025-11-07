
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Camera, Edit2, MapPin, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

export default function MyProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    const interval = setInterval(handleThemeChange, 100);
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      clearInterval(interval);
    };
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      navigate('/');
    }
  };

  const { data: plants = [] } = useQuery({
    queryKey: ['plants', user?.email],
    queryFn: async () => {
      try {
        return await base44.entities.Plant.filter({ created_by: user.email });
      } catch (err) {
        return [];
      }
    },
    enabled: !!user,
  });

  const { data: followerCount = 0 } = useQuery({
    queryKey: ['followerCount', user?.email],
    queryFn: async () => {
      const follows = await base44.entities.Follow.filter({ following_email: user.email });
      return follows.length;
    },
    enabled: !!user,
  });

  const { data: followingCount = 0 } = useQuery({
    queryKey: ['followingCount', user?.email],
    queryFn: async () => {
      const follows = await base44.entities.Follow.filter({ follower_email: user.email });
      return follows.length;
    },
    enabled: !!user,
  });

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

  const tierEmojis = {
    'New Sprout': '🌱',
    'Green Thumb': '🪴',
    'Gold Thumb': '🏵️',
    'Master Gardener': '🌳',
    'Plant Whisperer': '✨',
    'Legendary Botanist': '👑'
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-6">
      <div className="max-w-2xl mx-auto">
        <Card className={`mb-6 overflow-hidden ${getThemedClasses()}`}>
          <CardContent className="p-0">
            <div className="text-center pt-8 pb-6 px-6">
              <Avatar className="w-32 h-32 mx-auto mb-4 border-4 border-white shadow-xl">
                <AvatarImage src={user.profile_picture} className="object-cover" />
                <AvatarFallback className="text-4xl bg-green-100">
                  <User className="w-16 h-16 text-green-600" />
                </AvatarFallback>
              </Avatar>

              <h2 className={`text-2xl font-bold mb-1 ${getTextColor()}`}>
                {user.full_name}
              </h2>
              <p className={`mb-4 ${getSecondaryTextColor()}`}>@{user.handle}</p>

              <div className="flex justify-center gap-8 mb-4">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${getTextColor()}`}>{plants.length}</p>
                  <p className={`text-sm ${getSecondaryTextColor()}`}>Plants</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl font-bold ${getTextColor()}`}>{followerCount}</p>
                  <p className={`text-sm ${getSecondaryTextColor()}`}>Followers</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl font-bold ${getTextColor()}`}>{followingCount}</p>
                  <p className={`text-sm ${getSecondaryTextColor()}`}>Following</p>
                </div>
              </div>

              {user.bio && (
                <p className={`text-center mb-4 max-w-md mx-auto leading-relaxed ${getTextColor()}`}>
                  {user.bio}
                </p>
              )}

              {user.location && user.location_public && (
                <div className={`flex items-center justify-center gap-2 mb-4 ${getSecondaryTextColor()}`}>
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">{user.location}</span>
                </div>
              )}

              {user.profile_private && (
                <div className={`flex items-center justify-center gap-2 mb-4 ${getSecondaryTextColor()}`}>
                  <Lock className="w-4 h-4" />
                  <span className="text-sm">Private Profile</span>
                </div>
              )}

              <Button
                onClick={() => navigate('/Settings')}
                variant="outline"
                className={`w-full max-w-xs ${getThemedClasses()} ${getTextColor()}`}
                size="lg"
              >
                <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={`mb-6 ${getThemedClasses()}`}>
          <CardContent className="p-6">
            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${getTextColor()}`}>
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Plant Care Stats
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl mb-2">{tierEmojis[user.current_tier || 'New Sprout']}</div>
                <p className={`text-sm font-bold ${getTextColor()}`}>{user.current_tier || 'New Sprout'}</p>
                <p className={`text-xs ${getSecondaryTextColor()}`}>Current Tier</p>
              </div>
              <div>
                <p className={`text-3xl font-bold mb-2 ${getTextColor()}`}>{user.lifetime_waterings || 0}</p>
                <p className={`text-xs ${getSecondaryTextColor()}`}>Plants Watered</p>
              </div>
              <div>
                <p className={`text-3xl font-bold mb-2 ${getTextColor()}`}>{user.total_plant_growths || 0}</p>
                <p className={`text-xs ${getSecondaryTextColor()}`}>Plants Grown</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className={`text-2xl font-bold mb-4 ${getTextColor()}`}>My Garden</h3>
          {plants.length === 0 ? (
            <Card className={getThemedClasses()}>
              <CardContent className="p-12 text-center">
                <p className={getSecondaryTextColor()}>No plants yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {plants.map((plant) => {
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
                  <Card key={plant.id} className={`overflow-hidden hover:shadow-lg transition-shadow ${getThemedClasses()}`}>
                    <CardContent className="p-0">
                      {plant.image_url && (
                        <img src={plant.image_url} alt={displayName} className="w-full h-32 object-cover" />
                      )}
                      <div className="p-3">
                        {plant.nickname && (
                          <p className={`font-bold text-sm mb-1 ${getTextColor()}`}>
                            {plant.nickname}
                          </p>
                        )}
                        <p className={`font-semibold text-sm line-clamp-1 ${getTextColor()}`}>
                          {plant.name}
                        </p>
                        {plant.scientific_name && (
                          <p className={`text-xs italic line-clamp-1 ${getSecondaryTextColor()}`}>
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
      </div>
    </div>
  );
}
