
import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Droplets, Calendar, MapPin, Edit, Trash2, Heart, Plus, Check, MessageCircle, Send, Loader2, Camera, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";
import PlantHealthCheck from "@/components/PlantHealthCheck";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { chatWithPlant } from "@/functions/chatWithPlant";

export default function PlantDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const plantId = urlParams.get('id');

  // State to hold the current user's data and loading status
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  const [showWaterDialog, setShowWaterDialog] = useState(false);
  const [wateringNotes, setWateringNotes] = useState("");
  const [wateringDate, setWateringDate] = useState(new Date().toISOString().split('T')[0]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState({});
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDescription, setReminderDescription] = useState("");
  const [reminderDate, setReminderDate] = useState("");

  const [showChatDialog, setShowChatDialog] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isProcessingChat, setIsProcessingChat] = useState(false);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef(null);

  // New states for new features
  const [selectedTab, setSelectedTab] = useState('details'); // Default tab
  const [progressPhotoNotes, setProgressPhotoNotes] = useState("");
  const [isUploadingProgress, setIsUploadingProgress] = useState(false);
  const progressImageInputRef = useRef(null); // Ref for progress photo file input

  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTag, setNewTag] = useState("");

  const [showVacationModeDialog, setShowVacationModeDialog] = useState(false); // Dialog for setting vacation dates
  const [vacationModeEnabled, setVacationModeEnabled] = useState(false);
  const [vacationStartDate, setVacationStartDate] = useState("");
  const [vacationEndDate, setVacationEndDate] = useState("");

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  // Load user data on component mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
      // If user cannot be loaded, redirect to Dashboard
      navigate('/Dashboard');
    } finally {
      setUserLoaded(true);
    }
  };

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

  const { data: plant, isLoading, error } = useQuery({
    queryKey: ['plant', plantId, user?.email], // Add user's email to queryKey for ownership check
    queryFn: async () => {
      try {
        // Filter plant by both id and the user's created_by email
        const result = await base44.entities.Plant.filter({ id: plantId, created_by: user.email });
        if (!result || result.length === 0) {
          // If no plant found or it doesn't belong to the user, return null
          return null;
        }
        return result[0];
      } catch (err) {
        console.error("Error fetching plant:", err);
        return null;
      }
    },
    // Enable query only if plantId, user object, and userLoaded are available
    enabled: !!plantId && !!user && userLoaded,
    retry: 1,
  });

  const { data: wateringLogs = [] } = useQuery({
    queryKey: ['wateringLogs', plantId],
    queryFn: async () => {
      try {
        return await base44.entities.WateringLog.filter({ plant_id: plantId }, '-watered_date', 10);
      } catch (err) {
        console.error("Error fetching watering logs:", err);
        return [];
      }
    },
    enabled: !!plantId,
    retry: 1,
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders', plantId],
    queryFn: async () => {
      try {
        return await base44.entities.Reminder.filter({ plant_id: plantId }, '-due_date');
      } catch (err) {
        console.error("Error fetching reminders:", err);
        return [];
      }
    },
    enabled: !!plantId,
    retry: 1,
  });

  const { data: conversation } = useQuery({
    queryKey: ['plantConversation', plantId],
    queryFn: async () => {
      try {
        const convs = await base44.entities.PlantConversation.filter({ plant_id: plantId });
        if (convs && convs.length > 0) {
          setChatMessages(convs[0].messages || []);
          return convs[0];
        }
        return null;
      } catch (err) {
        console.error("Error fetching conversation:", err);
        return null;
      }
    },
    enabled: !!plantId,
    retry: 1,
  });

  const { data: progressPhotos = [] } = useQuery({
    queryKey: ['progressPhotos', plantId],
    queryFn: async () => {
      try {
        const result = await base44.entities.PlantProgressPhoto.filter({ plant_id: plantId }, '-photo_date');
        return Array.isArray(result) ? result : [];
      } catch (err) {
        console.error("Error fetching progress photos:", err);
        return [];
      }
    },
    enabled: !!plantId,
    initialData: [],
    retry: 1,
  });

  useEffect(() => {
    if (plant) {
      setEditData({
        nickname: plant.nickname || "",
        location: plant.location || "",
        environment: plant.environment || "Indoor",
        sun_exposure: plant.sun_exposure || "",
        pot_type: plant.pot_type || "",
        pot_size: plant.pot_size || "",
        substrate_type: plant.substrate_type || "",
        notes: plant.notes || "",
        water_frequency_days: plant.water_frequency_days || 7
      });
      setVacationModeEnabled(plant.vacation_mode_enabled || false);
      setVacationStartDate(plant.vacation_start_date || "");
      setVacationEndDate(plant.vacation_end_date || "");
    }
  }, [plant]);

  const waterPlantMutation = useMutation({
    mutationFn: async () => {
      console.log('🚰 Starting watering mutation...');
      
      // Direct implementation instead of calling external function
      const waterDate = wateringDate || new Date().toISOString().split('T')[0];
      
      // Fetch plant data
      const plantData = await base44.entities.Plant.get(plantId);
      
      if (!plantData) {
        throw new Error('Plant not found');
      }
      
      const newTotalWaterings = (plantData.total_waterings || 0) + 1;
      let newGrowthStage = plantData.growth_stage || 'seedling';
      let grewThisWatering = false;

      if (newTotalWaterings >= 20 && newGrowthStage !== 'mature') {
        newGrowthStage = 'mature';
        grewThisWatering = true;
      } else if (newTotalWaterings >= 15 && newGrowthStage !== 'large' && newGrowthStage !== 'mature') {
        newGrowthStage = 'large';
        grewThisWatering = true;
      } else if (newTotalWaterings >= 10 && newGrowthStage !== 'medium' && newGrowthStage !== 'large' && newGrowthStage !== 'mature') {
        newGrowthStage = 'medium';
        grewThisWatering = true;
      } else if (newTotalWaterings >= 5 && newGrowthStage !== 'small' && newGrowthStage !== 'medium' && newGrowthStage !== 'large' && newGrowthStage !== 'mature') {
        newGrowthStage = 'small';
        grewThisWatering = true;
      }

      const nextWatering = new Date(waterDate);
      nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

      // Update plant
      await base44.entities.Plant.update(plantId, {
        last_watered: waterDate,
        next_watering_due: nextWatering.toISOString().split('T')[0],
        total_waterings: newTotalWaterings,
        growth_stage: newGrowthStage,
        status: 'healthy',
      });

      // Create watering log
      await base44.entities.WateringLog.create({
        plant_id: plantId,
        plant_name: plantData.name,
        watered_date: waterDate,
        method: 'manual',
        notes: wateringNotes || null,
      });

      // Update user stats
      const newLifetimeWaterings = (user.lifetime_waterings || 0) + 1;
      let newTotalPlantGrowths = (user.total_plant_growths || 0);

      if (grewThisWatering) {
        newTotalPlantGrowths++;
      }

      let tier = 'New Sprout';
      if (newLifetimeWaterings >= 200) {
        tier = 'Legendary Botanist';
      } else if (newLifetimeWaterings >= 100) {
        tier = 'Plant Whisperer';
      } else if (newLifetimeWaterings >= 50) {
        tier = 'Master Gardener';
      } else if (newLifetimeWaterings >= 25) {
        tier = 'Gold Thumb';
      } else if (newLifetimeWaterings >= 10) {
        tier = 'Green Thumb';
      }

      await base44.auth.updateMe({
        lifetime_waterings: newLifetimeWaterings,
        current_tier: tier,
        total_plant_growths: newTotalPlantGrowths,
      });

      // Resolve events
      const events = await base44.entities.GameEvent.filter({ resolved: false });
      const plantEvents = events.filter(e => e.affected_plant_ids && e.affected_plant_ids.includes(plantId));

      if (plantEvents.length > 0) {
        for (const event of plantEvents) {
          const remainingPlants = event.affected_plant_ids.filter(id => id !== plantId);
          if (remainingPlants.length === 0) {
            await base44.entities.GameEvent.update(event.id, { resolved: true });
          } else {
            await base44.entities.GameEvent.update(event.id, { affected_plant_ids: remainingPlants });
          }
        }
      }
      
      console.log('✅ Watering complete!');
      
      return {
        success: true,
        grew: grewThisWatering,
        growth_stage: newGrowthStage,
        new_tier: tier,
        tier_changed: tier !== user.current_tier,
        total_waterings: newLifetimeWaterings,
        total_plant_growths: newTotalPlantGrowths,
      };
    },
    onSuccess: (data) => {
      console.log('✅ Watering success! Data:', data);
      
      // Close dialog FIRST
      setShowWaterDialog(false);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries(['plant']);
      queryClient.invalidateQueries(['wateringLogs']);
      queryClient.invalidateQueries(['plants']);
      
      // Clear the form
      setWateringNotes("");
      setWateringDate(new Date().toISOString().split('T')[0]);

      // Then show success messages
      if (data?.grew) {
        toast.success(`🌱 Your plant grew to ${data.growth_stage}!`);
      } else {
        toast.success('Plant watered! 💧');
      }

      if (data?.tier_changed) {
        toast.success(`🏆 You reached ${data.new_tier}!`);
      }
    },
    onError: (error) => {
      console.error('❌ Watering failed:', error);
      toast.error('Failed to water plant: ' + error.message);
    }
  });

  const updatePlantMutation = useMutation({
    mutationFn: async (updates) => {
      await base44.entities.Plant.update(plantId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['plant']);
      queryClient.invalidateQueries(['plants']);
      setShowEditDialog(false);
      toast.success('Plant updated!');
    },
  });

  const deletePlantMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Plant.delete(plantId);
    },
    onSuccess: () => {
      toast.success('Plant removed from your garden');
      navigate('/Dashboard');
    },
  });

  const createReminderMutation = useMutation({
    mutationFn: async (reminderData) => {
      await base44.entities.Reminder.create(reminderData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['reminders']);
      setShowReminderDialog(false);
      setReminderTitle("");
      setReminderDescription("");
      setReminderDate("");
      toast.success('Reminder created!');
    },
  });

  const toggleReminderMutation = useMutation({
    mutationFn: async ({ id, completed }) => {
      await base44.entities.Reminder.update(id, { completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['reminders']);
    },
  });

  const uploadProgressPhotoMutation = useMutation({
    mutationFn: async ({ image_url, notes }) => {
      await base44.entities.PlantProgressPhoto.create({
        plant_id: plantId,
        plant_name: plant.name,
        image_url,
        photo_date: new Date().toISOString().split('T')[0],
        notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['progressPhotos']);
      setProgressPhotoNotes("");
      toast.success("Progress photo added!");
    },
  });

  const deleteProgressPhotoMutation = useMutation({
    mutationFn: async (photoId) => {
      await base44.entities.PlantProgressPhoto.delete(photoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['progressPhotos']);
      toast.success("Photo deleted");
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async (tag) => {
      const currentTags = plant.tags || [];
      const updatedTags = [...new Set([...currentTags, tag])]; // Ensure unique tags
      await base44.entities.Plant.update(plantId, {
        tags: updatedTags
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['plant']);
      setNewTag("");
      setShowTagDialog(false);
      toast.success("Tag added!");
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagToRemove) => {
      const currentTags = plant.tags || [];
      await base44.entities.Plant.update(plantId, {
        tags: currentTags.filter(t => t !== tagToRemove)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['plant']);
      toast.success("Tag removed");
    },
  });

  const toggleVacationModeMutation = useMutation({
    mutationFn: async ({ enabled, startDate, endDate }) => {
      await base44.entities.Plant.update(plantId, {
        vacation_mode_enabled: enabled,
        vacation_start_date: enabled ? startDate : null,
        vacation_end_date: enabled ? endDate : null,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries(['plant']);
      setVacationModeEnabled(variables.enabled);
      setVacationStartDate(variables.startDate || "");
      setVacationEndDate(variables.endDate || "");
      toast.success(variables.enabled ? 'Vacation mode activated!' : 'Vacation mode deactivated.');
      setShowVacationModeDialog(false); // Close dialog after action
    },
    onError: () => {
      toast.error("Failed to update vacation mode.");
    }
  });

  const handleChatSend = async () => {
    if (!chatInput.trim() || isProcessingChat) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsProcessingChat(true);

    try {
      const { data } = await chatWithPlant({
        plant_id: plantId,
        message: userMessage,
        conversation_id: conversation?.id
      });

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response
      }]);
    } catch (error) {
      console.error('Error in plant chat:', error);
      toast.error("Failed to send message");
    } finally {
      setIsProcessingChat(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      await base44.entities.Plant.update(plantId, {
        image_url: file_url
      });

      queryClient.invalidateQueries(['plant']);
      toast.success("Plant photo updated! 📸");
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error("Failed to upload photo");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleProgressPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingProgress(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await uploadProgressPhotoMutation.mutateAsync({
        image_url: file_url,
        notes: progressPhotoNotes
      });
    } catch (error) {
      console.error('Error uploading progress image:', error);
      toast.error("Failed to upload photo");
    } finally {
      setIsUploadingProgress(false);
      if (progressImageInputRef.current) {
        progressImageInputRef.current.value = null; // Clear the input so same file can be selected again
      }
    }
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-green-950/50 backdrop-blur-md border border-green-900/50';
    if (theme === 'kawaii') return 'bg-pink-50/95 backdrop-blur-md border border-pink-200/50';
    if (theme === 'halloween') return 'bg-black/70 backdrop-blur-md border border-orange-500/30';
    if (theme === 'christmas') return 'bg-red-950/70 backdrop-blur-md border border-red-800/50';
    if (theme === 'valentines') return 'bg-pink-50/95 backdrop-blur-md border border-pink-300/50';
    if (theme === 'newyears') return 'bg-indigo-950/70 backdrop-blur-md border border-indigo-800/50';
    if (theme === 'stpatricks') return 'bg-green-50/95 backdrop-blur-md border border-green-300/50';
    if (theme === 'fourthofjuly') return 'bg-blue-950/70 backdrop-blur-md border border-blue-800/50';
    if (theme === 'summer') return 'bg-orange-50/95 backdrop-blur-md border border-orange-300/50';
    if (theme === 'spring') return 'bg-purple-50/95 backdrop-blur-md border border-purple-300/50';
    if (theme === 'fall') return 'bg-orange-950/70 backdrop-blur-md border border-orange-800/50';
    if (theme === 'winter') return 'bg-blue-50/95 backdrop-blur-md border border-blue-300/50';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    return 'bg-white/95 backdrop-blur-md border border-gray-300/50'; // light mode - opaque white
  };

  // Helper to determine if theme has a light background (needs dark text)
  const isThemeLight = (currentTheme) => {
    return currentTheme === 'kawaii' || currentTheme === 'valentines' || currentTheme === 'stpatricks' || currentTheme === 'summer' || currentTheme === 'spring' || currentTheme === 'winter' || currentTheme === 'light'; // Default 'light'
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'fall') return 'text-white';
    return 'text-gray-900';
  };

  const getSecondaryTextColor = () => {
    if (theme === 'dark' || theme === 'botanical' || theme === 'halloween' || theme === 'christmas' || theme === 'newyears' || theme === 'fourthofjuly' || theme === 'fall') return 'text-white/80';
    return 'text-gray-600';
  };

  // Show loading state until user is loaded and plant query starts
  if (!userLoaded || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text">Loading plant details...</p>
        </div>
      </div>
    );
  }

  // If plant is null after loading, it means either the plant doesn't exist
  // or the current user doesn't own it.
  if (!plant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center theme-bg">
        <div className="text-center">
          <h2 className="text-2xl font-bold theme-text mb-4">Plant not found or access denied</h2>
          <p className="theme-text mb-6">The plant with ID "{plantId}" does not exist or does not belong to your garden.</p>
          <Button onClick={() => navigate('/Dashboard')} className="bg-green-600 hover:bg-green-700">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Garden
          </Button>
        </div>
      </div>
    );
  }

  const getWateringStatus = () => {
    if (plant.vacation_mode_enabled && plant.vacation_end_date && new Date(plant.vacation_end_date) >= new Date()) {
      return { text: `Vacation mode active until ${format(parseISO(plant.vacation_end_date), 'MMM d, yyyy')}`, color: 'text-blue-600', bg: 'bg-blue-100' };
    }

    if (plant.status === 'wilted') {
      return { text: 'HELP! Plant needs water urgently!', color: 'text-red-600', bg: 'bg-red-100' };
    }

    if (!plant.next_watering_due) {
      return { text: 'Watering schedule not set', color: 'text-gray-600', bg: 'bg-gray-100' };
    }

    const today = new Date();
    const dueDate = parseISO(plant.next_watering_due);
    const daysUntil = differenceInDays(dueDate, today);

    // If it's a light-text theme, use light backgrounds with dark text
    if (isThemeLight(theme)) {
      if (daysUntil < 0) return { text: `${Math.abs(daysUntil)} days overdue!`, color: 'text-red-600', bg: 'bg-red-100' };
      if (daysUntil === 0) return { text: 'Water today', color: 'text-orange-600', bg: 'bg-orange-100' };
      if (daysUntil <= 2) return { text: `Water in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, color: 'text-yellow-600', bg: 'bg-yellow-100' };
      return { text: `Next watering in ${daysUntil} days`, color: 'text-green-600', bg: 'bg-green-100' };
    } else { // Dark backgrounds need white text
      if (daysUntil < 0) return { text: `${Math.abs(daysUntil)} days overdue!`, color: 'text-white', bg: 'bg-red-700' };
      if (daysUntil === 0) return { text: 'Water today', color: 'text-white', bg: 'bg-orange-700' };
      if (daysUntil <= 2) return { text: `Water in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, color: 'text-white', bg: 'bg-yellow-700' };
      return { text: `Next watering in ${daysUntil} days`, color: 'text-white', bg: 'bg-green-700' };
    }
  };

  const wateringStatus = getWateringStatus();

  const growthEmojis = {
    seedling: '🌱',
    small: '🌿',
    medium: '🪴',
    large: '🌳',
    mature: '🌲'
  };

  return (
    <div className="min-h-screen theme-bg pb-20">
      <div className="max-w-4xl mx-auto p-6">
        <button onClick={() => navigate('/Dashboard')} className="mb-6 flex items-center gap-2 theme-text hover:opacity-70">
          <ArrowLeft className="w-5 h-5" />
          Back to Garden
        </button>

        {/* Tags Section */}
        {plant && (
          <Card className={`${getThemedClasses()} mb-6`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-semibold ${getTextColor()}`}>🏷️ Tags</h3>
                <Button
                  size="sm"
                  onClick={() => setShowTagDialog(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Tag
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {plant.tags && plant.tags.length > 0 ? (
                  plant.tags.map((tag, idx) => (
                    <Badge
                      key={idx}
                      className={isThemeLight(theme) ? "bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer group relative" : "bg-blue-700 text-white hover:bg-blue-800 cursor-pointer group relative"}
                      onClick={() => removeTagMutation.mutate(tag)}
                    >
                      {tag}
                      <X className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Badge>
                  ))
                ) : (
                  <p className={`text-sm ${getSecondaryTextColor()}`}>No tags yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className={`${getThemedClasses()} w-full grid grid-cols-4 mb-6 gap-1 p-1`}>
            <TabsTrigger value="details" className={`${isThemeLight(theme) ? 'data-[state=active]:bg-green-100 data-[state=active]:text-green-700' : 'data-[state=active]:bg-green-700 data-[state=active]:text-white'} rounded-lg px-3 py-2`}>Details</TabsTrigger>
            <TabsTrigger value="reminders" className={`${isThemeLight(theme) ? 'data-[state=active]:bg-green-100 data-[state=active]:text-green-700' : 'data-[state=active]:bg-green-700 data-[state=active]:text-white'} rounded-lg px-3 py-2`}>Reminders</TabsTrigger>
            <TabsTrigger value="history" className={`${isThemeLight(theme) ? 'data-[state=active]:bg-green-100 data-[state=active]:text-green-700' : 'data-[state=active]:bg-green-700 data-[state=active]:text-white'} rounded-lg px-3 py-2`}>History</TabsTrigger>
            <TabsTrigger value="progress" className={`${isThemeLight(theme) ? 'data-[state=active]:bg-green-100 data-[state=active]:text-green-700' : 'data-[state=active]:bg-green-700 data-[state=active]:text-white'} rounded-lg px-3 py-2`}>Progress</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="grid md:grid-cols-2 gap-6">
            <div>
              <Card className={`${getThemedClasses()} overflow-hidden shadow-xl mb-4`}>
                <div className="relative h-80 bg-green-50 group">
                  {plant.image_url ? (
                    <>
                      <img
                        src={plant.image_url}
                        alt={plant.name}
                        className={`w-full h-full object-cover ${
                          plant.status === 'wilted' ? 'grayscale' : ''
                        }`}
                      />
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {isUploadingImage ? (
                          <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
                        ) : (
                          <Camera className="w-5 h-5 text-green-600" />
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center theme-bg">
                      <Droplets className="w-20 h-20 text-green-300 mb-4" />
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl flex items-center gap-2"
                      >
                        {isUploadingImage ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Camera className="w-5 h-5" />
                            Add Photo
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {plant.growth_stage && (
                    <div className="absolute top-4 left-4 text-4xl">
                      {growthEmojis[plant.growth_stage]}
                    </div>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => setShowWaterDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  <Droplets className="w-4 h-4" />
                  Water Plant
                </Button>
                <PlantHealthCheck plant={plant} />
              </div>

              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={() => setShowChatDialog(true)}
                  className={`w-full ${getThemedClasses()} ${getTextColor()}`}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Chat about {plant.nickname || plant.name}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Card className={getThemedClasses()}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className={`text-3xl font-bold mb-2 ${getTextColor()}`}>
                        {plant.nickname || plant.name}
                      </h1>
                      {plant.nickname && (
                        <p className={`text-lg italic ${getSecondaryTextColor()}`}>
                          {plant.name}
                          {plant.scientific_name && ` (${plant.scientific_name})`}
                          {plant.hybrid_name && ` '${plant.hybrid_name}'`}
                        </p>
                      )}
                      {!plant.nickname && plant.scientific_name && (
                        <p className={`text-lg italic ${getSecondaryTextColor()}`}>
                          {plant.scientific_name}
                          {plant.hybrid_name && ` '${plant.hybrid_name}'`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowEditDialog(true)}
                        className={`${getThemedClasses()} ${getTextColor()}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (confirm('Are you sure you want to remove this plant?')) {
                            deletePlantMutation.mutate();
                          }
                        }}
                        className={getThemedClasses()}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  <div className={`${wateringStatus.bg} ${wateringStatus.color} p-4 rounded-xl mb-4 font-semibold flex items-center gap-2`}>
                    <Droplets className="w-5 h-5" />
                    {wateringStatus.text}
                  </div>

                  <div className="space-y-3">
                    {plant.location && (
                      <div className="flex items-center gap-3">
                        <MapPin className={`w-5 h-5 ${getSecondaryTextColor()}`} />
                        <span className={getTextColor()}>{plant.location}</span>
                      </div>
                    )}
                    {plant.environment && (
                      <div className="flex items-center gap-3">
                        <Calendar className={`w-5 h-5 ${getSecondaryTextColor()}`} />
                        <span className={getTextColor()}>{plant.environment}</span>
                      </div>
                    )}
                    {plant.last_watered && (
                      <div className="flex items-center gap-3">
                        <Droplets className={`w-5 h-5 ${getSecondaryTextColor()}`} />
                        <span className={getTextColor()}>
                          Last watered: {format(parseISO(plant.last_watered), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                    {plant.water_frequency_days && (
                      <div className="flex items-center gap-3">
                        <Droplets className={`w-5 h-5 ${getSecondaryTextColor()}`} />
                        <span className={getTextColor()}>
                          Water every {plant.water_frequency_days} days
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <Badge className={isThemeLight(theme) ? 'bg-purple-100 text-purple-800' : 'bg-purple-700 text-white'}>
                        {plant.total_waterings || 0} waterings
                      </Badge>
                      {plant.growth_stage && (
                        <Badge className={isThemeLight(theme) ? 'bg-green-100 text-green-800' : 'bg-green-700 text-white'}>
                          {plant.growth_stage}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {plant.care_instructions && (
                <Card className={getThemedClasses()}>
                  <CardContent className="p-6">
                    <h2 className={`text-xl font-semibold mb-4 ${getTextColor()}`}>Care Instructions</h2>
                    <div className={`space-y-3 text-sm ${getTextColor()}`}>
                      {plant.care_instructions.watering && (
                        <div>
                          <p className={`font-semibold mb-1 ${getTextColor()}`}>💧 Watering:</p>
                          <p className={getSecondaryTextColor()}>{plant.care_instructions.watering}</p>
                        </div>
                      )}
                      {plant.care_instructions.sunlight && (
                        <div>
                          <p className={`font-semibold mb-1 ${getTextColor()}`}>☀️ Sunlight:</p>
                          <p className={getSecondaryTextColor()}>{plant.care_instructions.sunlight}</p>
                        </div>
                      )}
                      {plant.care_instructions.tips && (
                        <div>
                          <p className={`font-semibold mb-1 ${getTextColor()}`}>💡 Tips:</p>
                          <p className={getSecondaryTextColor()}>{plant.care_instructions.tips}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Vacation Mode Section */}
              <Card className={getThemedClasses()}>
                <CardHeader>
                  <CardTitle className={getTextColor()}>🏖️ Vacation Mode</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className={getTextColor()}>Enable Vacation Mode</p>
                    <Switch
                      checked={vacationModeEnabled}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setShowVacationModeDialog(true);
                        } else {
                          toggleVacationModeMutation.mutate({ enabled: false, startDate: null, endDate: null });
                        }
                      }}
                    />
                  </div>
                  {vacationModeEnabled && plant.vacation_start_date && plant.vacation_end_date && (
                    <p className={`${getSecondaryTextColor()} text-sm`}>
                      Active from {format(parseISO(plant.vacation_start_date), 'MMM d, yyyy')} to {format(parseISO(plant.vacation_end_date), 'MMM d, yyyy')}
                    </p>
                  )}
                  {vacationModeEnabled && !(plant.vacation_start_date && plant.vacation_end_date) && (
                      <p className={`${getTextColor()} text-sm text-yellow-600`}>
                        Vacation mode is enabled, but dates are not set. Please set them.
                      </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="reminders">
            <Card className={getThemedClasses()}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-semibold ${getTextColor()}`}>Reminders</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowReminderDialog(true)}
                    className={`${getThemedClasses()} ${getTextColor()}`}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>
                {reminders.length === 0 ? (
                  <p className={`text-sm ${getSecondaryTextColor()}`}>No reminders set</p>
                ) : (
                  <div className="space-y-2">
                    {reminders.map(reminder => (
                      <div key={reminder.id} className={`flex items-start gap-3 p-3 rounded-lg border ${getThemedClasses()}`}>
                        <button
                          onClick={() => toggleReminderMutation.mutate({
                            id: reminder.id,
                            completed: !reminder.completed
                          })}
                          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center ${
                            reminder.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                          }`}
                        >
                          {reminder.completed && <Check className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1">
                          <p className={`font-medium ${reminder.completed ? 'line-through' : ''} ${getTextColor()}`}>
                            {reminder.title}
                          </p>
                          {reminder.description && (
                            <p className={`text-sm ${getSecondaryTextColor()}`}>{reminder.description}</p>
                          )}
                          <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>
                            {format(parseISO(reminder.due_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            {wateringLogs.length > 0 && (
              <Card className={getThemedClasses()}>
                <CardContent className="p-6">
                  <h2 className={`text-xl font-semibold mb-4 ${getTextColor()}`}>Watering History</h2>
                  <div className="space-y-2">
                    {wateringLogs.map(log => (
                      <div key={log.id} className={`flex items-center justify-between p-3 rounded-lg border ${getThemedClasses()}`}>
                        <div>
                          <p className={`font-medium ${getTextColor()}`}>
                            {format(parseISO(log.watered_date), 'MMM d, yyyy')}
                          </p>
                          {log.notes && (
                            <p className={`text-sm ${getSecondaryTextColor()}`}>{log.notes}</p>
                          )}
                        </div>
                        <Badge variant="outline" className={getTextColor()}>{log.method}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="progress">
            <Card className={getThemedClasses()}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className={getTextColor()}>📸 Progress Photos</CardTitle>
                  <label>
                    <input
                      ref={progressImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProgressPhotoUpload}
                      disabled={isUploadingProgress}
                    />
                    <Button
                      as="span"
                      disabled={isUploadingProgress}
                      className="bg-green-600 hover:bg-green-700 cursor-pointer"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {isUploadingProgress ? 'Uploading...' : 'Add Photo'}
                    </Button>
                  </label>
                </div>
                {(progressPhotoNotes || isUploadingProgress) && ( // Show notes input only if there are notes or uploading
                  <Input
                    placeholder="Add notes for this photo..."
                    value={progressPhotoNotes}
                    onChange={(e) => setProgressPhotoNotes(e.target.value)}
                    className="theme-input"
                  />
                )}
              </CardHeader>
              <CardContent>
                {progressPhotos.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon className={`w-16 h-16 mx-auto mb-4 ${getSecondaryTextColor()}`} />
                    <p className={getSecondaryTextColor()}>No progress photos yet</p>
                    <p className={`text-sm mt-2 ${getSecondaryTextColor()}`}>
                      Document your plant's journey over time!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {progressPhotos.map((photo) => (
                      <div key={photo.id} className={`border rounded-2xl overflow-hidden ${
                        isThemeLight(theme) ? 'border-gray-200' : 'border-gray-700'
                      }`}>
                        <img
                          src={photo.image_url}
                          alt={`Progress ${photo.photo_date}`}
                          className="w-full h-64 object-cover"
                        />
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className={`font-semibold ${getTextColor()}`}>
                              {new Date(photo.photo_date).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteProgressPhotoMutation.mutate(photo.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                          {photo.notes && (
                            <p className={`text-sm ${getSecondaryTextColor()}`}>{photo.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showWaterDialog} onOpenChange={setShowWaterDialog}>
        <DialogContent className={getThemedClasses()}>
          <DialogHeader>
            <DialogTitle className={getTextColor()}>Water Plant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                Date Watered
              </label>
              <Input
                type="date"
                value={wateringDate}
                onChange={(e) => setWateringDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="theme-input"
              />
              <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>
                You can log waterings from the past
              </p>
            </div>
            <Textarea
              placeholder="Add notes (optional) - e.g., 'Leaves looked droopy'"
              value={wateringNotes}
              onChange={(e) => setWateringNotes(e.target.value)}
              className="theme-input"
            />
            <Button
              onClick={() => waterPlantMutation.mutate()}
              disabled={waterPlantMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {waterPlantMutation.isPending ? 'Watering...' : 'Confirm Watering'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className={`${getThemedClasses()} max-h-[80vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={getTextColor()}>Edit Plant Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Nickname</label>
              <Input
                value={editData.nickname || ""}
                onChange={(e) => setEditData({...editData, nickname: e.target.value})}
                placeholder="Give your plant a nickname"
                className="theme-input"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Location</label>
              <Input
                value={editData.location || ""}
                onChange={(e) => setEditData({...editData, location: e.target.value})}
                placeholder="e.g., Living room, Bedroom window"
                className="theme-input"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Watering Frequency (days)</label>
              <Input
                type="number"
                min="1"
                max="365"
                value={editData.water_frequency_days || plant?.water_frequency_days || 7}
                onChange={(e) => setEditData({...editData, water_frequency_days: parseInt(e.target.value) || 7})}
                className="theme-input"
              />
              <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>
                How many days between waterings
              </p>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Environment</label>
              <Select
                value={editData.environment}
                onValueChange={(value) => setEditData({...editData, environment: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Indoor">Indoor</SelectItem>
                  <SelectItem value="Outdoor">Outdoor</SelectItem>
                  <SelectItem value="Balcony">Balcony</SelectItem>
                  <SelectItem value="Patio">Patio</SelectItem>
                  <SelectItem value="Greenhouse">Greenhouse</SelectItem>
                  <SelectItem value="Window Sill">Window Sill</SelectItem>
                  <SelectItem value="Office">Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Sun Exposure</label>
              <Select
                value={editData.sun_exposure}
                onValueChange={(value) => setEditData({...editData, sun_exposure: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full Sun (6+ hours)">Full Sun (6+ hours)</SelectItem>
                  <SelectItem value="Partial Sun (3-6 hours)">Partial Sun (3-6 hours)</SelectItem>
                  <SelectItem value="Partial Shade (2-4 hours)">Partial Shade (2-4 hours)</SelectItem>
                  <SelectItem value="Full Shade (<2 hours)">Full Shade (less than 2 hours)</SelectItem>
                  <SelectItem value="Artificial Light">Artificial Light</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Pot Type</label>
              <Select
                value={editData.pot_type}
                onValueChange={(value) => setEditData({...editData, pot_type: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Plastic">Plastic</SelectItem>
                  <SelectItem value="Terracotta/Clay">Terracotta/Clay</SelectItem>
                  <SelectItem value="Ceramic (glazed)">Ceramic (glazed)</SelectItem>
                  <SelectItem value="Ceramic (unglazed)">Ceramic (unglazed)</SelectItem>
                  <SelectItem value="Self-watering">Self-watering</SelectItem>
                  <SelectItem value="Fabric/Grow bag">Fabric/Grow bag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Pot Size</label>
              <Select
                value={editData.pot_size}
                onValueChange={(value) => setEditData({...editData, pot_size: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Much smaller than plant">Much smaller than plant</SelectItem>
                  <SelectItem value="Slightly smaller">Slightly smaller</SelectItem>
                  <SelectItem value="Perfect fit">Perfect fit</SelectItem>
                  <SelectItem value="Room to grow">Room to grow</SelectItem>
                  <SelectItem value="Too large">Too large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Substrate Type</label>
              <Select
                value={editData.substrate_type}
                onValueChange={(value) => setEditData({...editData, substrate_type: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard potting mix">Standard potting mix</SelectItem>
                  <SelectItem value="Cactus/succulent mix">Cactus/succulent mix</SelectItem>
                  <SelectItem value="Orchid bark mix">Orchid bark mix</SelectItem>
                  <SelectItem value="Peat-based mix">Peat-based mix</SelectItem>
                  <SelectItem value="Coco coir">Coco coir</SelectItem>
                  <SelectItem value="Custom mix">Custom mix</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Notes</label>
              <Textarea
                value={editData.notes || ""}
                onChange={(e) => setEditData({...editData, notes: e.target.value})}
                placeholder="Any additional notes about your plant"
                className="theme-input"
              />
            </div>
            <Button
              onClick={() => updatePlantMutation.mutate(editData)}
              disabled={updatePlantMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
        <DialogContent className={getThemedClasses()}>
          <DialogHeader>
            <DialogTitle className={getTextColor()}>Create Reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Title</label>
              <Input
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="e.g., Take plant outside"
                className="theme-input"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Description (optional)</label>
              <Textarea
                value={reminderDescription}
                onChange={(e) => setReminderDescription(e.target.value)}
                placeholder="Additional details"
                className="theme-input"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Due Date</label>
              <Input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="theme-input"
              />
            </div>
            <Button
              onClick={() => {
                if (!reminderTitle || !reminderDate) {
                  toast.error('Please fill in title and date');
                  return;
                }
                createReminderMutation.mutate({
                  plant_id: plantId,
                  plant_name: plant.name,
                  title: reminderTitle,
                  description: reminderDescription,
                  due_date: reminderDate
                });
              }}
              disabled={createReminderMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Create Reminder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showChatDialog} onOpenChange={setShowChatDialog}>
        <DialogContent className={`${getThemedClasses()} max-w-2xl max-h-[80vh] flex flex-col`}>
          <DialogHeader>
            <DialogTitle className={getTextColor()}>Chat with AI about {plant.nickname || plant.name}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-4">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl p-3 ${
                    msg.role === 'user'
                      ? 'bg-green-600 text-white'
                      : isThemeLight(theme)
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isProcessingChat && (
              <div className="flex gap-2">
                <div className={isThemeLight(theme) ? 'bg-gray-100 rounded-xl p-3' : 'bg-white/10 rounded-xl p-3'}>
                  <Loader2 className={`w-4 h-4 animate-spin ${getTextColor()}`} />
                </div>
              </div>
            )}
          </div>

          <div className={`flex gap-2 pt-3 border-t ${isThemeLight(theme) ? 'border-gray-200' : 'border-white/20'}`}>
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleChatSend()}
              placeholder="Ask about care, watering, problems..."
              disabled={isProcessingChat}
              className="theme-input"
            />
            <Button
              onClick={handleChatSend}
              disabled={!chatInput.trim() || isProcessingChat}
              size="icon"
              className="bg-green-600 hover:bg-green-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent className={getThemedClasses()}>
          <DialogHeader>
            <DialogTitle className={getTextColor()}>Add Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="e.g., Kitchen Shelf, Water Monday, Outdoor..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="theme-input"
              onKeyPress={(e) => e.key === 'Enter' && newTag.trim() && addTagMutation.mutate(newTag.trim())}
            />
            <Button
              onClick={() => newTag.trim() && addTagMutation.mutate(newTag.trim())}
              disabled={!newTag.trim() || addTagMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Add Tag
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vacation Mode Dialog for setting dates */}
      <Dialog open={showVacationModeDialog} onOpenChange={setShowVacationModeDialog}>
        <DialogContent className={getThemedClasses()}>
          <DialogHeader>
            <DialogTitle className={getTextColor()}>Set Vacation Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Start Date</label>
              <Input
                type="date"
                value={vacationStartDate}
                onChange={(e) => setVacationStartDate(e.target.value)}
                className="theme-input"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>End Date</label>
              <Input
                type="date"
                value={vacationEndDate}
                onChange={(e) => setVacationEndDate(e.target.value)}
                className="theme-input"
              />
            </div>
            <Button
              onClick={() => {
                if (!vacationStartDate || !vacationEndDate) {
                  toast.error("Please select both start and end dates.");
                  return;
                }
                if (new Date(vacationStartDate) > new Date(vacationEndDate)) {
                  toast.error("Start date cannot be after end date.");
                  return;
                }
                toggleVacationModeMutation.mutate({
                  enabled: true,
                  startDate: vacationStartDate,
                  endDate: vacationEndDate,
                });
              }}
              disabled={toggleVacationModeMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {toggleVacationModeMutation.isPending ? "Activating..." : "Activate Vacation Mode"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
