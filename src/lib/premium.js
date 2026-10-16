// Happy Plants Plus: subscription state + the native billing bridge.
// The server (functions/premium, fed by RevenueCat) decides whether you're Plus;
// the phone only starts purchases. App user id at RevenueCat = Base44 user id.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { base44 } from '@/api/base44Client';

const PLUS_CACHE_KEY = 'hp_plus';
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
  const { data } = await base44.functions.invoke('premium', { action: refresh ? 'refresh' : 'status' });
  if (data?.success) cachePlus(data.plus);
  return data;
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
  const r = await b.purchase({ packageId });
  if (r?.cancelled) return { cancelled: true };
  const status = await getPremiumStatus({ refresh: true }).catch(() => null);
  return { plus: !!(status?.plus ?? r?.active), status };
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
    return { kind: d?.kind || 'ai', limit: d?.limit, plus: !!d?.plus };
  }
  return null;
}

const LIMIT_WORDS = { identify: 'plant IDs', health: 'health checks', chat: 'AI chat messages' };
export function aiLimitMessage(info) {
  const what = LIMIT_WORDS[info.kind] || 'AI uses';
  return info.plus
    ? `You've used all ${info.limit} ${what} for today. They reset at midnight.`
    : `You've used your ${info.limit} free ${what} for today. Plus gives you way more — or try again tomorrow.`;
}

/** Play's subscription management screen for this app. */
export function manageSubscriptionUrl(productId) {
  const pkg = 'com.mediocreatbest.happyplants';
  const base = 'https://play.google.com/store/account/subscriptions';
  return productId ? `${base}?sku=${encodeURIComponent(productId.split(':')[0])}&package=${pkg}` : `${base}?package=${pkg}`;
}

/** If err is the daily-limit answer, show one friendly toast with a way to Plus. */
export async function handleAiLimit(err, navigate) {
  const info = aiLimitInfo(err);
  if (!info) return false;
  const { toast } = await import('sonner');
  const go = () => (navigate ? navigate('/Premium') : window.location.assign('/Premium'));
  toast.error(aiLimitMessage(info), info.plus ? { duration: 6000 } : { duration: 8000, action: { label: 'See Plus', onClick: go } });
  return true;
}
