import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"
];

export default function AddCategoryModal({ isOpen, onClose, user, theme }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.UserPlantCategory.create({
        name: name.trim(),
        color
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customCategories', user?.email] });
      setName("");
      setColor(PRESET_COLORS[0]);
      onClose();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      createMutation.mutate();
    }
  };

  const getThemedClasses = () => {
    if (theme === 'botanical') return 'bg-black/40 backdrop-blur-md border border-green-700/40';
    if (theme === 'dark') return 'bg-black/40 backdrop-blur-md border border-gray-700/50';
    if (theme === 'kawaii') return 'bg-white/60 backdrop-blur-md border border-pink-200/50';
    return 'bg-white/60 backdrop-blur-md border border-gray-300/50';
  };

  const getTextColor = () => {
    if (theme === 'dark' || theme === 'botanical') return 'text-white';
    return 'text-gray-900';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`${getThemedClasses()} rounded-2xl p-6 max-w-sm w-full`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${getTextColor()}`}>Add Category</h2>
          <button onClick={onClose} className={getTextColor()}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-semibold mb-2 ${getTextColor()}`}>
              Category Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Flowering, Propagation..."
              className={`w-full px-3 py-2 rounded-lg border theme-input text-sm`}
              autoFocus
            />
          </div>

          <div>
            <label className={`block text-sm font-semibold mb-2 ${getTextColor()}`}>
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    color === c ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold ${getThemedClasses()}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}