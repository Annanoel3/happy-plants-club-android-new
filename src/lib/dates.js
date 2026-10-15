// Dates in the user's own calendar day.
// `new Date().toISOString()` is UTC, so for anyone in the Americas "today" flipped to
// tomorrow's date every evening (7 PM Central). Everything that stamps a day uses these.
export function toLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localToday() {
  return toLocalDateString(new Date());
}
