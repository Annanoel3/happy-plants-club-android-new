import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Undo2, Eraser, Lightbulb, Loader2, Share2, RefreshCw, Flame, Timer, PlayCircle, HelpCircle, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { localToday } from '@/lib/dates';
import { usePlus } from '@/lib/plus';
import { rewardedAvailable, showRewardedAd } from '@/lib/admob';
import { makePuzzle, dailyPuzzle, isSolved, hintFor, REGION_COLORS, REGION_COLORS_DARK } from '@/lib/plantdoku/engine';
import { markPlantdokuFound } from '@/lib/plantdoku/egg';
import { setDone, getDone, countFinish, adBeforeNext, useToday } from '@/lib/games/common';
import NewDailyBar from '@/components/games/NewDailyBar';

// Plantdoku: every color is a garden bed. One plant in every bed, every row and every
// column; plants never touch, not even at corners. Each bed has its own plant, so a
// finished board shows one of each.
// Daily puzzle (same for everyone, timed on the server from the Start tap, leaderboard)
// + practice puzzles from a 5x5 starter up. Ads: one full-screen ad per two finished
// puzzles (adBeforeNext in lib/games/common), when the next one starts, before its clock runs.
// Hints: each one costs a reward video (Plus: unlimited). The clock stops during any ad.
// The daily board stays hidden until its clock is running, so nobody can study it for free.
// Plus: no ads, unlimited hints.

