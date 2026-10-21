import React from 'react';
import { Sparkles } from 'lucide-react';

// Shown when midnight passed while yesterday's daily is still open. The game keeps yesterday's
// puzzle (and its date) until the player taps this, leaves, or starts another one.
export default function NewDailyBar({ ui, onGo }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 mb-3 ${ui.card}`} role="status">
      <p className={`text-sm font-semibold flex items-center gap-1.5 ${ui.text}`}>
        <Sparkles className="w-4 h-4 text-green-600 shrink-0" /> A new daily is ready
      </p>
      <button onClick={onGo} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold bg-green-600 text-white active:scale-95">
        Play it
      </button>
    </div>
  );
}
