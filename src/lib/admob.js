import { Capacitor, registerPlugin } from '@capacitor/core';

const AD_UNIT_ID = 'ca-app-pub-7979856440890193/9127484934';
const SHOW_EVERY_N_OPENS = 3;  // Show ad every 3rd app open
const AD_DELAY_MS = 15000;     // Wait 15 seconds before showing

let AdMob = null;

// Global mic recording flag — set by VoiceLog/AddPlant when mic is active
let _micActive = false;
export function setMicActive(val) { _micActive = val; }
export function isMicActive() { return _micActive; }

export async function initAdMob() {
  if (!Capacitor.isNativePlatform()) return;
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
    return true;
  } catch (e) {
    console.warn('[AdMob] interstitial failed:', e);
    return false;
  }
}

export async function maybeShowAdOnOpen() {
  const count = parseInt(localStorage.getItem('appOpenCount') || '0') + 1;
  localStorage.setItem('appOpenCount', String(count));

  if (count % SHOW_EVERY_N_OPENS !== 0) return;

  // Wait the delay, then show if not busy
  await new Promise(resolve => setTimeout(resolve, AD_DELAY_MS));
  await showInterstitialAd();
}