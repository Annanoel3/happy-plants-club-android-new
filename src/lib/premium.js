// Happy Plants Plus: subscription state + the native billing bridge.
// The server (functions/premium, fed by RevenueCat) decides whether you're Plus;
// the phone only starts purchases. App user id at RevenueCat = Base44 user id.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { base44 } from '@/api/base44Client';

const PLUS_CACHE_KEY = 'hp_plus';
export const PREMIUM_STATUS_EVENT = 'hp-premium-status'; // detail = the latest status from the server
let Billing = null;
let configuredFor = null;

function bridge() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Billing) Billing = registerPlugin('BillingBridge');
  return Billing;
}

export function isPlusCached() {
  try { return localStorage.getItem(PLUS_CACHE_KEY) === '1'; } catch { return false; }
}
function cachePlus(v) {
  try { localStorage.setItem(PLUS_CACHE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('hp-plus', { detail: !!v })); } catch { /* ignore */ }
}

/** Server truth: plan, today's AI usage and limits. refresh=true asks RevenueCat first. */
export async function getPremiumStatus({ refresh = false } = {}) {
  watchOnResume();
  const { data } = await base44.functions.invoke('premium', { action: refresh ? 'refresh' : 'status' });
  if (data?.success) {
    lastStatusAt = Date.now();
    cachePlus(data.plus);
    try { window.dispatchEvent(new CustomEvent(PREMIUM_STATUS_EVENT, { detail: data })); } catch { /* ignore */ }
  }
  return data;
}

// The first check runs when the app opens (Layout). Phones keep the app in the background for
// days, so also check when it comes back to the front, at most every 3 hours, so ads and Plus
// screens follow an expiry or a new purchase without a restart. One small server call.
const RESUME_CHECK_MS = 3 * 3600e3;
let lastStatusAt = 0;
let watching = false;
function watchOnResume() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastStatusAt < RESUME_CHECK_MS) return;
    lastStatusAt = Date.now(); // count the try too, so a failing call isn't repeated on every resume
    getPremiumStatus().catch(() => {});
  });
}

// After a purchase that didn't clearly finish (pending payment, slow store): ask RevenueCat
// again in 2 minutes, and check right away the next time the app comes back to the front.
let soonTimer = null;
function checkPlusSoon() {
  lastStatusAt = 0;
  clearTimeout(soonTimer);
  soonTimer = setTimeout(() => { getPremiumStatus({ refresh: true }).catch(() => {}); }, 120000);
}

/** Can this install buy? (Older app versions don't have the billing bridge.) */
export async function billingAvailable() {
  const b = bridge();
  if (!b) return { available: false, reason: 'web' };
  try {
    const r = await b.isAvailable();
    return r?.available ? { available: true, testStore: !!r.testStore } : { available: false, reason: 'no_key' };
  } catch {
    return { available: false, reason: 'update_needed' };
  }
}

async function ensureConfigured() {
  const b = bridge();
  if (!b) throw new Error('billing_unavailable');
  const user = await base44.auth.me();
  if (!user?.id) throw new Error('not_signed_in');
  if (configuredFor !== user.id) {
    await b.configure({ appUserId: user.id });
    configuredFor = user.id;
  }
  return b;
}

export async function getPlans() {
  const b = await ensureConfigured();
  const r = await b.getOfferings();
  const pkgs = r?.packages || [];
  const monthly = pkgs.find((p) => p.type === 'MONTHLY') || pkgs.find((p) => p.period === 'P1M');
  const annual = pkgs.find((p) => p.type === 'ANNUAL') || pkgs.find((p) => p.period === 'P1Y');
  return { monthly, annual, all: pkgs };
}

/** Returns { cancelled } or { plus } after the server has confirmed it. */
export async function buyPlan(packageId) {
  const b = await ensureConfigured();
  let r;
  try {
    r = await b.purchase({ packageId });
  } catch (e) {
    // Build 13 reports a pending payment as an error too, so it may still go through
    checkPlusSoon();
    throw e;
  }
  if (r?.cancelled) return { cancelled: true };
  const status = await getPremiumStatus({ refresh: true }).catch(() => null);
  const plus = !!(status?.plus ?? r?.active);
  if (!plus) checkPlusSoon();
  return { plus, status };
}

export async function restorePurchases() {
  const b = await ensureConfigured();
  await b.restore();
  const status = await getPremiumStatus({ refresh: true }).catch(() => null);
  return { plus: !!status?.plus, status };
}

/** Recognises the server's "daily AI limit reached" answer from any AI function. */
export function aiLimitInfo(err) {
  const d = err?.response?.data || err?.data;
  if (err?.response?.status === 429 || d?.limit_reached) {
    return { kind: d?.kind || 'ai', limit: d?.limit, plus: !!d?.plus, ids: d?.ids || null };
  }
  return null;
}

