import React, { useEffect, useState, useMemo, useRef } from "react";
import { localToday, toLocalDateString } from '@/lib/dates';
import { base44 } from "@/api/base44Client";
import { syncWateringPopups } from "@/lib/wateringPopups";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Droplets, AlertCircle, Sparkles, Mic, Bell, BellOff, Search, X, CheckSquare, LayoutGrid, Layers, Wand2 } from "lucide-react";
import { categorizePlants } from "@/functions/categorizePlants";
import SortFilterBar from "@/components/SortFilterBar";
import AddCategoryModal from "@/components/AddCategoryModal";

import DailyWeatherPopup from "@/components/DailyWeatherPopup";
import LocationPrompt from "@/components/plus/LocationPrompt";
import QuickLogModal from "@/components/QuickLogModal";

import PlantTypeStack from "@/components/PlantTypeStack";
import BulkActionBar from "@/components/BulkActionBar";
import WateringRound, { dueNow } from "@/components/WateringRound";
import NewPlantReview from "@/components/NewPlantReview";
import WelcomeBack from "@/components/WelcomeBack";
import NewPlantsNotice from "@/components/NewPlantsNotice";
import { fetchTrips, tripCovering, welcomeBackTrip, niceDay, addDays } from "@/lib/vacation";
import { whenPopupFree, releasePopup, popupBusy } from "@/lib/popupGate";
import { toast } from "sonner";
import { showAdForEvent } from "@/lib/admob";
import { usePlus, useMe } from "@/lib/plus";
import { refreshPlantData } from "@/lib/query-client";
import { withPendingWaterings } from "@/lib/outbox";
import { AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [wateringRemindersEnabled, setWateringRemindersEnabled] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [roundOpen, setRoundOpen] = useState(false);
  const [laterToday, setLaterToday] = useState(() => {
    try { return localStorage.getItem('hp_round_later') === localToday(); } catch { return false; }
  });
  const plus = usePlus();
  const me = useMe();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSkip, setReviewSkip] = useState(() => new Set()); // "Later" (this visit) or just saved
  const reviewWaitRef = useRef(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSeenTick, setBulkSeenTick] = useState(0);
  const bulkWaitRef = useRef(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeLater, setWelcomeLater] = useState(false);
  const welcomeWaitRef = useRef(null);
  const retriedRef = useRef(new Set());
  const [selectedIds, setSelectedIds] = useState([]);
  const [categorizing, setCategorizing] = useState(false);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('garden_sortBy') || null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('garden_viewMode') || 'stack');
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);

  useEffect(() => {
    checkAuthentication();
  }, []);

  useEffect(() => {
    localStorage.setItem('garden_sortBy', sortBy || '');
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('garden_viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = localStorage.getItem('theme') || 'light';
      setTheme(currentTheme);
      document.documentElement.setAttribute('data-theme', currentTheme);
    };
    
    handleThemeChange();
    window.addEventListener('storage', handleThemeChange);
    window.addEventListener('hp-theme-change', handleThemeChange); // was a 100ms poll
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
      window.removeEventListener('hp-theme-change', handleThemeChange);
    };
  }, []);

  const toggleSelectMode = () => {
    setSelectMode(s => !s);
    setSelectedIds([]);
  };

  const togglePlantSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Select (or deselect) a whole group at once: a type section, or every plant in one spot.
  const selectGroup = (ids, select) => {
    setSelectedIds(prev => select
      ? Array.from(new Set([...prev, ...ids]))
      : prev.filter(x => !ids.includes(x)));
  };

  const handleBulkDone = () => {
    setSelectedIds([]);
    setSelectMode(false);
    queryClient.invalidateQueries({ queryKey: ['plants'] });
  };

  const handleAutoCategorize = async () => {
    setCategorizing(true);
    try {
      await categorizePlants({});
      queryClient.invalidateQueries({ queryKey: ['plants'] });
    } finally {
      setCategorizing(false);
    }
  };

  const toggleWateringRemindersMutation = useMutation({
    mutationFn: async (enabled) => {
      await base44.auth.updateMe({ notifications_watering: enabled });
    },
    onSuccess: () => syncWateringPopups(),
  });

  const handleToggleWateringReminders = () => {
    const newVal = !wateringRemindersEnabled;
    setWateringRemindersEnabled(newVal);
    toggleWateringRemindersMutation.mutate(newVal);
  };

  const checkAuthentication = async () => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      
      if (isAuth) {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        setWateringRemindersEnabled(currentUser?.notifications_watering !== false);
        
        if (!currentUser?.location) {
          navigate('/Welcome');
          return;
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth error:', error);
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const { data: plants, isLoading, error, refetch } = useQuery({
    queryKey: ['plants', user?.email],
    queryFn: async () => {
      try {
        // Explicit limit: without one the server stops at 100 plants
        const result = await base44.entities.Plant.filter({ created_by: user.email }, undefined, 1000);
        // Waterings still waiting on this phone (no signal) show as done
        return withPendingWaterings(Array.isArray(result) ? result : (result?.data || []));
      } catch (err) {
        console.error("❌ Error fetching plants:", err);
        // Keep showing the garden we already have (no signal) instead of an empty one
        throw err;
      }
    },
    placeholderData: [], // (was initialData; that would count as fresh under the 30s staleTime and hide the real data)
    enabled: authChecked && !!user && !!user.location,
    // While a new plant is being named on the server, check back every few seconds
    refetchInterval: (q) => (Array.isArray(q.state.data) && q.state.data.some((p) => p?.add_status === 'identifying') ? 4000 : false),
    retry: 1,
    // No staleTime: 0 here any more: the garden list is kept for 30s between visits,
    // and every Plant write refreshes it automatically (api/base44Client.js).
  });

  // Safety net: any plant photo without a card-sized copy gets one made in the
  // background (covers plants added before thumbnails existed, or via other paths).
  const thumbJobRef = useRef(false);
  useEffect(() => {
    if (!plants?.length || thumbJobRef.current) return;
    const missing = plants.filter(p => p.image_url && !p.thumbnail_url).length;
    if (!missing) return;
    thumbJobRef.current = true;
    (async () => {
      try {
        for (let i = 0; i < 10; i++) {
          const res = await base44.functions.invoke('generateThumbnails', {});
          const data = res?.data ?? res;
          if (!data?.success || !data.remaining) break;
        }
        queryClient.invalidateQueries({ queryKey: ['plants'] });
      } catch (e) {
        console.warn('[thumbnails] backfill failed:', e?.message || e);
      } finally {
        thumbJobRef.current = false;
      }
    })();
  }, [plants]);

  const { data: activeEvents = [] } = useQuery({
    queryKey: ['activeEvents', user?.email],
    queryFn: async () => {
      try {
        const result = await base44.entities.GameEvent.filter({ resolved: false });
        return Array.isArray(result) ? result : [];
      } catch (err) {
        console.error("Error fetching events:", err);
        return [];
      }
    },
    placeholderData: [], // (was initialData; that would count as fresh under the 30s staleTime and hide the real data)
    enabled: authChecked && !!user && !!user.location,
    retry: 1,
  });

  // Trips (Schedule > Vacations): away = garden-wide pause on watering reminders
  const { data: trips = [] } = useQuery({
    queryKey: ['vacations', user?.email],
    queryFn: () => fetchTrips(user.email),
    enabled: authChecked && !!user?.email,
    placeholderData: [],
    retry: 1,
  });
  const todayStr = localToday();
  const awayTrip = tripCovering(trips, todayStr);
  // Back from a trip with a sitter plan nobody has answered yet
  const pendingBack = welcomeBackTrip(trips, todayStr);
  let askedLater = welcomeLater;
  try { askedLater = askedLater || (!!pendingBack && !!sessionStorage.getItem(`hp_welcome_later_${pendingBack.id}`)); } catch { /* ignore */ }
  const backTrip = askedLater ? null : pendingBack;
  // Away, or just back (first 2 days) with the question still open: the watering banner
  // waits, since the sitter's waterings aren't logged yet. "Ask me later" shows it again.
  const holdTrip = awayTrip || (backTrip ? tripCovering(trips, todayStr, true) : null);

  // Check for today's watering reminder
  const { data: todayReminder, refetch: refetchTodayReminder } = useQuery({
    queryKey: ['todayWateringReminder', user?.email],
    queryFn: async () => {
      if (!user?.email) return null; // Ensure user is available before fetching
      const today = localToday();
      const reminders = await base44.entities.DailyWateringReminder.filter({
        user_email: user.email,
        reminder_date: today
      });
      return reminders[0] || null;
    },
    enabled: !!user,
    refetchInterval: 300000, // was every minute; the daily reminder is created once a day by a scheduled job
  });

  const dismissWateringReminder = async (status) => {
    if (!todayReminder) return;
    
    await base44.entities.DailyWateringReminder.update(todayReminder.id, {
      dismissed: true
    });
    
    // Refetch to update UI
    refetchTodayReminder(); // Use specific refetch for the reminder
    
    if (status === 'done') {
      // Optional: Show a nice message
      const event = new CustomEvent('showToast', { 
        detail: { message: '🌱 Great job watering your plants!', type: 'success' } 
      });
      window.dispatchEvent(event);
    }
  };

  const plantsList = useMemo(() => (Array.isArray(plants) ? plants : []), [plants]);
  const hasUncategorized = plantsList.some(p => !p.plant_type || p.plant_type === 'Other');

  // Group by plant type, filtered by search, with sort support
  const groupedPlants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? plantsList.filter(p =>
          (p.plant_type || '').toLowerCase().includes(q) ||
          (p.name || '').toLowerCase().includes(q) ||
          (p.nickname || '').toLowerCase().includes(q)
        )
      : plantsList;

    // Within-group sort: pinned first, then by name
    const withinGroupSort = (a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '');
    };

    // For water_soon and location sorts — flatten, sort, then skip grouping
    if (sortBy === 'water_soon') {
      const sorted = [...filtered].sort((a, b) => {
        // Sort by the due date string itself (YYYY-MM-DD sorts correctly); no time-of-day math.
        return (a.next_watering_due || '9999') .localeCompare(b.next_watering_due || '9999');
      });
      return [["By Watering Schedule", sorted]];
    }

    if (sortBy === 'location') {
      const groups = {};
      [...filtered].forEach(p => {
        const loc = p.location || 'No Location';
        if (!groups[loc]) groups[loc] = [];
        groups[loc].push(p);
      });
      return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }

    if (sortBy === 'date_added') {
      const sorted = [...filtered].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      return [["Recently Added", sorted]];
    }

    // Default: group by type A–Z
    const groups = {};
    [...filtered].sort(withinGroupSort).forEach(plant => {
      const type = plant.plant_type || 'Other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(plant);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [plantsList, searchQuery, sortBy]);



  // Helper functions for theming
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



  const getSeasonalThemes = () => {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    
    // Kawaii is always available
    const themes = ['kawaii'];
    
    // January 1-2: New Years
    if (month === 1 && day <= 2) {
      themes.push('newyears');
    }
    // January 3 - February 7: Winter
    else if ((month === 1 && day >= 3) || (month === 2 && day <= 7)) {
      themes.push('winter');
    }
    // February 8-14: Valentine's
    else if (month === 2 && day >= 8 && day <= 14) {
      themes.push('valentines');
    }
    // February 15 - March 16: Winter
    else if ((month === 2 && day >= 15) || (month === 3 && day <= 16)) {
      themes.push('winter');
    }
    // March 17: St. Patrick's
    else if (month === 3 && day === 17) {
      themes.push('stpatricks');
    }
    // March 18 - June 21: Spring
    else if ((month === 3 && day >= 18) || month === 4 || month === 5 || (month === 6 && day <= 21)) {
      themes.push('spring');
    }
    // June 22 - July 3: Summer
    else if ((month === 6 && day >= 22) || (month === 7 && day <= 3)) {
      themes.push('summer');
    }
    // July 4: Fourth of July
    else if (month === 7 && day === 4) {
      themes.push('fourthofjuly');
    }
    // July 5 - August 20: Summer
    else if ((month === 7 && day >= 5) || (month === 8 && day <= 20)) {
      themes.push('summer');
    }
    // August 21 - September 30: Fall
    else if ((month === 8 && day >= 21) || month === 9) {
      themes.push('fall');
    }
    // October 1-31: Halloween
    else if (month === 10) {
      themes.push('halloween');
    }
    // November 1-30: Fall
    else if (month === 11) {
      themes.push('fall');
    }
    // December 1-25: Christmas
    else if (month === 12 && day <= 25) {
      themes.push('christmas');
    }
    // December 26-30: Winter
    else if (month === 12 && day >= 26 && day <= 30) {
      themes.push('winter');
    }
    // December 31 - January 1: New Years
    else if (month === 12 && day === 31) {
      themes.push('newyears');
    }
    
    return themes;
  };

  const cycleSecretTheme = () => {
    const secretThemes = getSeasonalThemes();
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    let nextTheme;
    if (secretThemes.includes(currentTheme)) {
      const currentIndex = secretThemes.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % secretThemes.length;
      nextTheme = secretThemes[nextIndex];
    } else {
      nextTheme = secretThemes[0]; // Default to first available (kawaii or seasonal)
    }
    
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    
    window.dispatchEvent(new Event('storage'));
  };

  const cycleAllThemes = () => {
    const allThemes = [
      'light', 'dark', 'botanical', 'kawaii', 'halloween', 'christmas',
      'valentines', 'newyears', 'stpatricks', 'fourthofjuly', 'summer', 'spring', 'fall', 'winter'
    ];
    const currentTheme = localStorage.getItem('theme') || 'light';
    const currentIndex = allThemes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % allThemes.length;
    const nextTheme = allThemes[nextIndex];
    
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    
    window.dispatchEvent(new Event('storage'));
  };

  // ---- New plants: being named on the server, then "Check your new plant" ----
  const identifyingPlants = plantsList.filter((p) => p.add_status === 'identifying');
  // One plant added: the check opens right away. Several at once (add_info.bulk) or put off
  // with "Later": no popup per plant; they wait under "Newly added" until the owner opens
  // each one and says where it lives.
  const reviewQueue = plantsList
    .filter((p) => (p.add_status === 'review' || p.add_status === 'failed') && !reviewSkip.has(p.id) && !p.add_info?.bulk && !p.add_info?.later)
    .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
  const reviewPlant = reviewQueue[0] || null;

  // Open the check when there's one to do, waiting for any other popup to finish first
  useEffect(() => {
    if (!reviewPlant || reviewOpen || reviewWaitRef.current) return;
    reviewWaitRef.current = whenPopupFree('review', () => { reviewWaitRef.current = null; setReviewOpen(true); }, { firstDelay: 600 });
  }, [reviewPlant?.id, reviewOpen]);
  useEffect(() => () => { reviewWaitRef.current?.(); releasePopup('review'); }, []);

  // "Newly added": everything not set up yet, newest first
  const newPlants = plantsList
    .filter((p) => ['identifying', 'review', 'failed'].includes(p.add_status))
    .sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));

  // Several plants added at once: one note, not a question per plant
  const bulkSeen = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('hp_bulk_announced') || '[]')); } catch { return new Set(); }
  })();
  void bulkSeenTick; // re-read after "Got it"
  // (only plants that still need a place; a batch added with its area picked doesn't)
  const bulkUnseen = newPlants.filter((p) => p.add_info?.bulk && !String(p.location || '').trim() && !bulkSeen.has(p.id));
  useEffect(() => {
    if (!bulkUnseen.length || bulkOpen || bulkWaitRef.current) return;
    bulkWaitRef.current = whenPopupFree('bulknew', () => { bulkWaitRef.current = null; setBulkOpen(true); }, { firstDelay: 700 });
  }, [bulkUnseen.length, bulkOpen]);
  useEffect(() => () => { bulkWaitRef.current?.(); releasePopup('bulknew'); }, []);
  const closeBulk = () => {
    try {
      const ids = [...bulkSeen, ...newPlants.filter((p) => p.add_info?.bulk).map((p) => p.id)].slice(-300);
      localStorage.setItem('hp_bulk_announced', JSON.stringify(ids));
    } catch { /* ignore */ }
    setBulkSeenTick((t) => t + 1);
    setBulkOpen(false);
    releasePopup('bulknew');
    showPendingAddAd();
  };
  // One ad per add, after the last popup about it closes (never on top of one)
  const showPendingAddAd = () => {
    let pending = false;
    try { pending = sessionStorage.getItem('hp_add_ad_pending') === '1'; sessionStorage.removeItem('hp_add_ad_pending'); } catch { /* ignore */ }
    if (pending) setTimeout(() => showAdForEvent('add'), 800);
  };
  // An add with nothing to ask (several plants, area already picked): the ad comes once the
  // garden has loaded and nothing else is up
  useEffect(() => {
    let pending = false;
    try { pending = sessionStorage.getItem('hp_add_ad_pending') === '1'; } catch { /* ignore */ }
    if (!pending || !plantsList.length) return;
    if (identifyingPlants.length || reviewQueue.length || bulkUnseen.length || bulkOpen || reviewOpen) return;
    const t = setTimeout(() => { if (!popupBusy()) showPendingAddAd(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantsList.length, identifyingPlants.length, reviewQueue.length, bulkUnseen.length, bulkOpen, reviewOpen]);

  const closeReview = (skipIds = []) => {
    setReviewSkip((s) => { const n = new Set(s); skipIds.forEach((id) => n.add(id)); return n; });
    setReviewOpen(false);
    releasePopup('review');
    reviewWaitRef.current = null;
  };
  const reviewSaved = (p) => {
    const remaining = reviewQueue.filter((x) => x.id !== p.id);
    setReviewSkip((s) => new Set(s).add(p.id));
    if (remaining.length) return; // next one shows in the same sheet
    closeReview();
    showPendingAddAd();
  };

  // After a trip with a sitter plan: "Did your sitter water as planned?" (one popup at a time)
  useEffect(() => {
    if (!backTrip || welcomeOpen || welcomeWaitRef.current) return;
    try { if (sessionStorage.getItem(`hp_welcome_later_${backTrip.id}`)) return; } catch { /* ignore */ }
    welcomeWaitRef.current = whenPopupFree('welcome', () => { welcomeWaitRef.current = null; setWelcomeOpen(true); }, { firstDelay: 900 });
  }, [backTrip?.id, welcomeOpen]);
  useEffect(() => () => { welcomeWaitRef.current?.(); releasePopup('welcome'); }, []);
  const closeWelcome = (how) => {
    if (how === 'later') {
      try { sessionStorage.setItem(`hp_welcome_later_${backTrip?.id}`, '1'); } catch { /* ignore */ }
      setWelcomeLater(true);
    }
    setWelcomeOpen(false);
    releasePopup('welcome');
    welcomeWaitRef.current = null;
    queryClient.invalidateQueries({ queryKey: ['vacations'] });
  };
  // Home early: the trip ends yesterday, reminders start again today
  const endTripEarly = async () => {
    if (!awayTrip) return;
    try {
      await base44.entities.VacationDay.update(awayTrip.id, { end_date: addDays(todayStr, -1) });
      queryClient.invalidateQueries({ queryKey: ['vacations'] });
    } catch {
      toast.error("Couldn't reach Happy Plants. Try again in a moment.");
    }
  };

  // A plant stuck "naming" for 3+ minutes (app was closed, signal dropped): ask the
  // server to try again. The server also retries on its own every hour.
  const identifyingKey = identifyingPlants.map((p) => p.id).join(',');
  useEffect(() => {
    for (const p of identifyingPlants) {
      if (retriedRef.current.has(p.id)) continue;
      const started = Date.parse(p.add_info?.started_at || p.created_date) || 0;
      if (Date.now() - started < 3 * 60 * 1000 || (Number(p.add_info?.tries) || 0) >= 3) continue;
      retriedRef.current.add(p.id);
      base44.functions.invoke('identifyPlantWithExpert', { plant_id: p.id }).then(() => refreshPlantData()).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifyingKey]);

  // New plants get a watering profile (how it's watered, finicky or not, seasonal
  // intervals for succulents) right away instead of waiting for the hourly sweep.
  const unprofiled = plantsList.filter((p) => !p.care_profile).length;
  useEffect(() => {
    if (!unprofiled) return;
    const key = `hp_profile_try_${unprofiled}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    base44.functions.invoke('plus', { action: 'profile' })
      .then(({ data }) => { if (data?.profiled) refreshPlantData(); })
      .catch(() => {});
  }, [unprofiled]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="theme-text">Loading your garden...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div 
        className="fixed inset-0 flex items-center justify-center theme-bg overflow-hidden"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="text-center max-w-md px-6 w-full">
          <div className={`rounded-3xl p-8 ${getThemedClasses()}`}>
            <div className="w-24 h-24 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <h1 className={`text-3xl font-bold mb-3 ${getTextColor()}`}>Welcome to Happy Plants</h1>
            <p className={`mb-8 ${getSecondaryTextColor()}`}>Please log in to manage your garden</p>
            <button 
              onClick={() => navigate('/Welcome')}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl shadow-lg text-lg"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const eventsList = Array.isArray(activeEvents) ? activeEvents : [];

  // Check if there are plants needing water today
  const plantsNeedingWaterToday = plantsList.filter(plant => {
  if (!plant?.next_watering_due) return false;
  const today = localToday();
  return plant.next_watering_due <= today; // Include overdue plants
  });

  // Due right now (not on vacation, not already watered today), for the watering round
  const dueToday = dueNow(plantsList);
  const dueAreas = (() => {
    const m = new Map();
    for (const p of dueToday) {
      const raw = String(p.location || '').trim();
      const k = raw.toLowerCase() || '~none';
      if (!m.has(k)) m.set(k, { label: raw || 'No area', n: 0 });
      m.get(k).n++;
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  })();
  const dueAreaText = dueAreas.length === 1
    ? (dueAreas[0].label === 'No area' ? null : `All in ${dueAreas[0].label}`)
    : dueAreas.slice(0, 2).map((a) => `${a.label} ${a.n}`).join(' · ') + (dueAreas.length > 2 ? ` · +${dueAreas.length - 2} more` : '');

  // Shows for everyone with something due (not only on days the 8 AM push went out)
  const showWateringReminder = dueToday.length > 0 && !laterToday && !todayReminder?.dismissed && !holdTrip;

  const roundUi = {
    card: getThemedClasses(),
    text: getTextColor(),
    sub: getSecondaryTextColor(),
    light: getTextColor() === 'text-gray-900',
  };

  const remindLater = () => {
    try { localStorage.setItem('hp_round_later', localToday()); } catch { /* ignore */ }
    setLaterToday(true);
    if (todayReminder && !todayReminder.dismissed) dismissWateringReminder('not_yet');
  };



  return (
    <>
      <DailyWeatherPopup />
      <LocationPrompt plantCount={plants?.length || 0} />
      {bulkOpen && (
        <NewPlantsNotice count={Math.max(1, bulkUnseen.length)} ui={roundUi} onClose={closeBulk} />
      )}
      {welcomeOpen && backTrip && (
        <WelcomeBack trip={backTrip} ui={roundUi} onClose={closeWelcome} />
      )}
      {reviewOpen && reviewPlant && (
        <NewPlantReview
          plant={reviewPlant}
          allPlants={plantsList}
          ui={roundUi}
          navigate={navigate}
          onDone={reviewSaved}
          onLater={() => {
            // Put off: it waits under "Newly added" instead of popping up again
            for (const p of reviewQueue) {
              base44.entities.Plant.update(p.id, { add_info: { ...(p.add_info || {}), later: true } }).catch(() => {});
            }
            closeReview(reviewQueue.map((p) => p.id));
            showPendingAddAd();
          }}
        />
      )}
      <WateringRound
        open={roundOpen}
        onClose={() => setRoundOpen(false)}
        plants={plantsList}
        user={me || user}
        plus={plus}
        ui={roundUi}
        onAllDone={() => { if (todayReminder && !todayReminder.dismissed) dismissWateringReminder('done'); }}
      />
      <div className={`min-h-screen theme-bg overflow-y-auto ${selectMode ? 'pb-72' : 'pb-28'}`}>
        <div className="max-w-6xl mx-auto px-4 pt-6">

          {/* Header: date + title */}
          <div className="mb-3">
            <p className={`text-xs font-medium uppercase tracking-widest mb-1 ${getSecondaryTextColor()}`}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className={`text-3xl font-bold tracking-tight ${getTextColor()}`}>
              My Garden
            </h1>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => navigate('/AddPlant')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
              <button
                onClick={() => setShowQuickLog(true)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 ${getThemedClasses()} ${getTextColor()}`}
              >
                <Mic className="w-3 h-3" /> Quick Log
              </button>
              <button
                onClick={() => setShowAddCategory(true)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 ${getThemedClasses()} ${getTextColor()}`}
              >
                <Plus className="w-3 h-3" /> Category
              </button>
            </div>
          </div>

          {/* Toolbar: count, sort, select, view, reminders */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {/* Plant count badge */}
            <div className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold ${getThemedClasses()} ${getTextColor()}`}>
              🌿 <span>{plantsList.length}</span>
            </div>
            {/* Watering round: only what's due, by area */}
            {dueToday.length > 0 && !holdTrip && (
              <button
                onClick={() => setRoundOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold bg-blue-600 text-white active:scale-95"
                aria-label={`Water ${dueToday.length} due plants`}
              >
                <Droplets className="w-4 h-4" /> {dueToday.length} due
              </button>
            )}
            {/* Sort */}
            {plantsList.length > 0 && (
              <SortFilterBar
                sortBy={sortBy}
                onSortChange={setSortBy}
                textColor={getTextColor()}
                secondaryTextColor={getSecondaryTextColor()}
                themedClasses={getThemedClasses()}
              />
            )}
            {/* Select mode */}
            {plantsList.length > 0 && (
              <button
                onClick={toggleSelectMode}
                title={selectMode ? 'Cancel selection' : 'Select plants'}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  selectMode
                    ? 'bg-red-500/20 text-red-400'
                    : `${getThemedClasses()} ${getSecondaryTextColor()}`
                }`}
              >
                <CheckSquare className="w-4 h-4" />
              </button>
            )}
            {/* View mode toggle */}
            <button
              onClick={() => setViewMode(v => v === 'stack' ? 'tile' : 'stack')}
              title={viewMode === 'stack' ? 'Switch to tile view' : 'Switch to stack view'}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${getThemedClasses()} ${getSecondaryTextColor()}`}
            >
              {viewMode === 'stack' ? <LayoutGrid className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            </button>
            {/* Watering reminders toggle */}
            <button
              onClick={handleToggleWateringReminders}
              title={wateringRemindersEnabled ? 'Reminders on' : 'Reminders off'}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                wateringRemindersEnabled
                  ? 'bg-blue-500/20 text-blue-400'
                  : `${getThemedClasses()} ${getSecondaryTextColor()} opacity-50`
              }`}
            >
              {wateringRemindersEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
          </div>

          {/* Newly added: plants still to set up (where they live, care). They leave once
              the owner saves where the plant lives, not just by opening it. */}
          {newPlants.length > 0 && (
            <section className="mb-5" aria-label="Newly added">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className={`text-sm font-bold ${getTextColor()}`}>🌱 Newly added ({newPlants.length})</p>
                <p className={`text-xs ${getSecondaryTextColor()}`}>Tap one to say where it lives</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                {newPlants.map((p) => {
                  const naming = p.add_status === 'identifying';
                  const img = p.thumbnail_url || p.image_url;
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/PlantDetail?id=${p.id}`)}
                      className={`shrink-0 w-28 rounded-2xl overflow-hidden text-left active:scale-95 transition ${getThemedClasses()}`}
                      aria-label={naming ? 'New plant, still being named' : `Set up ${p.nickname || p.name}`}
                    >
                      <div className="relative h-20 bg-green-100">
                        {img
                          ? <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                          : <span className="w-full h-full flex items-center justify-center text-3xl" aria-hidden>🪴</span>}
                        {naming && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className={`text-xs font-semibold truncate ${getTextColor()}`}>{naming ? 'Naming…' : (p.nickname || p.name)}</p>
                        <p className={`text-[10px] truncate ${getSecondaryTextColor()}`}>
                          {naming ? 'Almost ready' : p.add_status === 'failed' ? "Couldn't name it" : (p.scientific_name ? <i>{p.scientific_name}</i> : 'Set it up')}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Away: watering reminders paused for the whole garden */}
          {awayTrip && (
            <div className="mb-5 rounded-2xl shadow-lg border border-cyan-400/30 bg-gradient-to-r from-cyan-500/20 to-blue-500/10 backdrop-blur-md">
              <div className="flex items-center gap-3 p-4">
                <span className="text-2xl" aria-hidden>🏖️</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${getTextColor()}`}>On vacation until {niceDay(awayTrip.end_date)}</p>
                  <p className={`text-xs ${getSecondaryTextColor()}`}>Watering reminders are paused{plus ? '. Frost alerts still come' : ''}.</p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => navigate(`/VacationReview?id=${awayTrip.id}`)}
                    className="px-3 py-1.5 rounded-xl bg-cyan-600 text-white text-xs font-bold"
                  >
                    Sitter plan
                  </button>
                  {String(awayTrip.start_date).slice(0, 10) < todayStr && (
                    <button
                      onClick={endTripEarly}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${getThemedClasses()} ${getTextColor()}`}
                    >
                      I'm back
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Watering Reminder Banner */}
          {showWateringReminder && wateringRemindersEnabled && (
            <div className="mb-5 rounded-2xl overflow-hidden shadow-lg border border-blue-400/30 bg-gradient-to-r from-blue-500/20 to-cyan-500/10 backdrop-blur-md">
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Droplets className="w-5 h-5 text-blue-400 animate-bounce" />
                </div>
                <button onClick={() => setRoundOpen(true)} className="flex-1 min-w-0 text-left">
                  <p className={`font-bold text-sm ${getTextColor()}`}>Time to water!</p>
                  <p className={`text-xs ${getSecondaryTextColor()}`}>
                    {dueToday.length} {dueToday.length === 1 ? 'plant needs' : 'plants need'} water today
                  </p>
                  {dueAreaText && <p className={`text-xs truncate ${getSecondaryTextColor()}`}>{dueAreaText}</p>}
                </button>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setRoundOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold"
                  >
                    Start
                  </button>
                  <button
                    onClick={remindLater}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${getThemedClasses()} ${getTextColor()}`}
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Emergency Alert */}
          {eventsList.length > 0 && (
            <div className="mb-5 rounded-2xl overflow-hidden shadow-lg border border-red-400/40 bg-gradient-to-r from-red-500/20 to-orange-500/10 backdrop-blur-md">
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${getTextColor()}`}>⚠️ Weather Emergency</p>
                  {eventsList.map(event => (
                    <p key={event.id} className={`text-xs ${getSecondaryTextColor()}`}>{event.message}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          {plantsList.length > 0 && (
            <div className={`relative mb-5 flex items-center rounded-2xl px-4 py-2.5 ${getThemedClasses()}`}>
              <Search className={`w-4 h-4 flex-shrink-0 mr-3 ${getSecondaryTextColor()}`} />
              <input
                type="text"
                placeholder="Search by type or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={`flex-1 bg-transparent text-sm outline-none ${getTextColor()} placeholder:opacity-50`}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}>
                  <X className={`w-4 h-4 ${getSecondaryTextColor()}`} />
                </button>
              )}
            </div>
          )}

          {/* Auto-categorize nudge */}
          {hasUncategorized && !categorizing && (
            <div className={`mb-5 rounded-2xl overflow-hidden border border-violet-400/30 bg-gradient-to-r from-violet-500/20 to-purple-500/10 backdrop-blur-md`}>
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Wand2 className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${getTextColor()}`}>Some plants aren't categorized</p>
                  <p className={`text-xs ${getSecondaryTextColor()}`}>Let AI sort them into the right types</p>
                </div>
                <button
                  onClick={handleAutoCategorize}
                  className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-xs font-bold flex-shrink-0"
                >
                  Auto-fix
                </button>
              </div>
            </div>
          )}
          {categorizing && (
            <div className={`mb-5 rounded-2xl p-4 flex items-center gap-3 border border-violet-400/30 bg-violet-500/10 backdrop-blur-md`}>
              <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className={`text-sm font-semibold ${getTextColor()}`}>Categorizing your plants…</p>
            </div>
          )}

          {/* Stacked wallet cards grouped by plant type */}
          {plantsList.length === 0 ? (
            <div className={`text-center py-20 rounded-3xl ${getThemedClasses()} px-8`}>
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <Sparkles className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className={`text-2xl font-extrabold mb-2 ${getTextColor()}`}>Start Your Garden</h2>
              <p className={`text-sm mb-6 ${getSecondaryTextColor()}`}>
                Add your first plant using your camera, voice, or by name
              </p>
              <button
                onClick={() => navigate('/AddPlant')}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg"
              >
                <Plus className="w-4 h-4" /> Add Your First Plant
              </button>
            </div>
          ) : groupedPlants.length === 0 ? (
            <div className={`text-center py-12 rounded-3xl ${getThemedClasses()}`}>
              <p className={`text-sm font-semibold ${getTextColor()}`}>No plants match your search</p>
              <button onClick={() => setSearchQuery('')} className="mt-2 text-emerald-500 text-sm font-bold">Clear</button>
            </div>
          ) : (
            groupedPlants.map(([type, typePlants], i) => (
              <PlantTypeStack
                key={type}
                plantType={type}
                plants={typePlants}
                wateringRemindersEnabled={wateringRemindersEnabled}
                themedClasses={getThemedClasses()}
                textColor={getTextColor()}
                secondaryTextColor={getSecondaryTextColor()}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={togglePlantSelection}
                onSelectGroup={selectGroup}
                stackIndex={i}
                viewMode={viewMode}
                showHeader={!(sortBy === 'water_soon' || sortBy === 'date_added')}
              />
            ))
          )}

          <div className="mt-10 flex justify-center">
            <button
              onClick={cycleSecretTheme}
              className="text-[10px] opacity-20 hover:opacity-50 transition-opacity theme-text-secondary px-2 py-1"
            >
              don't click this
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectMode && (
          <BulkActionBar
            selectedIds={selectedIds}
            allPlants={plantsList}
            onDone={handleBulkDone}
            onCancel={toggleSelectMode}
            visibleIds={groupedPlants.flatMap(([, ps]) => ps.map(p => p.id))}
            onSelectAll={setSelectedIds}
            onSelectGroup={selectGroup}
          />
        )}
        {showQuickLog && (
          <QuickLogModal
            isOpen={showQuickLog}
            onClose={() => setShowQuickLog(false)}
            theme={theme}
          />
        )}
      </AnimatePresence>

      <AddCategoryModal
        isOpen={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        user={user}
        theme={theme}
      />
    </>
  );
}