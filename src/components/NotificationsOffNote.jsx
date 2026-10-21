import React, { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BellOff } from 'lucide-react';

// "Notifications are off on this phone": shown where reminders are set, so nobody counts
// on a reminder that can't pop up. Reads Android's own setting (NotifyBridge.wateringState,
// the same check the watering pop-up uses). The website and older builds show nothing.
let Notify = null;
const bridge = () => {
  if (!Notify) Notify = registerPlugin('NotifyBridge');
  return Notify;
};

async function notificationsBlocked() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const s = await bridge().wateringState();
    return s?.notificationsAllowed === false;
  } catch {
    return false;
  }
}

export function useNotificationsBlocked() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => notificationsBlocked().then((b) => { if (alive) setBlocked(b); });
    check();
    // Back from the phone's settings: check again
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return blocked;
}

export default function NotificationsOffNote({ light = true, className = '' }) {
  const blocked = useNotificationsBlocked();
  if (!blocked) return null;
  // Asks again, or (if they said no before) offers to open the phone's settings
  const fix = () => { bridge().requestPermission().catch(() => {}); };
  return (
    <div role="status" className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
      light ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-amber-500/15 text-amber-100 border border-amber-400/30'} ${className}`}>
      <BellOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p>Notifications are off on this phone, so reminders won't pop up.</p>
        <button onClick={fix} className="mt-1 font-semibold underline">Turn them on</button>
      </div>
    </div>
  );
}
