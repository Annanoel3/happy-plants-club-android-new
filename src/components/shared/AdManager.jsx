import { useEffect } from 'react';
import { initAdMob } from '@/lib/admob';

// Ads are now event-based (see src/lib/admob.js showAdForEvent):
// one interstitial after watering and one after adding plants.
// This component only warms up the AdMob plugin on app start.
export default function AdManager() {
  useEffect(() => {
    initAdMob().catch(() => {});
  }, []);
  return null;
}
