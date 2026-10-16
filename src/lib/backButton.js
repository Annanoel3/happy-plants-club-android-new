// Android back button: close the open popup first, only then go back a page.
// The native app (MainActivity) calls window.__hpBack(); if it returns true the
// popup was closed and the app stays on the same screen.
function closeTopPopup() {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
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
  // Radix dialogs/sheets/alerts close on Escape
  if (top.getAttribute('data-state') === 'open') {
    top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  }
  // Our own sheets: press their close button, or tap the dark backdrop
  const closeBtn = top.querySelector('[aria-label="Close"], [aria-label="close"]');
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
