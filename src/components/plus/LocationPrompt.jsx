import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { whenPopupFree, releasePopup } from '@/lib/popupGate';
import { isPlusCached } from '@/lib/premium';
import LocationDialog from '@/components/plus/LocationDialog';

// The one-time "Where are your plants?" ask on the garden page.
// Shows only when the location is missing, couldn't be found on the map, or is a
// whole state/country — and only for people who have at least one plant.
// At most 3 times ever, at least 30 days apart, and never on top of another popup.
const GAP_DAYS = 30;
const MAX_TIMES = 3;

export default function LocationPrompt({ user, plantCount }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.email || !plantCount) return;
    const loc = String(user.location || '').trim();
    const status = !loc ? 'missing' : user.location_status;
    // A location typed before this feature hasn't been looked up yet; the server
    // does that on its own, so only ask once we know it's a problem.
    if (!['missing', 'not_found', 'too_broad'].includes(status)) return;
    const count = Number(user.location_prompt_count) || 0;
    const last = user.location_prompt_at ? Date.parse(user.location_prompt_at) : 0;
    if (count >= MAX_TIMES) return;
    if (last && Date.now() - last < GAP_DAYS * 86400000) return;
    try {
      const k = 'hp_loc_prompt_day';
      const today = new Date().toDateString();
      if (localStorage.getItem(k) === today) return;
    } catch { /* ignore */ }

    // Give the daily weather popup and others the first turn.
    const cancel = whenPopupFree('location', () => {
      try { localStorage.setItem('hp_loc_prompt_day', new Date().toDateString()); } catch { /* ignore */ }
      base44.auth.updateMe({ location_prompt_count: count + 1, location_prompt_at: new Date().toISOString() }).catch(() => {});
      setOpen(true);
    }, { firstDelay: 6000 });
    return cancel;
  }, [user?.email, user?.location, user?.location_status, plantCount]);

  const onOpenChange = (v) => {
    setOpen(v);
    if (!v) releasePopup('location');
  };

  return <LocationDialog open={open} onOpenChange={onOpenChange} user={user} plus={isPlusCached()} />;
}
