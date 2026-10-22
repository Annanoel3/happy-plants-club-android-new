import React, { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BellOff } from 'lucide-react';

// Shown where reminders are set, so nobody counts on a reminder that can't pop up.
// Reads Android's own settings (NotifyBridge.wateringState, the same check the watering
// pop-up uses):
//   'blocked' notifications are off for the app on this phone
//   'quiet'   notifications are on, but the "Watering pop-ups" category is set to silent,
//             sound-only or off, so it won't pop up (reported by app builds after v13)
// The website and older builds show nothing.
let Notify = null;
const bridge = () => {
  if (!Notify) Notify = registerPlugin('NotifyBridge');
  return Notify;
};

async function readProblem() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const s = await bridge().wateringState();
    if (s?.notificationsAllowed === false) return 'blocked';
    if (s?.popupsOn === false) return 'quiet';
    return null;
  } catch {
    return null;
  }
}

export function useNotificationProblem() {
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    let alive = true;
    const check = () => readProblem().then((p) => { if (alive) setProblem(p); });
    check();
    // Back from the phone's settings: check again
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return problem;
}

export function useNotificationsBlocked() {
  return useNotificationProblem() === 'blocked';
}

// popupsOnly: only the "won't pop up" case (Settings has its own "notifications are off" box)
export default function NotificationsOffNote({ light = true, className = '', popupsOnly = false }) {
  const problem = useNotificationProblem();
  if (!problem || (popupsOnly && problem !== 'quiet')) return null;
  const quiet = problem === 'quiet';
  const fix = () => {
    if (quiet) {
      // That category's own settings page, where it can be set to pop up again
      bridge().openWateringPopupSettings().catch(() => {});
    } else {
      // Asks again, or (if they said no before) offers to open the phone's settings
      bridge().requestPermission().catch(() => {});
    }
  };
  return (
    <div role="status" className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
      light ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-amber-500/15 text-amber-100 border border-amber-400/30'} ${className}`}>
      <BellOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p>
          {quiet
            ? "Watering reminders are set not to pop up on this phone, so they're easy to miss."
            : "Notifications are off on this phone, so reminders won't pop up."}
        </p>
        <button onClick={fix} className="mt-1 font-semibold underline">
          {quiet ? 'Turn on pop-ups' : 'Turn them on'}
        </button>
      </div>
    </div>
  );
}
