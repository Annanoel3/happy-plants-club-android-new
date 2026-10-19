import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sun } from 'lucide-react';
import { BANDS, bandIndex, fcOf, needFromText, verdict, startLight } from '@/lib/lightMeter';

// Full-screen light meter for one plant: hold the phone where the plant sits.
// Shows a band (low / medium / bright / sun), not a precise number: phone sensors are rough.
const TONE = {
  good: 'bg-green-600/15 border-green-600/40',
  ok: 'bg-lime-500/15 border-lime-500/40',
  warn: 'bg-amber-500/15 border-amber-500/40',
  bad: 'bg-red-500/15 border-red-500/40',
};
const SEG = ['#6b7280', '#93c5fd', '#86efac', '#fde047', '#fb923c'];

function roundNice(n) {
  if (n < 10) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export default function LightMeter({ plant, ui, onClose }) {
  const [lux, setLux] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(null);
  const samples = useRef([]);

  useEffect(() => {
    let stop = null;
    let alive = true;
    let last = 0;
    const onLux = (v) => {
      const now = Date.now();
      samples.current = [...samples.current.filter((s) => now - s.at < 1500), { v, at: now }].slice(-15);
      if (now - last < 250) return; // a calm display: about 4 updates a second
      last = now;
      const sorted = samples.current.map((s) => s.v).sort((a, b) => a - b);
      setLux(sorted[Math.floor(sorted.length / 2)]);
      setWaiting(false);
    };
    startLight(onLux).then((s) => { if (alive) stop = s; else s(); }).catch(() => setError("This phone's light sensor isn't available."));
    const t = setTimeout(() => { if (alive && !samples.current.length) setWaiting(true); }, 2500);
    return () => { alive = false; clearTimeout(t); stop?.(); };
  }, []);

  const name = plant?.nickname || plant?.name || 'your plant';
  const careText = plant?.care_instructions?.sunlight || '';
  const need = useMemo(() => needFromText(careText), [careText]);
  const band = lux === null ? -1 : bandIndex(lux);
  const v = verdict(band, need, name);
  const fc = lux === null ? null : fcOf(lux);
  // Marker position on a log scale from 10 fc to 10,000 fc
  const pos = fc === null ? null : Math.min(100, Math.max(0, ((Math.log10(Math.max(fc, 10)) - 1) / 3) * 100));
  const edges = [10, 50, 250, 1000, 3000, 10000].map((f) => ((Math.log10(f) - 1) / 3) * 100);
  const light = ui?.light;

  return createPortal(
    <div className={`fixed inset-0 z-[300] flex flex-col ${light ? 'bg-gray-50' : 'bg-neutral-950'}`} role="dialog" aria-modal="true" aria-label="Light meter"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className={`px-4 py-3 border-b flex items-center justify-between ${light ? 'border-gray-200' : 'border-white/15'}`}>
        <p className={`text-lg font-bold flex items-center gap-2 ${ui.text}`}><Sun className="w-5 h-5 text-amber-500" /> Light meter</p>
        <button onClick={onClose} aria-label="Close" className={`p-2 -mr-2 rounded-full ${ui.text}`}><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <p className={`text-sm ${ui.sub}`}>
          Hold your phone where {name} sits, screen facing the window. The sensor is at the top of the screen near the front camera, so keep your hand off it.
        </p>

        <div className={`rounded-2xl border p-5 text-center ${ui.card}`}>
          {error ? (
            <p className={`font-semibold ${ui.text}`}>{error}</p>
          ) : lux === null ? (
            <p className={`font-semibold ${ui.text}`}>{waiting ? 'Waiting for the sensor… tilt the phone a little.' : 'Reading the light…'}</p>
          ) : (
            <>
              <p className={`text-3xl font-bold ${ui.text}`}>{BANDS[band].label}</p>
              <p className={`text-sm mt-1 ${ui.sub}`}>about {roundNice(fc).toLocaleString()} foot-candles ({roundNice(lux).toLocaleString()} lux)</p>
            </>
          )}

          {/* The scale: dark → sun, with what the plant likes underneath */}
          <div className="mt-5 relative">
            <div className="flex h-3 rounded-full overflow-hidden">
              {BANDS.map((b, i) => (
                <div key={b.key} style={{ width: `${edges[i + 1] - edges[i]}%`, background: SEG[i], opacity: band === -1 || band === i ? 1 : 0.35 }} />
              ))}
            </div>
            {pos !== null && (
              <div className="absolute -top-1.5 h-6 w-1.5 rounded-full bg-black dark:bg-white shadow transition-all duration-300"
                style={{ left: `calc(${pos}% - 3px)`, background: light ? '#111827' : '#fff' }} aria-hidden />
            )}
            <div className="flex mt-1.5">
              {BANDS.map((b, i) => (
                <span key={b.key} className={`text-[10px] text-center ${ui.sub}`} style={{ width: `${edges[i + 1] - edges[i]}%` }}>{b.short}</span>
              ))}
            </div>
            {need && (
              <div className="relative h-6 mt-1">
                <div className="absolute top-1 h-1.5 rounded-full bg-green-600"
                  style={{ left: `${edges[need.min]}%`, width: `${edges[need.max + 1] - edges[need.min]}%` }} />
                <p className="absolute top-3 text-[11px] font-semibold text-green-600 whitespace-nowrap"
                  style={{ left: `${Math.min(edges[need.min], 60)}%` }}>{name} likes this range</p>
              </div>
            )}
          </div>
        </div>

        {v && (
          <div className={`rounded-2xl border p-4 ${TONE[v.tone]}`} role="status">
            <p className={`font-bold ${ui.text}`}>{v.title}</p>
            <p className={`text-sm mt-0.5 ${ui.sub}`}>{v.text}</p>
          </div>
        )}

        {careText && (
          <div className={`rounded-2xl border p-4 ${ui.card}`}>
            <p className={`text-sm font-semibold ${ui.text}`}>☀️ What {name} needs</p>
            <p className={`text-sm mt-1 ${ui.sub}`}>{careText}</p>
          </div>
        )}

        <ul className={`text-xs space-y-1.5 ${ui.sub}`}>
          <li>• Light changes a lot through the day and the year. Check around midday, and again in winter.</li>
          <li>• Phone sensors are rough, so this shows a range, not an exact number.</li>
          <li>• Light drops sharply as you move away from a window, so measure right where the plant sits.</li>
        </ul>
      </div>
    </div>,
    document.body,
  );
}
