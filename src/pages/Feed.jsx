
import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Send, Image, Filter, Loader2, Camera, Leaf, Trash2, User } from "lucide-react";
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

export default function Feed() {
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

  const { data: posts = [], refetch } = useQuery({
    queryKey: ['posts', user?.email], // Removed filter from queryKey
    queryFn: async () => {
      if (!user) return [];
      // Simplified queryFn as filter logic is removed from UI
      return await base44.entities.Post.list('-created_date', 100);
    },
    enabled: !!user,
    initialData: [],
  });

  const { data: allComments = {} } = useQuery({
    queryKey: ['comments'],
    queryFn: async () => {
      const comments = await base44.entities.Comment.list('-created_date');
      const grouped = {};
      comments.forEach(comment => {
        if (!grouped[comment.post_id]) grouped[comment.post_id] = [];
        grouped[comment.post_id].push(comment);
      });
      return grouped;
    },
    initialData: {},
    enabled: !!user,
  });

  // Changed 'likes' to 'userLikes' and modified queryFn to return array of post_ids
  const { data: userLikes = [] } = useQuery({
    queryKey: ['userLikes', user?.email],
    queryFn: async () => {
      const userLikedPosts = await base44.entities.Like.filter({ user_email: user.email });
      return userLikedPosts.map(l => l.post_id);
    },
    enabled: !!user,
    initialData: [],
  });

  const { data: userPlants = [] } = useQuery({
    queryKey: ['userPlants', user?.email],
    queryFn: () => base44.entities.Plant.filter({ user_email: user.email }),
    enabled: !!user,
    initialData: [],
  });

  const createPostMutation = useMutation({
    mutationFn: async (postData) => {
      const moderated = await base44.functions.invoke('moderateContent', { content: postData.content });
      if (!moderated.data.approved) {
        throw new Error('Post contains inappropriate content');
      }
      return base44.entities.Post.create(postData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['posts']);
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
    mutationFn: async ({ postId, isLiked }) => {
      if (isLiked) {
        // Find the specific like object to delete
        const likeToDelete = (await base44.entities.Like.filter({ post_id: postId, user_email: user.email }))[0];
        if (likeToDelete) {
          await base44.entities.Like.delete(likeToDelete.id);
        }
      } else {
        await base44.entities.Like.create({ post_id: postId, user_email: user.email });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['userLikes']); // Invalidate the new query key
      queryClient.invalidateQueries(['posts']);
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ postId, content }) => {
      const moderated = await base44.functions.invoke('moderateContent', { content });
      if (!moderated.data.approved) {
        throw new Error('Comment contains inappropriate content');
      }
      
      const post = posts.find(p => p.id === postId);
      await base44.entities.Comment.create({
        post_id: postId,
        content,
        author_email: user.email,
        author_name: user.full_name,
      });

      if (post.created_by !== user.email) {
        await base44.entities.Notification.create({
          user_email: post.created_by,
          type: 'comment',
          message: `${user.full_name} commented on your post`,
          from_user_email: user.email,
          from_user_name: user.full_name,
          from_user_handle: user.handle,
        });
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['comments']);
      setCommentInputs(prev => ({ ...prev, [variables.postId]: "" })); // Clear specific comment input
      toast.success('Comment added!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add comment');
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId) => base44.entities.Post.delete(postId),
    onSuccess: () => {
      queryClient.invalidateQueries(['posts']);
      toast.success('Post deleted successfully!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete post');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId) => base44.entities.Comment.delete(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['comments']);
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
    if (!newPost.trim() && !uploadedImage) { // Updated state names
      toast.error('Post cannot be empty');
      return;
    }

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
    if (!content?.trim()) return;
    commentMutation.mutate({ postId, content });
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

  // Removed userLocation as filter is removed from UI

  return (
    <div className="min-h-screen theme-bg p-6 pb-24">
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
            <h1 className={`text-4xl font-bold mb-2 ${getTextColor()}`}>Community</h1>
            <p className={getSecondaryTextColor()}>Share your plant journey</p>
            
            {/* Easter Egg Button */}
            <button
              onClick={handleEasterEggClick}
              className="absolute bottom-2 right-2 text-[8px] opacity-20 hover:opacity-40 transition-opacity"
            >
              🌿
            </button>
          </div>

          <Card className={`mb-6 ${getThemedClasses()}`}>
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
            {posts.length === 0 ? (
              <Card className={getThemedClasses()}>
                <CardContent className="p-12 text-center">
                  <MessageCircle className={`w-16 h-16 mx-auto mb-4 ${getSecondaryTextColor()}`} />
                  <p className={getSecondaryTextColor()}>No posts yet. Be the first to share!</p>
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
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
                      {post.created_by === user?.email && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePostMutation.mutate(post.id)}
                          className="text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

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
                                {comment.author_email === user?.email && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                                    className="h-6 w-6 text-red-500"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                              <p className={`text-sm ${getTextColor()}`}>{comment.content}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
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
