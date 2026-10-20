import React, { useState } from 'react';
import { compareOz } from '@/lib/waterAmount';

// "15 oz — what does that look like?" Tap to compare the amount to everyday containers
// (a 16.9 oz water bottle, a soda can, a measuring cup…). Opens inline, not as a popup.
export default function WaterCompare({ oz, ui, className = '' }) {
  const [open, setOpen] = useState(false);
  const list = compareOz(oz);
  if (!list.length) return null;
  return (
    <div className={className}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border active:scale-95 ${
          ui?.light === false ? 'bg-white/10 border-white/20 text-white' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
        🥤 {open ? 'Hide' : `What does ${oz} oz look like?`}
      </button>
      {open && (
        <ul className={`mt-2 space-y-1 text-sm ${ui?.text || ''}`}>
          {list.map((c, i) => (
            <li key={c.container} className={i === 0 ? 'font-semibold' : ''}>• {c.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
