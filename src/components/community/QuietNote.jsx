import React, { useState } from 'react';
import { X } from 'lucide-react';

// A friendly heads-up while Happy Plants is new and the community is small.
// Each screen's note can be closed; it stays closed on this phone.
const TEXT = {
  feed: "We're just getting started, so the community is still small and things may be a little quiet here for a while. Share a plant, say hi, and it'll get livelier as more plant people join.",
  friends: "The community is still small, so you may not find many people yet. Check back as more plant people join.",
};

export default function QuietNote({ where = 'feed', className = '', textClass = '' }) {
  const key = `hp_quiet_note_${where}`;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  if (hidden) return null;
  const close = () => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setHidden(true); };
  return (
    <div className={`relative rounded-2xl p-4 pr-10 ${className}`} role="note">
      <p className={`text-sm leading-snug ${textClass}`}>
        <span aria-hidden className="mr-1">🌱</span>
        {TEXT[where] || TEXT.feed}
      </p>
      <button onClick={close} aria-label="Close this note" className={`absolute top-2 right-2 p-1.5 rounded-full opacity-60 hover:opacity-100 ${textClass}`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
