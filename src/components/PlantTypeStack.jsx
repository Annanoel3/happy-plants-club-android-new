import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, Circle, Pin } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const CARD_HEIGHT = 220;
const PEEK_HEIGHT = 110;
const GAP = 10;

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

function PlantCard({ plant, wateringRemindersEnabled, index, total, isExpanded, onClick, selectMode, isSelected, onToggleSelect, gradientIndex }) {
  const navigate = useNavigate();
  const watering = getWateringStatus(plant, wateringRemindersEnabled);
  const displayName = plant.nickname || plant.name || 'Unknown Plant';
  const scientificName = plant.scientific_name;
  const needsWater = watering && (watering.status === 'today' || watering.status === 'overdue' || watering.status === 'wilted');

  const stackOffset = isExpanded ? index * (PEEK_HEIGHT + GAP) : index * PEEK_HEIGHT;
  const cardHeight = isExpanded ? CARD_HEIGHT : PEEK_HEIGHT;

  const handleClick = () => {
    if (selectMode) {
      onToggleSelect(plant.id);
    } else if (isExpanded) {
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
        animate={{ height: cardHeight }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        onClick={handleClick}
        className={`relative rounded-[28px] overflow-hidden cursor-pointer select-none
          ${isSelected ? 'ring-2 ring-red-400 ring-offset-2 ring-offset-transparent' : ''}
          ${needsWater && !selectMode ? 'ring-1 ring-blue-400/50' : ''}
        `}
        style={{
          boxShadow: isSelected
            ? '0 8px 32px rgba(248,113,113,0.4), 0 2px 8px rgba(0,0,0,0.3)'
            : '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.25)',
        }}
        whileTap={{ scale: 0.975 }}
      >
        {/* Background */}
        {plant.image_url ? (
          <img
            src={plant.image_url}
            alt={displayName}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-300
              ${plant.status === 'wilted' || isSelected ? 'grayscale brightness-75' : 'brightness-90'}`}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(gradientIndex)}`} />
        )}

        {/* Glassy sheen overlay — the key to the "shiny" effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/5 to-transparent pointer-events-none" />
        {/* Side sheen */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/10 pointer-events-none" />

        {/* Bottom scrim for text legibility when expanded */}
        <motion.div
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none"
          animate={{ opacity: isExpanded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          style={{ height: '60%' }}
        />

        {/* Top scrim always */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" style={{ height: '50%' }} />

        {/* Water urgency glow */}
        {needsWater && wateringRemindersEnabled && !selectMode && (
          <div className="absolute inset-0 bg-blue-500/15 pointer-events-none" />
        )}

        {/* ── TOP ROW (always visible) ── */}
        <div className="absolute top-0 left-0 right-0 flex items-center px-4 pt-3 pb-2 gap-2">
          {selectMode && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex-shrink-0"
            >
              {isSelected
                ? <CheckCircle2 className="w-5 h-5 text-red-400 drop-shadow" />
                : <Circle className="w-5 h-5 text-white/70 drop-shadow" />
              }
            </motion.div>
          )}

          <p className="flex-1 font-bold text-white text-[15px] leading-tight line-clamp-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
            {displayName}
          </p>

          {!selectMode && plant.pinned && (
            <Pin className="w-3.5 h-3.5 text-pink-300 drop-shadow flex-shrink-0" />
          )}
          {watering && !selectMode && (
            <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-1 shadow-md ${watering.color}`}>
              {(watering.status === 'today' || watering.status === 'overdue') && <Droplets className="w-3 h-3" />}
              {watering.status === 'wilted' && <AlertCircle className="w-3 h-3" />}
              {watering.text}
            </span>
          )}
        </div>

        {/* ── BOTTOM INFO (visible when expanded) ── */}
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
                <p className="text-white/60 text-[11px] italic mb-1 drop-shadow">
                  {scientificName}
                </p>
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

export default function PlantTypeStack({ plantType, plants, wateringRemindersEnabled, themedClasses, textColor, secondaryTextColor, selectMode, selectedIds, onToggleSelect, stackIndex = 0 }) {
  const [expanded, setExpanded] = useState(false);

  const isOpen = expanded || selectMode;
  const totalHeight = isOpen
    ? plants.length * (PEEK_HEIGHT + GAP) + (CARD_HEIGHT - PEEK_HEIGHT - GAP)
    : plants.length > 1
      ? (plants.length - 1) * PEEK_HEIGHT + CARD_HEIGHT
      : CARD_HEIGHT;

  return (
    <ScrollReveal index={stackIndex}>
    <div className="mb-8">
      {/* Section header */}
      <button
        className="w-full flex items-center justify-between mb-4 px-1"
        onClick={() => !selectMode && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className={`font-extrabold text-base tracking-tight ${textColor}`}>{plantType || 'Other'}</span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${themedClasses} ${secondaryTextColor}`}>
            {plants.length}
          </span>
        </div>
        {!selectMode && (
          isOpen
            ? <ChevronUp className={`w-4 h-4 ${secondaryTextColor}`} />
            : <ChevronDown className={`w-4 h-4 ${secondaryTextColor}`} />
        )}
      </button>

      {/* Stack container */}
      <motion.div
        className="relative"
        animate={{ height: totalHeight }}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
      >
        {plants.map((plant, index) => (
          <PlantCard
            key={plant.id}
            plant={plant}
            wateringRemindersEnabled={wateringRemindersEnabled}
            index={index}
            total={plants.length}
            isExpanded={isOpen}
            onClick={() => setExpanded(true)}
            selectMode={selectMode}
            isSelected={selectedIds?.includes(plant.id)}
            onToggleSelect={onToggleSelect}
            gradientIndex={index}
          />
        ))}
      </motion.div>
    </div>
    </ScrollReveal>
  );
}