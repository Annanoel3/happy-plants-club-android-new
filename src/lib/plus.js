// Small helpers for Happy Plants Plus features in the UI.
//  usePlus()       → true/false, kept current by getPremiumStatus() (runs on every app open)
//  usePlusReady()  → can this phone actually buy Plus right now? Teasers for free users
//                    only show when it can, so nobody hits a dead-end "coming soon" page.
import { useEffect, useState } from 'react';
import { isPlusCached, billingAvailable } from '@/lib/premium';

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
