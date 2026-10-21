// Android back button: close the open popup first, only then go back a page.
// The native app (MainActivity) calls window.__hpBack(); if it returns true the
// popup was closed and the app stays on the same screen.
//
// How a popup gets closed, in order:
//   1. a close handler registered for it (registerBackHandler, by its aria-label):
//      for popups whose only button is "Got it" and that must run their own close code
//   2. Radix dialogs/sheets/menus: Escape
//   3. a button marked data-back-close, or one labelled "Close"
//   4. a tap on its dark backdrop

const handlers = []; // { label, fn }

/** While a popup is open, Back runs fn() for the dialog with this aria-label. Returns an unregister function. */
export function registerBackHandler(label, fn) {
  const entry = { label, fn };
  handlers.push(entry);
  return () => {
    const i = handlers.indexOf(entry);
    if (i >= 0) handlers.splice(i, 1);
  };
}

function closeTopPopup() {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
    .filter((el) => el.getAttribute('data-state') !== 'closed')
    .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');
  const top = dialogs[dialogs.length - 1];
  if (!top) {
    // Open dropdown / select menus (Radix) also close on Escape
    if (document.querySelector('[role="menu"][data-state="open"], [role="listbox"][data-state="open"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }
    return false;
  }
  const label = top.getAttribute('aria-label');
  if (label) {
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i].label === label) { handlers[i].fn(); return true; }
    }
  }
  // Radix dialogs/sheets/alerts close on Escape
  if (top.getAttribute('data-state') === 'open') {
    top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  }
  // Our own sheets: press their close button, or tap the dark backdrop
  const closeBtn = top.querySelector('[data-back-close]') || top.querySelector('[aria-label="Close"], [aria-label="close"]');
  if (closeBtn) { closeBtn.click(); return true; }
  const backdrop = top.querySelector(':scope > .absolute.inset-0');
  if (backdrop) { backdrop.click(); return true; }
  top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

if (typeof window !== 'undefined') {
  window.__hpBack = () => {
    try { return closeTopPopup(); } catch { return false; }
  };
}
