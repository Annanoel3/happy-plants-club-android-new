// The full Community feed, restored from before June 24, 2026, when the Base44 builder
// deleted it to make the "Coming soon" screen. Shown when COMMUNITY_OPEN in src/pages/Feed.jsx
// is true. Everything here goes through the community function: people are identified by user
// id (never email), and the server says what's yours ("mine") and what you can delete.
import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Send, Loader2, Camera, Leaf, Trash2, User, MoreHorizontal, Flag, ShieldX, EyeOff } from "lucide-react";
import confetti from "canvas-confetti";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { community, communityToast, displayName, parseServerDate, profilePath } from "@/lib/community";
import ReportSheet from "@/components/community/ReportSheet";
import { usePhotoSource } from "@/components/PhotoSourceSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { motion, AnimatePresence } from 'framer-motion';
import QuietNote from "@/components/community/QuietNote";
import PlantdokuEgg from "@/components/PlantdokuEgg";

// The hidden 🌿 button: a little confetti and a happy line (made on the phone, nothing loaded
// from other sites)
const EGG_LINES = [
  "You found the secret sprout! 🌱",
  "Your plants think you're doing great. 💚",
  "Leaf it to you to find this! 🍃",
  "Photosynthesis party! ☀️🌿",
  "Grow on, plant friend! 🪴",
];

