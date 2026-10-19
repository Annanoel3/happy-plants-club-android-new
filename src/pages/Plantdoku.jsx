import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Undo2, Eraser, Lightbulb, Loader2, Share2, RefreshCw, Flame, Timer, PlayCircle, HelpCircle, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { localToday } from '@/lib/dates';
import { usePlus } from '@/lib/plus';
import { showAdForEvent, rewardedAvailable, showRewardedAd } from '@/lib/admob';
import { makePuzzle, dailySeed, dailySize, findConflicts, isSolved, hintFor, REGION_COLORS, REGION_COLORS_DARK } from '@/lib/plantdoku/engine';
import { markPlantdokuFound } from '@/lib/plantdoku/egg';

// Plantdoku: one plant in every row, every column and every color; plants never touch.
// Daily puzzle (same for everyone, timed on the server, leaderboard) + practice puzzles.
// Ads: one full-screen ad per two finished puzzles, shown when you start the next one
// (never on top of a result). Hints: 1 free per puzzle, more with a reward video. Plus: no
// ads, unlimited hints.

const DARK_THEMES = new Set(['dark', 'botanical', 'halloween', 'christmas', 'newyears', 'fourthofjuly', 'valentines', 'stpatricks', 'fall']);
const LEVELS = [
  { key: 'easy', label: 'Easy', size: 6 },
  { key: 'medium', label: 'Medium', size: 7 },
  { key: 'hard', label: 'Hard', size: 8 },
  { key: 'expert', label: 'Expert', size: 9 },
];
const HINT_SECONDS = 30;
const MEDALS = ['🥇', '🥈', '🥉'];

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
function countFinish() {
  try { localStorage.setItem('hp_pd_completed', String((Number(localStorage.getItem('hp_pd_completed')) || 0) + 1)); } catch { /* ignore */ }
}
// One full-screen ad per two finished puzzles, when the next one starts
function adBeforeNext() {
  let n = 0;
  try { n = Number(localStorage.getItem('hp_pd_completed')) || 0; } catch { /* ignore */ }
  if (n >= 2) {
    try { localStorage.setItem('hp_pd_completed', '0'); } catch { /* ignore */ }
    showAdForEvent('plantdoku');
  }
}
function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = Math.max(0, Math.round((next - now) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function Sprout({ bad }) {
  return (
    <svg viewBox="0 0 40 40" className="w-[80%] h-[80%] pointer-events-none" aria-hidden>
      <path d="M20 27 L20 15" stroke="#4a3728" strokeWidth="5" strokeLinecap="round" />
      <path d="M20 27 L20 15" stroke="#5aa84b" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 19 C14 10 5 12 7.5 17.5 C10 22.5 17 22 20 19 Z" fill="#8fd17a" stroke="#4a3728" strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 16 C25 6.5 34.5 9 32.5 14.5 C30.5 19.5 23 19 20 16 Z" fill="#8fd17a" stroke="#4a3728" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12.5 29.5 H27.5 L25.5 37 H14.5 Z" fill={bad ? '#f87171' : '#ee9a7e'} stroke="#4a3728" strokeWidth="2" strokeLinejoin="round" />
      <rect x="10.5" y="25.5" width="19" height="5" rx="2" fill={bad ? '#dc2626' : '#e07a5f'} stroke="#4a3728" strokeWidth="2" />
    </svg>
  );
}

function Board({ puzzle, marks, conflicts, hint, dark, locked, onTap, onStroke, onDragX }) {
  const N = puzzle.size;
  const colors = dark ? REGION_COLORS_DARK : REGION_COLORS;
  const bad = useMemo(() => new Set(conflicts), [conflicts]);
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
  const thick = `2.5px solid ${dark ? '#000' : '#3f3f46'}`;
  const thin = `1px solid ${dark ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.12)'}`;
  return (
    <div
      className="grid w-full max-w-[440px] mx-auto aspect-square rounded-xl overflow-hidden select-none"
      style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, border: thick, touchAction: 'none' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
      role="grid" aria-label={`${N} by ${N} Plantdoku board`}
    >
      {puzzle.regions.map((reg, i) => {
        const r = Math.floor(i / N), c = i % N;
        const v = marks[i] || 0;
        const isBad = v === 2 && bad.has(i);
        const hinted = hint && hint.cell === i;
        return (
          <div key={i} data-cell={i} role="gridcell"
            aria-label={`Row ${r + 1}, column ${c + 1}${v === 2 ? ', plant' : v === 1 ? ', marked empty' : ''}`}
            className={`relative flex items-center justify-center ${hinted ? (hint.type === 'wrong' ? 'ring-4 ring-inset ring-red-500 animate-pulse' : 'ring-4 ring-inset ring-green-600 animate-pulse') : ''}`}
            style={{
              background: colors[reg],
              borderTop: r > 0 ? (puzzle.regions[i - N] !== reg ? thick : thin) : 'none',
              borderLeft: c > 0 ? (puzzle.regions[i - 1] !== reg ? thick : thin) : 'none',
            }}>
            {v === 2 && <Sprout bad={isBad} />}
            {v === 1 && <span className={`text-sm font-bold pointer-events-none ${dark ? 'text-white/45' : 'text-black/35'}`}>✕</span>}
          </div>
        );
      })}
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
  const today = localToday();

  const [mode, setMode] = useState('daily');
  const [level, setLevel] = useState('medium');
  const [seed, setSeed] = useState(() => `practice-${Date.now()}`);
  const puzzle = useMemo(() => (mode === 'daily'
    ? makePuzzle(dailySeed(today), dailySize(today))
    : makePuzzle(seed, LEVELS.find((l) => l.key === level).size)), [mode, today, seed, level]);
  const N = puzzle.size;
  const storeKey = mode === 'daily' ? `hp_pd_${today}` : null;

  const [marks, setMarks] = useState([]);
  const [history, setHistory] = useState([]);
  const [hint, setHint] = useState(null);
  const [localHints, setLocalHints] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [showRules, setShowRules] = useState(() => { try { return !localStorage.getItem('hp_pd_rules_seen'); } catch { return true; } });

  const [daily, setDaily] = useState(null); // server: { hints, finished, name, ... }
  const [dailyError, setDailyError] = useState(null);
  const [result, setResult] = useState(null); // finished puzzle (daily: server answer; practice: local)
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const clock = useRef({ ms: 0, at: Date.now(), running: false });
  const [, setTick] = useState(0);

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
    setFinishError(false);
    if (mode === 'practice') {
      setResult(null);
      clock.current = { ms: 0, at: Date.now(), running: true };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);
  useEffect(() => {
    if (storeKey && marks.length === N * N) { try { localStorage.setItem(storeKey, JSON.stringify(marks)); } catch { /* ignore */ } }
  }, [marks, storeKey, N]);

  // Daily: the server's clock (starts or resumes it)
  const startDaily = async () => {
    setDailyError(null);
    try {
      const d = await call('start', { date: today });
      if (!d?.success) throw new Error(d?.error || 'failed');
      setDaily(d);
      clock.current = { ms: d.elapsed_ms || 0, at: Date.now(), running: !d.finished };
      if (d.finished) {
        setResult({ daily: true, seconds: d.seconds, raw: Math.round((d.elapsed_ms || 0) / 1000), hints: d.hints, board: d.board, stats: d.stats, name: d.name });
        // Solved on another phone (or this one was cleared): show the finished board
        const sol = makePuzzle(dailySeed(today), dailySize(today));
        const done = new Array(sol.size * sol.size).fill(0);
        sol.solution.forEach((c, r) => { done[r * sol.size + c] = 2; });
        setMarks((m) => (isSolved(sol.size, sol.regions, m.flatMap((v, i) => (v === 2 ? [[Math.floor(i / sol.size), i % sol.size]] : []))) ? m : done));
      }
    } catch {
      setDailyError("Couldn't reach Happy Plants. Check your signal.");
    }
  };
  useEffect(() => {
    if (mode !== 'daily') return;
    startDaily();
    return () => { if (clock.current.running) pauseKeepalive(today); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Pause the clock while the app is in the background
  useEffect(() => {
    const onVis = () => {
      const c = clock.current;
      if (document.hidden) {
        if (c.running) {
          clock.current = { ms: c.ms + (Date.now() - c.at), at: Date.now(), running: false, paused: true };
          if (mode === 'daily') pauseKeepalive(today);
        }
      } else if (c.paused) {
        if (mode === 'daily') startDaily();
        else clock.current = { ms: c.ms, at: Date.now(), running: true };
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, today]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedSec = (clock.current.running ? clock.current.ms + (Date.now() - clock.current.at) : clock.current.ms) / 1000;

  const plants = useMemo(() => marks.flatMap((v, i) => (v === 2 ? [[Math.floor(i / N), i % N]] : [])), [marks, N]);
  const conflicts = useMemo(() => findConflicts(N, puzzle.regions, plants), [N, puzzle, plants]);
  const solved = marks.length === N * N && isSolved(N, puzzle.regions, plants);
  const locked = !!result || (mode === 'daily' && (!daily || daily.finished));

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
    setFinishError(false);
    try {
      const d = await call('finish', { date: today, plants });
      if (!d?.success) throw new Error(d?.error || 'failed');
      clock.current = { ms: (d.raw_seconds || elapsedSec) * 1000, at: Date.now(), running: false };
      if (!d.already) countFinish();
      setDaily((x) => ({ ...(x || {}), finished: true, hints: d.hints }));
      setResult({ daily: true, seconds: d.seconds, raw: d.raw_seconds, hints: d.hints, board: d.board, stats: d.stats, name: daily?.name });
    } catch (e) {
      const code = e?.response?.data?.error;
      setFinishError(code === 'too_fast' ? "Solved! The clock hadn't started yet, so give it a second and tap Try again."
        : code === 'not_solved' ? "Hmm, the server doesn't see a finished board. Check for a red pot."
          : "Solved! But your time didn't save. Check your signal.");
    } finally {
      setFinishing(false);
    }
  };
  useEffect(() => {
    const key = mode === 'daily' ? `daily:${today}` : `practice:${seed}`;
    if (!solved || result || finishedRef.current === key) return;
    if (mode === 'daily' && !daily) return; // wait for the server clock to load
    finishedRef.current = key;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, !!daily, mode]);

  // Editing the board
  const push = () => setHistory((h) => [...h.slice(-199), marks]);
  const tap = (i) => {
    push();
    setHint(null);
    setMarks((m) => { const n = m.slice(); n[i] = ((n[i] || 0) + 1) % 3; return n; });
    if (showRules) { setShowRules(false); try { localStorage.setItem('hp_pd_rules_seen', '1'); } catch { /* ignore */ } }
  };
  const dragX = (i) => setMarks((m) => { if (m[i]) return m; const n = m.slice(); n[i] = 1; return n; });
  const undo = () => setHistory((h) => { if (!h.length) return h; setMarks(h[h.length - 1]); return h.slice(0, -1); });
  const clearAll = () => { if (!marks.some(Boolean)) return; push(); setMarks(new Array(N * N).fill(0)); setHint(null); };

  // Hints
  const usedHints = mode === 'daily' ? (daily?.hints || 0) : localHints;
  const needVideo = !plus && usedHints >= 1;
  const showHint = (h) => {
    if (!h) { toast('No hint needed. Check the red plants!'); return; }
    setHint(h);
    toast(h.type === 'wrong' ? "That plant isn't in the right spot." : 'A plant goes in the glowing square.');
    setTimeout(() => setHint((cur) => (cur === h ? null : cur)), 4000);
  };
  const askHint = async () => {
    if (hintBusy || locked) return;
    if (needVideo) {
      if (!rewardedAvailable()) { toast("That's your free hint for this puzzle."); return; }
      setHintBusy(true);
      const r = await showRewardedAd();
      setHintBusy(false);
      if (!r.ok) { toast(r.reason === 'closed' ? 'The video was closed early, so no hint this time.' : "Couldn't play the video. Try again in a little while."); return; }
    }
    if (mode === 'daily') {
      setHintBusy(true);
      try {
        const d = await call('hint', { date: today, plants });
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

  const newPractice = (lv = level) => {
    adBeforeNext();
    setLevel(lv);
    setMode('practice');
    setSeed(`practice-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    setResult(null);
  };
  const backToDaily = () => {
    adBeforeNext();
    setResult(null);
    clock.current = { ms: 0, at: Date.now(), running: false };
    setMode('daily');
  };
  const newName = async () => {
    try {
      const d = await call('new_name');
      if (!d?.success) throw new Error();
      const b = await call('board', { date: today });
      setResult((r) => (r ? { ...r, name: d.name, board: b?.board || r.board } : r));
      setDaily((x) => ({ ...(x || {}), name: d.name }));
    } catch {
      toast.error("Couldn't change your name. Try again.");
    }
  };
  const share = async () => {
    const day = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const text = `Plantdoku ${day} 🌱\nSolved in ${fmt(result.seconds)}${result.hints ? ` (${result.hints} hint${result.hints === 1 ? '' : 's'})` : ''}${result.board?.faster_than != null ? `, faster than ${result.board.faster_than}% of players` : ''}\nhappyplants.club`;
    if (Capacitor.isNativePlatform()) {
      try { await registerPlugin('NotifyBridge').shareText({ text, title: 'Plantdoku' }); return; } catch { /* older build */ }
    }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); toast.success('Copied! Paste it anywhere.'); } catch { toast.error("Couldn't share."); }
  };

  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const btn = `flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold border active:scale-95 disabled:opacity-50 ${ui.chip}`;

  return (
    <div className="min-h-screen theme-bg pb-28">
      <div className="max-w-xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/Dashboard'))} className={`flex items-center gap-1.5 py-2 -ml-1 text-sm font-semibold ${ui.text}`}>
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
          <button onClick={() => setShowRules((s) => !s)} className={`flex items-center gap-1 text-sm font-semibold ${ui.text}`}>
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

        {/* Daily / practice switch */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <button onClick={() => mode !== 'daily' && backToDaily()}
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

        {showRules && (
          <div className={`rounded-2xl border p-4 mb-3 text-sm ${ui.card} ${ui.sub}`}>
            <p className={`font-bold mb-1 ${ui.text}`}>How to play</p>
            <p>Put <b className={ui.text}>one plant</b> in every <b className={ui.text}>row</b>, every <b className={ui.text}>column</b> and every <b className={ui.text}>color</b>.</p>
            <p className="mt-1">Plants can't touch each other, not even at the corners.</p>
            <p className="mt-1">Tap a square once to mark it ✕ (no plant), twice for a plant 🌱, three times to clear it. Drag across squares to mark lots of ✕ at once.</p>
            {mode === 'daily' && <p className="mt-1">Everyone gets the same daily puzzle. The clock only runs while it's on screen, and each hint adds {HINT_SECONDS} seconds.</p>}
          </div>
        )}

        {mode === 'daily' && dailyError && !result && (
          <div className={`rounded-2xl border p-4 mb-3 ${ui.card}`}>
            <p className={`font-semibold ${ui.text}`}>{dailyError}</p>
            <button onClick={startDaily} className="mt-2 text-sm font-bold text-green-600 flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Try again</button>
          </div>
        )}

        <div className={`relative ${locked && !result ? 'opacity-60' : ''}`}>
          <Board puzzle={puzzle} marks={marks} conflicts={conflicts} hint={hint} dark={dark} locked={locked}
            onTap={tap} onStroke={push} onDragX={dragX} />
          {mode === 'daily' && !daily && !dailyError && (
            <div className="absolute inset-0 flex items-center justify-center"><Loader2 className={`w-8 h-8 animate-spin ${ui.text}`} /></div>
          )}
        </div>

        {!result && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button onClick={undo} disabled={!history.length || locked} className={btn}><Undo2 className="w-4 h-4" /> Undo</button>
            <button onClick={clearAll} disabled={locked} className={btn}><Eraser className="w-4 h-4" /> Clear</button>
            <button onClick={askHint} disabled={hintBusy || locked} className={btn}>
              {hintBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : needVideo ? <PlayCircle className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
              Hint{mode === 'daily' ? ` +${HINT_SECONDS}s` : ''}
            </button>
          </div>
        )}
        {!result && conflicts.length > 0 && (
          <p className="text-xs text-red-500 font-semibold mt-2 text-center">Red pots break a rule: same row, column or color, or touching.</p>
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
                <p className={`text-xs mt-3 ${ui.sub}`}>New daily puzzle in {untilMidnight()}.</p>
              </>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {result.daily && (
                <button onClick={share} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold bg-green-600 text-white active:scale-95">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
              <button onClick={() => newPractice(level)} className={btn}>
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
