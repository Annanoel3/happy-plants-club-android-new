// The garden's hidden "don't click this" (turns on Kawaii and the seasonal theme).
// Once someone has found it, the text goes away for good and those themes join the
// regular theme button in the side menu instead.
import { base44 } from '@/api/base44Client';

const KEY = 'hp_theme_egg_found';
const BASE = ['light', 'dark', 'botanical'];

export function themeEggFound(user) {
  if (user?.theme_egg_found) return true;
  try {
    if (localStorage.getItem(KEY) === '1') return true;
    // Already using a secret theme from before this existed: they found it
    const t = localStorage.getItem('theme');
    return !!t && !BASE.includes(t);
  } catch { return false; }
}

export async function markThemeEggFound() {
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('hp-theme-egg-found')); } catch { /* ignore */ }
  try { await base44.auth.updateMe({ theme_egg_found: true }); } catch { /* ignore */ }
}
