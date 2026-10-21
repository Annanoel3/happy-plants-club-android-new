import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { saveMyPlayerId } from '@/functions/saveMyPlayerId';
import { setOneSignalExternalUserId } from '@/functions/setOneSignalExternalUserId';
import { whenPopupFree, releasePopup } from '@/lib/popupGate';

// Set once the app has asked for notifications on its own. After that it never asks
// again on launch; Settings > Notifications has a button instead.
const ASKED_KEY = 'hp_push_asked';
// Screens where an ask would interrupt sign-up
const NO_ASK_PATHS = ['/Welcome', '/ProfileSetup', '/DeleteAccount', '/PrivacyPolicy', '/TermsAndConditions'];

function isRunningInCapacitor() {
  return window.Capacitor?.isNativePlatform?.() ?? false;
}

function bridge() {
  return isRunningInCapacitor() ? window.Capacitor?.Plugins?.NotifyBridge || null : null;
}

function askedBefore() {
  try { return !!localStorage.getItem(ASKED_KEY); } catch { return false; }
}

function markAsked() {
  try { localStorage.setItem(ASKED_KEY, new Date().toISOString()); } catch { /* ignore */ }
}

/**
 * Can this phone show our notifications? 'granted' | 'denied' | 'unknown'
 * ('unknown' on the web or on app builds without NotifyBridge.wateringState).
 * Reads Android's own setting, so it never shows a prompt.
 */
export async function getPushPermission() {
  const b = bridge();
  if (!b?.wateringState) return 'unknown';
  try {
    const s = await b.wateringState();
    if (s?.notificationsAllowed === true) return 'granted';
    if (s?.notificationsAllowed === false) return 'denied';
  } catch { /* older build */ }
  return 'unknown';
}

/**
 * Shows Android's notification prompt. If Android won't show it again (they said no
 * before), OneSignal offers to open this app's notification settings instead.
 * Resolves with the permission afterwards.
 */
export async function requestPushPermission() {
  const b = bridge();
  if (!b?.requestPermission) return 'unknown';
  markAsked();
  try { await b.requestPermission(); } catch { /* dismissed */ }
  const result = await getPushPermission();
  if (result === 'granted') window.dispatchEvent(new Event('hp-push-granted'));
  return result;
}

// Links this phone to the signed-in account so pushes reach it.
// This never asks for permission; that happens once, later, with an explanation.
async function linkPhone(user) {
  const NotifyBridge = bridge();
  if (!NotifyBridge || !user) return;
  let externalId;
  if (user.email && user.email.includes('@')) externalId = user.email;
  else if (user.id) externalId = `${user.id}@happyplants.club`;
  else return;
  try {
    const loginResult = await NotifyBridge.login({ externalId });
    const playerId = loginResult?.playerId;
    if (playerId) {
      await saveMyPlayerId({ playerId });
      // Force-link external_id to this player via REST API
      await setOneSignalExternalUserId({ playerId, externalId });
    }
  } catch (e) {
    console.warn('[OneSignal] link failed', e?.message || e);
  }
}

// Only ask once someone is set up and has a plant to be reminded about.
async function readyToAsk(pathname) {
  if (askedBefore() || !bridge()) return false;
  if (NO_ASK_PATHS.some((p) => pathname.startsWith(p))) return false;
  const me = await base44.auth.me().catch(() => null);
  if (!me?.email || !me.location || !me.profile_complete) return false;
  const perm = await getPushPermission();
  if (perm === 'granted') { markAsked(); return false; } // already on (older Android, or allowed before)
  const plants = await base44.entities.Plant.filter({ created_by: me.email }, '-created_date', 1).catch(() => []);
  return Array.isArray(plants) && plants.length > 0;
}

export default function OneSignalSetup({ user }) {
  const { pathname } = useLocation();
  const [showAsk, setShowAsk] = useState(false);
  const showing = useRef(false);
  const lastCheck = useRef(0);
  const cancelWait = useRef(null);
  const checking = useRef(false);
  const checkRef = useRef(() => {});

  useEffect(() => {
    if (user) linkPhone(user);
  }, [user]);

  // Permission just turned on: link again so the saved push id is current
  useEffect(() => {
    const onGranted = () => { if (user) linkPhone(user); };
    window.addEventListener('hp-push-granted', onGranted);
    return () => window.removeEventListener('hp-push-granted', onGranted);
  }, [user]);

  useEffect(() => {
    if (!user || askedBefore() || !bridge()) return undefined;
    let stopped = false;
    const check = async (force) => {
      if (stopped || checking.current || showing.current || cancelWait.current || askedBefore()) return;
      // Screen changes check at most every 20 s, plant saves every 5 s (each check reads one plant)
      if (Date.now() - lastCheck.current < (force ? 5000 : 20000)) return;
      lastCheck.current = Date.now();
      checking.current = true;
      let ready = false;
      try { ready = await readyToAsk(window.location.pathname); } finally { checking.current = false; }
      if (!ready || stopped) return;
      // Wait until no other popup (camera/mic sheet, update, weather) is showing
      cancelWait.current = whenPopupFree('push-ask', () => {
        cancelWait.current = null;
        if (askedBefore() || NO_ASK_PATHS.some((p) => window.location.pathname.startsWith(p))) {
          releasePopup('push-ask');
          return;
        }
        showing.current = true;
        setShowAsk(true);
      }, { firstDelay: 2500, maxWaitMs: 10 * 60 * 1000 });
    };
    checkRef.current = check;
    // First plant just saved
    const onWrite = (e) => { if (e?.detail?.entity === 'Plant') setTimeout(() => check(true), 1500); };
    window.addEventListener('hp-data-write', onWrite);
    return () => {
      stopped = true;
      checkRef.current = () => {};
      window.removeEventListener('hp-data-write', onWrite);
    };
  }, [user]);

  // Look again on each screen change (e.g. back on the garden after adding a plant)
  useEffect(() => { checkRef.current(false); }, [user, pathname]);

  useEffect(() => () => { cancelWait.current?.(); releasePopup('push-ask'); }, []);

  const close = () => {
    markAsked();
    showing.current = false;
    setShowAsk(false);
    releasePopup('push-ask');
  };

  const turnOn = async () => {
    close();
    await requestPushPermission();
  };

  if (!showAsk) return null;

  const theme = (() => { try { return localStorage.getItem('theme') || 'light'; } catch { return 'light'; } })();
  const isDark = ['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'fall', 'valentines', 'stpatricks'].includes(theme);
  const cardBg = isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200';
  const textColor = isDark ? 'text-white' : 'text-gray-900';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center p-4" role="dialog" aria-modal="true" aria-label="Turn on notifications"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className={`relative w-full max-w-sm rounded-3xl border shadow-2xl p-6 ${cardBg}`}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-green-700" />
          </div>
          <p className={`text-base font-semibold pt-1 ${textColor}`}>
            Turn on notifications so we can remind you to water.
          </p>
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={close} className={`flex-1 h-11 rounded-2xl text-sm font-medium ${subText}`}>
            Not now
          </button>
          <button onClick={turnOn} className="flex-1 h-11 rounded-2xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white">
            Turn on
          </button>
        </div>
      </div>
    </div>
  );
}