const DARK_THEMES = new Set(['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'valentines', 'stpatricks', 'fall']);
const LEVELS = [
  { key: 'starter', label: 'Starter', size: 5 },
  { key: 'easy', label: 'Easy', size: 6 },
  { key: 'medium', label: 'Medium', size: 7 },
  { key: 'hard', label: 'Hard', size: 8 },
  { key: 'expert', label: 'Expert', size: 9 },
];
const HINT_SECONDS = 30;
const MEDALS = ['🥇', '🥈', '🥉'];
const TUTORIAL_KEY = 'hp_pd_tutorial_v2';
// Bed names, same order as REGION_COLORS (rose, yellow, blue, green, lavender, apricot, aqua, grey, pink)
const BED_NAMES = ['red', 'yellow', 'blue', 'green', 'purple', 'orange', 'teal', 'gray', 'pink'];
// Each bed's own plant, colored to match its bed
const PLANTS = [
  { kind: 'blossom', color: '#e11d48' },
  { kind: 'daisy', color: '#facc15', center: '#92400e' },
  { kind: 'tulip', color: '#2563eb' },
  { kind: 'cactus', color: '#16a34a' },
  { kind: 'blossom', color: '#8b5cf6' },
  { kind: 'tulip', color: '#f97316' },
  { kind: 'rosette', color: '#0d9488' },
  { kind: 'daisy', color: '#ffffff', center: '#facc15' },
  { kind: 'tulip', color: '#db2777' },
];

const fmt = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const call = async (action, extra = {}) => {
  const { data } = await base44.functions.invoke('plantdoku', { action, ...extra });
  return data;
};
// Leaving the screen or the app: stop the clock even if the page is going away
function pauseKeepalive(date) {
  try {
    let token = null;
    try { token = localStorage.getItem('base44_access_token'); } catch { /* ignore */ }
    token = token || appParams.token;
    fetch(`/api/apps/${appParams.appId}/functions/plantdoku`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: 'pause', date }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = Math.max(0, Math.round((next - now) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// What's wrong right now, in words, plus which squares to show in red
function checkBoard(N, regions, plants) {
  const badPlants = new Set();
  const badZones = new Set();
  const problems = [];
  const byRow = {}, byCol = {}, byBed = {};
  for (const [r, c] of plants) {
    (byRow[r] = byRow[r] || []).push(r * N + c);
    (byCol[c] = byCol[c] || []).push(r * N + c);
    const g = regions[r * N + c];
    (byBed[g] = byBed[g] || []).push(r * N + c);
  }
  for (const g of Object.keys(byBed)) {
    if (byBed[g].length < 2) continue;
    byBed[g].forEach((i) => badPlants.add(i));
    regions.forEach((x, i) => { if (String(x) === g) badZones.add(i); });
    problems.push(`The ${BED_NAMES[g] || ''} bed has ${byBed[g].length} plants. Only 1 per color.`);
  }
  for (const r of Object.keys(byRow)) {
    if (byRow[r].length < 2) continue;
    byRow[r].forEach((i) => badPlants.add(i));
    for (let c = 0; c < N; c++) badZones.add(Number(r) * N + c);
    problems.push(`Row ${Number(r) + 1} has ${byRow[r].length} plants. Only 1 per row.`);
  }
  for (const c of Object.keys(byCol)) {
    if (byCol[c].length < 2) continue;
    byCol[c].forEach((i) => badPlants.add(i));
    for (let r = 0; r < N; r++) badZones.add(r * N + Number(c));
    problems.push(`Column ${Number(c) + 1} has ${byCol[c].length} plants. Only 1 per column.`);
  }
  let touching = false;
  for (let a = 0; a < plants.length; a++) {
    for (let b = a + 1; b < plants.length; b++) {
      const [r1, c1] = plants[a], [r2, c2] = plants[b];
      if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) {
        badPlants.add(r1 * N + c1); badPlants.add(r2 * N + c2); touching = true;
      }
    }
  }
  if (touching) problems.push('Two plants are touching. They need a gap, even at the corners.');
  return { badPlants, badZones, problems };
}

// ---- Plant art (original): each bed gets its own plant ----
const O = '#4a3728';
function Stem() {
  return (
    <>
      <path d="M20 38 V21" stroke={O} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M20 38 V21" stroke="#5aa84b" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 32 C14 26 8 29 10 33 C12 37 18 35 20 32 Z" fill="#8fd17a" stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20 29 C26 23 32 26 30 30 C28 34 22 32 20 29 Z" fill="#8fd17a" stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
    </>
  );
}
function PlantIcon({ region, className = 'w-[82%] h-[82%]' }) {
  const p = PLANTS[region % PLANTS.length];
  let art;
  if (p.kind === 'blossom') {
    const pts = [[20, 7.6], [25.9, 11.9], [23.7, 18.9], [16.3, 18.9], [14.1, 11.9]];
    art = (<><Stem />{pts.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="5.2" fill={p.color} stroke={O} strokeWidth="1.5" />)}<circle cx="20" cy="14" r="3.4" fill="#fde047" stroke={O} strokeWidth="1.3" /></>);
  } else if (p.kind === 'tulip') {
    art = (<><Stem /><path d="M12.5 7.5 L16 11.5 L20 6.5 L24 11.5 L27.5 7.5 C28.5 16 26 21.5 20 21.5 C14 21.5 11.5 16 12.5 7.5 Z" fill={p.color} stroke={O} strokeWidth="1.6" strokeLinejoin="round" /></>);
  } else if (p.kind === 'daisy') {
    art = (<><Stem />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <ellipse key={a} cx="20" cy="7.6" rx="2.7" ry="5" transform={`rotate(${a} 20 14)`} fill={p.color} stroke={O} strokeWidth="1.2" />)}<circle cx="20" cy="14" r="4" fill={p.center} stroke={O} strokeWidth="1.3" /></>);
  } else if (p.kind === 'cactus') {
    art = (
      <>
        <path d="M15 27 H12 C10 27 9 26 9 24 V19 C9 17.3 11.8 17.3 11.8 19 V23.5 H15" fill={p.color} stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M25 23 H28 V17 C28 15.3 30.8 15.3 30.8 17 V22 C30.8 24 29.8 25 28 25 H25" fill={p.color} stroke={O} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M15 37 V14 C15 8 25 8 25 14 V37 Z" fill={p.color} stroke={O} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M20 13 V35" stroke="#0f5132" strokeWidth="1" opacity="0.5" />
        <circle cx="20" cy="9.2" r="2.6" fill="#f9a8d4" stroke={O} strokeWidth="1.2" />
      </>
    );
  } else {
    // rosette (succulent)
    const leaf = 'M20 23 C16.5 18 17.5 9 20 6 C22.5 9 23.5 18 20 23 Z';
    art = (
      <>
        {[0, 60, 120, 180, 240, 300].map((a) => <path key={a} d={leaf} transform={`rotate(${a} 20 23)`} fill={p.color} stroke={O} strokeWidth="1.3" strokeLinejoin="round" />)}
        {[30, 150, 270].map((a) => <path key={a} d={leaf} transform={`rotate(${a} 20 23) translate(20 23) scale(0.6) translate(-20 -23)`} fill="#5eead4" stroke={O} strokeWidth="1.6" strokeLinejoin="round" />)}
      </>
    );
  }
  return <svg viewBox="0 0 40 40" className={`${className} pointer-events-none`} aria-hidden>{art}</svg>;
}

// hideX: a finished board shows just the plants. The ✕ marks are only notes for solving.
function Board({ puzzle, marks, check, hint, highlight, dark, locked, mini, hideX, onTap, onStroke, onDragX }) {
  const N = puzzle.size;
  const colors = dark ? REGION_COLORS_DARK : REGION_COLORS;
  const drag = useRef(null);
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-cell]');
    return el ? Number(el.getAttribute('data-cell')) : null;
  };
  const down = (e) => {
    if (locked) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drag.current = { start: i, last: i, moved: false, seen: new Set([i]) };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || i === d.last) return;
    if (!d.moved) { d.moved = true; onStroke(); onDragX(d.start); }
    // A quick swipe can skip squares: fill everything between along a row or column
    const r0 = Math.floor(d.last / N), c0 = d.last % N, r1 = Math.floor(i / N), c1 = i % N;
    const path = [];
    if (r0 === r1) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) path.push(r0 * N + c);
    else if (c0 === c1) for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) path.push(r * N + c0);
    else path.push(i);
    for (const j of path) if (!d.seen.has(j)) { d.seen.add(j); onDragX(j); }
    d.last = i;
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onTap(d.start);
  };
  const thick = `${mini ? 2 : 2.5}px solid ${dark ? '#000' : '#3f3f46'}`;
  const thin = `1px solid ${dark ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.12)'}`;
  return (
    <div
      className={`grid w-full mx-auto aspect-square rounded-xl overflow-hidden select-none ${mini ? 'max-w-[180px]' : 'max-w-[440px]'}`}
      // Fixed, equal rows and columns: what's in a square can never stretch or squeeze it
      style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${N}, minmax(0, 1fr))`, border: thick, touchAction: locked ? 'auto' : 'none' }}
      onPointerDown={locked ? undefined : down} onPointerMove={locked ? undefined : move} onPointerUp={locked ? undefined : up}
      onPointerCancel={() => { drag.current = null; }}
      role="grid" aria-label={`${N} by ${N} Plantdoku board`}
    >
      {puzzle.regions.map((reg, i) => {
        const r = Math.floor(i / N), c = i % N;
        const v = marks[i] || 0;
        const isBad = v === 2 && check?.badPlants.has(i);
        const inBadZone = check?.badZones.has(i);
        const hinted = hint && hint.cell === i;
        const lit = highlight && highlight.has(i);
        return (
          <div key={i} data-cell={i} role="gridcell"
            aria-label={`Row ${r + 1}, column ${c + 1}, ${BED_NAMES[reg]} bed${v === 2 ? ', plant' : v === 1 ? ', marked empty' : ''}${isBad ? ', breaks a rule' : ''}`}
            className={`relative min-w-0 min-h-0 overflow-hidden ${hinted ? (hint.type === 'wrong' ? 'ring-4 ring-inset ring-red-600 animate-pulse' : 'ring-4 ring-inset ring-green-600 animate-pulse') : lit ? 'ring-[3px] ring-inset ring-green-700' : isBad ? 'ring-[3px] ring-inset ring-red-600' : ''}`}
            style={{
              background: colors[reg],
              borderTop: r > 0 ? (puzzle.regions[i - N] !== reg ? thick : thin) : 'none',
              borderLeft: c > 0 ? (puzzle.regions[i - 1] !== reg ? thick : thin) : 'none',
            }}>
            {inBadZone && <span className="absolute inset-0 bg-red-500/25 pointer-events-none" aria-hidden />}
            {(v === 2 || (v === 1 && !hideX)) && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                {v === 2 && <PlantIcon region={reg} />}
                {v === 1 && <span className={`${mini ? 'text-[10px]' : 'text-sm'} font-bold leading-none ${dark ? 'text-white/45' : 'text-black/35'}`}>✕</span>}
              </span>
            )}
            {isBad && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center pointer-events-none" aria-hidden>!</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- How to play: four short picture steps ----
const EX4 = { size: 4, regions: [0, 0, 2, 2, 0, 0, 2, 2, 1, 1, 3, 3, 1, 1, 3, 3] };
const EX4_DONE = (() => { const m = new Array(16).fill(0); [1, 3, 0, 2].forEach((c, r) => { m[r * 4 + c] = 2; }); return m; })();
const EX4_BAD = (() => { const m = new Array(16).fill(0); m[0 * 4 + 1] = 2; m[0 * 4 + 3] = 2; return m; })();
const EX3 = { size: 3, regions: new Array(9).fill(4) };
const EX3_MARKS = [1, 1, 1, 1, 2, 1, 1, 1, 1];

function Tutorial({ dark, ui, onClose, onStarter }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: 'Every color is a garden bed',
      text: 'Put exactly 1 plant in each bed. Each bed has its own plant, so a finished garden has one of each.',
      pic: <Board mini locked dark={dark} puzzle={EX4} marks={EX4_DONE} />,
    },
    {
      title: '1 plant in every row and column',
      text: 'Each row across and each column down also gets exactly 1 plant.',
      pic: (
        <div className="grid grid-cols-2 gap-3 items-start">
          <div>
            <Board mini locked dark={dark} puzzle={EX4} marks={EX4_DONE} highlight={new Set([4, 5, 6, 7])} />
            <p className="text-center text-xs font-bold text-green-700 mt-1">✓ One in this row</p>
          </div>
          <div>
            <Board mini locked dark={dark} puzzle={EX4} marks={EX4_BAD} check={checkBoard(4, EX4.regions, [[0, 1], [0, 3]])} />
            <p className="text-center text-xs font-bold text-red-600 mt-1">✗ Two in one row</p>
          </div>
        </div>
      ),
    },
    {
      title: "Plants can't touch",
      text: 'Not side by side, not even corner to corner. Every square around a plant stays empty.',
      pic: <Board mini locked dark={dark} puzzle={EX3} marks={EX3_MARKS} />,
    },
    {
      title: 'How to tap',
      text: '',
      pic: (
        <div className="space-y-2">
          {[
            ['Tap once', '✕ means "no plant here." Use it to rule squares out.', 1],
            ['Tap twice', 'Plant it!', 2],
            ['Tap again', 'Clears the square.', 0],
          ].map(([a, b, v]) => (
            <div key={a} className="flex items-center gap-3">
              <span className="w-12 h-12 shrink-0 rounded-lg border-2 border-gray-700 flex items-center justify-center" style={{ background: REGION_COLORS[2] }}>
                {v === 1 && <span className="text-sm font-bold text-black/40">✕</span>}
                {v === 2 && <PlantIcon region={2} className="w-[85%] h-[85%]" />}
              </span>
              <p className={`text-sm ${ui.sub}`}><b className={ui.text}>{a}:</b> {b}</p>
            </div>
          ))}
          <p className={`text-sm ${ui.sub}`}>Drag your finger across squares to ✕ lots at once. <b className={ui.text}>Tip:</b> start with the smallest bed. It has the fewest places its plant can go.</p>
        </div>
      ),
    },
  ];
  const s = steps[step];
  const last = step === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="How to play Plantdoku">
      <div className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl ${dark ? 'bg-neutral-900' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-xs font-semibold ${ui.sub}`}>How to play · {step + 1} of {steps.length}</p>
          <button onClick={onClose} aria-label="Close" className={`p-1 ${ui.text}`}><X className="w-5 h-5" /></button>
        </div>
        <h2 className={`text-xl font-bold ${ui.text}`}>{s.title}</h2>
        {s.text && <p className={`mt-1 text-sm ${ui.sub}`}>{s.text}</p>}
        <div className="mt-4">{s.pic}</div>
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
        {last && (
          <button onClick={onStarter} className="w-full mt-2 text-sm font-semibold text-green-600 underline">Try an easy 5×5 first</button>
        )}
      </div>
    </div>
  );
}

