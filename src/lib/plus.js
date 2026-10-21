// Small helpers for Happy Plants Plus features in the UI.
//  usePlus()       → true/false, kept current by getPremiumStatus() (runs on every app open, and
//                    when the app comes back to the front after 3+ hours: see lib/premium)
//  usePlusReady()  → can this phone actually buy Plus right now? Teasers for free users
//                    only show when it can, so nobody hits a dead-end "coming soon" page.
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { isPlusCached, billingAvailable } from '@/lib/premium';

/** The signed-in user, reloaded after their location changes. */
export function useMe() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => base44.auth.me().then((u) => { if (alive) setMe(u); }).catch(() => {});
    load();
    window.addEventListener('hp-location', load);
    return () => { alive = false; window.removeEventListener('hp-location', load); };
  }, []);
  return me;
}

export function usePlus() {
  const [plus, setPlus] = useState(isPlusCached());
  useEffect(() => {
    const on = (e) => setPlus(!!e.detail);
    window.addEventListener('hp-plus', on);
    setPlus(isPlusCached());
    return () => window.removeEventListener('hp-plus', on);
  }, []);
  return plus;
}

let readyPromise = null;
export function usePlusReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!readyPromise) readyPromise = billingAvailable().then((r) => !!r?.available).catch(() => false);
    readyPromise.then((v) => { if (alive) setReady(v); });
    return () => { alive = false; };
  }, []);
  return ready;
}
