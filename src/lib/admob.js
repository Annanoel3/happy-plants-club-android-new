import { Capacitor, registerPlugin } from '@capacitor/core';
import { isPlusCached } from '@/lib/premium';

const AD_UNIT_ID = 'ca-app-pub-7979856440890193/9127484934';
// Reward video ("watch a short video for 5 more photo IDs"). Empty = the option stays hidden.
// Create it in AdMob: Apps > Happy Plants > Ad units > Add ad unit > Rewarded.
export const REWARDED_AD_UNIT_ID = 'ca-app-pub-7979856440890193/4931700307'; // "Photo ID reward" (Happy Plants Club app in AdMob)

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

// Every 3rd full-screen ad is followed by the small "Tired of ads?" Plus popup, once the
// ad is closed. Reward videos the person chose to watch don't count.
const ADS_SEEN_KEY = 'hp_ads_seen';
const NUDGE_EVERY_N_ADS = 3;
function adsSeen() {
  try { return parseInt(localStorage.getItem(ADS_SEEN_KEY) || '0', 10) || 0; } catch { return 0; }
}
function setAdsSeen(n) {
  try { localStorage.setItem(ADS_SEEN_KEY, String(n)); } catch { /* ignore */ }
}
function nudgeAfterThisAd() {
  let done = false;
  let sub = null;
  let timer = null;
  const cleanup = () => { clearTimeout(timer); try { sub?.remove?.(); } catch { /* ignore */ } };
  const fire = () => {
    if (done) return;
    done = true;
    cleanup();
    import('@/lib/upgradeNudge').then((m) => m.nudgeUpgrade('ads')).catch(() => {});
  };
  try {
    Promise.resolve(AdMob.addListener('interstitialAdDismissed', fire))
      .then((s) => { sub = s; if (done) cleanup(); })
      .catch(() => {});
  } catch { /* ignore */ }
  timer = setTimeout(fire, 60000); // if the closed event never arrives
  return { fire, cancel: () => { done = true; cleanup(); } };
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

  const nth = adsSeen() + 1;
  let nudge = null;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNIT_ID, isTesting: false });
    if (nth % NUDGE_EVERY_N_ADS === 0) nudge = nudgeAfterThisAd();
    await AdMob.showInterstitial();
    markAdShown();
    setAdsSeen(nth);
    return true;
  } catch (e) {
    nudge?.cancel();
    console.warn('[AdMob] interstitial failed:', e);
    return false;
  }
}

/** Can this install show a reward video? (Android app + a rewarded ad unit set.) */
export function rewardedAvailable() {
  return Capacitor.isNativePlatform() && !!REWARDED_AD_UNIT_ID;
}

/**
 * Show one reward video. Resolves { ok: true } only if the person watched it to the end.
 * The plugin's show() only settles when the reward is earned, so closing early is caught
 * through the "dismissed" event instead.
 */
export async function showRewardedAd() {
  if (!rewardedAvailable()) return { ok: false, reason: 'unavailable' };
  if (!AdMob) await initAdMob();
  if (!AdMob) return { ok: false, reason: 'unavailable' };
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID, isTesting: false });
  } catch (e) {
    console.warn('[AdMob] reward video failed to load:', e);
    return { ok: false, reason: 'no_fill' };
  }
  return new Promise((resolve) => {
    let earned = false;
    let finished = false;
    const subs = [];
    const finish = (r) => {
      if (finished) return;
      finished = true;
      subs.forEach((s) => { try { s?.remove?.(); } catch { /* ignore */ } });
      markAdShown(); // no interstitial right after a reward video
      resolve(r);
    };
    const listen = async (name, fn) => {
      try { subs.push(await AdMob.addListener(name, fn)); } catch { /* ignore */ }
    };
    Promise.all([
      listen('onRewardedVideoAdReward', () => { earned = true; }),
      listen('onRewardedVideoAdDismissed', () => finish(earned ? { ok: true } : { ok: false, reason: 'closed' })),
      listen('onRewardedVideoAdFailedToShow', () => finish({ ok: false, reason: 'failed' })),
    ]).then(() => {
      AdMob.showRewardVideoAd().then(() => { earned = true; }).catch(() => finish({ ok: false, reason: 'failed' }));
    });
    // Safety net: never leave the button spinning
    setTimeout(() => finish(earned ? { ok: true } : { ok: false, reason: 'timeout' }), 3 * 60 * 1000);
  });
}

let _pending = false;

/**
 * Show one interstitial after a meaningful action ("water", "add").
 * Fire-and-forget: never await this in a UI handler.
 */
export function showAdForEvent(reason = 'event') {
  if (!Capacitor.isNativePlatform()) return;
  if (isPlusCached()) return; // Happy Plants Plus = no ads
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
