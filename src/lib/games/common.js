// Shared bits for the Garden Games (Plantdoku, Sprout Word, Garden Groups, Mini Garden).
import { useState } from 'react';
import { localToday } from '@/lib/dates';
import { showAdForEvent } from '@/lib/admob';

export const DARK_THEMES = new Set(['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'valentines', 'stpatricks', 'fall']);

/** { dark, ui: { text, sub, card, chip } } from the app theme */
export function useGameTheme() {
  const [theme] = useState(() => { try { return localStorage.getItem('theme') || 'light'; } catch { return 'light'; } });
  const dark = DARK_THEMES.has(theme);
  return {
    dark,
    ui: {
      text: dark ? 'text-white' : 'text-gray-900',
      sub: dark ? 'text-white/75' : 'text-gray-600',
      card: dark ? 'bg-black/45 border-white/15' : 'bg-white/85 border-gray-200',
      chip: dark ? 'bg-white/10 text-white border-white/15' : 'bg-white text-gray-800 border-gray-300',
    },
  };
}

export const GAMES = [
  { key: 'plantdoku', name: 'Plantdoku', path: '/Plantdoku', emoji: '🌱', blurb: 'One plant in every color, row and column. No touching.' },
  { key: 'sproutword', name: 'Sprout Word', path: '/SproutWord', emoji: '🔤', blurb: 'Guess the 5-letter plant word in 6 tries.' },
  { key: 'gardengroups', name: 'Garden Groups', path: '/GardenGroups', emoji: '🧺', blurb: 'Sort 16 words into 4 groups of 4.' },
  { key: 'minigarden', name: 'Mini Garden', path: '/MiniGarden', emoji: '🪴', blurb: 'Every row, column and box gets one of each plant.' },
];

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dayNumber = (day) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);

/** Today's featured game: a different one each day, in turn */
export function spotlightFor(day = localToday()) {
  return GAMES[((dayNumber(day) % GAMES.length) + GAMES.length) % GAMES.length];
}

// Finished today? (kept on this phone)
const doneKey = (game, day) => `hp_game_${game}_${day}`;
export function getDone(game, day = localToday()) {
  try { return JSON.parse(localStorage.getItem(doneKey(game, day)) || 'null'); } catch { return null; }
}
export function setDone(game, data = {}, day = localToday()) {
  try { localStorage.setItem(doneKey(game, day), JSON.stringify({ ...data, at: Date.now() })); } catch { /* ignore */ }
}
/** Days in a row the daily puzzle of this game was finished, ending today or yesterday */
export function streakFor(game, day = localToday()) {
  let n = 0;
  let d = getDone(game, day) ? day : addDays(day, -1);
  while (getDone(game, d)) { n++; d = addDays(d, -1); }
  return n;
}

// Ads: one full-screen ad per two finished puzzles (any game), shown when the next one starts
export function countFinish() {
  try { localStorage.setItem('hp_pd_completed', String((Number(localStorage.getItem('hp_pd_completed')) || 0) + 1)); } catch { /* ignore */ }
}
export function adBeforeNext() {
  let n = 0;
  try { n = Number(localStorage.getItem('hp_pd_completed')) || 0; } catch { /* ignore */ }
  if (n >= 2) {
    try { localStorage.setItem('hp_pd_completed', '0'); } catch { /* ignore */ }
    showAdForEvent('game');
  }
}

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Seeded random (same idea as the Plantdoku engine): same day → same puzzle on every phone
export function seededRng(seedString) {
  let h = 1779033703 ^ String(seedString).length;
  for (let i = 0; i < String(seedString).length; i++) {
    h = Math.imul(h ^ String(seedString).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const seed = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = seed(), b = seed(), c = seed(), d = seed();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}
export function shuffleWith(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
