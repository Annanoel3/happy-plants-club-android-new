import React from 'react';
import { createPortal } from 'react-dom';

// Several plants added at once: one note instead of a question for every plant.
// The plants wait under "Newly added" at the top of the garden until the owner opens
// each one and says where it lives.
export default function NewPlantsNotice({ count, ui, onClose }) {
  const light = ui?.light;
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-label="New plants added">
      <div className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl ${light ? 'bg-white' : 'bg-neutral-900'}`}>
        <p className="text-3xl mb-2" aria-hidden>🌱</p>
        <h2 className={`text-xl font-bold ${ui?.text || ''}`}>{count} new plant{count === 1 ? '' : 's'} added</h2>
        <p className={`mt-2 text-sm ${ui?.sub || ''}`}>
          Open each one to choose where it lives and check its care. They're waiting at the top of your garden under <b>Newly added</b>.
        </p>
        <button onClick={onClose} className="mt-4 w-full rounded-2xl py-3.5 font-bold bg-green-600 text-white active:scale-95">
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
