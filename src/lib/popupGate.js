// One popup at a time. Anything that pops up on its own (weather, location ask,
// permissions, update) asks here first and waits its turn. Open app dialogs
// (role="dialog", e.g. the Water dialog) also count as "busy".
let current = null;

export function popupBusy() {
  if (current) return true;
  try {
    return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
  } catch {
    return false;
  }
}

export function claimPopup(name) {
  if (current === name) return true;
  if (popupBusy()) return false;
  current = name;
  return true;
}

export function releasePopup(name) {
  if (current === name) current = null;
}

/**
 * Calls show() once nothing else is up, holding the slot for `name` until releasePopup(name).
 * Gives up after maxWaitMs. Returns a cancel function.
 */
export function whenPopupFree(name, show, { firstDelay = 0, interval = 1500, maxWaitMs = 120000 } = {}) {
  let cancelled = false;
  let t = null;
  const started = Date.now();
  const tick = () => {
    if (cancelled) return;
    if (claimPopup(name)) { show(); return; }
    if (Date.now() - started > maxWaitMs) return;
    t = setTimeout(tick, interval);
  };
  t = setTimeout(tick, firstDelay);
  return () => { cancelled = true; clearTimeout(t); };
}
