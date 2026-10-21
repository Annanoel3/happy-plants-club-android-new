import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/lib/backButton'
import '@/lib/stats'
import '@/lib/wateringPopups'

// After an update goes live, an app that was already open still asks for the old version's
// files (the word list, the camera, ...), which no longer exist, so that part of the app
// breaks. When that happens, reload once to pick up the new version (at most once every
// 5 minutes, so a real outage can't cause a reload loop).
function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem('hp_chunk_reload') || 0);
    if (Date.now() - last < 5 * 60 * 1000) return;
    sessionStorage.setItem('hp_chunk_reload', String(Date.now()));
  } catch { /* no storage: still reload once */ }
  window.location.reload();
}
window.addEventListener('vite:preloadError', (e) => { e.preventDefault?.(); reloadForNewVersion(); });
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message || e?.reason || '');
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(msg)) reloadForNewVersion();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



