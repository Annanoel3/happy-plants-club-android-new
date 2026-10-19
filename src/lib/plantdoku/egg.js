// Where Plantdoku hides today. Tiny text moves between four screens, one each day
// (never the same screen two days running inside a week). functions/sendFeatureTips has
// a copy of eggFor() so the "there's a hidden game" tip opens the right screen. Keep in step.
import { base44 } from '@/api/base44Client';

export const EGG_PAGES = [
  { path: '/Dashboard', key: 'garden' },
  { path: '/Schedule', key: 'schedule' },
  { path: '/Feed', key: 'community' },
  { path: '/PlantChat', key: 'expert' },
];
// (not "don't click": the garden already has a hidden "don't click this" for secret themes)
const TEXTS = ["what's this?", "psst… what's this?", "ooh, what's this?", '🌱 what\'s this?'];

function h32(s) {
  let x = 0;
  for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return x;
}
// Scrambles a day number so the screens don't follow a pattern
function mix(n) {
  let x = (n * 2654435761) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
const dayNumber = (day) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);

// A random walk from Jan 1 2026: every day moves to one of the other three screens
function eggIndex(day) {
  const n = dayNumber(day);
  let idx = 0;
  for (let d = dayNumber('2026-01-01') + 1; d <= n; d++) idx = (idx + 1 + (mix(d) % 3)) % 4;
  return idx;
}

/** eggFor('YYYY-MM-DD') → { page: 'garden' | 'schedule' | 'community' | 'expert', path, text, align } */
export function eggFor(day) {
  const page = EGG_PAGES[eggIndex(day)];
  const x = h32(`egg${day}`);
  return { page: page.key, path: page.path, text: TEXTS[x % TEXTS.length], align: ['left', 'center', 'right'][(x >>> 4) % 3] };
}

const FOUND_KEY = 'hp_pd_found';
export function plantdokuFound() {
  try { return localStorage.getItem(FOUND_KEY) === '1'; } catch { return false; }
}
export async function markPlantdokuFound() {
  try { localStorage.setItem(FOUND_KEY, '1'); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('hp-pd-found')); } catch { /* ignore */ }
  try { await base44.auth.updateMe({ plantdoku_found: true }); } catch { /* ignore */ }
}
