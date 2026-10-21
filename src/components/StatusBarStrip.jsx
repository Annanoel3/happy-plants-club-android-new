import React, { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

// Android draws the app behind the phone's status bar (time, battery, Wi-Fi). On light
// themes like Kawaii the white status icons sat on light pink and disappeared. This puts a
// solid strip in the theme's own deep color behind them, and keeps the icons white.
// (Android 15+ ignores the old "status bar color" setting, so the strip has to be ours.)
const StatusBar = registerPlugin('StatusBar');

// Themes with a light header: the strip uses the theme's deep text color
// (Kawaii deep pink, Spring deep purple, Winter deep blue...). Dark themes keep their header color.
const LIGHT_THEMES = new Set(['light', 'kawaii', 'valentines', 'stpatricks', 'summer', 'spring', 'winter']);

const isAndroidApp = () => {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
};

export default function StatusBarStrip() {
  const [native] = useState(isAndroidApp);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');

  useEffect(() => {
    if (!native) return undefined;
    const sync = () => setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    window.addEventListener('hp-theme-change', sync);
    sync();
    return () => window.removeEventListener('hp-theme-change', sync);
  }, [native]);

  // White icons on every theme now (the strip is always a deep color)
  useEffect(() => {
    if (!native) return;
    StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
  }, [native, theme]);

  if (!native) return null;
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 pointer-events-none"
      style={{
        height: 'env(safe-area-inset-top, 0px)',
        zIndex: 2147483000,
        background: LIGHT_THEMES.has(theme) ? 'var(--mobile-header-text, #2d3748)' : 'var(--mobile-header-bg, #1a202c)',
      }}
    />
  );
}
