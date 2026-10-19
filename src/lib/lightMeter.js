// Light meter: reads the phone's ambient light sensor (Android app, NotifyBridge.startLight)
// and compares the spot with what the plant's care text says it likes.
//
// Light bands (foot-candles). Low/medium/bright follow University of Minnesota Extension
// (low 50-250, medium 250-1,000, high 1,000+). Under 50 fc won't sustain most plants
// (Mississippi State Extension). "Direct sun" above 3,000 fc is our own cut-off between
// Illinois Extension's "direct" (~1,500 fc indoors) and outdoor sun (10,000-12,000 fc).
// Phone sensors are rough (often 10-40% off uncalibrated), so we only ever show bands.
import { Capacitor, registerPlugin } from '@capacitor/core';

export const LUX_PER_FC = 10.764;
export const BANDS = [
  { key: 'dark', label: 'Too dark', short: 'Dark', upToFc: 50 },
  { key: 'low', label: 'Low light', short: 'Low', upToFc: 250 },
  { key: 'medium', label: 'Medium light', short: 'Medium', upToFc: 1000 },
  { key: 'bright', label: 'Bright light', short: 'Bright', upToFc: 3000 },
  { key: 'direct', label: 'Direct sun', short: 'Sun', upToFc: Infinity },
];
export const fcOf = (lux) => lux / LUX_PER_FC;
export function bandIndex(lux) {
  const fc = fcOf(lux);
  return BANDS.findIndex((b) => fc < b.upToFc);
}

// ---- The sensor (Android app only; older app versions don't have it) ----
let Notify = null;
function bridge() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Notify) Notify = registerPlugin('NotifyBridge');
  return Notify;
}
let availability = null;
export async function lightMeterAvailable() {
  if (availability !== null) return availability;
  const b = bridge();
  if (!b) return (availability = false);
  try {
    const r = await b.lightInfo();
    availability = !!r?.has_sensor;
  } catch {
    availability = false; // app version without the light meter
  }
  return availability;
}
/** Starts readings; calls onLux(lux) on every change. Returns a stop function. */
export async function startLight(onLux) {
  const b = bridge();
  if (!b) throw new Error('unavailable');
  const sub = await b.addListener('light', (e) => {
    const lux = Number(e?.lux);
    if (Number.isFinite(lux) && lux >= 0) onLux(lux);
  });
  await b.startLight();
  return async () => {
    try { await b.stopLight(); } catch { /* ignore */ }
    try { await sub.remove(); } catch { /* ignore */ }
  };
}

// ---- What the plant likes, read from its care text ----
const NEG = /\b(avoid|protect|shield|keep (?:it )?(?:out of|away from)|away from|out of|not|no|never|scorch\w*|burn\w*|too much)\b/;
const TOL = /\b(tolerat\w*|can handle|can take|survives?|accepts?|copes?)\b/;
const DIRECT = /\b(full sun|full sunlight|direct (?:morning |afternoon |midday |hot |strong |harsh )?(?:sun\w*|light)|(?:morning|afternoon|midday|hot|harsh|strong|intense) sun\w*|hours of (?:gentle |direct |full )*sun\w*)/;
const SOFT_DIRECT = /\b(morning sun|gentle (?:morning |direct )?sun|a little (?:direct )?sun|some (?:direct )?sun)/;

/**
 * "Bright, indirect light; avoid direct sun" → { min, max, ideal, softDirect } as BANDS
 * indexes, or null when the text doesn't say. softDirect: direct sun only if it's gentle.
 */
export function needFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const sentences = text.toLowerCase().replace(/—|–/g, ' - ').split(/[.;!?\n]+/);
  let found = false;
  let min = 9, idealMax = -1, tolMin = 9, allowMax = -1;
  let directOk = false, directSoftOk = false, directNo = false;
  for (let s of sentences) {
    s = s.split(/,?\s+such as\s+|,?\s+e\.g\.?\s+|,?\s+like an?\s+/)[0]; // drop examples ("such as an east window")
    for (const clause of s.split(/\s+but\s+|\s+though\s+|\s+while\s+|,\s*although\s+/)) {
      const c = clause.trim();
      if (!c) continue;
      const neg = NEG.test(c);
      const tol = TOL.test(c);
      const marks = [];
      const hasBright = /\bbright\w*/.test(c);
      if (/\b(low(?:er)?(?:[ -]light)?|dim|full shade|deep shade|north[ -]facing)\b/.test(c) && !/\blow(er)? (?:water|humidity|temperature)/.test(c)) marks.push(1);
      if (/\b(medium|moderate|partial (?:shade|sun)|part (?:shade|sun)|filtered|dappled)\b/.test(c)) marks.push(2);
      if (/\bindirect\b/.test(c) && !hasBright) { marks.push(2); if (!neg) allowMax = 3; } // plain "indirect": medium, bright is fine too
      if (hasBright) marks.push(3);
      const direct = DIRECT.test(c);
      if (direct) {
        if (neg) directNo = true;
        else if (SOFT_DIRECT.test(c)) directSoftOk = true;
        else directOk = true;
      }
      if (neg) continue; // "avoid low light" etc. isn't a liking
      if (!marks.length && !direct) continue;
      found = true;
      for (const m of marks) {
        if (tol) tolMin = Math.min(tolMin, m);
        else { min = Math.min(min, m); idealMax = Math.max(idealMax, m); }
      }
    }
  }
  if (!found && !directOk && !directSoftOk) return null;
  if (directOk && !directNo) { idealMax = 4; if (min === 9) min = 3; }
  if (idealMax < 0) {
    if (directSoftOk) { idealMax = 3; min = Math.min(min, 3); } else return null;
  }
  const lo = Math.min(min, tolMin);
  const max = directOk && !directNo ? 4 : directSoftOk ? 4 : Math.max(idealMax, allowMax);
  return {
    min: lo === 9 ? idealMax : lo,
    max,
    ideal: idealMax,
    softDirect: max === 4 && !(directOk && !directNo),
  };
}

/** What to tell the owner about this spot for this plant. */
export function verdict(band, need, plantName = 'it') {
  if (!need || band < 0) return null;
  const Name = plantName ? plantName[0].toUpperCase() + plantName.slice(1) : 'It';
  if (band < need.min) {
    return need.min - band >= 2
      ? { tone: 'bad', title: `Too dark for ${plantName}`, text: 'It needs a much brighter spot. Try right next to a window.' }
      : { tone: 'warn', title: `A bit dark for ${plantName}`, text: 'It will grow slowly here. A spot closer to a window would suit it better.' };
  }
  if (band > need.max) {
    return { tone: 'warn', title: `Too much sun for ${plantName}`, text: 'Move it back from the window a little, or put a sheer curtain between them.' };
  }
  if (band === 4 && need.softDirect) {
    return { tone: 'warn', title: 'Direct sun here', text: `Gentle morning sun is fine for ${plantName}. Strong midday or afternoon sun can scorch it.` };
  }
  if (band < need.ideal) {
    return { tone: 'ok', title: `${Name} can live here`, text: 'It would grow faster with a bit more light.' };
  }
  return { tone: 'good', title: `Good spot for ${plantName}`, text: 'This is the kind of light it likes.' };
}