export default function CommunityFeed() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [newPost, setNewPost] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [showPlantPicker, setShowPlantPicker] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [expandedPost, setExpandedPost] = useState(null);

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [followingOnly, setFollowingOnly] = useState(false);
  const [sortMode, setSortMode] = useState('friends_first'); // 'friends_first' | 'newest'

  const [reportTarget, setReportTarget] = useState(null);
  const [eggLine, setEggLine] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: 'post'|'comment', id }

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
      // Opening the feed marks like/comment notices as seen (clears the menu badge). Follow
      // approvals are left alone so their pop-up still shows.
      const unseen = await base44.entities.Notification.filter({ user_email: currentUser.email, dismissed: false });
      await Promise.allSettled((unseen || [])
        .filter((n) => n.type === 'like' || n.type === 'comment')
        .map((n) => base44.entities.Notification.update(n.id, { dismissed: true })));
      queryClient.invalidateQueries({ queryKey: ['feedNotifications'] });
    } catch {
      // not signed in or offline: the feed shows its loading state
    }
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

  const getInputClasses = () => (isDarkTheme
    ? 'bg-white/10 text-white border-white/20 placeholder:text-white/50'
    : 'bg-white text-gray-900 border-gray-300');

  const getIconColor = () => (isDarkTheme ? 'text-white' : 'text-gray-700');

  const handleEasterEggClick = () => {
    setEggLine(EGG_LINES[Math.floor(Math.random() * EGG_LINES.length)]);
    try {
      confetti({
        particleCount: 120,
        spread: 80,
        startVelocity: 38,
        origin: { y: 0.6 },
        colors: ['#16a34a', '#22c55e', '#86efac', '#facc15', '#f472b6'],
        disableForReducedMotion: true,
        zIndex: 400,
      });
    } catch { /* confetti is just for fun */ }
    setTimeout(() => setEggLine(null), 2600);
  };

  // Posts, comments, like counts and my likes all come from the community function, which
  // leaves out anything hidden and anyone blocked (either direction).
  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ['communityFeed', user?.email],
    queryFn: () => community('feed'),
    enabled: !!user,
  });
  const posts = feed?.posts || [];
  const allComments = feed?.comments || {};
  const userLikes = feed?.liked || [];
  const isBanned = !!feed?.me?.banned;
  const isAdmin = !!feed?.me?.admin;
  const refreshFeed = () => queryClient.invalidateQueries({ queryKey: ['communityFeed'] });

  const blockPerson = async (person) => {
    if (!person?.id) return;
    try {
      await community('block', { user_id: person.id });
      toast.success(`${displayName(person)} won't see your posts and you won't see theirs. Unblock anytime from Blocked people in your profile.`);
      refreshFeed();
    } catch (e) {
      communityToast(e, navigate);
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
    mutationFn: (postData) => community('post', postData),
    onSuccess: () => {
      refreshFeed();
      setNewPost("");
      setUploadedImage(null);
      setSelectedPlant(null);
      toast.success('Posted!');
    },
    onError: (error) => communityToast(error, navigate),
  });

  const likeMutation = useMutation({
    // Toggles the like on the server, which also tells the post's owner (once) and keeps the count right
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
      communityToast(error, navigate);
      refreshFeed();
    },
    onSettled: () => refreshFeed(),
  });

  const commentMutation = useMutation({
    // Checked by moderateContent on the server before it's saved; the server also tells the post's owner
    mutationFn: ({ postId, content }) => community('comment', { post_id: postId, content }),
    onSuccess: (data, variables) => {
      refreshFeed();
      setCommentInputs(prev => ({ ...prev, [variables.postId]: "" }));
      toast.success('Comment added!');
    },
    onError: (error) => communityToast(error, navigate),
  });

  // Deleting a post also removes its comments, likes and notices (on the server)
  const deleteMutation = useMutation({
    mutationFn: ({ kind, id }) => (kind === 'post'
      ? community('delete_post', { post_id: id })
      : community('delete_comment', { comment_id: id })),
    onSuccess: (_d, { kind }) => {
      refreshFeed();
      toast.success(kind === 'post' ? 'Post deleted' : 'Comment deleted');
    },
    onError: (error) => communityToast(error, navigate),
    onSettled: () => setConfirmDelete(null),
  });

  // Camera or gallery, like everywhere else in the app
  const uploadPostPhoto = async (file) => {
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedImage(file_url);
    } catch {
      toast.error("That photo didn't upload. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  };
  const postPhoto = usePhotoSource((files) => uploadPostPhoto(files?.[0]), { title: 'Add a photo' });

  const handleCreatePost = () => {
    if (!newPost.trim() && !uploadedImage) {
      toast.error('Write something or add a photo.');
      return;
    }
    createPostMutation.mutate({
      content: newPost,
      image_url: uploadedImage,
      plant_id: selectedPlant?.id,
    });
  };

  const handleLike = (postId) => {
    const isLiked = userLikes.includes(postId);
    likeMutation.mutate({ postId, isLiked });
  };

  const handleComment = (postId) => {
    const content = commentInputs[postId];
    if (!content?.trim()) {
      toast.error('Write a comment first.');
      return;
    }
    commentMutation.mutate({ postId, content });
  };

  const openProfile = (person) => {
    const path = profilePath(person?.id);
    if (path) navigate(path);
  };

  const postDate = (d) => {
    const date = parseServerDate(d);
    return date ? format(date, 'MMM d, yyyy') : '';
  };

  // Followed people's posts first (or only), then newest
  const displayedPosts = useMemo(() => {
    let filtered = posts;
    if (followingOnly) filtered = posts.filter(p => p.followed || p.mine);
    const time = (p) => parseServerDate(p.created_date)?.getTime() || 0;
    if (sortMode === 'newest') return [...filtered].sort((a, b) => time(b) - time(a));
    return [...filtered].sort((a, b) => {
      const aF = a.followed || a.mine;
      const bF = b.followed || b.mine;
      if (aF && !bF) return -1;
      if (!aF && bF) return 1;
      return time(b) - time(a);
    });
  }, [posts, followingOnly, sortMode]);

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
      {reportTarget && (
        <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={() => refreshFeed()} />
      )}
      {postPhoto.sheet}

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDelete?.kind === 'post' ? 'Delete this post?' : 'Delete this comment?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === 'post'
                ? 'Its comments and likes will be deleted too. This can’t be undone.'
                : 'This can’t be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (confirmDelete) deleteMutation.mutate(confirmDelete); }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Easter egg: confetti and a happy line */}
      <AnimatePresence>
        {eggLine && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="fixed inset-x-0 top-1/3 z-50 flex justify-center px-6 pointer-events-none"
          >
            <p className="rounded-2xl bg-green-600 text-white text-lg font-bold px-6 py-4 shadow-2xl text-center">{eggLine}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Darker overlay for specific dark themes */}
      {isDarkTheme && (
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
              aria-label="A little surprise"
              className="absolute bottom-2 right-2 text-[8px] opacity-20 hover:opacity-40 transition-opacity"
            >
              🌿
            </button>
          </div>

          <QuietNote where="feed" className={`mb-6 ${getThemedClasses()}`} textClass={getTextColor()} />

          {isBanned && (
            <Card className={`mb-6 ${getThemedClasses()}`}>
              <CardContent className="p-6">
                <p className={getTextColor()}>Your Community access has been turned off because of reports about your posts or comments. You can still read the feed.</p>
              </CardContent>
            </Card>
          )}

          <Card className={`mb-6 ${getThemedClasses()} ${isBanned ? 'hidden' : ''}`}>
            <CardContent className="p-6">
              <Textarea
                placeholder="Share something about your plants..."
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                maxLength={2000}
                className={`mb-4 ${getInputClasses()}`}
              />
              
              {uploadedImage && (
                <div className="mb-4 relative inline-block">
                  <img src={uploadedImage} alt="Your photo" className="h-32 rounded-lg" />
                  <button
                    onClick={() => setUploadedImage(null)}
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              )}

              {selectedPlant && (
                <div className={`mb-4 p-3 rounded-lg border flex items-center justify-between ${getThemedClasses()}`}>
                  <span className={getTextColor()}>🪴 {selectedPlant.nickname || selectedPlant.name}</span>
                  <button onClick={() => setSelectedPlant(null)} aria-label="Remove plant" className="text-red-500">×</button>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Add a photo"
                  onClick={postPhoto.openPicker}
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
                  aria-label="Tag one of your plants"
                  onClick={() => setShowPlantPicker(!showPlantPicker)}
                  className={`${getThemedClasses()} ${getIconColor()}`}
                >
                  <Leaf className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleCreatePost}
                  disabled={createPostMutation.isPending || isUploadingImage || (!newPost.trim() && !uploadedImage)}
                  className={`flex-1 ${getPrimaryButtonClasses()}`}
                >
                  {createPostMutation.isPending ? 'Posting...' : 'Post'}
                </Button>
              </div>

              {showPlantPicker && (
                <div className={`mt-4 p-4 rounded-lg border ${getThemedClasses()}`}>
                  {userPlants.length === 0 ? (
                    <p className={`text-sm ${getSecondaryTextColor()}`}>You don't have any plants yet.</p>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {feedLoading ? (
              <div className="flex justify-center py-12"><Loader2 className={`w-6 h-6 animate-spin ${getTextColor()}`} /></div>
            ) : displayedPosts.length === 0 ? (
              <Card className={getThemedClasses()}>
                <CardContent className="p-12 text-center">
                  <MessageCircle className={`w-16 h-16 mx-auto mb-4 ${getSecondaryTextColor()}`} />
                  <p className={getSecondaryTextColor()}>{followingOnly ? 'No posts from people you follow yet.' : "No posts yet. You could be the very first! Share a photo of a plant you're proud of."}</p>
                </CardContent>
              </Card>
            ) : (
              displayedPosts.map((post) => (
                <Card key={post.id} className={getThemedClasses()}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <button
                        onClick={() => openProfile(post.author)}
                        className="flex items-center gap-3 min-w-0"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={post.author?.photo} />
                          <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div className="text-left min-w-0">
                          <p className={`font-semibold truncate ${getTextColor()}`}>{displayName(post.author)}</p>
                          <p className={`text-xs ${getSecondaryTextColor()}`}>{postDate(post.created_date)}</p>
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="More options" className={getIconColor()}>
                            <MoreHorizontal className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(post.mine || isAdmin) && (
                            <DropdownMenuItem onClick={() => setConfirmDelete({ kind: 'post', id: post.id })} className="text-red-600">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete post
                            </DropdownMenuItem>
                          )}
                          {!post.mine && (
                            <>
                              <DropdownMenuItem onClick={() => setReportTarget({ type: 'post', id: post.id, userId: post.author?.id, name: displayName(post.author) })}>
                                <Flag className="w-4 h-4 mr-2" /> Report post
                              </DropdownMenuItem>
                              {post.author?.id && (
                                <DropdownMenuItem onClick={() => blockPerson(post.author)} className="text-red-600">
                                  <ShieldX className="w-4 h-4 mr-2" /> Block {displayName(post.author)}
                                </DropdownMenuItem>
                              )}
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

                    {post.content && <p className={`mb-4 whitespace-pre-wrap ${getTextColor()}`}>{post.content}</p>}

                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Post photo"
                        loading="lazy"
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
                        disabled={likeMutation.isPending || isBanned}
                        aria-label={userLikes.includes(post.id) ? 'Unlike' : 'Like'}
                        className={`flex items-center gap-2 ${
                          userLikes.includes(post.id) ? 'text-red-500' : getSecondaryTextColor()
                        }`}
                      >
                        <Heart className={`w-5 h-5 ${userLikes.includes(post.id) ? 'fill-current' : ''}`} />
                        <span>{post.likes_count || 0}</span>
                      </button>
                      <button
                        onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                        aria-label="Comments"
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
                                  onClick={() => openProfile(comment.author)}
                                  className="flex items-center gap-2 min-w-0"
                                >
                                  <Avatar className="w-8 h-8">
                                    <AvatarImage src={comment.author?.photo} />
                                    <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                                  </Avatar>
                                  <span className={`font-semibold text-sm truncate ${getTextColor()}`}>
                                    {displayName(comment.author)}
                                  </span>
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label="Comment options" className={`h-7 w-7 ${getIconColor()}`}>
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {comment.can_delete && (
                                      <DropdownMenuItem onClick={() => setConfirmDelete({ kind: 'comment', id: comment.id })} className="text-red-600">
                                        <Trash2 className="w-4 h-4 mr-2" /> Delete comment
                                      </DropdownMenuItem>
                                    )}
                                    {!comment.mine && (
                                      <>
                                        <DropdownMenuItem onClick={() => setReportTarget({ type: 'comment', id: comment.id, userId: comment.author?.id, name: displayName(comment.author) })}>
                                          <Flag className="w-4 h-4 mr-2" /> Report comment
                                        </DropdownMenuItem>
                                        {comment.author?.id && (
                                          <DropdownMenuItem onClick={() => blockPerson(comment.author)} className="text-red-600">
                                            <ShieldX className="w-4 h-4 mr-2" /> Block {displayName(comment.author)}
                                          </DropdownMenuItem>
                                        )}
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              {comment.hidden && <p className="text-xs font-semibold text-red-500 mb-1">Hidden ({comment.hidden_reason || 'reports'}). Only admins see this.</p>}
                              <p className={`text-sm whitespace-pre-wrap ${getTextColor()}`}>{comment.content}</p>
                            </div>
                          ))}
                        </div>
                        <div className={`flex gap-2 ${isBanned ? 'hidden' : ''}`}>
                          <Input
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ''}
                            maxLength={1000}
                            onChange={(e) => setCommentInputs({
                              ...commentInputs,
                              [post.id]: e.target.value
                            })}
                            onKeyDown={(e) => e.key === 'Enter' && handleComment(post.id)}
                            className={getInputClasses()}
                          />
                          <Button
                            onClick={() => handleComment(post.id)}
                            disabled={!commentInputs[post.id]?.trim() || commentMutation.isPending}
                            size="icon"
                            aria-label="Send comment"
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
          <PlantdokuEgg page="community" className="mt-6" />
        </div>
      </div>
    </div>
  );
}
