import React, { useState } from "react";
import { ArrowUpDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SORT_OPTIONS = [
  { id: "type_az", label: "Type A–Z" },
  { id: "water_soon", label: "Water Soonest" },
  { id: "location", label: "Location" },
  { id: "date_added", label: "Date Added" },
];

export default function SortFilterBar({ sortBy, onSortChange, textColor, secondaryTextColor, themedClasses }) {
  const [open, setOpen] = useState(false);
  const active = SORT_OPTIONS.find(o => o.id === sortBy);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold transition-all ${
          sortBy ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40" : `${themedClasses} ${secondaryTextColor}`
        }`}
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        {active ? active.label : "Sort"}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl p-6 pb-10"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
            >
              <div className="flex items-center justify-between mb-5">
                <p className="text-white font-bold text-base">Sort By</p>
                <button onClick={() => setOpen(false)}>
                  <X className="w-5 h-5 text-white/60" />
                </button>
              </div>
              <div className="space-y-2">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onSortChange(sortBy === opt.id ? null : opt.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl font-semibold text-sm transition-all ${
                      sortBy === opt.id
                        ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                        : "bg-white/8 text-white/80 hover:bg-white/12"
                    }`}
                  >
                    {opt.label}
                    {sortBy === opt.id && <span className="float-right text-emerald-400">✓</span>}
                  </button>
                ))}
                {sortBy && (
                  <button
                    onClick={() => { onSortChange(null); setOpen(false); }}
                    className="w-full text-center py-3 text-white/40 text-sm font-semibold mt-2"
                  >
                    Clear Sort
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}