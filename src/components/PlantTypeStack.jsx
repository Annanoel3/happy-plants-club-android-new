import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

const PEEK_HEIGHT = 64; // px visible per stacked card

function getWateringStatus(plant, wateringRemindersEnabled) {
  if (plant?.status === 'wilted') return { status: 'wilted', text: 'HELP!', color: 'bg-red-500 text-white' };
  if (!wateringRemindersEnabled) return null;
  if (!plant?.next_watering_due) return null;
  try {
    const daysUntil = differenceInDays(parseISO(plant.next_watering_due), new Date());
    if (daysUntil < 0) return { status: 'overdue', text: `${Math.abs(daysUntil)}d overdue`, color: 'bg-red-500 text-white' };
    if (daysUntil === 0) return { status: 'today', text: 'Water today', color: 'bg-orange-500 text-white' };
    if (daysUntil <= 2) return { status: 'soon', text: `${daysUntil}d left`, color: 'bg-amber-400 text-amber-900' };
    return { status: 'good', text: `${daysUntil}d left`, color: 'bg-emerald-500 text-white' };
  } catch { return null; }
}

function PlantCard({ plant, wateringRemindersEnabled, index, total, isExpanded, onClick, selectMode, isSelected, onToggleSelect }) {
  const navigate = useNavigate();
  const watering = getWateringStatus(plant, wateringRemindersEnabled);
  const displayName = plant.nickname || plant.name || 'Unknown Plant';
  const needsWater = watering && (watering.status === 'today' || watering.status === 'overdue' || watering.status === 'wilted');

  const stackOffset = isExpanded ? index * (PEEK_HEIGHT + 8) : index * PEEK_HEIGHT;

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
    <div
      className="absolute left-0 right-0 transition-all duration-500 ease-in-out"
      style={{ top: stackOffset, zIndex: index + 1 }}
    >
      {/* Card shell */}
      <div
        className={`rounded-3xl overflow-hidden shadow-xl border ${
          isSelected ? 'border-red-400/80' : needsWater ? 'border-blue-400/60' : 'border-white/20'
        } transition-all duration-200 active:scale-[0.98] cursor-pointer`}
        style={{ height: isExpanded ? 220 : PEEK_HEIGHT }}
        onClick={handleClick}
      >
        {/* Background image */}
        {plant.image_url ? (
          <img
            src={plant.image_url}
            alt={displayName}
            className={`absolute inset-0 w-full h-full object-cover ${plant.status === 'wilted' || isSelected ? 'grayscale' : ''}`}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-800 to-emerald-950 flex items-center justify-center">
            <span className="text-5xl">🪴</span>
          </div>
        )}

        {/* Dark overlay */}
        <div className={`absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black/50 ${isSelected ? 'bg-red-900/40' : ''}`} />

        {/* Thirsty shimmer */}
        {needsWater && wateringRemindersEnabled && !selectMode && (
          <div className="absolute inset-0 bg-blue-900/30" />
        )}

        {/* Top bar — always visible */}
        <div className="absolute top-0 left-0 right-0 h-16 flex items-center px-4 gap-3">
          {/* Select checkbox */}
          {selectMode && (
            <div className="flex-shrink-0">
              {isSelected
                ? <CheckCircle2 className="w-5 h-5 text-red-400 drop-shadow" />
                : <Circle className="w-5 h-5 text-white/60 drop-shadow" />
              }
            </div>
          )}

          {/* Name */}
          <p className="flex-1 font-bold text-white text-sm leading-tight line-clamp-1 drop-shadow-md">
            {displayName}
          </p>

          {/* Watering badge (hidden in select mode) */}
          {watering && !selectMode && (
            <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${watering.color}`}>
              {(watering.status === 'today' || watering.status === 'overdue') && <Droplets className="w-3 h-3" />}
              {watering.status === 'wilted' && <AlertCircle className="w-3 h-3" />}
              {watering.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlantTypeStack({ plantType, plants, wateringRemindersEnabled, themedClasses, textColor, secondaryTextColor, selectMode, selectedIds, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false);

  const isOpen = expanded || selectMode;
  const totalHeight = isOpen
    ? plants.length * (64 + 8) + 220 - 8
    : plants.length > 1
      ? (plants.length - 1) * 64 + 64
      : 64;

  return (
    <div className="mb-6">
      {/* Section header */}
      <button
        className="w-full flex items-center justify-between mb-3 px-1"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className={`font-bold text-base ${textColor}`}>{plantType || 'Other'}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${themedClasses} ${secondaryTextColor}`}>
            {plants.length}
          </span>
        </div>
        {expanded
          ? <ChevronUp className={`w-4 h-4 ${secondaryTextColor}`} />
          : <ChevronDown className={`w-4 h-4 ${secondaryTextColor}`} />
        }
      </button>

      {/* Stack container */}
      <div
        className="relative transition-all duration-500"
        style={{ height: totalHeight }}
      >
        {plants.map((plant, index) => (
          <PlantCard
            key={plant.id}
            plant={plant}
            wateringRemindersEnabled={wateringRemindersEnabled}
            index={index}
            total={plants.length}
            isExpanded={expanded || selectMode}
            onClick={() => setExpanded(true)}
            selectMode={selectMode}
            isSelected={selectedIds?.includes(plant.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}