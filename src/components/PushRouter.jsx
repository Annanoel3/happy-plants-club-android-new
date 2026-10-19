import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';

// A tapped push opens the screen it's about: the app build saves the push's data.screen
// (e.g. "/PlantChat" for a Plant Expert tip) and this asks for it once the page is ready.
// Older builds don't have takePendingScreen; then a tap just opens the app as before.
const SCREEN = /^\/[A-Za-z][A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_%.-]*)?$/;
let Notify = null;

export default function PushRouter() {
  const navigate = useNavigate();
  useEffect(() => {
    let native = false;
    try { native = Capacitor.isNativePlatform(); } catch { native = false; }
    if (!native) return undefined;
    if (!Notify) Notify = registerPlugin('NotifyBridge');
    let timers = [];
    const check = async () => {
      try {
        const r = await Notify.takePendingScreen();
        const screen = r?.screen;
        if (screen && SCREEN.test(screen) && screen !== window.location.pathname + window.location.search) navigate(screen);
      } catch { /* older build */ }
    };
    // the tap is recorded as the app opens: look a few times
    const look = () => { timers.forEach(clearTimeout); timers = [300, 1500, 4000].map((ms) => setTimeout(check, ms)); };
    look();
    const onVisible = () => { if (document.visibilityState === 'visible') look(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVisible); };
  }, [navigate]);
  return null;
}
