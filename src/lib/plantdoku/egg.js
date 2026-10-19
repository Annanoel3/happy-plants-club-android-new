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
const TEXTS = ["what's this?", "don't click me", 'psst…', 'hmm?'];

function h32(s) {
  let x = 0;
  for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return x;
}
const dayNumber = (day) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);

/** eggFor('YYYY-MM-DD') → { page: 'garden' | 'schedule' | 'community' | 'expert', path, text, align } */
export function eggFor(day) {
  const n = dayNumber(day);
  const offset = h32(`week${Math.floor(n / 7)}`) % 4;
  const page = EGG_PAGES[(n + offset) % 4];
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
