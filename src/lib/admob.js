import { Capacitor, registerPlugin } from '@capacitor/core';

const AD_UNIT_ID = 'ca-app-pub-7979856440890193/9127484934';

// Ads are event-based: one interstitial after a watering (single, bulk or voice)
// and one after adding plants (a bulk add counts as one). No more "every 3rd open".
const EVENT_AD_DELAY_MS = 1200;   // let the success toast land before the ad
const MIN_GAP_BETWEEN_ADS_MS = 45000; // never two interstitials within 45s of each other
const LAST_AD_KEY = 'hp_last_ad_at';

let AdMob = null;

// Global mic recording flag — set by VoiceLog/AddPlant/QuickLog when mic is active
let _micActive = false;
export function setMicActive(val) { _micActive = val; }
export function isMicActive() { return _micActive; }

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
  if (AdMob) return;
  try {
    AdMob = registerPlugin('AdMob');
    await AdMob.initialize({ initializeForTesting: false });
    console.log('[AdMob] initialized');
  } catch (e) {
    console.warn('[AdMob] init failed:', e);
    AdMob = null;
  }
}

function isInputFocused() {
  const active = document.activeElement;
  return active && (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.contentEditable === 'true'
  );
}

function isUserBusy() {
  return isInputFocused() || _micActive;
}

function lastAdAt() {
  try { return parseInt(localStorage.getItem(LAST_AD_KEY) || '0', 10) || 0; } catch { return 0; }
}
function markAdShown() {
  try { localStorage.setItem(LAST_AD_KEY, String(Date.now())); } catch { /* ignore */ }
}

export async function showInterstitialAd() {
  if (!AdMob) return false;

  // Wait until user is not typing or speaking (max 30s)
  let waitAttempts = 0;
  while (isUserBusy() && waitAttempts < 60) {
    await new Promise(resolve => setTimeout(resolve, 500));
    waitAttempts++;
  }

  // Still busy after waiting — skip ad
  if (isUserBusy()) return false;

  try {
    await AdMob.prepareInterstitial({ adId: AD_UNIT_ID, isTesting: false });
    await AdMob.showInterstitial();
    markAdShown();
    return true;
  } catch (e) {
    console.warn('[AdMob] interstitial failed:', e);
    return false;
  }
}

let _pending = false;

/**
 * Show one interstitial after a meaningful action ("water", "add").
 * Fire-and-forget: never await this in a UI handler.
 */
export function showAdForEvent(reason = 'event') {
  if (!Capacitor.isNativePlatform()) return;
  if (_pending) return;
  if (Date.now() - lastAdAt() < MIN_GAP_BETWEEN_ADS_MS) {
    console.log('[AdMob] skipped (' + reason + '): too soon after last ad');
    return;
  }
  _pending = true;
  setTimeout(async () => {
    try {
      if (!AdMob) await initAdMob();
      await showInterstitialAd();
    } finally {
      _pending = false;
    }
  }, EVENT_AD_DELAY_MS);
}
