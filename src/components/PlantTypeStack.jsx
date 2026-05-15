import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, Circle, Pin } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

// Tile card — compact 2-per-row grid
function PlantTileCard({ plant, wateringRemindersEnabled, gradientIndex }) {
  const navigate = useNavigate();
  const watering = getWateringStatus(plant, wateringRemindersEnabled);
  const displayName = plant.nickname || plant.name || 'Unknown Plant';
  const needsWater = watering && (watering.status === 'today' || watering.status === 'overdue' || watering.status === 'wilted');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => navigate(`/PlantDetail?id=${plant.id}`)}
      className={`relative rounded-2xl overflow-hidden cursor-pointer select-none aspect-square ${needsWater && wateringRemindersEnabled ? 'ring-1 ring-blue-400/60' : ''}`}
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.28)' }}
    >
      {/* Background */}
      {plant.image_url ? (
        <img src={plant.image_url} alt={displayName} className="absolute inset-0 w-full h-full object-cover brightness-90" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(gradientIndex)}`} />
      )}

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />

      {/* Watering badge */}
      {watering && (
        <div className="absolute top-2 right-2">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${watering.color}`}>
            {(watering.status === 'today' || watering.status === 'overdue') && <Droplets className="w-2.5 h-2.5" />}
            {watering.status === 'wilted' && <AlertCircle className="w-2.5 h-2.5" />}
            {watering.text}
          </span>
        </div>
      )}

      {plant.pinned && (
        <div className="absolute top-2 left-2">
          <Pin className="w-3 h-3 text-pink-300 drop-shadow" />
        </div>
      )}

      {/* Name at bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-4">
        <p className="font-bold text-white text-xs leading-tight line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {displayName}
        </p>
        {plant.scientific_name && (
          <p className="text-white/55 text-[9px] italic truncate mt-0.5">{plant.scientific_name}</p>
        )}
      </div>
    </motion.div>
  );
}

const CARD_HEIGHT = 220;
const COLLAPSED_PEEK = 36; // how much of each card peeks below the one above (collapsed)
const EXPANDED_GAP = 12;  // gap between fully expanded cards

// Gradient palettes for cards without images
const CARD_GRADIENTS = [
  "from-emerald-600 via-teal-500 to-cyan-600",
  "from-violet-600 via-purple-500 to-pink-500",
  "from-amber-500 via-orange-500 to-rose-500",
  "from-sky-500 via-blue-500 to-indigo-600",
  "from-lime-500 via-green-500 to-emerald-600",
  "from-fuchsia-500 via-pink-500 to-rose-400",
];

function getGradient(index) {
  return CARD_GRADIENTS[index % CARD_GRADIENTS.length];
}

function getWateringStatus(plant, wateringRemindersEnabled) {
  if (plant?.status === 'wilted') return { status: 'wilted', text: 'HELP!', color: 'bg-red-500/90 text-white' };
  if (!wateringRemindersEnabled) return null;
  if (!plant?.next_watering_due) return null;
  try {
    const daysUntil = differenceInDays(parseISO(plant.next_watering_due), new Date());
    if (daysUntil < 0) return { status: 'overdue', text: `${Math.abs(daysUntil)}d overdue`, color: 'bg-red-500/90 text-white' };
    if (daysUntil === 0) return { status: 'today', text: 'Water today', color: 'bg-orange-500/90 text-white' };
    if (daysUntil <= 2) return { status: 'soon', text: `${daysUntil}d`, color: 'bg-amber-400/90 text-amber-900' };
    return { status: 'good', text: `${daysUntil}d`, color: 'bg-emerald-500/90 text-white' };
  } catch { return null; }
}

// Compact list row used in select mode
function PlantListRow({ plant, wateringRemindersEnabled, isSelected, onToggleSelect, gradientIndex }) {
  const watering = getWateringStatus(plant, wateringRemindersEnabled);
  const displayName = plant.nickname || plant.name || 'Unknown Plant';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={() => onToggleSelect(plant.id)}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer mb-2 border transition-all
        ${isSelected
          ? 'bg-red-500/20 border-red-400/50'
          : 'bg-white/10 border-white/10'
        }`}
    >
      {/* Thumbnail */}
      <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
        {plant.image_url
          ? <img src={plant.image_url} alt={displayName} className="w-full h-full object-cover" />
          : <div className={`w-full h-full bg-gradient-to-br ${getGradient(gradientIndex)}`} />
        }
      </div>

      {/* Name + watering */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm leading-tight truncate">{displayName}</p>
        {plant.scientific_name && (
          <p className="text-white/50 text-[11px] italic truncate">{plant.scientific_name}</p>
        )}
      </div>

      {watering && (
        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${watering.color}`}>
          {(watering.status === 'today' || watering.status === 'overdue') && <Droplets className="w-3 h-3" />}
          {watering.text}
        </span>
      )}

      {/* Checkbox */}
      <div className="flex-shrink-0">
        {isSelected
          ? <CheckCircle2 className="w-5 h-5 text-red-400" />
          : <Circle className="w-5 h-5 text-white/40" />
        }
      </div>
    </motion.div>
  );
}

function PlantCard({ plant, wateringRemindersEnabled, index, isExpanded, onClick, gradientIndex }) {
  const navigate = useNavigate();
  const watering = getWateringStatus(plant, wateringRemindersEnabled);
  const displayName = plant.nickname || plant.name || 'Unknown Plant';
  const scientificName = plant.scientific_name;
  const needsWater = watering && (watering.status === 'today' || watering.status === 'overdue' || watering.status === 'wilted');

  const stackOffset = isExpanded
    ? index * (CARD_HEIGHT + EXPANDED_GAP)
    : index * COLLAPSED_PEEK;

  const handleClick = () => {
    if (isExpanded) {
      navigate(`/PlantDetail?id=${plant.id}`);
    } else {
      onClick();
    }
  };

  return (
    <motion.div
      className="absolute left-0 right-0"
      animate={{ top: stackOffset }}
      transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.8 }}
      style={{ zIndex: index + 1 }}
    >
      <motion.div
        style={{
          height: CARD_HEIGHT,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.25)',
        }}
        onClick={handleClick}
        className={`relative rounded-[28px] overflow-hidden cursor-pointer select-none
          ${needsWater ? 'ring-1 ring-blue-400/50' : ''}
        `}
        whileTap={{ scale: 0.975 }}
      >
        {/* Background */}
        {plant.image_url ? (
          <img
            src={plant.image_url}
            alt={displayName}
            className={`absolute inset-0 w-full h-full object-cover brightness-90`}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(gradientIndex)}`} />
        )}

        {/* Glassy sheen overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/5 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/10 pointer-events-none" />

        {/* Bottom scrim */}
        <motion.div
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none"
          animate={{ opacity: isExpanded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          style={{ height: '60%' }}
        />

        {/* Top scrim */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" style={{ height: '50%' }} />

        {needsWater && wateringRemindersEnabled && (
          <div className="absolute inset-0 bg-blue-500/15 pointer-events-none" />
        )}

        {/* TOP ROW */}
        <div className="absolute top-0 left-0 right-0 flex items-center px-4 pt-3 pb-2 gap-2">
          <p className="flex-1 font-bold text-white text-[15px] leading-tight line-clamp-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
            {displayName}
          </p>
          {plant.pinned && <Pin className="w-3.5 h-3.5 text-pink-300 drop-shadow flex-shrink-0" />}
          {watering && (
            <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-1 shadow-md ${watering.color}`}>
              {(watering.status === 'today' || watering.status === 'overdue') && <Droplets className="w-3 h-3" />}
              {watering.status === 'wilted' && <AlertCircle className="w-3 h-3" />}
              {watering.text}
            </span>
          )}
        </div>

        {/* BOTTOM INFO (expanded) */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="absolute bottom-0 left-0 right-0 px-4 pb-4"
            >
              {scientificName && (
                <p className="text-white/60 text-[11px] italic mb-1 drop-shadow">{scientificName}</p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {plant.location && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white">
                      📍 {plant.location}
                    </span>
                  )}
                  {plant.environment && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white">
                      {plant.environment}
                    </span>
                  )}
                </div>
                <span className="text-white/50 text-[10px] font-semibold">Tap to open →</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// Scroll-in animation wrapper
function ScrollReveal({ children, index }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.1, rootMargin: '0px 0px -20px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={visible ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay: index * 0.06 }}
    >
      {children}
    </motion.div>
  );
}

export default function PlantTypeStack({ plantType, plants, wateringRemindersEnabled, themedClasses, textColor, secondaryTextColor, selectMode, selectedIds, onToggleSelect, stackIndex = 0, viewMode = 'stack', showHeader = true }) {
  const [expanded, setExpanded] = useState(false);

  const isOpen = expanded || selectMode;
  const stackHeight = isOpen
    ? plants.length * (CARD_HEIGHT + EXPANDED_GAP) - EXPANDED_GAP
    : (plants.length - 1) * COLLAPSED_PEEK + CARD_HEIGHT;

  const displayType = plantType && plantType !== 'Other' ? plantType : '🌿 Uncategorized';

  return (
    <ScrollReveal index={stackIndex}>
    <div className="mb-8">
      {/* Section header — compact pill style */}
      {showHeader && (
      <button
        className="flex items-center gap-2 mb-3 px-1"
        onClick={() => !selectMode && viewMode === 'stack' && setExpanded(e => !e)}
      >
        <span className={`text-xs font-bold uppercase tracking-widest ${secondaryTextColor} opacity-70`}>{displayType}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${themedClasses} ${secondaryTextColor}`}>
          {plants.length}
        </span>
        {!selectMode && viewMode === 'stack' && (
          isOpen
            ? <ChevronUp className={`w-3 h-3 ${secondaryTextColor} opacity-60`} />
            : <ChevronDown className={`w-3 h-3 ${secondaryTextColor} opacity-60`} />
        )}
      </button>
      )}

      {/* Select mode: compact list */}
      {selectMode ? (
        <div>
          {plants.map((plant, index) => (
            <PlantListRow
              key={plant.id}
              plant={plant}
              wateringRemindersEnabled={wateringRemindersEnabled}
              isSelected={selectedIds?.includes(plant.id)}
              onToggleSelect={onToggleSelect}
              gradientIndex={index}
            />
          ))}
        </div>
      ) : viewMode === 'tile' ? (
        /* Tile mode: 2-per-row grid */
        <div className="grid grid-cols-2 gap-3">
          {plants.map((plant, index) => (
            <PlantTileCard
              key={plant.id}
              plant={plant}
              wateringRemindersEnabled={wateringRemindersEnabled}
              gradientIndex={index}
            />
          ))}
        </div>
      ) : (
        /* Stack mode: wallet card stack */
        <motion.div
          className="relative"
          animate={{ height: stackHeight }}
          transition={{ type: "spring", stiffness: 260, damping: 32 }}
        >
          {plants.map((plant, index) => (
            <PlantCard
              key={plant.id}
              plant={plant}
              wateringRemindersEnabled={wateringRemindersEnabled}
              index={index}
              isExpanded={isOpen}
              onClick={() => setExpanded(true)}
              gradientIndex={index}
            />
          ))}
        </motion.div>
      )}
    </div>
    </ScrollReveal>
  );
}