export default function Plantdoku() {
  const navigate = useNavigate();
  const plus = usePlus();
  const [theme] = useState(() => { try { return localStorage.getItem('theme') || 'light'; } catch { return 'light'; } });
  const dark = DARK_THEMES.has(theme);
  const ui = {
    text: dark ? 'text-white' : 'text-gray-900',
    sub: dark ? 'text-white/75' : 'text-gray-600',
    card: dark ? 'bg-black/45 border-white/15' : 'bg-white/85 border-gray-200',
    chip: dark ? 'bg-white/10 text-white border-white/15' : 'bg-white text-gray-800 border-gray-300',
  };
  // The daily's date is locked when the screen opens: midnight can't swap the puzzle (or its
  // size) mid-play, and saves, hints and the server clock all use this date. It moves to the
  // new day via Daily / "Play it", or on a fresh visit.
  const today = useToday();
  const [day, setDay] = useState(localToday);

  const [mode, setMode] = useState('daily');
  const [level, setLevel] = useState('starter');
  const [seed, setSeed] = useState(() => `practice-${Date.now()}`);
  const puzzle = useMemo(() => (mode === 'daily'
    ? dailyPuzzle(day)
    : makePuzzle(seed, LEVELS.find((l) => l.key === level).size)), [mode, day, seed, level]);
  const N = puzzle.size;
  const storeKey = mode === 'daily' ? `hp_pd_${day}` : null;

  const [marks, setMarks] = useState([]);
  const [history, setHistory] = useState([]);
  const [hint, setHint] = useState(null);
  const [localHints, setLocalHints] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [tutorial, setTutorial] = useState(() => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; } });

  const [daily, setDaily] = useState(null); // server: { started, finished, hints, name, ... }
  const [dailyError, setDailyError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState(null); // finished puzzle (daily: server answer; practice: local)
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(null);
  const clock = useRef({ ms: 0, at: Date.now(), running: false });
  const [, setTick] = useState(0);
  const adHold = useRef(false); // an ad or hint video is up: the clock must not restart
  // Latest values for timers and listeners that outlive a render
  const live = useRef({});
  live.current = { mode, day, seed, daily, result, tutorial };

  useEffect(() => { markPlantdokuFound(); }, []);

  // A new puzzle: load saved marks (daily) or start empty
  useEffect(() => {
    let m = new Array(N * N).fill(0);
    if (storeKey) {
      try {
        const s = JSON.parse(localStorage.getItem(storeKey) || 'null');
        if (Array.isArray(s) && s.length === N * N) m = s;
      } catch { /* ignore */ }
    }
    setMarks(m);
    setHistory([]);
    setHint(null);
    setLocalHints(0);
    setFinishError(null);
    if (mode === 'practice') {
      // A new practice puzzle: the ad check comes first, and its clock waits for the ad to close
      setResult(null);
      clock.current = { ms: 0, at: Date.now(), running: false, paused: true };
      const s = seed;
      adHold.current = true;
      adBeforeNext().then(() => {
        adHold.current = false;
        const l = live.current;
        if (l.mode === 'practice' && l.seed === s && !l.tutorial && !document.hidden) resumeClock();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);
  useEffect(() => {
    if (storeKey && marks.length === N * N) { try { localStorage.setItem(storeKey, JSON.stringify(marks)); } catch { /* ignore */ } }
  }, [marks, storeKey, N]);

  // Daily: what the server knows (doesn't start the clock)
  const applyDaily = (d) => {
    setDaily(d);
    clock.current = { ms: d.elapsed_ms || 0, at: Date.now(), running: !!d.started && !d.finished };
    if (d.finished) {
      if (!getDone('plantdoku', day)) setDone('plantdoku', { seconds: d.seconds }, day);
      setResult({ daily: true, seconds: d.seconds, raw: Math.round((d.elapsed_ms || 0) / 1000), hints: d.hints, board: d.board, stats: d.stats, name: d.name });
      // Solved on another phone (or this one was cleared): show the finished board
      const sol = dailyPuzzle(day);
      const done = new Array(sol.size * sol.size).fill(0);
      sol.solution.forEach((c, r) => { done[r * sol.size + c] = 2; });
      setMarks((m) => (isSolved(sol.size, sol.regions, m.flatMap((v, i) => (v === 2 ? [[Math.floor(i / sol.size), i % sol.size]] : []))) ? m : done));
    }
  };
  // Starts (or resumes) the server clock. fresh: the Start tap on a daily not begun yet, which is
  // a new puzzle starting, so the ad check runs first and the clock only starts once it's closed.
  const startDaily = async (fresh = false) => {
    setDailyError(null);
    setStarting(true);
    try {
      if (fresh) {
        adHold.current = true;
        try { await adBeforeNext(); } finally { adHold.current = false; }
      }
      const d = await call('start', { date: day });
      if (!d?.success) throw new Error(d?.error || 'failed');
      applyDaily({ ...d, started: true });
    } catch {
      setDailyError("Couldn't reach Happy Plants. Check your signal.");
    } finally {
      setStarting(false);
    }
  };
  const loadDaily = async () => {
    setDailyError(null);
    try {
      const d = await call('peek', { date: day });
      if (!d?.success) throw new Error(d?.error || 'failed');
      // Already playing today (left and came back): pick the clock back up, unless the how-to is open
      if (d.started && !d.finished && !tutorial) { await startDaily(); return; }
      applyDaily(d);
      if (d.started && !d.finished) clock.current = { ...clock.current, running: false, paused: true };
    } catch {
      setDailyError("Couldn't reach Happy Plants. Check your signal.");
    }
  };
  useEffect(() => {
    if (mode !== 'daily') return undefined;
    loadDaily();
    return () => { if (clock.current.running) pauseKeepalive(day); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day]);

  // The clock stops while the app is in the background, the how-to is open, or an ad is up
  const pauseClock = () => {
    const c = clock.current;
    if (!c.running) return;
    clock.current = { ms: c.ms + (Date.now() - c.at), at: Date.now(), running: false, paused: true };
    if (live.current.mode === 'daily') pauseKeepalive(live.current.day);
  };
  const resumeClock = () => {
    const c = clock.current;
    const l = live.current;
    if (!c.paused || l.result || adHold.current) return;
    if (l.mode === 'daily') { if (l.daily?.started && !l.daily?.finished) startDaily(); }
    else clock.current = { ms: c.ms, at: Date.now(), running: true };
  };
  useEffect(() => {
    const onVis = () => { if (document.hidden) pauseClock(); else if (!live.current.tutorial) resumeClock(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedSec = (clock.current.running ? clock.current.ms + (Date.now() - clock.current.at) : clock.current.ms) / 1000;

  const openTutorial = () => { pauseClock(); setTutorial(true); };
  const closeTutorial = () => {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
    setTutorial(false);
    resumeClock();
  };

  const plants = useMemo(() => marks.flatMap((v, i) => (v === 2 ? [[Math.floor(i / N), i % N]] : [])), [marks, N]);
  const check = useMemo(() => checkBoard(N, puzzle.regions, plants), [N, puzzle, plants]);
  const solved = marks.length === N * N && isSolved(N, puzzle.regions, plants);
  const needsStart = mode === 'daily' && daily && !daily.started && !daily.finished;
  // The daily board is hidden whenever its clock isn't running: before Start, while loading,
  // offline, paused, or during an ad. Only a finished board shows without the clock.
  const hideBoard = mode === 'daily' && !result && !daily?.finished && !clock.current.running;
  const locked = !!result || hideBoard || (mode === 'daily' && (!daily || !daily.started || daily.finished));
  const newDay = mode === 'daily' && today !== day;

  // Solved!
  const finishedRef = useRef(null);
  const finish = async () => {
    if (mode === 'practice') {
      clock.current = { ms: elapsedSec * 1000, at: Date.now(), running: false };
      countFinish();
      setResult({ practice: true, seconds: elapsedSec, hints: localHints, level });
      return;
    }
    setFinishing(true);
    setFinishError(null);
    try {
      const d = await call('finish', { date: day, plants });
      if (!d?.success) throw new Error(d?.error || 'failed');
      clock.current = { ms: (d.raw_seconds || elapsedSec) * 1000, at: Date.now(), running: false };
      if (!d.already) countFinish();
      setDaily((x) => ({ ...(x || {}), finished: true, hints: d.hints }));
      setDone('plantdoku', { seconds: d.seconds }, day);
      setResult({ daily: true, seconds: d.seconds, raw: d.raw_seconds, hints: d.hints, board: d.board, stats: d.stats, name: daily?.name });
    } catch (e) {
      const code = e?.response?.data?.error;
      setFinishError(code === 'too_fast' ? "Solved! The clock hadn't started yet, so give it a second and tap Try again."
        : code === 'not_solved' ? "Hmm, the server doesn't see a finished board. Check for a red square."
          : "Solved! But your time didn't save. Check your signal.");
    } finally {
      setFinishing(false);
    }
  };
  useEffect(() => {
    const key = mode === 'daily' ? `daily:${day}` : `practice:${seed}`;
    if (!solved || result || finishedRef.current === key) return;
    if (mode === 'daily' && !daily?.started) return; // wait for the server clock
    finishedRef.current = key;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, !!daily?.started, mode]);

  // Editing the board
  const push = () => setHistory((h) => [...h.slice(-199), marks]);
  const tap = (i) => {
    push();
    setHint(null);
    setMarks((m) => { const n = m.slice(); n[i] = ((n[i] || 0) + 1) % 3; return n; });
  };
  const dragX = (i) => setMarks((m) => { if (m[i]) return m; const n = m.slice(); n[i] = 1; return n; });
  const undo = () => setHistory((h) => { if (!h.length) return h; setMarks(h[h.length - 1]); return h.slice(0, -1); });
  const clearAll = () => { if (!marks.some(Boolean)) return; push(); setMarks(new Array(N * N).fill(0)); setHint(null); };

  // Hints
  const usedHints = mode === 'daily' ? (daily?.hints || 0) : localHints;
  const needVideo = !plus; // hints are never free: one video each (Plus: unlimited, no video)
  const showHint = (h) => {
    if (!h) { toast('No hint needed. Fix the squares marked in red.'); return; }
    setHint(h);
    toast(h.type === 'wrong' ? "That plant isn't in the right spot." : 'A plant goes in the glowing square.');
    setTimeout(() => setHint((cur) => (cur === h ? null : cur)), 4000);
  };
  const askHint = async () => {
    if (hintBusy || locked) return;
    if (needVideo) {
      if (!rewardedAvailable()) { toast("No video is ready right now, so no hint yet. Try again in a little while."); return; }
      setHintBusy(true);
      // Stop the clock for the video (on the server too, and wait for it before the video, so the
      // resume after it can't overtake the pause) so ad time never counts
      const c = clock.current;
      const wasRunning = c.running;
      adHold.current = true;
      if (wasRunning) clock.current = { ms: c.ms + (Date.now() - c.at), at: Date.now(), running: false, paused: true };
      if (mode === 'daily' && wasRunning) { try { await call('pause', { date: day }); } catch { pauseKeepalive(day); } }
      const r = await showRewardedAd();
      adHold.current = false;
      if (wasRunning) {
        if (mode === 'daily') await startDaily();
        else resumeClock();
      }
      setHintBusy(false);
      if (!r.ok) { toast(r.reason === 'closed' ? 'The video was closed early, so no hint this time.' : "Couldn't play the video. Try again in a little while."); return; }
    }
    if (mode === 'daily') {
      setHintBusy(true);
      try {
        const d = await call('hint', { date: day, plants });
        setDaily((x) => ({ ...x, hints: d.hints }));
        showHint(d.hint);
      } catch {
        toast.error("Couldn't get a hint. Check your signal.");
      } finally {
        setHintBusy(false);
      }
    } else {
      setLocalHints((n) => n + 1);
      showHint(hintFor(N, puzzle.regions, puzzle.solution, plants));
    }
  };

  // (The ad check for a new puzzle runs when it starts: the practice puzzle effect, or Start on the daily)
  const newPractice = (lv = level) => {
    if (mode === 'daily') pauseClock();
    setLevel(lv);
    setMode('practice');
    setSeed(`practice-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    setResult(null);
  };
  const backToDaily = () => {
    pauseClock(); // stops yesterday's server clock too, if we're moving to the new day
    setResult(null);
    clock.current = { ms: 0, at: Date.now(), running: false };
    setDaily(null);
    setDay(localToday());
    setMode('daily');
  };
  const newName = async () => {
    try {
      const d = await call('new_name');
      if (!d?.success) throw new Error();
      const b = await call('board', { date: day });
      setResult((r) => (r ? { ...r, name: d.name, board: b?.board || r.board } : r));
      setDaily((x) => ({ ...(x || {}), name: d.name }));
    } catch {
      toast.error("Couldn't change your name. Try again.");
    }
  };
  const share = async () => {
    const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const text = `Plantdoku ${dayLabel} 🌱\nSolved in ${fmt(result.seconds)}${result.hints ? ` (${result.hints} hint${result.hints === 1 ? '' : 's'})` : ''}${result.board?.faster_than != null ? `, faster than ${result.board.faster_than}% of players` : ''}\nhappyplants.club`;
    if (Capacitor.isNativePlatform()) {
      try { await registerPlugin('NotifyBridge').shareText({ text, title: 'Plantdoku' }); return; } catch { /* older build */ }
    }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); toast.success('Copied! Paste it anywhere.'); } catch { toast.error("Couldn't share."); }
  };

  const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const btn = `flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold border active:scale-95 disabled:opacity-50 ${ui.chip}`;

  return (
    <div className="min-h-screen theme-bg pb-28">
      {tutorial && (
        <Tutorial dark={dark} ui={ui} onClose={closeTutorial}
          onStarter={() => { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ } setTutorial(false); newPractice('starter'); }} />
      )}
      <div className="max-w-xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => navigate('/Games')} className={`flex items-center gap-1.5 py-2 -ml-1 text-sm font-semibold ${ui.text}`}>
            <ArrowLeft className="w-5 h-5" /> Games
          </button>
          <button onClick={openTutorial} className={`flex items-center gap-1 text-sm font-semibold ${ui.text}`}>
            <HelpCircle className="w-4 h-4" /> How to play
          </button>
        </div>

        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h1 className={`text-3xl font-bold ${ui.text}`}>🌱 Plantdoku</h1>
            <p className={`text-sm ${ui.sub}`}>{mode === 'daily' ? `Daily puzzle · ${dateLabel}` : `Practice · ${LEVELS.find((l) => l.key === level).label}`}</p>
          </div>
          <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2 border font-mono font-bold ${ui.card} ${ui.text}`} aria-label="Time">
            <Timer className="w-4 h-4" /> {fmt(result ? (result.raw ?? result.seconds) : elapsedSec)}
          </div>
        </div>

        {newDay && <NewDailyBar ui={ui} onGo={backToDaily} />}

        {/* Daily / practice switch */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <button onClick={() => (mode !== 'daily' || newDay) && backToDaily()}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold border ${mode === 'daily' ? 'bg-green-600 border-green-600 text-white' : ui.chip}`}>
            Daily
          </button>
          {LEVELS.map((l) => (
            <button key={l.key} onClick={() => newPractice(l.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold border ${mode === 'practice' && level === l.key ? 'bg-green-600 border-green-600 text-white' : ui.chip}`}>
              {l.label} {l.size}×{l.size}
            </button>
          ))}
        </div>

        {/* The goal, always in view */}
        {!result && (
          <p className={`text-sm mb-2 ${ui.sub}`}>
            <b className={ui.text}>1 plant</b> in every <b className={ui.text}>color</b>, <b className={ui.text}>row</b> and <b className={ui.text}>column</b>. No touching. <span className="whitespace-nowrap">· {plants.length} of {N} planted</span>
          </p>
        )}

        {mode === 'daily' && dailyError && !result && (
          <div className={`rounded-2xl border p-4 mb-3 ${ui.card}`}>
            <p className={`font-semibold ${ui.text}`}>{dailyError}</p>
            <button onClick={daily ? () => startDaily(!daily.started) : loadDaily} className="mt-2 text-sm font-bold text-green-600 flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Try again</button>
          </div>
        )}

        <div className="relative">
          {/* Hidden, not just blurred, until the daily clock runs (a blur still shows the beds'
              shapes). The board keeps its space, so nothing moves when it appears. */}
          <div className={hideBoard ? 'invisible' : locked && !result ? 'opacity-60' : ''} aria-hidden={hideBoard || undefined}>
            <Board puzzle={puzzle} marks={marks} check={check} hint={hint} dark={dark} locked={locked}
              hideX={solved || !!result} onTap={tap} onStroke={push} onDragX={dragX} />
          </div>
          {hideBoard && (
            <div className={`absolute inset-0 w-full max-w-[440px] mx-auto rounded-xl border flex flex-col items-center justify-center gap-3 px-6 text-center ${ui.card}`}>
              {needsStart ? (
                <>
                  <p className={`text-lg font-bold ${ui.text}`}>{newDay ? "Yesterday's puzzle is ready" : "Today's puzzle is ready"}</p>
                  <p className={`text-sm ${ui.sub}`}>The clock starts when you tap Start, and pauses if you leave.</p>
                  <button onClick={() => startDaily(true)} disabled={starting}
                    className="flex items-center gap-2 rounded-2xl px-8 py-3.5 font-bold bg-green-600 text-white text-lg active:scale-95 disabled:opacity-60">
                    {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />} Start
                  </button>
                  <button onClick={openTutorial} className={`text-sm font-semibold underline ${ui.text}`}>How to play</button>
                </>
              ) : daily?.started && !dailyError && !starting && !hintBusy ? (
                <>
                  <p className={`text-lg font-bold ${ui.text}`}>Paused</p>
                  <button onClick={() => startDaily()}
                    className="flex items-center gap-2 rounded-2xl px-8 py-3.5 font-bold bg-green-600 text-white text-lg active:scale-95">
                    <PlayCircle className="w-5 h-5" /> Keep going
                  </button>
                </>
              ) : !dailyError ? (
                <Loader2 className={`w-8 h-8 animate-spin ${ui.text}`} />
              ) : null}
            </div>
          )}
        </div>

        {!result && !needsStart && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button onClick={undo} disabled={!history.length || locked} className={btn}><Undo2 className="w-4 h-4" /> Undo</button>
            <button onClick={clearAll} disabled={locked} className={btn}><Eraser className="w-4 h-4" /> Clear</button>
            <button onClick={askHint} disabled={hintBusy || locked} className={btn}>
              {hintBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : needVideo ? <PlayCircle className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
              Hint{mode === 'daily' ? ` +${HINT_SECONDS}s` : ''}
            </button>
          </div>
        )}
        {!result && check.problems.length > 0 && (
          <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3" role="status">
            {check.problems.slice(0, 3).map((p) => (
              <p key={p} className="text-sm font-semibold text-red-600">⚠️ {p}</p>
            ))}
          </div>
        )}
        {finishing && <p className={`text-sm mt-3 text-center ${ui.sub}`}><Loader2 className="w-4 h-4 inline animate-spin" /> Checking your time…</p>}
        {finishError && (
          <div className={`rounded-2xl border p-4 mt-3 ${ui.card}`}>
            <p className={`font-semibold ${ui.text}`}>{finishError}</p>
            <button onClick={finish} className="mt-2 text-sm font-bold text-green-600 flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Try again</button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`rounded-2xl border p-5 mt-4 ${ui.card}`}>
            <p className="text-3xl" aria-hidden>🎉</p>
            <p className={`text-2xl font-bold mt-1 ${ui.text}`}>Solved in {fmt(result.seconds)}</p>
            {result.hints > 0 && result.daily && (
              <p className={`text-xs ${ui.sub}`}>includes {result.hints * HINT_SECONDS} s for {result.hints} hint{result.hints === 1 ? '' : 's'}</p>
            )}

            {result.daily && result.board && (
              <>
                <p className={`mt-2 font-semibold ${ui.text}`}>
                  {result.board.total <= 1
                    ? "You're the first to solve today's puzzle! 🌟"
                    : `Faster than ${result.board.faster_than ?? 0}% of players today`}
                </p>
                {result.board.me && result.board.total > 1 && (
                  <p className={`text-sm ${ui.sub}`}>#{result.board.me.rank} of {result.board.total} · typical time {fmt(result.board.median)}</p>
                )}

                <div className="mt-4">
                  <p className={`text-sm font-bold flex items-center gap-1.5 mb-2 ${ui.text}`}><Trophy className="w-4 h-4 text-amber-500" /> Today's top 5</p>
                  <ol className="space-y-1">
                    {result.board.top.map((row) => (
                      <li key={row.rank} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${row.me ? 'bg-green-600/20 font-bold' : ''} ${ui.text}`}>
                        <span className="w-6 text-center">{MEDALS[row.rank - 1] || row.rank}</span>
                        <span className="flex-1 truncate">{row.name}{row.me ? ' (you)' : ''}</span>
                        <span className="font-mono">{fmt(row.seconds)}</span>
                      </li>
                    ))}
                    {result.board.me && result.board.me.rank > 5 && (
                      <>
                        <li className={`text-center text-xs ${ui.sub}`}>⋯</li>
                        <li className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm bg-green-600/20 font-bold ${ui.text}`}>
                          <span className="w-6 text-center">{result.board.me.rank}</span>
                          <span className="flex-1 truncate">{result.board.me.name} (you)</span>
                          <span className="font-mono">{fmt(result.board.me.seconds)}</span>
                        </li>
                      </>
                    )}
                  </ol>
                  <p className={`text-xs mt-2 ${ui.sub}`}>
                    You show up as <b className={ui.text}>{result.name || daily?.name}</b>.{' '}
                    <button onClick={newName} className="underline font-semibold text-green-600">Pick a new name</button>
                  </p>
                </div>

                {result.stats && (
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className={`rounded-xl border p-2 ${ui.card}`}>
                      <p className={`text-lg font-bold ${ui.text}`}><Flame className="w-4 h-4 inline text-orange-500" /> {result.stats.streak}</p>
                      <p className={`text-[11px] ${ui.sub}`}>day streak</p>
                    </div>
                    <div className={`rounded-xl border p-2 ${ui.card}`}>
                      <p className={`text-lg font-bold ${ui.text}`}>{result.stats.best_time != null ? fmt(result.stats.best_time) : '–'}</p>
                      <p className={`text-[11px] ${ui.sub}`}>your best</p>
                    </div>
                    <div className={`rounded-xl border p-2 ${ui.card}`}>
                      <p className={`text-lg font-bold ${ui.text}`}>{result.stats.solved}</p>
                      <p className={`text-[11px] ${ui.sub}`}>dailies solved</p>
                    </div>
                  </div>
                )}
                {!newDay && <p className={`text-xs mt-3 ${ui.sub}`}>New daily puzzle in {untilMidnight()}.</p>}
              </>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {result.daily && (
                <button onClick={share} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold bg-green-600 text-white active:scale-95">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
              <button onClick={() => newPractice(result.practice ? level : 'easy')} className={btn}>
                <PlayCircle className="w-4 h-4" /> {result.practice ? 'Next puzzle' : 'Play a practice puzzle'}
              </button>
              {result.practice && <button onClick={backToDaily} className={btn}>Daily puzzle</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
