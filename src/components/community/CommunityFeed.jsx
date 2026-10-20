// The full Community feed, restored from before June 24, 2026, when the Base44 builder
// deleted it to make the "Coming soon" screen. Hidden for now: see COMMUNITY_OPEN in
// src/pages/Feed.jsx. Before opening it, see the notes there.
import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Send, Image, Filter, Loader2, Camera, Leaf, Trash2, User, MoreHorizontal, Flag, ShieldX, EyeOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { community } from "@/lib/community";
import ReportSheet from "@/components/community/ReportSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from 'framer-motion';


export default function CommunityFeed() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [newPost, setNewPost] = useState(""); // Changed from newPostContent
  const [uploadedImage, setUploadedImage] = useState(null); // Changed from newPostImage
  const [isUploadingImage, setIsUploadingImage] = useState(false); // Changed from isUploading
  const [selectedPlant, setSelectedPlant] = useState(null); // New state for plant selection
  const [showPlantPicker, setShowPlantPicker] = useState(false); // New state to control plant picker visibility
  const imageInputRef = useRef(null); // New ref for image input
  const [commentInputs, setCommentInputs] = useState({}); // Changed from commentText, object to store comment per post
  const [expandedPost, setExpandedPost] = useState(null); // New state to control expanded comments for a post
  // Removed filter state as it's removed from UI in the outline

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [followingOnly, setFollowingOnly] = useState(false);
  const [sortMode, setSortMode] = useState('friends_first'); // 'friends_first' | 'newest'

  const [reportTarget, setReportTarget] = useState(null);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [currentGif, setCurrentGif] = useState(0);
  
  const easterEggGifs = [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWp5dzh5dGJ4dHFyZGRsMzZyMzJwOGJyZGRsMzZyMzJwOGJy/giphy.gif',
    'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif',
    'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
    'https://media.giphy.com/media/26FmQ6EOvLxp6cWyY/giphy.gif',
  ];

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
      
      // Mark all notifications as dismissed when Feed is visited
      const userNotifications = await base44.entities.Notification.filter({ user_email: currentUser.email, dismissed: false });
      for (const notif of userNotifications) {
        await base44.entities.Notification.update(notif.id, { dismissed: true });
      }
      // Invalidate query to clear the red dot
      queryClient.invalidateQueries(['feedNotifications']);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const parseLocation = (location) => {
    if (!location) return { city: null, state: null, country: null };
    
    const parts = location.split(',').map(p => p.trim());
    
    if (parts.length === 2) {
      return { city: parts[0], state: parts[1], country: null };
    } else if (parts.length === 3) {
      return { city: parts[0], state: parts[1], country: parts[2] };
    }
    
    return { city: null, state: location, country: null };
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
    if (theme === 'dark' || theme === 'botanical' || theme === 'christmas' || theme === 'newyears' || theme === 'stpatricks' || theme === 'valentines' || theme === 'fall' || theme === 'halloween' || theme === 'fourthofjuly') {
      return 'bg-white/10 text-white border-white/20 placeholder:text-white/50';
    }
    // Light themes - light inputs with dark text
    return 'bg-white text-gray-900 border-gray-300';
  };

  const getIconColor = () => {
    // Dark themes need white icons
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall' || theme === 'fourthofjuly') return 'text-white';
    // Light themes need dark icons
    return 'text-gray-700';
  };

  const handleEasterEggClick = () => {
    setShowEasterEgg(true);
    setCurrentGif((prev) => (prev + 1) % easterEggGifs.length);
    setTimeout(() => setShowEasterEgg(false), 3000);
  };

  const { data: following = [] } = useQuery({
    queryKey: ['following', user?.email],
    queryFn: async () => {
      const follows = await base44.entities.Follow.filter({ follower_email: user.email });
      return follows.map(f => f.following_email);
    },
    enabled: !!user,
    initialData: [],
  });

  // Posts, comments, like counts and my likes all come from the community function, which
  // leaves out anything hidden and anyone blocked (either direction).
  const { data: feed } = useQuery({
    queryKey: ['communityFeed', user?.email],
    queryFn: () => community('feed'),
    enabled: !!user,
  });
  const posts = feed?.posts || [];
  const allComments = feed?.comments || {};
  const userLikes = feed?.liked || [];
  const isBanned = !!feed?.me?.banned;
  const refreshFeed = () => queryClient.invalidateQueries({ queryKey: ['communityFeed'] });

  const blockPerson = async (email, name) => {
    try {
      await community('block', { email });
      toast.success(`${name || 'They'} won't see your posts and you won't see theirs. Unblock from their profile.`);
      refreshFeed();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const { data: userPlants = [] } = useQuery({
    queryKey: ['userPlants', user?.email],
    queryFn: () => base44.entities.Plant.filter({ created_by: user.email }),
    enabled: !!user,
    initialData: [],
  });

  const createPostMutation = useMutation({
    // Checked by moderateContent on the server before it's saved (text and photo)
    mutationFn: (postData) => community('post', {
      content: postData.content,
      image_url: postData.image_url,
      plant_id: postData.plant_id,
    }),
    onSuccess: () => {
      refreshFeed();
      setNewPost(""); // Updated state name
      setUploadedImage(null); // Updated state name
      setSelectedPlant(null); // Clear selected plant
      toast.success('Post created!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create post');
    },
  });

  const likeMutation = useMutation({
    // Toggles the like on the server, which also sends the in-app notification and keeps the count right
    mutationFn: ({ postId }) => community('like', { post_id: postId }),
    onMutate: ({ postId, isLiked }) => {
      // Show the heart and count change right away
      queryClient.setQueryData(['communityFeed', user?.email], (old) => old && ({
        ...old,
        liked: isLiked ? old.liked.filter((id) => id !== postId) : [...old.liked, postId],
        posts: old.posts.map((p) => p.id === postId ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) + (isLiked ? -1 : 1)) } : p),
      }));
    },
    onError: (error) => {
      toast.error(error.message);
      refreshFeed();
    },
    onSettled: () => refreshFeed(),
  });

  const commentMutation = useMutation({
    // Checked by moderateContent on the server before it's saved; the server also sends the
    // in-app notification (the push comes from the "Notify on Comment" automation)
    mutationFn: ({ postId, content }) => community('comment', { post_id: postId, content }),
    onSuccess: (data, variables) => {
      refreshFeed();
      setCommentInputs(prev => ({ ...prev, [variables.postId]: "" }));
      toast.success('Comment added!');
    },
    onError: (error) => {
      console.error('Comment mutation error:', error);
      toast.error(error.message || 'Failed to add comment');
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId) => base44.entities.Post.delete(postId),
    onSuccess: () => {
      refreshFeed();
      toast.success('Post deleted successfully!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete post');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId) => base44.entities.Comment.delete(commentId),
    onSuccess: () => {
      refreshFeed();
      toast.success('Comment deleted successfully!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete comment');
    },
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true); // Updated state name
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedImage(file_url); // Updated state name
      toast.success('Image uploaded!');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setIsUploadingImage(false); // Updated state name
    }
  };

  const handleCreatePost = () => {
    console.log('handleCreatePost called', { newPost, uploadedImage });
    if (!newPost.trim() && !uploadedImage) { // Updated state names
      toast.error('Post cannot be empty');
      return;
    }

    console.log('Creating post with:', {
      content: newPost,
      image_url: uploadedImage,
      author_email: user.email,
      author_name: user.full_name,
      plant_id: selectedPlant?.id,
      plant_name: selectedPlant?.nickname || selectedPlant?.name,
    });

    createPostMutation.mutate({
      content: newPost, // Updated state name
      image_url: uploadedImage, // Updated state name
      author_email: user.email,
      author_name: user.full_name,
      plant_id: selectedPlant?.id, // Added plant_id
      plant_name: selectedPlant?.nickname || selectedPlant?.name, // Added plant_name
    });
  };

  const handleLike = (postId) => {
    const isLiked = userLikes.includes(postId); // Updated to use userLikes
    likeMutation.mutate({ postId, isLiked });
  };

  const handleComment = (postId) => {
    const content = commentInputs[postId]; // Updated state name
    if (!content?.trim()) {
      toast.error('Comment cannot be empty');
      return;
    }
    console.log('Submitting comment:', { postId, content });
    commentMutation.mutate({ postId, content });
  };

  // Filter and sort posts: following users' posts first, then optional following-only filter
  const displayedPosts = useMemo(() => { // eslint-disable-line
    let filtered = posts;
    if (followingOnly) {
      filtered = posts.filter(p => following.includes(p.author_email) || p.author_email === user?.email);
    }
    if (sortMode === 'newest') {
      return [...filtered].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    }
    // friends_first: followed users' posts first, then by date
    return [...filtered].sort((a, b) => {
      const aIsFollowed = following.includes(a.author_email) || a.author_email === user?.email;
      const bIsFollowed = following.includes(b.author_email) || b.author_email === user?.email;
      if (aIsFollowed && !bIsFollowed) return -1;
      if (!aIsFollowed && bIsFollowed) return 1;
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [posts, following, followingOnly, sortMode, user?.email]);

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

  // Removed userLocation as filter is removed from UI

  return (
    <div className="min-h-screen theme-bg p-6 pb-24">
      {reportTarget && (
        <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={() => refreshFeed()} />
      )}
      {/* Easter Egg GIF Popup */}
      <AnimatePresence>
        {showEasterEgg && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <img 
              src={easterEggGifs[currentGif]} 
              alt="Celebration" 
              className="max-w-md max-h-96 rounded-2xl shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Darker overlay for specific dark themes */}
      {(theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'valentines' || theme === 'stpatricks' || theme === 'fall') && (
        <div className="fixed inset-0 bg-black/60 -z-10"></div>
      )}
      
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <div className={`mb-8 rounded-2xl p-6 relative ${getThemedClasses()}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className={`text-4xl font-bold mb-1 ${getTextColor()}`}>Community</h1>
                <p className={getSecondaryTextColor()}>Share your plant journey</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortMode(prev => prev === 'friends_first' ? 'newest' : 'friends_first')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${getThemedClasses()} ${getTextColor()}`}
                >
                  {sortMode === 'newest' ? '🕒 Newest' : '👥 Friends first'}
                </button>
                <button
                  onClick={() => setFollowingOnly(prev => !prev)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    followingOnly
                      ? getPrimaryButtonClasses()
                      : `${getThemedClasses()} ${getTextColor()}`
                  }`}
                >
                  <User className="w-4 h-4" />
                  {followingOnly ? 'Following only' : 'Everyone'}
                </button>
              </div>
            </div>
            
            {/* Easter Egg Button */}
            <button
              onClick={handleEasterEggClick}
              className="absolute bottom-2 right-2 text-[8px] opacity-20 hover:opacity-40 transition-opacity"
            >
              🌿
            </button>
          </div>

          {isBanned && (
            <Card className={`mb-6 ${getThemedClasses()}`}>
              <CardContent className="p-6">
                <p className={getTextColor()}>Your Community access has been turned off because of reports about your posts or messages. You can still read the feed.</p>
              </CardContent>
            </Card>
          )}

          <Card className={`mb-6 ${getThemedClasses()} ${isBanned ? 'hidden' : ''}`}>
            <CardContent className="p-6">
              <Textarea
                placeholder="Share something about your plants..."
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                className={`mb-4 ${getInputClasses()}`}
              />
              
              {uploadedImage && (
                <div className="mb-4 relative inline-block">
                  <img src={uploadedImage} alt="Preview" className="h-32 rounded-lg" />
                  <button
                    onClick={() => setUploadedImage(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              )}

              {selectedPlant && (
                <div className={`mb-4 p-3 rounded-lg border flex items-center justify-between ${getThemedClasses()}`}>
                  <span className={getTextColor()}>🪴 {selectedPlant.nickname || selectedPlant.name}</span>
                  <button onClick={() => setSelectedPlant(null)} className="text-red-500">×</button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className={`${getThemedClasses()} ${getIconColor()}`}
                >
                  {isUploadingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPlantPicker(!showPlantPicker)}
                  className={`${getThemedClasses()} ${getIconColor()}`}
                >
                  <Leaf className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleCreatePost}
                  disabled={createPostMutation.isPending || (!newPost.trim() && !uploadedImage)}
                  className={`flex-1 ${getPrimaryButtonClasses()}`}
                >
                  {createPostMutation.isPending ? 'Posting...' : 'Post'}
                </Button>
              </div>

              {showPlantPicker && (
                <div className={`mt-4 p-4 rounded-lg border ${getThemedClasses()}`}>
                  <p className={`text-sm font-semibold mb-2 ${getTextColor()}`}>Choose a plant:</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {userPlants.map(plant => (
                      <button
                        key={plant.id}
                        onClick={() => {
                          setSelectedPlant(plant);
                          setShowPlantPicker(false);
                        }}
                        className={`w-full text-left p-2 rounded hover:bg-opacity-70 ${getThemedClasses()}`}
                      >
                        <span className={getTextColor()}>{plant.nickname || plant.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {displayedPosts.length === 0 ? (
              <Card className={getThemedClasses()}>
                <CardContent className="p-12 text-center">
                  <MessageCircle className={`w-16 h-16 mx-auto mb-4 ${getSecondaryTextColor()}`} />
                  <p className={getSecondaryTextColor()}>{followingOnly ? 'No posts from people you follow yet.' : 'No posts yet. Be the first to share!'}</p>
                </CardContent>
              </Card>
            ) : (
              displayedPosts.map((post) => (
                <Card key={post.id} className={getThemedClasses()}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <button
                        onClick={() => navigate(`/Profile?email=${post.author_email}`)}
                        className="flex items-center gap-3"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={post.author_profile_picture} />
                          <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <p className={`font-semibold ${getTextColor()}`}>{post.author_name}</p>
                          <p className={`text-xs ${getSecondaryTextColor()}`}>
                            {format(parseISO(post.created_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="More options" className={getIconColor()}>
                            <MoreHorizontal className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {post.author_email === user?.email ? (
                            <DropdownMenuItem onClick={() => deletePostMutation.mutate(post.id)} className="text-red-600">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete post
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => setReportTarget({ type: 'post', id: post.id, email: post.author_email, name: post.author_name })}>
                                <Flag className="w-4 h-4 mr-2" /> Report post
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => blockPerson(post.author_email, post.author_name)} className="text-red-600">
                                <ShieldX className="w-4 h-4 mr-2" /> Block {post.author_name || 'this person'}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {post.hidden && (
                      <p className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-red-500">
                        <EyeOff className="w-3 h-3" /> Hidden from everyone ({post.hidden_reason || 'reports'}). Only admins see this.
                      </p>
                    )}

                    <p className={`mb-4 whitespace-pre-wrap ${getTextColor()}`}>{post.content}</p>

                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Post"
                        className="rounded-lg mb-4 max-w-full"
                      />
                    )}

                    {post.plant_name && (
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 ${getThemedClasses()}`}>
                        <Leaf className="w-4 h-4 text-green-600" />
                        <span className={`text-sm ${getTextColor()}`}>{post.plant_name}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-4 border-t theme-border">
                      <button
                        onClick={() => handleLike(post.id)}
                        disabled={likeMutation.isPending}
                        className={`flex items-center gap-2 ${
                          userLikes.includes(post.id) ? 'text-red-500' : getSecondaryTextColor()
                        }`}
                      >
                        <Heart className={`w-5 h-5 ${userLikes.includes(post.id) ? 'fill-current' : ''}`} />
                        <span>{post.likes_count || 0}</span>
                      </button>
                      <button
                        onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                        className={`flex items-center gap-2 ${getSecondaryTextColor()}`}
                      >
                        <MessageCircle className="w-5 h-5" />
                        <span>{allComments[post.id]?.length || 0}</span>
                      </button>
                    </div>

                    {expandedPost === post.id && (
                      <div className="mt-4 space-y-4">
                        <div className="space-y-3">
                          {(allComments[post.id] || []).map((comment) => (
                            <div key={comment.id} className={`p-3 rounded-lg ${getThemedClasses()}`}>
                              <div className="flex items-start justify-between mb-2">
                                <button
                                  onClick={() => navigate(`/Profile?email=${comment.author_email}`)}
                                  className="flex items-center gap-2"
                                >
                                  <Avatar className="w-8 h-8">
                                    <AvatarImage src={comment.author_profile_picture} />
                                    <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                                  </Avatar>
                                  <span className={`font-semibold text-sm ${getTextColor()}`}>
                                    {comment.author_name}
                                  </span>
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label="Comment options" className={`h-7 w-7 ${getIconColor()}`}>
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {comment.author_email === user?.email ? (
                                      <DropdownMenuItem onClick={() => deleteCommentMutation.mutate(comment.id)} className="text-red-600">
                                        <Trash2 className="w-4 h-4 mr-2" /> Delete comment
                                      </DropdownMenuItem>
                                    ) : (
                                      <>
                                        <DropdownMenuItem onClick={() => setReportTarget({ type: 'comment', id: comment.id, email: comment.author_email, name: comment.author_name })}>
                                          <Flag className="w-4 h-4 mr-2" /> Report comment
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => blockPerson(comment.author_email, comment.author_name)} className="text-red-600">
                                          <ShieldX className="w-4 h-4 mr-2" /> Block {comment.author_name || 'this person'}
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              {comment.hidden && <p className="text-xs font-semibold text-red-500 mb-1">Hidden ({comment.hidden_reason || 'reports'}). Only admins see this.</p>}
                              <p className={`text-sm ${getTextColor()}`}>{comment.content}</p>
                            </div>
                          ))}
                        </div>
                        <div className={`flex gap-2 ${isBanned ? 'hidden' : ''}`}>
                          <Input
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) => setCommentInputs({
                              ...commentInputs,
                              [post.id]: e.target.value
                            })}
                            onKeyPress={(e) => e.key === 'Enter' && handleComment(post.id)}
                            className={getInputClasses()}
                          />
                          <Button
                            onClick={() => handleComment(post.id)}
                            disabled={!commentInputs[post.id]?.trim() || commentMutation.isPending}
                            size="icon"
                            className={getPrimaryButtonClasses()}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}