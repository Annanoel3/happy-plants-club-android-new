// Stats, tier and achievements are computed on the server from your real
// history (syncMyStats). This keeps them in sync after anything that waters,
// adds or removes plants, or adds progress photos — from any screen.
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

let timer = null;
let inflight = null;
let latest = null;

export function getLatestStats() { return latest; }

export async function syncStats({ announce = true } = {}) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await base44.functions.invoke('syncMyStats', {});
      if (!data?.success) return null;
      latest = data;
      try { window.dispatchEvent(new CustomEvent('hp-stats', { detail: data })); } catch { /* noop */ }
      if (announce) {
        const n = data.newly_unlocked || [];
        // One toast, never a pile of them
        if (n.length === 1) toast.success(`${n[0].icon} Achievement unlocked: ${n[0].name}`);
        else if (n.length > 1) toast.success(`🏆 ${n.length} achievements unlocked! See them on your profile.`);
        else if (data.tier_changed) toast.success(`🏆 You reached ${data.stats.tier}!`);
      }
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Bulk actions write many rows at once; wait for things to settle, then sync once.
export function scheduleStatsSync(delay = 2500) {
  clearTimeout(timer);
  timer = setTimeout(() => syncStats(), delay);
}

if (typeof window !== 'undefined') {
  window.addEventListener('hp-data-write', () => scheduleStatsSync());
}
