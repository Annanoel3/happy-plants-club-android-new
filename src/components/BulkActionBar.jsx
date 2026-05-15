import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Droplets, Trash2, MapPin, Heart, AlertTriangle, X, ChevronDown, Plus, Check
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const ENVIRONMENT_OPTIONS = [
  "Indoor", "Outdoor", "Balcony", "Patio", "Greenhouse", "Window Sill", "Office"
];

export default function BulkActionBar({ selectedIds, allPlants, onDone, onCancel }) {
  const [loading, setLoading] = useState(null);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [newLocationInput, setNewLocationInput] = useState('');
  const [showNewLocationInput, setShowNewLocationInput] = useState(false);

  const count = selectedIds.length;
  const selectedPlants = allPlants.filter(p => selectedIds.includes(p.id));

  // Collect unique existing locations from all plants
  const existingLocations = [...new Set(allPlants.map(p => p.location).filter(Boolean))];

  const runBulkUpdate = async (data, label) => {
    setLoading(label);
    await Promise.all(selectedIds.map(id => base44.entities.Plant.update(id, data)));
    setLoading(null);
    onDone();
  };

  const handleWaterAll = async () => {
    setLoading('water');
    const today = new Date().toISOString().split('T')[0];
    await Promise.all(selectedPlants.map(plant => {
      const freq = plant.water_frequency_days || 7;
      const next = new Date();
      next.setDate(next.getDate() + freq);
      const nextStr = next.toISOString().split('T')[0];
      return Promise.all([
        base44.entities.Plant.update(plant.id, {
          last_watered: today,
          next_watering_due: nextStr,
          total_waterings: (plant.total_waterings || 0) + 1,
        }),
        base44.entities.WateringLog.create({
          plant_id: plant.id,
          plant_name: plant.nickname || plant.name,
          watered_date: today,
          method: 'bulk',
        }),
      ]);
    }));
    setLoading(null);
    onDone();
  };

  const handleSetLocation = async (location) => {
    setShowLocationMenu(false);
    setShowNewLocationInput(false);
    await runBulkUpdate({ location }, 'location');
  };

  const handleSetStatus = async (status) => {
    setShowStatusMenu(false);
    await runBulkUpdate({ status }, 'status');
  };

  const handleDelete = async () => {
    setLoading('delete');
    await Promise.all(selectedIds.map(id => base44.entities.Plant.delete(id)));
    setLoading(null);
    onDone();
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
            className="mx-4 mb-2 rounded-2xl overflow-hidden bg-gray-900/98 backdrop-blur-md border border-white/10 shadow-2xl"
          >
            <p className="text-white/50 text-xs font-bold px-4 pt-3 pb-2 uppercase tracking-widest">Move to location</p>

            {/* Existing locations */}
            {existingLocations.map(loc => (
              <button
                key={loc}
                onClick={() => handleSetLocation(loc)}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors flex items-center gap-2"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
                {loc}
              </button>
            ))}

            {/* Environment presets */}
            <p className="text-white/30 text-xs font-bold px-4 pt-2 pb-1 uppercase tracking-widest">Environments</p>
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {ENVIRONMENT_OPTIONS.map(env => (
                <button
                  key={env}
                  onClick={() => handleSetLocation(env)}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                >
                  {env}
                </button>
              ))}
            </div>

            {/* Custom location input */}
            {showNewLocationInput ? (
              <div className="px-4 pb-3 flex gap-2">
                <input
                  autoFocus
                  value={newLocationInput}
                  onChange={e => setNewLocationInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && newLocationInput.trim() && handleSetLocation(newLocationInput.trim())}
                  placeholder="e.g. Back porch, Bedroom..."
                  className="flex-1 bg-white/10 text-white text-sm px-3 py-2 rounded-xl outline-none placeholder:text-white/30 border border-white/20"
                />
                <button
                  onClick={() => newLocationInput.trim() && handleSetLocation(newLocationInput.trim())}
                  className="bg-emerald-600 text-white px-3 py-2 rounded-xl"
                >
                  <Check className="w-4 h-4" />
                </button>
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

      {/* Status submenu */}
      <AnimatePresence>
        {showStatusMenu && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-4 mb-2 rounded-2xl overflow-hidden bg-gray-900/98 backdrop-blur-md border border-white/10 shadow-2xl"
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
      <div className="mx-3 mb-4 rounded-2xl bg-gray-900/98 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
        {/* Count header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <span className="text-white font-bold text-sm">
            {count === 0 ? 'Tap plants to select' : `${count} plant${count !== 1 ? 's' : ''} selected`}
          </span>
          <button onClick={onCancel} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
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
            onClick={handleWaterAll}
          />

          {/* Location */}
          <ActionBtn
            icon={<MapPin className="w-5 h-5" />}
            label="Move To"
            color="text-emerald-400"
            loading={loading === 'location'}
            disabled={count === 0}
            onClick={() => { setShowStatusMenu(false); setShowLocationMenu(v => !v); }}
          />

          {/* Status */}
          <ActionBtn
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Mark As"
            color="text-amber-400"
            loading={loading === 'status'}
            disabled={count === 0}
            onClick={() => { setShowLocationMenu(false); setShowStatusMenu(v => !v); }}
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
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-red-400 border-t border-white/10 disabled:opacity-30 hover:bg-red-500/10 transition-colors"
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
      className={`flex flex-col items-center justify-center gap-1 py-3.5 px-2 hover:bg-white/8 transition-colors disabled:opacity-30 ${color}`}
    >
      {loading
        ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : icon
      }
      <span className="text-[10px] font-bold text-white/70 leading-tight text-center">{label}</span>
    </button>
  );
}