const LIMIT_WORDS = { identify: 'photo IDs', health: 'health checks', chat: 'AI chat messages' };
export function aiLimitMessage(info) {
  if (info.kind === 'identify') {
    return info.plus
      ? `You've used all ${info.limit} photo IDs for today. They're back tomorrow. Typing a plant's name doesn't use a photo ID.`
      : "You're out of photo IDs for today. The photo is saved and gets named tomorrow. Typing its name doesn't use a photo ID.";
  }
  if (info.kind === 'rename') {
    // Typed names don't use photo IDs, but they have their own daily limit
    const n = info.limit ? `${info.limit} ` : '';
    return info.plus
      ? `You've typed in ${n}plant names today. That's the most for one day, so you can type more tomorrow.`
      : `You've typed in your ${n}free plant names for today. You can type more tomorrow, and Plus gives you more.`;
  }
  const what = LIMIT_WORDS[info.kind] || 'AI uses';
  return info.plus
    ? `You've used all ${info.limit} ${what} for today. They reset at midnight.`
    : `You've used your ${info.limit} free ${what} for today. Plus gives you way more — or try again tomorrow.`;
}

const APP_PACKAGE = 'com.mediocreatbest.happyplants';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;

/** Play's subscription management screen for this app. */
export function manageSubscriptionUrl(productId) {
  const base = 'https://play.google.com/store/account/subscriptions';
  return productId ? `${base}?sku=${encodeURIComponent(productId.split(':')[0])}&package=${APP_PACKAGE}` : `${base}?package=${APP_PACKAGE}`;
}

// Opening Google Play from the Android app. An https link would load Google's website inside
// the app's own web view: MainActivity.openExternally only hands non-http links (intent:,
// market:, tel: ...) to the phone. So on Android we turn the https link into an intent: link
// pinned to the Play Store app (package com.android.vending). That's the same thing Google's
// docs do in Java (ACTION_VIEW on the play.google.com link + setPackage("com.android.vending")),
// and unlike market:// it also works for the subscriptions screen. It has to open in the same
// window: target=_blank / window.open goes through onCreateWindow, which loads the link inside
// the web view and never reaches openExternally. Web keeps the normal https link in a new tab.
function isAndroidApp() {
  try { return Capacitor.getPlatform() === 'android'; } catch { return false; }
}
function playIntent(httpsUrl) {
  return `intent://${httpsUrl.replace(/^https:\/\//, '')}#Intent;scheme=https;package=com.android.vending;end`;
}
/** Props for an <a> that opens a play.google.com link in the Play Store app (Android) or a new tab (web). */
export function playLinkProps(httpsUrl) {
  return isAndroidApp() ? { href: playIntent(httpsUrl) } : { href: httpsUrl, target: '_blank', rel: 'noreferrer' };
}
/** Same as playLinkProps, from code. */
export function openInPlay(httpsUrl) {
  if (isAndroidApp()) window.location.href = playIntent(httpsUrl);
  else window.open(httpsUrl, '_blank', 'noopener');
}

/** If err is the daily-limit answer, show one friendly toast with a way to Plus. */
export async function handleAiLimit(err, navigate) {
  const info = aiLimitInfo(err);
  if (!info) return false;
  // Free users get the small "get Plus" popup (with the reward video for photo IDs)
  if (!info.plus) {
    const { nudgeUpgrade } = await import('@/lib/upgradeNudge');
    let canWatch = false;
    if (info.kind === 'identify' && info.ids) {
      const ids = await import('@/lib/plantIds');
      canWatch = ids.canWatchForIds(info.ids);
    }
    const reason = info.kind === 'identify' ? 'ids' : info.kind;
    if (nudgeUpgrade(reason, { limit: info.limit, ids: info.ids, canWatch })) return true;
  }
  const { toast } = await import('sonner');
  const go = () => (navigate ? navigate('/Premium') : window.location.assign('/Premium'));
  if (info.kind === 'identify' && info.ids) {
    // Photo IDs: offer the reward video first when there is one
    const ids = await import('@/lib/plantIds');
    if (ids.canWatchForIds(info.ids)) {
      toast(aiLimitMessage(info), {
        duration: 10000,
        action: {
          label: `Video: +${info.ids.per_ad}`,
          onClick: async () => {
            const r = await ids.watchForIds();
            toast[r.ok ? 'success' : 'message'](r.ok ? `${info.ids.per_ad} more photo IDs! Naming your waiting plants…` : ids.rewardFailText(r.reason));
          },
        },
      });
      return true;
    }
  }
  toast.error(aiLimitMessage(info), info.plus ? { duration: 6000 } : { duration: 8000, action: { label: 'See Plus', onClick: go } });
  return true;
}
