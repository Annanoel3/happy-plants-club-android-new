import React from 'react';
import { useNavigate } from 'react-router-dom';
import { localToday } from '@/lib/dates';
import { eggFor, markPlantdokuFound } from '@/lib/plantdoku/egg';

// A little painted Easter egg (our own drawing: pastel with a zigzag band and dots)
function EasterEgg({ className = '' }) {
  return (
    <svg viewBox="0 0 24 30" className={className} aria-hidden>
      <defs>
        <clipPath id="hp-egg-clip"><path d="M12 1C6 1 1.5 10 1.5 18c0 6.4 4.7 11 10.5 11s10.5-4.6 10.5-11C22.5 10 18 1 12 1z" /></clipPath>
      </defs>
      <g clipPath="url(#hp-egg-clip)">
        <rect width="24" height="30" fill="#fbcfe8" />
        <rect y="0" width="24" height="10" fill="#bae6fd" />
        <path d="M0 13l3-3 3 3 3-3 3 3 3-3 3 3 3-3 3 3v5l-3-3-3 3-3-3-3 3-3-3-3 3-3-3-3 3-3-3z" fill="#facc15" />
        <rect y="22" width="24" height="8" fill="#bbf7d0" />
        <circle cx="7" cy="6" r="1.4" fill="#f472b6" /><circle cx="13" cy="4.5" r="1.4" fill="#f472b6" /><circle cx="17.5" cy="7" r="1.4" fill="#f472b6" />
        <circle cx="6" cy="25" r="1.3" fill="#a78bfa" /><circle cx="12" cy="26.5" r="1.3" fill="#a78bfa" /><circle cx="18" cy="25" r="1.3" fill="#a78bfa" />
      </g>
      <path d="M12 1C6 1 1.5 10 1.5 18c0 6.4 4.7 11 10.5 11s10.5-4.6 10.5-11C22.5 10 18 1 12 1z" fill="none" stroke="#6b7280" strokeWidth="1" />
    </svg>
  );
}

// The hidden way into the Garden Games: tiny, faint text with a little egg that sits on one of
// four screens each day. Until someone taps it, the games aren't in the menu at all.
export default function PlantdokuEgg({ page, className = '' }) {
  const navigate = useNavigate();
  const egg = eggFor(localToday());
  if (egg.page !== page) return null;
  const align = egg.align === 'left' ? 'justify-start' : egg.align === 'right' ? 'justify-end' : 'justify-center';
  return (
    <div className={`flex ${align} px-2 py-3 ${className}`}>
      <button
        onClick={() => { markPlantdokuFound(); navigate('/Games'); }}
        className="flex items-center gap-1 text-[10px] italic opacity-40 hover:opacity-80 theme-text select-none"
        aria-label="Hidden games"
      >
        <EasterEgg className="w-3 h-[15px] shrink-0" />
        {egg.text}
      </button>
    </div>
  );
}
