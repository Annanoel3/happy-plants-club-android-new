import React, { useState, useEffect, useRef } from "react";
import { usePhotoSource } from "@/components/PhotoSourceSheet";
import { asChangeEvent, pickPhotos } from "@/lib/photoPicker";
import { localToday, toLocalDateString } from '@/lib/dates';
import { base44 } from "@/api/base44Client";
import { handleAiLimit } from "@/lib/premium";
import { refreshPlantData } from "@/lib/query-client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Droplets, Calendar, MapPin, Edit, Trash2, Heart, Plus, Check, MessageCircle, Send, Loader2, Camera, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
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
import { showAdForEvent } from "@/lib/admob";
import { prepareImageForUpload } from "@/lib/imageResize";
import { usePlus, usePlusReady, useMe } from "@/lib/plus";
import { hintLine } from "@/lib/weather";
import { logWaterings } from "@/lib/watering";
import { withPendingWaterings } from "@/lib/outbox";
import { POT_SIZES, WATER_METHODS, waterMethod, scheduleText, waterAmount, methodInfo } from "@/lib/waterAmount";
import { CARE_META } from "@/lib/care";
import PlantWaterPanel from "@/components/plus/PlantWaterPanel";
import CareScheduleCard from "@/components/plus/CareScheduleCard";
import HealthHistoryCard from "@/components/plus/HealthHistoryCard";
import GrowthTimeline from "@/components/plus/GrowthTimeline";
import NewPlantReview from "@/components/NewPlantReview";

