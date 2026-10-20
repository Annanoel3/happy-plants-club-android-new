import React, { useState } from 'react';
import { X } from 'lucide-react';

// "How to play": a few short picture steps. steps: [{ title, text, pic }]
// extra: optional { label, onClick } link under the last step.
export default function GameTutorial({ steps, dark, ui, onClose, extra, label = 'How to play' }) {
  const [step, setStep] = useState(0);
  const s = steps[step];
  const last = step === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl ${dark ? 'bg-neutral-900' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-xs font-semibold ${ui.sub}`}>{label} · {step + 1} of {steps.length}</p>
          <button onClick={onClose} aria-label="Close" className={`p-1 ${ui.text}`}><X className="w-5 h-5" /></button>
        </div>
        <h2 className={`text-xl font-bold ${ui.text}`}>{s.title}</h2>
        {s.text && <p className={`mt-1 text-sm ${ui.sub}`}>{s.text}</p>}
        {s.pic && <div className="mt-4">{s.pic}</div>}
        <div className="flex gap-2 mt-5">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className={`flex-1 rounded-2xl py-3 font-semibold border ${dark ? 'border-white/20 text-white' : 'border-gray-300 text-gray-800'}`}>Back</button>
          )}
          {!last ? (
            <button onClick={() => setStep(step + 1)} className="flex-1 rounded-2xl py-3 font-bold bg-green-600 text-white active:scale-95">Next</button>
          ) : (
            <button onClick={onClose} className="flex-1 rounded-2xl py-3 font-bold bg-green-600 text-white active:scale-95">Got it</button>
          )}
        </div>
        {last && extra && (
          <button onClick={extra.onClick} className="w-full mt-2 text-sm font-semibold text-green-600 underline">{extra.label}</button>
        )}
      </div>
    </div>
  );
}
