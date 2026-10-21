import React, { useState } from "react";
import { localToday, toLocalDateString } from '@/lib/dates';
import { motion, AnimatePresence } from "framer-motion";
import {
  Droplets, Trash2, MapPin, Heart, AlertTriangle, X, ChevronDown, Plus, Check
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { showAdForEvent } from "@/lib/admob";
import { logWaterings } from "@/lib/watering";
import { refreshPlantData } from "@/lib/query-client";
import { toast } from "sonner";

// One request for the whole selection. Base44's PUT /bulk applies every change
// or none; if that route ever refuses, fall back to one request per plant.
// Before this, 20 selected plants meant 20 simultaneous requests from the phone
// (and 40 for watering), and a single failure left the spinner on forever.
async function bulkUpdatePlants(rows) {
  if (rows.length === 0) return;
  try {
    await base44.entities.Plant.bulkUpdate(rows);
  } catch (e) {
    console.warn('[bulk] bulkUpdate failed, falling back to per-plant updates:', e?.message || e);
    await Promise.all(rows.map(({ id, ...data }) => base44.entities.Plant.update(id, data)));
  }
}

const ENVIRONMENT_OPTIONS = [
  "Indoor", "Outdoor", "Balcony", "Patio", "Greenhouse", "Window Sill", "Office"
];

export default function BulkActionBar({ selectedIds, allPlants, onDone, onCancel, visibleIds = [], onSelectAll, onSelectGroup }) {
  const [showSpotPicker, setShowSpotPicker] = useState(false);
  const [loading, setLoading] = useState(null);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showWaterMenu, setShowWaterMenu] = useState(false);
  const todayStr = localToday();
  const [waterDate, setWaterDate] = useState(todayStr);
  const [newLocationInput, setNewLocationInput] = useState('');
  const [newLocationEnv, setNewLocationEnv] = useState('Indoor');
  const [showNewLocationInput, setShowNewLocationInput] = useState(false);

  const count = selectedIds.length;
  const selectedPlants = allPlants.filter(p => selectedIds.includes(p.id));
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));

  // Unique existing locations, each remembering its indoor/outdoor environment
  const locationEnv = {};
  allPlants.forEach(p => {
    if (p.location && !ENVIRONMENT_OPTIONS.includes(p.location) && !locationEnv[p.location]) {
      locationEnv[p.location] = p.environment || null;
    }
  });
  const existingLocations = Object.keys(locationEnv);

  // Plants grouped by spot, for "select everything in the kitchen"
  const plantsBySpot = {};
  allPlants.forEach(p => {
    const spot = p.location || 'No spot set';
    (plantsBySpot[spot] ||= []).push(p.id);
  });
  const spots = Object.entries(plantsBySpot).sort(([a], [b]) => a.localeCompare(b));

  const runBulkUpdate = async (data, label) => {
    setLoading(label);
    try {
      await bulkUpdatePlants(selectedIds.map(id => ({ id, ...data })));
      onDone();
    } catch (e) {
      console.error('[bulk] update failed:', e);
      toast.error("Couldn't update those plants. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  // Logs a watering for every selected plant on `today` (defaults to today, can be a past day).
  const handleWaterAll = async (dateStr) => {
    setShowWaterMenu(false);
    setLoading('water');
    const today = dateStr || todayStr;
    try {
      // Saved on the phone first, then sent in one request; the server skips repeats and
      // never moves a schedule backwards for an older day. No signal: it's sent later.
      const r = await logWaterings(selectedPlants, { date: today, method: 'bulk' });
      if (!r.synced) toast.success("Watered! No signal right now, so it'll sync when you're back online.");
      onDone();
      // Bulk watering = one ad
      showAdForEvent('water');
    } catch (e) {
      console.error('[bulk] watering failed:', e);
      toast.error("Couldn't log those waterings. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  // Same as moving one plant: indoors/outdoors changes its watering numbers (the server
  // skips plants with their own interval). Fire and forget; the hourly sweep is the backup.
  const retuneMoved = (environment) => {
    if (!environment) return;
    const ids = selectedPlants.filter((p) => p.environment !== environment).map((p) => p.id);
    for (let i = 0; i < ids.length; i += 50) {
      base44.functions.invoke('plus', { action: 'retune', plant_ids: ids.slice(i, i + 50) })
        .then(() => refreshPlantData()).catch(() => { /* the hourly sweep does it */ });
    }
  };

  const handleSetLocation = async (location, environment) => {
    setShowLocationMenu(false);
    setShowNewLocationInput(false);
    const data = environment ? { location, environment } : { location };
    setLoading('location');
    try {
      // A named plant under "Newly added" is set up once it has a place. One still waiting
      // for its name stays there (so it still gets named) and leaves once it's named.
      await bulkUpdatePlants(selectedPlants.map((p) => ({
        id: p.id,
        ...data,
        ...(p.add_status === 'review' ? { add_status: 'done' } : {}),
        ...(p.add_status === 'failed' ? { add_info: { ...(p.add_info || {}), place_chosen: true } } : {}),
      })));
      retuneMoved(environment);
      onDone();
    } catch (e) {
      console.error('[bulk] move failed:', e);
      toast.error("Couldn't move those plants. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleSetEnvironment = async (environment) => {
    setShowLocationMenu(false);
    await runBulkUpdate({ environment }, 'location');
    retuneMoved(environment);
  };

  const handleSetStatus = async (status) => {
    setShowStatusMenu(false);
    await runBulkUpdate({ status }, 'status');
  };

  const handleDelete = async () => {
    if (!count) return;
    if (!window.confirm(`Delete ${count} plant${count === 1 ? '' : 's'}? This can't be undone.`)) return;
    setLoading('delete');
    try {
      await Promise.all(selectedIds.map(id => base44.entities.Plant.delete(id)));
      onDone();
    } catch (e) {
      console.error('[bulk] delete failed:', e);
      toast.error("Couldn't delete all of those plants. Please try again.");
      onDone(); // refresh so whatever did get deleted disappears
    } finally {
      setLoading(null);
    }
  };

  const handlePinToggle = async () => {
    // Toggle — if all selected are pinned, unpin; otherwise pin all
    const allPinned = selectedPlants.every(p => p.pinned);
    await runBulkUpdate({ pinned: !allPinned }, 'pin');
  };

  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="fixed bottom-0 left-0 right-0 z-50"
    >
      {/* Location submenu */}
      <AnimatePresence>
        {showLocationMenu && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-4 mb-2 rounded-2xl overflow-hidden bg-gray-900 border border-white/10 shadow-2xl"
          >
            <p className="text-white/50 text-xs font-bold px-4 pt-3 pb-2 uppercase tracking-widest">Move to location</p>

            {/* Existing locations */}
            {existingLocations.map(loc => (
              <button
                key={loc}
                onClick={() => handleSetLocation(loc, locationEnv[loc])}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors flex items-center gap-2"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span className="flex-1">{loc}</span>
                {locationEnv[loc] && <span className="text-xs text-white/60">{locationEnv[loc]}</span>}
              </button>
            ))}

            {/* Environment presets */}
            <p className="text-white/30 text-xs font-bold px-4 pt-2 pb-1 uppercase tracking-widest">Environments</p>
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {ENVIRONMENT_OPTIONS.map(env => (
                <button
                  key={env}
                  onClick={() => handleSetEnvironment(env)}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                >
                  {env}
                </button>
              ))}
            </div>

            {/* Custom location input */}
            {showNewLocationInput ? (
              <div className="px-4 pb-3">
              <div className="flex gap-2 mb-2">
                {['Indoor', 'Outdoor'].map(env => (
                  <button
                    key={env}
                    onClick={() => setNewLocationEnv(env)}
                    className={`flex-1 text-xs font-bold py-1.5 rounded-xl ${newLocationEnv === env ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/70'}`}
                  >
                    {env}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newLocationInput}
                  onChange={e => setNewLocationInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && newLocationInput.trim() && handleSetLocation(newLocationInput.trim(), newLocationEnv)}
                  placeholder="e.g. Back porch, Bedroom..."
                  className="flex-1 bg-white/10 text-white text-sm px-3 py-2 rounded-xl outline-none placeholder:text-white/30 border border-white/20"
                />
                <button
                  onClick={() => newLocationInput.trim() && handleSetLocation(newLocationInput.trim(), newLocationEnv)}
                  className="bg-emerald-600 text-white px-3 py-2 rounded-xl"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewLocationInput(true)}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-emerald-400 hover:bg-white/10 transition-colors flex items-center gap-2 border-t border-white/10"
              >
                <Plus className="w-4 h-4" /> Add new spot
              </button>
            )}

            <button
              onClick={() => { setShowLocationMenu(false); setShowNewLocationInput(false); }}
              className="w-full py-3 text-sm text-white/40 border-t border-white/10"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spot picker: select every plant in one location */}
      <AnimatePresence>
        {showSpotPicker && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-4 mb-2 rounded-2xl overflow-hidden bg-gray-900 border border-white/10 shadow-2xl max-h-[50vh] overflow-y-auto"
          >
            <p className="text-white/50 text-xs font-bold px-4 pt-3 pb-2 uppercase tracking-widest">Select everything in…</p>
            {spots.map(([spot, ids]) => {
              const allIn = ids.every(id => selectedIds.includes(id));
              return (
                <button
                  key={spot}
                  onClick={() => onSelectGroup?.(ids, !allIn)}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  <MapPin className={`w-4 h-4 ${allIn ? 'text-emerald-400' : 'text-white/40'}`} />
                  <span className="flex-1">{spot}</span>
                  <span className="text-xs text-white/60">{ids.length}</span>
                  {allIn && <Check className="w-4 h-4 text-emerald-400" />}
                </button>
              );
            })}
            <button
              onClick={() => setShowSpotPicker(false)}
              className="w-full py-3 text-sm text-white/40 border-t border-white/10"
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Water submenu: today, yesterday, or any past date */}
      <AnimatePresence>
        {showWaterMenu && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-4 mb-2 rounded-2xl overflow-hidden bg-gray-900 border border-white/10 shadow-2xl"
          >
            <p className="text-white/50 text-xs font-bold px-4 pt-3 pb-2 uppercase tracking-widest">When were they watered?</p>
            <div className="flex gap-2 px-4 pb-3">
              <button
                onClick={() => handleWaterAll(todayStr)}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl bg-blue-600 text-white"
              >
                Today
              </button>
              <button
                onClick={() => {
                  const d = new Date(); d.setDate(d.getDate() - 1);
                  handleWaterAll(toLocalDateString(d));
                }}
                className="flex-1 text-sm font-bold py-2.5 rounded-xl bg-white/10 text-white"
              >
                Yesterday
              </button>
            </div>
            <div className="px-4 pb-3">
              <p className="text-white/30 text-xs font-bold pb-1 uppercase tracking-widest">Or pick a day</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={waterDate}
                  max={todayStr}
                  onChange={e => setWaterDate(e.target.value)}
                  className="flex-1 bg-white/10 text-white text-sm px-3 py-2 rounded-xl outline-none border border-white/20"
                />
                <button
                  onClick={() => waterDate && waterDate <= todayStr && handleWaterAll(waterDate)}
                  disabled={!waterDate || waterDate > todayStr}
                  className="bg-blue-600 text-white px-3 py-2 rounded-xl disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowWaterMenu(false)}
              className="w-full py-3 text-sm text-white/40 border-t border-white/10"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status submenu */}
      <AnimatePresence>
        {showStatusMenu && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-4 mb-2 rounded-2xl overflow-hidden bg-gray-900 border border-white/10 shadow-2xl"
          >
            <p className="text-white/50 text-xs font-bold px-4 pt-3 pb-2 uppercase tracking-widest">Mark plants as</p>
            {[
              { value: 'healthy', label: '💚 Healthy', desc: 'All good!' },
              { value: 'wilted', label: '🥀 Wilted / Sick', desc: 'Needs attention' },
              { value: 'recovering', label: '🌱 Recovering', desc: 'Getting better' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSetStatus(opt.value)}
                className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/5"
              >
                <p className="text-sm font-bold text-white">{opt.label}</p>
                <p className="text-xs text-white/40">{opt.desc}</p>
              </button>
            ))}
            <button
              onClick={() => setShowStatusMenu(false)}
              className="w-full py-3 text-sm text-white/40"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main action bar */}
      <div className="mx-3 mb-4 rounded-2xl bg-gray-900 border border-white/10 shadow-2xl overflow-hidden">
        {/* Count header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <span className="text-white font-bold text-sm">
            {count === 0 ? 'Tap plants to select' : `${count} plant${count !== 1 ? 's' : ''} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowLocationMenu(false); setShowStatusMenu(false); setShowWaterMenu(false); setShowSpotPicker(v => !v); }}
              className={`text-xs font-bold px-2 py-1 rounded-lg ${showSpotPicker ? 'bg-emerald-600 text-white' : 'bg-white/10 text-emerald-400'}`}
            >
              By Spot
            </button>
            <button
              onClick={() => onSelectAll?.(allSelected ? [] : visibleIds)}
              className="text-xs font-bold text-emerald-400 px-2 py-1 rounded-lg bg-white/10"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button onClick={onCancel} className="text-white/60 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-0">
          {/* Water */}
          <ActionBtn
            icon={<Droplets className="w-5 h-5" />}
            label="Water All"
            color="text-blue-400"
            loading={loading === 'water'}
            disabled={count === 0}
            onClick={() => { setShowSpotPicker(false); setShowLocationMenu(false); setShowStatusMenu(false); setShowWaterMenu(v => !v); }}
          />

          {/* Location */}
          <ActionBtn
            icon={<MapPin className="w-5 h-5" />}
            label="Move To"
            color="text-emerald-400"
            loading={loading === 'location'}
            disabled={count === 0}
            onClick={() => { setShowSpotPicker(false); setShowStatusMenu(false); setShowWaterMenu(false); setShowLocationMenu(v => !v); }}
          />

          {/* Status */}
          <ActionBtn
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Mark As"
            color="text-amber-400"
            loading={loading === 'status'}
            disabled={count === 0}
            onClick={() => { setShowSpotPicker(false); setShowLocationMenu(false); setShowWaterMenu(false); setShowStatusMenu(v => !v); }}
          />

          {/* Pin */}
          <ActionBtn
            icon={<Heart className="w-5 h-5" />}
            label="Pin / Unpin"
            color="text-pink-400"
            loading={loading === 'pin'}
            disabled={count === 0}
            onClick={handlePinToggle}
          />
        </div>

        {/* Delete — separate danger row */}
        <button
          onClick={handleDelete}
          disabled={count === 0 || loading === 'delete'}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-red-400 border-t border-white/10 disabled:opacity-50 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          {loading === 'delete' ? 'Deleting...' : `Delete ${count > 0 ? count : ''} Selected`}
        </button>
      </div>
    </motion.div>
  );
}

function ActionBtn({ icon, label, color, loading, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex flex-col items-center justify-center gap-1 py-3.5 px-2 hover:bg-white/10 transition-colors disabled:opacity-50 ${color}`}
    >
      {loading
        ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : icon
      }
      <span className="text-xs font-bold text-white leading-tight text-center">{label}</span>
    </button>
  );
}