export default function PlantDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const plus = usePlus();
  const plusReady = usePlusReady();
  const me = useMe();
  const [healthOpenKey, setHealthOpenKey] = useState(0);
  const urlParams = new URLSearchParams(window.location.search);
  const plantId = urlParams.get('id');

  // State to hold the current user's data and loading status
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  const [showWaterDialog, setShowWaterDialog] = useState(false);
  const [wateringNotes, setWateringNotes] = useState("");
  const [wateringDate, setWateringDate] = useState(localToday());
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState({});
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDescription, setReminderDescription] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [reminderRepeat, setReminderRepeat] = useState("");

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

  const PLANT_TYPES = ["Orchid", "Succulent", "Cactus", "Tropical", "Tree", "Shrub", "Herb", "Vegetable", "Fruit", "Fern", "Vine", "Grass", "Aquatic", "Bulb", "Other"];

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
    window.addEventListener('hp-theme-change', handleThemeChange); // was a 100ms poll

    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
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
        // A watering still waiting on this phone (no signal) shows as done
        return withPendingWaterings([result[0]])[0];
      } catch (err) {
        console.error("Error fetching plant:", err);
        // No signal: keep showing the plant we already have instead of "not found"
        const status = err?.response?.status;
        if (!status || status >= 500) throw err;
        return null;
      }
    },
    // Enable query only if plantId, user object, and userLoaded are available
    enabled: !!plantId && !!user && userLoaded,
    retry: 1,
    // Still being named on the server: check back every few seconds
    refetchInterval: (q) => (q.state.data?.add_status === 'identifying' ? 4000 : false),
  });

  // New plant (added in bulk, or "Later" on the check): its setup card offers the areas
  // the owner already uses, so it needs the rest of the garden
  const isNewPlant = ['identifying', 'review', 'failed'].includes(plant?.add_status);
  const { data: gardenPlants = [] } = useQuery({
    queryKey: ['plants', user?.email],
    // same list as the garden page (shared cache), so the same shape: pending waterings included
    queryFn: async () => withPendingWaterings((await base44.entities.Plant.filter({ created_by: user.email }, undefined, 1000)) || []),
    enabled: !!user?.email && isNewPlant,
    staleTime: 60 * 1000,
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
    placeholderData: [], // (was initialData; that would count as fresh under the 30s staleTime and hide the real data)
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
        pot_diameter_in: (plant.pot_diameter_in === 0 || plant.pot_diameter_in) ? String(plant.pot_diameter_in) : "",
        substrate_type: plant.substrate_type || "",
        notes: plant.notes || "",
        water_frequency_days: plant.water_frequency_days || 7,
        plant_type: plant.plant_type || "Other",
        water_method: waterMethod(plant),
        water_strict: !!plant.water_strict,
        water_days_rest: plant.water_days_rest || "",
      });
      setVacationModeEnabled(plant.vacation_mode_enabled || false);
      setVacationStartDate(plant.vacation_start_date || "");
      setVacationEndDate(plant.vacation_end_date || "");
    }
  }, [plant]);

  const waterPlantMutation = useMutation({
    mutationFn: async () => {
      // Saved on the phone first, then sent (lib/watering): if the app closes or there's
      // no signal, it's sent later. The server also clears this plant from game events.
      const waterDate = wateringDate || localToday();
      const plantData = plant || await base44.entities.Plant.get(plantId);
      if (!plantData) throw new Error('Plant not found');
      const r = await logWaterings([plantData], { date: waterDate, notes: wateringNotes || null, method: 'manual' });
      const info = r.infos[0] || {};
      return { success: true, synced: r.synced, grew: !!info.grew, growth_stage: info.stage };
    },
    onSuccess: (data) => {
      console.log('✅ Watering success! Data:', data);
      
      // Close dialog FIRST
      setShowWaterDialog(false);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['plant'] });
      queryClient.invalidateQueries({ queryKey: ['wateringLogs'] });
      queryClient.invalidateQueries({ queryKey: ['plants'] });
      
      // Clear the form
      setWateringNotes("");
      setWateringDate(localToday());

      // Then show success messages
      if (data && data.synced === false) {
        toast.success("Plant watered! 💧 No signal right now, so it'll sync when you're back online.");
      } else if (data?.grew) {
        toast.success(`🌱 Your plant grew to ${data.growth_stage}!`);
      } else {
        toast.success('Plant watered! 💧');
      }

      // One interstitial per watering (fire-and-forget)
      showAdForEvent('water');
    },
    onError: (error) => {
      console.error('❌ Watering failed:', error);
      toast.error('Failed to water plant: ' + error.message);
    }
  });

  const updatePlantMutation = useMutation({
    mutationFn: async (updates) => {
      const clean = { ...updates };
      if ('pot_diameter_in' in clean) {
        if (clean.pot_diameter_in === '' || clean.pot_diameter_in === undefined) delete clean.pot_diameter_in;
        else clean.pot_diameter_in = Number(clean.pot_diameter_in);
      }
      // Watering profile: remember what the owner chose so the app never overrides it
      const prof = { ...(plant?.care_profile || {}) };
      if (clean.water_method === waterMethod(plant)) delete clean.water_method; else prof.user_method = true;
      if (!!clean.water_strict === !!plant?.water_strict) delete clean.water_strict; else prof.user_strict = true;
      const every = Number(clean.water_frequency_days) || 7;
      const seasonal = Number(plant?.water_days_grow) > 0 && Number(plant?.water_days_rest) > 0;
      if (seasonal) {
        const rest = Number(clean.water_days_rest) || Number(plant.water_days_rest);
        if (every !== Number(plant.water_frequency_days) || rest !== Number(plant.water_days_rest)) {
          prof.user_interval = true;
          // The number they typed is for the season it's in now
          if (plant.water_season === 'rest') { clean.water_days_rest = every; }
          else { clean.water_days_grow = every; clean.water_days_rest = Math.max(rest, every); }
        } else {
          delete clean.water_days_rest;
        }
      } else {
        delete clean.water_days_rest;
      }
      if (prof.user_method || prof.user_strict || prof.user_interval) clean.care_profile = prof;
      // A new plant leaves "Newly added" once the owner says where it lives
      if (['review', 'failed'].includes(plant?.add_status) && String(clean.location || '').trim()) clean.add_status = 'done';
      await base44.entities.Plant.update(plantId, clean);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plant'] });
      queryClient.invalidateQueries({ queryKey: ['plants'] });
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
      const rec = await base44.entities.Reminder.create(reminderData);
      // Queue the push right away (the 15-minute sweep is the backup)
      try { await base44.functions.invoke('sendCustomReminders', { action: 'sync', reminder_id: rec.id }); } catch (_) {}
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      setShowReminderDialog(false);
      setReminderTitle("");
      setReminderDescription("");
      setReminderDate("");
      setReminderTime("09:00");
      setReminderRepeat("");
      refreshPlantData();
      toast.success('Reminder set!');
    },
  });

  const toggleReminderMutation = useMutation({
    mutationFn: async ({ id, completed }) => {
      const { data } = await base44.functions.invoke('sendCustomReminders', {
        action: completed ? 'complete' : 'uncomplete',
        reminder_id: id,
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      refreshPlantData();
      if (data?.result === 'advanced' && data?.next_due) toast.success(`Done! Next one: ${format(parseISO(data.next_due), 'MMM d')}`);
    },
    onError: (err) => toast.error('Could not update reminder: ' + err.message),
  });

  const uploadProgressPhotoMutation = useMutation({
    mutationFn: async ({ image_url, notes }) => {
      await base44.entities.PlantProgressPhoto.create({
        plant_id: plantId,
        plant_name: plant.name,
        image_url,
        photo_date: localToday(),
        notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progressPhotos'] });
      setProgressPhotoNotes("");
      toast.success("Progress photo added!");
    },
  });

  const deleteProgressPhotoMutation = useMutation({
    mutationFn: async (photoId) => {
      await base44.entities.PlantProgressPhoto.delete(photoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progressPhotos'] });
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
      queryClient.invalidateQueries({ queryKey: ['plant'] });
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
      queryClient.invalidateQueries({ queryKey: ['plant'] });
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
      queryClient.invalidateQueries({ queryKey: ['plant'] });
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
      if (await handleAiLimit(error, navigate)) {
        setChatMessages(prev => prev.slice(0, -1));
        setChatInput(userMessage);
      } else toast.error("Failed to send message");
    } finally {
      setIsProcessingChat(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const { main, thumb } = await prepareImageForUpload(file);
      const [{ file_url }, thumbUpload] = await Promise.all([
        base44.integrations.Core.UploadFile({ file: main }),
        thumb ? base44.integrations.Core.UploadFile({ file: thumb }).catch(() => null) : Promise.resolve(null),
      ]);

      await base44.entities.Plant.update(plantId, {
        image_url: file_url,
        thumbnail_url: thumbUpload?.file_url || null
      });

      queryClient.invalidateQueries({ queryKey: ['plant'] });
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
      const { main } = await prepareImageForUpload(file, { mainSide: 1200 });
      const { file_url } = await base44.integrations.Core.UploadFile({ file: main });
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

  // Camera-or-gallery sheets for the main photo and progress photos
  const mainPhoto = usePhotoSource((files) => handleImageUpload(asChangeEvent(files)), { title: 'Plant photo' });
  const progressPhoto = usePhotoSource((files) => handleProgressPhotoUpload(asChangeEvent(files)), { title: 'Progress photo' });

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

  // Couldn't reach the server and nothing loaded yet: say so (it isn't "not found")
  if (!plant && error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center theme-bg px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold theme-text mb-2">Can't reach Happy Plants</h2>
          <p className="theme-text mb-6">Check your signal and try again.</p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['plant'] })} className="bg-green-600 hover:bg-green-700">Try again</Button>
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
    const daysUntil = differenceInCalendarDays(dueDate, today); // calendar days, so 'tomorrow' is 1 all day long

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
  const ui = { card: getThemedClasses(), text: getTextColor(), sub: getSecondaryTextColor(), light: isThemeLight(theme) };

  const growthEmojis = {
    seedling: '🌱',
    small: '🌿',
    medium: '🪴',
    large: '🌳',
    mature: '🌲'
  };

  // ---- Page pieces (plain values, no hooks below the early returns) ----
  const title = plant.nickname || plant.name || 'Plant';
  const commonName = plant.nickname && plant.name && plant.name !== plant.nickname ? plant.name : null;
  const sciName = plant.scientific_name && plant.scientific_name.toLowerCase() !== String(plant.nickname ? '' : plant.name || '').toLowerCase()
    ? plant.scientific_name : null;
  const schedule = plant.water_frequency_days ? scheduleText(plant) : null;
  const amount = waterAmount(plant);
  const specialWater = !['oz', 'ground', 'unknown'].includes(amount.kind);
  const chipCls = `inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
    ui.light ? 'bg-white/90 border border-gray-200 text-gray-800' : 'bg-white/10 border border-white/15 text-white'}`;
  const sectionCls = `rounded-2xl p-4 shadow-sm ${ui.card}`;
  const rowBg = ui.light ? 'bg-gray-50' : 'bg-white/5';
  const careGuide = [
    ['☀️', 'Light', plant.care_instructions?.sunlight],
    ['💧', 'Water', plant.care_instructions?.watering],
    ['🪴', 'Soil', plant.care_instructions?.soil],
    ['💨', 'Humidity', plant.care_instructions?.humidity],
    ['🌡️', 'Temperature', plant.care_instructions?.temperature],
    ['🌱', 'Feeding', plant.care_instructions?.fertilizing],
    ['💡', 'Tips', plant.care_instructions?.tips],
  ].filter(([, , t]) => t && String(t).trim());
  const tabCls = `${ui.light ? 'data-[state=active]:bg-green-100 data-[state=active]:text-green-800' : 'data-[state=active]:bg-green-700 data-[state=active]:text-white'} rounded-lg px-3 py-2 text-sm font-semibold`;

  return (
    <div className="min-h-screen theme-bg pb-28">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/Dashboard')} className="flex items-center gap-1.5 py-2 -ml-1 text-sm font-semibold theme-text hover:opacity-70">
            <ArrowLeft className="w-5 h-5" /> Garden
          </button>
          <button onClick={() => setShowEditDialog(true)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold shadow-sm ${ui.card} ${ui.text}`}>
            <Edit className="w-4 h-4" /> Edit
          </button>
        </div>

        {/* 1. The plant: photo, name, where it lives */}
        <div className="relative rounded-3xl overflow-hidden shadow-lg aspect-[4/3] bg-green-50">
          {plant.image_url ? (
            <>
              <img src={plant.image_url} alt={title} className={`w-full h-full object-cover ${plant.status === 'wilted' ? 'grayscale' : ''}`} />
              <button onClick={mainPhoto.openPicker} disabled={isUploadingImage} aria-label="Change photo"
                className="absolute bottom-3 right-3 bg-black/55 backdrop-blur text-white p-2.5 rounded-full active:scale-95">
                {isUploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <button onClick={mainPhoto.openPicker} disabled={isUploadingImage}
              className="w-full h-full flex flex-col items-center justify-center gap-2 text-green-700">
              {isUploadingImage ? <Loader2 className="w-8 h-8 animate-spin" /> : <Camera className="w-8 h-8" />}
              <span className="font-semibold">{isUploadingImage ? 'Uploading…' : 'Add a photo'}</span>
            </button>
          )}
          {plant.growth_stage && (
            <span className="absolute top-3 left-3 rounded-full bg-white/90 text-gray-900 text-xs font-semibold px-2.5 py-1 shadow">
              {growthEmojis[plant.growth_stage]} {plant.growth_stage.charAt(0).toUpperCase() + plant.growth_stage.slice(1)}
            </span>
          )}
          {mainPhoto.sheet}
        </div>

        <div className="mt-4">
          <h1 className={`text-3xl font-bold leading-tight ${ui.text}`}>{title}</h1>
          {(commonName || sciName) && (
            <p className={`mt-0.5 ${ui.sub}`}>
              {commonName}{commonName && sciName ? ' · ' : ''}
              {sciName && <i>{sciName}{plant.hybrid_name ? ` '${plant.hybrid_name}'` : ''}</i>}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setShowEditDialog(true)} className={chipCls}>
              <MapPin className="w-3.5 h-3.5" /> {plant.location || 'Add where it lives'}
            </button>
            {plant.environment && <span className={chipCls}>{plant.environment}</span>}
            <span className={chipCls}>
              <Droplets className="w-3.5 h-3.5" /> {plant.total_waterings || 0} watering{(plant.total_waterings || 0) === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* New plant: finish setting it up (where it lives, how it's watered, pot, name) */}
        {plant.add_status === 'identifying' && (
          <div className={`mt-4 ${sectionCls} flex items-center gap-3`} role="status">
            <Loader2 className="w-5 h-5 animate-spin text-green-600" />
            <p className={`text-sm ${ui.text}`}>Naming this plant… it usually takes under a minute.</p>
          </div>
        )}
        {(plant.add_status === 'review' || plant.add_status === 'failed') && (
          <div className="mt-4">
            <NewPlantReview
              inline
              plant={plant}
              allPlants={gardenPlants}
              ui={ui}
              navigate={navigate}
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: ['plant'] });
                queryClient.invalidateQueries({ queryKey: ['plants'] });
                toast.success("Saved. It's out of Newly added.");
              }}
            />
          </div>
        )}

        {/* 2. Watering: when, how, and the button */}
        <section className={`mt-4 ${sectionCls}`} aria-label="Watering">
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${wateringStatus.bg} ${wateringStatus.color}`}>
            <Droplets className="w-4 h-4" /> {wateringStatus.text}
          </div>
          {schedule && (
            <p className={`mt-3 font-semibold ${ui.text}`}>
              {methodInfo(plant).icon} {schedule.main}{plus && amount.kind === 'oz' ? ` · about ${amount.oz} oz` : ''}
            </p>
          )}
          {schedule?.note && <p className={`text-sm ${ui.sub}`}>{schedule.note}</p>}
          {specialWater && <p className={`text-sm ${ui.sub}`}>{amount.text}</p>}
          {plant.last_watered && (
            <p className={`text-sm mt-1 ${ui.sub}`}>Last watered {format(parseISO(String(plant.last_watered).slice(0, 10)), 'EEE, MMM d')}</p>
          )}
          {plus && hintLine(plant) && <p className={`mt-2 text-sm font-semibold ${ui.text}`}>{hintLine(plant)}</p>}
          <Button onClick={() => setShowWaterDialog(true)} className="mt-4 w-full h-12 text-base bg-blue-600 hover:bg-blue-700 gap-2">
            <Droplets className="w-5 h-5" /> Log watering
          </Button>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <PlantHealthCheck plant={plant} openKey={healthOpenKey} />
          <Button variant="outline" onClick={() => setShowChatDialog(true)} className={`w-full gap-2 ${ui.card} ${ui.text}`}>
            <MessageCircle className="w-4 h-4" /> Ask about it
          </Button>
        </div>

        {/* 3. Everything else, in three tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full mt-6">
          <TabsList className={`${ui.card} w-full grid grid-cols-3 mb-4 gap-1 p-1 h-auto`}>
            <TabsTrigger value="care" className={tabCls}>Care</TabsTrigger>
            <TabsTrigger value="history" className={tabCls}>History</TabsTrigger>
            <TabsTrigger value="progress" className={tabCls}>Photos</TabsTrigger>
          </TabsList>

          <TabsContent value="care" className="space-y-4 mt-0">
            {plus ? (
              <>
                <PlantWaterPanel plant={plant} user={me} plus={plus} plusReady={plusReady} ui={ui} />
                <CareScheduleCard plant={plant} user={me} plus={plus} plusReady={plusReady} ui={ui} />
                <HealthHistoryCard plant={plant} plus={plus} plusReady={plusReady} ui={ui} onRecheck={() => setHealthOpenKey((k) => k + 1)} />
              </>
            ) : plusReady ? (
              <button onClick={() => navigate('/Premium')} className={`w-full text-left ${sectionCls}`}>
                <p className={`font-semibold flex items-center gap-2 ${ui.text}`}><Lock className="w-4 h-4" /> More care with Plus</p>
                <p className={`text-sm mt-1 ${ui.sub}`}>How many ounces to give, rain and heat adjustments, reminders to feed, mist, turn and repot, and follow-ups after a health check.</p>
              </button>
            ) : null}

            {careGuide.length > 0 && (
              <section className={sectionCls}>
                <h2 className={`text-lg font-semibold ${ui.text}`}>Care guide</h2>
                <dl className="mt-3 space-y-3">
                  {(guideOpen ? careGuide : careGuide.slice(0, 3)).map(([icon, label, text]) => (
                    <div key={label} className="flex gap-3">
                      <span className="w-6 text-center text-lg leading-6 shrink-0" aria-hidden>{icon}</span>
                      <div className="min-w-0">
                        <dt className={`text-sm font-semibold ${ui.text}`}>{label}</dt>
                        <dd className={`text-sm ${ui.sub}`}>{text}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
                {careGuide.length > 3 && (
                  <button onClick={() => setGuideOpen((o) => !o)} className="mt-3 text-sm font-semibold text-green-600">
                    {guideOpen ? 'Show less' : `Show all ${careGuide.length}`}
                  </button>
                )}
              </section>
            )}

            {plant.notes && (
              <section className={sectionCls}>
                <h2 className={`text-lg font-semibold ${ui.text}`}>Your notes</h2>
                <p className={`mt-1 text-sm whitespace-pre-wrap ${ui.sub}`}>{plant.notes}</p>
              </section>
            )}

            <section className={sectionCls}>
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${ui.text}`}>Reminders</h2>
                <button onClick={() => setShowReminderDialog(true)} className="flex items-center gap-1 text-sm font-semibold text-green-600">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {reminders.length === 0 ? (
                <p className={`mt-1 text-sm ${ui.sub}`}>None for this plant.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {reminders.map((reminder) => (
                    <div key={reminder.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${rowBg}`}>
                      <button
                        onClick={() => toggleReminderMutation.mutate({ id: reminder.id, completed: !reminder.completed })}
                        aria-label={reminder.completed ? 'Mark not done' : 'Mark done'}
                        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${reminder.completed ? 'bg-green-500 border-green-500' : 'border-gray-400'}`}
                      >
                        {reminder.completed && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${reminder.completed ? 'line-through opacity-60' : ''} ${ui.text}`}>{reminder.title}</p>
                        {reminder.description && <p className={`text-xs ${ui.sub}`}>{reminder.description}</p>}
                        {reminder.due_date && <p className={`text-xs mt-0.5 ${ui.sub}`}>{format(parseISO(String(reminder.due_date).slice(0, 10)), 'EEE, MMM d')}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={sectionCls}>
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-semibold ${ui.text}`}>Tags</h2>
                <button onClick={() => setShowTagDialog(true)} className="flex items-center gap-1 text-sm font-semibold text-green-600">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {plant.tags && plant.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {plant.tags.map((tag, idx) => (
                    <button key={idx} onClick={() => removeTagMutation.mutate(tag)} aria-label={`Remove tag ${tag}`}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${ui.light ? 'bg-blue-100 text-blue-800' : 'bg-blue-700 text-white'}`}>
                      {tag} <X className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className={`mt-1 text-sm ${ui.sub}`}>None yet. Tags help you filter your garden.</p>
              )}
            </section>

            {/* Per-plant vacation is gone: vacations cover the whole garden now (Schedule).
                A plant that still has the old switch on can turn it off here. */}
            {vacationModeEnabled && (
              <section className={`${sectionCls} flex items-center justify-between gap-3`}>
                <p className={`text-sm ${ui.text}`}>
                  🏖️ Reminders paused for this plant
                  {plant.vacation_end_date ? ` until ${format(parseISO(plant.vacation_end_date), 'MMM d')}` : ''}.
                </p>
                <Button size="sm" variant="outline" onClick={() => toggleVacationModeMutation.mutate({ enabled: false, startDate: null, endDate: null })}>
                  Turn off
                </Button>
              </section>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-0">
            {!(Array.isArray(plant.care_history) && plant.care_history.length) && wateringLogs.length === 0 && (
              <p className={`text-sm text-center py-8 ${ui.sub}`}>Nothing logged yet. Waterings and care you log show up here.</p>
            )}
            {Array.isArray(plant.care_history) && plant.care_history.length > 0 && (
              <Card className={getThemedClasses()}>
                <CardContent className="p-6">
                  <h2 className={`text-xl font-semibold mb-4 ${getTextColor()}`}>Care & Rain</h2>
                  <div className="space-y-2">
                    {[...plant.care_history].reverse().slice(0, 30).map((h, i) => (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${getThemedClasses()}`}>
                        <p className={`font-medium ${getTextColor()}`}>
                          {h.type === 'rain'
                            ? `🌧️ Rain counted as watering${h.amount_in ? ` (${h.amount_in} in)` : ''}`
                            : `${CARE_META[h.type]?.icon || '✅'} ${CARE_META[h.type]?.label || h.type}`}
                        </p>
                        <span className={`text-sm ${getSecondaryTextColor()}`}>{h.date ? format(parseISO(h.date), 'MMM d, yyyy') : ''}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
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

          <TabsContent value="progress" className="mt-0">
            {plus ? (
              <GrowthTimeline plant={plant} photos={progressPhotos} ui={ui} />
            ) : (
            <>
            {plusReady && (
              <button onClick={() => navigate('/Premium')} className={`w-full text-left rounded-2xl p-4 border mb-4 ${getThemedClasses()}`}>
                <p className={`font-semibold ${getTextColor()}`}>🎞️ Growth time-lapse</p>
                <p className={`text-sm mt-1 ${getSecondaryTextColor()}`}>Plus lines up each photo with the last one, then plays them as a time-lapse and compares before and after.</p>
              </button>
            )}
            <Card className={getThemedClasses()}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className={getTextColor()}>📸 Progress Photos</CardTitle>
                  <Button
                    onClick={progressPhoto.openPicker}
                    disabled={isUploadingProgress}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {isUploadingProgress ? 'Uploading...' : 'Add Photo'}
                  </Button>
                  {progressPhoto.sheet}
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
            </>
            )}
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
                max={localToday()}
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
                {Number(plant?.water_days_rest) > 0 && Number(plant?.water_days_grow) > 0
                  ? (plant?.water_season === 'rest' ? 'Days between waterings while it rests (now)' : 'Days between waterings while it grows (now)')
                  : 'How many days between waterings'}
              </p>
            </div>
            {Number(plant?.water_days_rest) > 0 && Number(plant?.water_days_grow) > 0 && plant?.water_season !== 'rest' && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>
                  While it rests ({plant?.water_rest_season === 'summer' ? 'summer' : 'winter'}), water every
                </label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={editData.water_days_rest || plant?.water_days_rest || ''}
                  onChange={(e) => setEditData({...editData, water_days_rest: parseInt(e.target.value) || ''})}
                  className="theme-input"
                />
                <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>The app switches to this on its own when the season changes.</p>
              </div>
            )}
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>How it's watered</label>
              <Select
                value={editData.water_method || 'pour'}
                onValueChange={(value) => setEditData({...editData, water_method: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WATER_METHODS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.icon} {m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${getTextColor()}`}>Keep its exact watering days</p>
                <p className={`text-xs ${getSecondaryTextColor()}`}>For finicky plants. "Even out my schedule" won't move this one.</p>
              </div>
              <Switch
                checked={!!editData.water_strict}
                onCheckedChange={(v) => setEditData({...editData, water_strict: v})}
                aria-label="Keep its exact watering days"
              />
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
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Pot width (across the top)</label>
              <Select
                value={editData.pot_diameter_in}
                onValueChange={(value) => setEditData({...editData, pot_diameter_in: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {POT_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s} inches</SelectItem>
                  ))}
                  <SelectItem value="0">In the ground</SelectItem>
                </SelectContent>
              </Select>
              <p className={`text-xs mt-1 ${getSecondaryTextColor()}`}>
                Used to work out how much water to give
              </p>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Pot fit</label>
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
              <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Plant Type</label>
              <Select
                value={editData.plant_type}
                onValueChange={(value) => setEditData({...editData, plant_type: value})}
              >
                <SelectTrigger className="theme-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANT_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Time</label>
                <Input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="theme-input"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${getTextColor()}`}>Repeat</label>
                <select
                  value={reminderRepeat}
                  onChange={(e) => setReminderRepeat(e.target.value)}
                  className="theme-input w-full h-10 rounded-md border px-3 text-sm bg-white text-gray-900"
                >
                  <option value="">Never</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Every month</option>
                </select>
              </div>
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
                  due_date: reminderDate,
                  // Phone's local time → exact UTC moment for the push
                  schedule_time: new Date(`${reminderDate}T${reminderTime || '09:00'}`).toISOString(),
                  is_recurring: !!reminderRepeat,
                  recurrence_type: reminderRepeat || null,
                  original_time_phrase: reminderTime || '09:00',
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