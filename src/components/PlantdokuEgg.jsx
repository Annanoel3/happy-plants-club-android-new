import React from 'react';
import { useNavigate } from 'react-router-dom';
import { localToday } from '@/lib/dates';
import { eggFor, markPlantdokuFound } from '@/lib/plantdoku/egg';

// The hidden way into Plantdoku: tiny, faint text that sits on one of four screens each day.
export default function PlantdokuEgg({ page, className = '' }) {
  const navigate = useNavigate();
  const egg = eggFor(localToday());
  if (egg.page !== page) return null;
  const align = egg.align === 'left' ? 'justify-start' : egg.align === 'right' ? 'justify-end' : 'justify-center';
  return (
    <div className={`flex ${align} px-2 py-3 ${className}`}>
      <button
        onClick={() => { markPlantdokuFound(); navigate('/Games'); }}
        className="text-[10px] italic opacity-40 hover:opacity-80 theme-text select-none"
        aria-label="Hidden games"
      >
        {egg.text}
      </button>
    </div>
  );
}
