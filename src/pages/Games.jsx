import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Flame, Sparkles } from 'lucide-react';
import { localToday } from '@/lib/dates';
import { GAMES, spotlightFor, getDone, streakFor, useGameTheme } from '@/lib/games/common';
import { markPlantdokuFound } from '@/lib/plantdoku/egg';

// Garden Games: the hidden games, each with a new puzzle every day. One is featured each day.
export default function Games() {
  const navigate = useNavigate();
  const { ui } = useGameTheme();
  const today = localToday();
  const pick = spotlightFor(today);
  useEffect(() => { markPlantdokuFound(); }, []);

  const card = (g, featured) => {
    const done = getDone(g.key, today);
    const streak = streakFor(g.key, today);
    return (
      <button key={g.key} onClick={() => navigate(g.path)}
        className={`w-full text-left rounded-2xl border p-4 active:scale-[0.98] transition ${featured ? 'border-green-600 ring-2 ring-green-600/40' : ''} ${ui.card}`}>
        {featured && <p className="text-xs font-bold text-green-600 flex items-center gap-1 mb-1"><Sparkles className="w-3.5 h-3.5" /> Today's pick</p>}
        <div className="flex items-center gap-3">
          <span className={`${featured ? 'text-4xl' : 'text-3xl'} shrink-0`} aria-hidden>{g.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className={`${featured ? 'text-xl' : 'text-lg'} font-bold ${ui.text}`}>{g.name}</p>
            <p className={`text-sm ${ui.sub}`}>{g.blurb}</p>
          </div>
          <div className="shrink-0 text-right">
            {done ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-600 text-white text-xs font-bold px-2 py-1"><Check className="w-3.5 h-3.5" /> Done</span>
            ) : (
              <span className="inline-flex rounded-full bg-amber-400 text-gray-900 text-xs font-bold px-2 py-1">Play</span>
            )}
            {streak > 1 && <p className={`text-xs mt-1 ${ui.sub}`}><Flame className="w-3 h-3 inline text-orange-500" /> {streak}</p>}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen theme-bg pb-28">
      <div className="max-w-xl mx-auto px-4 pt-4">
        <button onClick={() => navigate('/Dashboard')} className={`flex items-center gap-1.5 py-2 -ml-1 mb-2 text-sm font-semibold ${ui.text}`}>
          <ArrowLeft className="w-5 h-5" /> Garden
        </button>
        <h1 className={`text-3xl font-bold ${ui.text}`}>🎲 Garden Games</h1>
        <p className={`text-sm mb-4 ${ui.sub}`}>A new puzzle in every game, every day. You found the secret!</p>
        <div className="space-y-3">
          {card(pick, true)}
          {GAMES.filter((g) => g.key !== pick.key).map((g) => card(g, false))}
        </div>
      </div>
    </div>
  );
}
