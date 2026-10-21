import React from 'react';
import { createPortal } from 'react-dom';
import { introEndsText } from '@/lib/plantIds';
import { rewardedAvailable } from '@/lib/admob';

// Shown once to new accounts (first 24 hours): how photo IDs work, before they run into it.
export default function IdsWelcome({ ids, ui, onClose }) {
  const light = ui?.light;
  const video = rewardedAvailable();
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-label="Adding plants by photo">
      <div className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl ${light ? 'bg-white' : 'bg-neutral-900'}`}>
        <p className="text-3xl mb-2" aria-hidden>📸🌿</p>
        <h2 className={`text-xl font-bold ${ui?.text || ''}`}>Add your whole garden today</h2>
        <ul className={`mt-3 space-y-2 text-sm ${ui?.sub || ''}`}>
          <li>✅ <b className={ui?.text}>First 24 hours:</b> add up to {ids?.intro_total || 15} plants by photo, free{ids?.intro_ends_at ? ` (${introEndsText(ids)})` : ''}.</li>
          <li>📷 <b className={ui?.text}>After that:</b> {ids?.daily || 5} photo IDs a day.{video ? ` Short videos get you ${ids?.per_ad || 5} more each, up to 3 videos a day.` : ''}</li>
          <li>⌨️ <b className={ui?.text}>Typing a plant's name</b> doesn't use a photo ID.</li>
          <li>✨ <b className={ui?.text}>Plus</b> gets 200 photo IDs a day and no ads.</li>
        </ul>
        <button onClick={onClose} data-back-close className="mt-5 w-full rounded-2xl py-3.5 font-bold bg-green-600 text-white active:scale-95">
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
