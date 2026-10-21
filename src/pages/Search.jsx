import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search as SearchIcon, User, UserPlus, UserCheck, UserX, Users, Clock, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import QuietNote from "@/components/community/QuietNote";
import { community, communityToast, displayName, profilePath } from "@/lib/community";

// Find Friends: search, follow requests and followers. Everything goes through the community
// function (and searchUsers), so people show up by name, @handle and photo, never by email.
// Opens on the Requests tab when there are requests waiting (or with ?tab=requests).
export default function SearchPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const [activeTab, setActiveTab] = useState(['search', 'requests', 'followers'].includes(urlTab) ? urlTab : 'search');
  const pickedTab = useRef(!!urlTab);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => navigate('/'));
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

  const { data: followRequests = [] } = useQuery({
    queryKey: ['followRequests', user?.email],
    queryFn: async () => (await community('people', { list: 'requests' }))?.people || [],
    enabled: !!user,
    refetchInterval: 60000, // the list is also refreshed right after accept/decline
  });

  const { data: followers = [] } = useQuery({
    queryKey: ['followers', user?.email],
    queryFn: async () => (await community('people', { list: 'followers' }))?.people || [],
    enabled: !!user && activeTab === 'followers',
  });

  // The menu's Find Friends badge counts requests: land on them
  useEffect(() => {
    if (!pickedTab.current && followRequests.length > 0) {
      pickedTab.current = true;
      setActiveTab('requests');
    }
  }, [followRequests.length]);

  const pickTab = (tab) => {
    pickedTab.current = true;
    setActiveTab(tab);
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

  const isDarkTheme = theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall';
  const getTextColor = () => (isDarkTheme ? 'text-white' : 'text-gray-900');
  const getSecondaryTextColor = () => (isDarkTheme ? 'text-white/80' : 'text-gray-600');

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
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearched(false);
      if (q) toast('Type at least 2 letters.');
      return;
    }
    setIsSearching(true);
    try {
      const { data } = await base44.functions.invoke('searchUsers', { query: q });
      setSearchResults(data?.users || []);
    } catch {
      toast.error("Search isn't working right now. Please try again.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
      setSearched(true);
    }
  };

  // Follow, request (private profiles), unfollow or cancel a request
  const toggleFollow = async (person) => {
    if (busyId) return;
    setBusyId(person.id);
    try {
      if (person.i_follow || person.requested) {
        await community('unfollow', { user_id: person.id });
        setSearchResults((rows) => rows.map((r) => (r.id === person.id ? { ...r, i_follow: false, requested: false } : r)));
        toast.success(person.i_follow ? 'Unfollowed' : 'Request canceled');
      } else {
        const res = await community('follow', { user_id: person.id });
        const requested = res?.state === 'requested';
        setSearchResults((rows) => rows.map((r) => (r.id === person.id ? { ...r, i_follow: !requested, requested } : r)));
        toast.success(requested ? 'Follow request sent!' : 'Now following!');
      }
      queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
    } catch (e) {
      communityToast(e, navigate);
    } finally {
      setBusyId(null);
    }
  };

  // Approving tells the person who asked (push + note); declining doesn't tell anyone
  const answerRequest = async (request, approve) => {
    if (busyId) return;
    setBusyId(request.request_id);
    try {
      const res = await community(approve ? 'approve' : 'decline', { request_id: request.request_id });
      if (approve && res?.state === 'unavailable') toast("That person isn't available anymore.");
      else toast.success(approve ? 'Request approved!' : 'Request declined');
      queryClient.invalidateQueries({ queryKey: ['followRequests'] });
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
    } catch (e) {
      communityToast(e, navigate);
    } finally {
      setBusyId(null);
    }
  };

  const openProfile = (person) => {
    const path = profilePath(person?.id);
    if (path) navigate(path);
  };

  const PersonLine = ({ person }) => (
    <>
      <Avatar className="w-10 h-10 flex-shrink-0">
        <AvatarImage src={person.photo} className="object-cover" />
        <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
      </Avatar>
      <div className="text-left min-w-0 flex-1">
        <p className={`font-semibold text-sm truncate ${getTextColor()}`}>{displayName(person)}</p>
        {person.handle && person.name !== person.handle && (
          <p className={`text-xs truncate ${getSecondaryTextColor()}`}>@{person.handle}</p>
        )}
      </div>
    </>
  );

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
    <div className="min-h-screen theme-bg p-6 pb-24">
      <div className="max-w-2xl mx-auto w-full">
        <div className={`mb-6 rounded-2xl p-4 ${getThemedClasses()}`}>
          <h1 className={`text-3xl font-bold mb-2 ${getTextColor()}`}>Find Friends</h1>
          <p className={`text-sm ${getSecondaryTextColor()}`}>Connect with other plant lovers</p>
        </div>

        <QuietNote where="friends" className={`mb-6 ${getThemedClasses()}`} textClass={getTextColor()} />

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-3 px-3">
          <Button
            onClick={() => pickTab('search')}
            variant={activeTab === 'search' ? 'default' : 'outline'}
            size="sm"
            className={`flex-shrink-0 whitespace-nowrap ${activeTab === 'search' ? getPrimaryButtonClasses() : `${getThemedClasses()} ${getTextColor()}`}`}
          >
            <SearchIcon className="w-4 h-4 mr-1" />
            <span className="text-sm">Search</span>
          </Button>
          <Button
            onClick={() => pickTab('requests')}
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
            onClick={() => pickTab('followers')}
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
                placeholder="Search by name or @handle"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="theme-input flex-1 min-w-0 text-sm"
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                size="icon"
                aria-label="Search"
                className={`flex-shrink-0 ${getPrimaryButtonClasses()}`}
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
              </Button>
            </div>

            <div className="space-y-3 w-full">
              {searchResults.map((result) => (
                <Card key={result.id} className={getThemedClasses()}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 w-full">
                      <button onClick={() => openProfile(result)} className="flex items-center gap-2 flex-1 min-w-0">
                        <PersonLine person={result} />
                      </button>
                      <Button
                        size="sm"
                        variant={result.i_follow || result.requested ? 'outline' : 'default'}
                        disabled={busyId === result.id}
                        onClick={() => toggleFollow(result)}
                        aria-label={result.i_follow ? 'Unfollow' : result.requested ? 'Cancel request' : result.private ? 'Request to follow' : 'Follow'}
                        className={`flex-shrink-0 h-8 px-2 ${result.i_follow || result.requested ? `${getThemedClasses()} ${getTextColor()}` : getPrimaryButtonClasses()}`}
                      >
                        {busyId === result.id ? <Loader2 className="w-4 h-4 animate-spin" />
                          : result.i_follow ? <UserCheck className="w-4 h-4" />
                          : result.requested ? <><Clock className="w-4 h-4 mr-1" /><span className="text-xs">Requested</span></>
                          : <UserPlus className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!isSearching && searched && searchResults.length === 0 && (
                <Card className={getThemedClasses()}>
                  <CardContent className="p-6 text-center">
                    <p className={getSecondaryTextColor()}>No one found by that name yet.</p>
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
                  <p className={getSecondaryTextColor()}>No follow requests waiting</p>
                </CardContent>
              </Card>
            ) : (
              followRequests.map((request) => (
                <Card key={request.request_id} className={getThemedClasses()}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 w-full">
                      <button onClick={() => openProfile(request)} className="flex items-center gap-2 min-w-0 flex-1">
                        <PersonLine person={request} />
                      </button>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          disabled={busyId === request.request_id}
                          onClick={() => answerRequest(request, true)}
                          aria-label="Approve"
                          className={`h-8 px-2 ${getPrimaryButtonClasses()}`}
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === request.request_id}
                          onClick={() => answerRequest(request, false)}
                          aria-label="Decline"
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
                    <button onClick={() => openProfile(follower)} className="flex items-center gap-2 w-full text-left min-w-0">
                      <PersonLine person={follower} />
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
