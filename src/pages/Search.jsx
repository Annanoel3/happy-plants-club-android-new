
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search as SearchIcon, User, UserPlus, UserCheck, UserX, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function SearchPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
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

  const { data: followRequests = [] } = useQuery({
    queryKey: ['followRequests', user?.email],
    queryFn: async () => {
      if (!user) return [];
      return await base44.entities.FollowRequest.filter({ 
        target_email: user.email,
        status: 'pending'
      });
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: following = [] } = useQuery({
    queryKey: ['following', user?.email],
    queryFn: async () => {
      if (!user) return [];
      return await base44.entities.Follow.filter({ follower_email: user.email });
    },
    enabled: !!user,
  });

  const { data: followers = [] } = useQuery({
    queryKey: ['followers', user?.email],
    queryFn: async () => {
      if (!user) return [];
      return await base44.entities.Follow.filter({ following_email: user.email });
    },
    enabled: !!user,
  });

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data } = await base44.functions.invoke('searchUsers', {
        query: searchQuery
      });
      setSearchResults(data.users || []);
    } catch (error) {
      toast.error('Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const followMutation = useMutation({
    mutationFn: async (targetEmail) => {
      const targetUsers = await base44.entities.User.filter({ email: targetEmail });
      if (targetUsers.length === 0) return;
      
      const targetUser = targetUsers[0];
      
      if (targetUser.profile_private) {
        await base44.entities.FollowRequest.create({
          requester_email: user.email,
          requester_name: user.full_name,
          requester_handle: user.handle,
          target_email: targetEmail,
          status: 'pending'
        });
        toast.success('Follow request sent!');
      } else {
        await base44.entities.Follow.create({
          follower_email: user.email,
          following_email: targetEmail
        });
        toast.success('Now following!');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['following']);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (targetEmail) => {
      const follows = await base44.entities.Follow.filter({
        follower_email: user.email,
        following_email: targetEmail
      });
      if (follows.length > 0) {
        await base44.entities.Follow.delete(follows[0].id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['following']);
      toast.success('Unfollowed');
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: async (request) => {
      await base44.entities.FollowRequest.update(request.id, { status: 'approved' });
      await base44.entities.Follow.create({
        follower_email: request.requester_email,
        following_email: user.email
      });
      
      await base44.entities.Notification.create({
        user_email: request.requester_email,
        type: 'follow_approved',
        message: `${user.full_name} approved your follow request!`,
        from_user_email: user.email,
        from_user_name: user.full_name,
        from_user_handle: user.handle
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['followRequests']);
      queryClient.invalidateQueries(['followers']);
      toast.success('Request approved!');
    },
  });

  const denyRequestMutation = useMutation({
    mutationFn: async (requestId) => {
      await base44.entities.FollowRequest.update(requestId, { status: 'denied' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['followRequests']);
      toast.success('Request denied');
    },
  });

  const isFollowing = (email) => {
    return following.some(f => f.following_email === email);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg p-3 md:p-6">
      <div className="max-w-2xl mx-auto w-full">
        <div className={`mb-6 rounded-2xl p-4 ${getThemedClasses()}`}>
          <h1 className={`text-3xl md:text-4xl font-bold mb-2 ${getTextColor()}`}>Find Friends</h1>
          <p className={`text-sm md:text-base ${getSecondaryTextColor()}`}>Connect with other plant lovers</p>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-3 px-3 md:mx-0 md:px-0">
          <Button
            onClick={() => setActiveTab('search')}
            variant={activeTab === 'search' ? 'default' : 'outline'}
            size="sm"
            className={`flex-shrink-0 whitespace-nowrap ${activeTab === 'search' ? getPrimaryButtonClasses() : `${getThemedClasses()} ${getTextColor()}`}`}
          >
            <SearchIcon className="w-4 h-4 mr-1" />
            <span className="text-sm">Search</span>
          </Button>
          <Button
            onClick={() => setActiveTab('requests')}
            variant={activeTab === 'requests' ? 'default' : 'outline'}
            size="sm"
            className={`flex-shrink-0 whitespace-nowrap ${activeTab === 'requests' ? getPrimaryButtonClasses() : `${getThemedClasses()} ${getTextColor()}`}`}
          >
            <UserPlus className="w-4 h-4 mr-1" />
            <span className="text-sm">Requests</span>
            {followRequests.length > 0 && (
              <Badge className="ml-1 bg-red-500 text-xs">{followRequests.length}</Badge>
            )}
          </Button>
          <Button
            onClick={() => setActiveTab('followers')}
            variant={activeTab === 'followers' ? 'default' : 'outline'}
            size="sm"
            className={`flex-shrink-0 whitespace-nowrap ${activeTab === 'followers' ? getPrimaryButtonClasses() : `${getThemedClasses()} ${getTextColor()}`}`}
          >
            <Users className="w-4 h-4 mr-1" />
            <span className="text-sm">Followers</span>
          </Button>
        </div>

        {activeTab === 'search' && (
          <>
            <div className="mb-6 flex gap-2 w-full">
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="theme-input flex-1 min-w-0 text-sm"
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                size="icon"
                className={`flex-shrink-0 ${getPrimaryButtonClasses()}`}
              >
                <SearchIcon className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3 w-full">
              {searchResults.map((result) => (
                <Card key={result.id} className={getThemedClasses()}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 w-full">
                      <button
                        onClick={() => navigate(`/Profile?email=${result.email}`)}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarImage src={result.profile_picture} className="object-cover" />
                          <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div className="text-left min-w-0 flex-1">
                          <p className={`font-semibold text-sm truncate ${getTextColor()}`}>{result.full_name}</p>
                          <p className={`text-xs truncate ${getSecondaryTextColor()}`}>@{result.handle}</p>
                        </div>
                      </button>
                      {isFollowing(result.email) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unfollowMutation.mutate(result.email)}
                          className={`flex-shrink-0 h-8 px-2 ${getThemedClasses()} ${getTextColor()}`}
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => followMutation.mutate(result.email)}
                          className={`flex-shrink-0 h-8 px-2 ${getPrimaryButtonClasses()}`}
                        >
                          <UserPlus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!isSearching && searchQuery && searchResults.length === 0 && (
                <Card className={getThemedClasses()}>
                  <CardContent className="p-6 text-center">
                    <p className={getSecondaryTextColor()}>No users found</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-3 w-full">
            {followRequests.length === 0 ? (
              <Card className={getThemedClasses()}>
                <CardContent className="p-6 text-center">
                  <UserPlus className={`w-12 h-12 mx-auto mb-3 ${getSecondaryTextColor()}`} />
                  <p className={getSecondaryTextColor()}>No pending follow requests</p>
                </CardContent>
              </Card>
            ) : (
              followRequests.map((request) => (
                <Card key={request.id} className={getThemedClasses()}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold text-sm truncate ${getTextColor()}`}>{request.requester_name}</p>
                          <p className={`text-xs truncate ${getSecondaryTextColor()}`}>@{request.requester_handle}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          onClick={() => approveRequestMutation.mutate(request)}
                          className={`h-8 px-2 ${getPrimaryButtonClasses()}`}
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => denyRequestMutation.mutate(request.id)}
                          className={`h-8 px-2 ${getThemedClasses()} text-red-600`}
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === 'followers' && (
          <div className="space-y-3 w-full">
            {followers.length === 0 ? (
              <Card className={getThemedClasses()}>
                <CardContent className="p-6 text-center">
                  <Users className={`w-12 h-12 mx-auto mb-3 ${getSecondaryTextColor()}`} />
                  <p className={getSecondaryTextColor()}>No followers yet</p>
                </CardContent>
              </Card>
            ) : (
              followers.map((follower) => (
                <Card key={follower.id} className={getThemedClasses()}>
                  <CardContent className="p-3">
                    <button
                      onClick={() => navigate(`/Profile?email=${follower.follower_email}`)}
                      className="flex items-center gap-2 w-full text-left min-w-0"
                    >
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold text-sm truncate ${getTextColor()}`}>{follower.follower_email}</p>
                      </div>
                    </button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
