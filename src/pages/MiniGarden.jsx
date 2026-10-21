import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Eraser, Lightbulb, Loader2, Share2, Flame, Timer, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { localToday } from '@/lib/dates';
import { usePlus } from '@/lib/plus';
import { rewardedAvailable, showRewardedAd } from '@/lib/admob';
import { useGameTheme, getDone, setDone, streakFor, countFinish, adBeforeNext, fmtTime } from '@/lib/games/common';
import GameHeader from '@/components/games/GameHeader';
import GameTutorial from '@/components/games/GameTutorial';
import PlantIcon from '@/components/games/PlantIcon';
import {
  makePuzzle, dailySeed, DAILY_LEVEL, findConflicts, isSolved, hintFor,
  rowOf, colOf, boxOf, PLANT_NAMES, PLANT_ICONS, SIZE,
} from '@/lib/games/minigarden';

// Mini Garden: a 6×6 Sudoku with plants. Every row, every column and every box (thick
// outlines) gets one of each of the 6 plants. Tap a square, then tap a plant.
// Daily puzzle (medium, same for everyone by local date) + practice Easy/Medium/Hard.
// Ads: one full-screen ad per two finished puzzles (any game), when the next one starts.
// Hints: 1 free per puzzle, more with a reward video. Plus: no ads, unlimited hints.

const TUTORIAL_KEY = 'hp_mg_tutorial_v1';
const LEVEL_LIST = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];
const storeKey = (day) => `hp_mg_${day}`;
const PLANT_VALUES = [0, 1, 2, 3, 4, 5];

function Cell({ v, bg, style, className = '' }) {
  return (
    <span className={`flex items-center justify-center aspect-square ${className}`} style={{ background: bg, ...style }}>
      {v !== null && v !== undefined && <PlantIcon index={PLANT_ICONS[v]} className="w-[80%] h-[80%]" />}
    </span>
  );
}

function tutorialSteps(dark, ui) {
  const bgA = dark ? '#1c2a22' : '#fffdf5';
  const line = `1px solid ${dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.15)'}`;
  const thick = `2.5px solid ${dark ? '#000' : '#3f3f46'}`;
  return [
    {
      title: 'Every row gets one of each plant',
      text: 'There are 6 plants. Each row across has all 6, no repeats.',
      pic: (
        <div className="grid grid-cols-6 rounded-lg overflow-hidden" style={{ border: thick }}>
          {[3, 0, 5, 1, 4, 2].map((v, k) => <Cell key={k} v={v} bg={bgA} style={{ borderLeft: k ? line : 'none' }} />)}
        </div>
      ),
    },
    {
      title: 'Every column too',
      text: 'Each column down also has all 6 plants, no repeats.',
      pic: (
        <div className="w-1/6 min-w-[48px] mx-auto grid grid-cols-1 rounded-lg overflow-hidden" style={{ border: thick }}>
          {[1, 4, 2, 5, 0, 3].map((v, k) => <Cell key={k} v={v} bg={bgA} style={{ borderTop: k ? line : 'none' }} />)}
        </div>
      ),
    },
    {
      title: 'Every box too',
      text: 'The thick lines split the garden into 6 boxes. Each box also gets one of each plant.',
      pic: (
        <div className="w-1/2 mx-auto grid grid-cols-3 rounded-lg overflow-hidden" style={{ border: thick }}>
          {[2, 0, 4, 5, 3, 1].map((v, k) => (
            <Cell key={k} v={v} bg={bgA} style={{ borderLeft: k % 3 ? line : 'none', borderTop: k >= 3 ? line : 'none' }} />
          ))}
        </div>
      ),
    },
    {
      title: 'Tap a square, then tap a plant',
      text: 'Pick an empty square, then tap a plant under the garden to plant it. Tap the same plant again to dig it up. Gray squares came planted and can\'t change.',
      pic: (
        <div className="space-y-3">
          <div className="w-1/2 mx-auto grid grid-cols-3 rounded-lg overflow-hidden" style={{ border: thick }}>
            {[2, null, 4, 5, 3, 1].map((v, k) => (
              <span key={k} className={`relative ${k === 1 ? 'ring-4 ring-inset ring-sky-500 z-10' : ''}`}>
                <Cell v={v} bg={k === 1 ? bgA : (dark ? '#2f3b33' : '#e6e0d2')} style={{ borderLeft: k % 3 ? line : 'none', borderTop: k >= 3 ? line : 'none' }} />
              </span>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {PLANT_VALUES.map((v) => (
              <span key={v} className={`rounded-xl border p-1 flex items-center justify-center ${ui.chip} ${v === 0 ? 'ring-2 ring-sky-500' : ''}`}>
                <PlantIcon index={PLANT_ICONS[v]} className="w-8 h-8" />
              </span>
            ))}
          </div>
          <p className={`text-xs text-center ${ui.sub}`}>The empty square needs the red flower: it's the only plant missing from that box.</p>
        </div>
      ),
    },
  ];
}

export default function MiniGarden() {
  const { dark, ui } = useGameTheme();
  const plus = usePlus();
  const today = localToday();

  const [mode, setMode] = useState('daily');
  const [level, setLevel] = useState('easy');
  const [seed, setSeed] = useState(() => `mg-practice-${Date.now()}`);
  const puzzle = useMemo(() => (mode === 'daily'
    ? makePuzzle(dailySeed(today), DAILY_LEVEL)
    : makePuzzle(seed, level)), [mode, today, seed, level]);

  const [grid, setGrid] = useState(() => puzzle.givens.slice());
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [hint, setHint] = useState(null);
  const [hints, setHints] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [tutorial, setTutorial] = useState(() => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; } });
  const clock = useRef({ ms: 0, at: Date.now(), running: false, started: false });
  const [, setTick] = useState(0);

  const elapsedMs = () => {
    const c = clock.current;
    return c.running ? c.ms + (Date.now() - c.at) : c.ms;
  };
  const startClock = () => {
    const c = clock.current;
    if (c.running) return;
    clock.current = { ms: c.ms, at: Date.now(), running: true, started: true };
  };
  const pauseClock = () => {
    const c = clock.current;
    if (!c.running) return;
    clock.current = { ...c, ms: c.ms + (Date.now() - c.at), at: Date.now(), running: false };
  };

  // A new puzzle: daily comes back where you left it (or finished); practice starts fresh
  useEffect(() => {
    setSelected(null);
    setHistory([]);
    setHint(null);
    if (mode === 'daily') {
      const done = getDone('minigarden', today);
      if (done) {
        setGrid(puzzle.solution.slice());
        setHints(done.hints || 0);
        clock.current = { ms: (done.seconds || 0) * 1000, at: Date.now(), running: false, started: true };
        setResult({ daily: true, seconds: done.seconds || 0, hints: done.hints || 0 });
        return;
      }
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(storeKey(today)) || 'null'); } catch { /* ignore */ }
      if (saved && Array.isArray(saved.grid) && saved.grid.length === SIZE * SIZE) {
        const g = puzzle.givens.map((v, i) => (v !== null ? v : (Number.isInteger(saved.grid[i]) ? saved.grid[i] : null)));
        setGrid(g);
        setHints(saved.hints || 0);
        clock.current = { ms: saved.ms || 0, at: Date.now(), running: false, started: (saved.ms || 0) > 0 };
      } else {
        setGrid(puzzle.givens.slice());
        setHints(0);
        clock.current = { ms: 0, at: Date.now(), running: false, started: false };
      }
      setResult(null);
    } else {
      setGrid(puzzle.givens.slice());
      setHints(0);
      setResult(null);
      clock.current = { ms: 0, at: Date.now(), running: false, started: false };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);

  // Save the daily as you go
  const saveDaily = () => {
    if (mode !== 'daily' || result) return;
    try { localStorage.setItem(storeKey(today), JSON.stringify({ grid, hints, ms: Math.round(elapsedMs()) })); } catch { /* ignore */ }
  };
  useEffect(() => { saveDaily(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grid, hints]);

  // The clock pauses while the app is in the background or the how-to is open
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) { pauseClock(); saveDaily(); }
      else if (clock.current.started && !result && !tutorial) startClock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, tutorial, grid, hints, mode]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Leaving the screen (or switching to practice): keep the daily's time, not just its plants
  const modeRef = useRef(mode);
  const resultRef = useRef(result);
  modeRef.current = mode;
  resultRef.current = result;
  const saveDailyTime = () => {
    if (modeRef.current !== 'daily' || resultRef.current) return;
    try {
      const s = JSON.parse(localStorage.getItem(storeKey(today)) || 'null');
      if (s) localStorage.setItem(storeKey(today), JSON.stringify({ ...s, ms: Math.round(elapsedMs()) }));
    } catch { /* ignore */ }
  };
  useEffect(() => () => { pauseClock(); saveDailyTime(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openTutorial = () => { pauseClock(); setTutorial(true); };
  const closeTutorial = () => {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
    setTutorial(false);
    if (clock.current.started && !result) startClock();
  };

  const conflict = useMemo(() => findConflicts(grid), [grid]);
  const solved = useMemo(() => isSolved(grid), [grid]);
  const filled = grid.filter((v) => v !== null).length;
  const editable = (i) => puzzle.givens[i] === null;

  // Solved!
  useEffect(() => {
    if (!solved || result) return;
    pauseClock();
    const seconds = Math.round(elapsedMs() / 1000);
    countFinish();
    if (mode === 'daily') {
      setDone('minigarden', { seconds, hints });
      try { localStorage.removeItem(storeKey(today)); } catch { /* ignore */ }
    }
    setSelected(null);
    setResult({ daily: mode === 'daily', seconds, hints });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  // Playing
  const push = () => setHistory((h) => [...h.slice(-199), grid]);
  const selectCell = (i) => {
    if (result) return;
    setSelected(i);
    startClock();
  };
  const place = (v) => {
    if (result) return;
    if (selected === null) { toast('Tap an empty square first, then a plant.'); return; }
    if (!editable(selected)) { toast("That square came planted. Pick an empty one."); return; }
    startClock();
    push();
    setHint(null);
    setGrid((g) => { const n = g.slice(); n[selected] = n[selected] === v ? null : v; return n; });
  };
  const erase = () => {
    if (result || selected === null || !editable(selected) || grid[selected] === null) return;
    push();
    setGrid((g) => { const n = g.slice(); n[selected] = null; return n; });
  };
  const undo = () => setHistory((h) => {
    if (!h.length) return h;
    setGrid(h[h.length - 1]);
    return h.slice(0, -1);
  });

  // Hints
  const needVideo = !plus && hints >= 1;
  const askHint = async () => {
    if (hintBusy || result) return;
    if (needVideo) {
      if (!rewardedAvailable()) { toast("That's your free hint for this puzzle."); return; }
      setHintBusy(true);
      const r = await showRewardedAd();
      setHintBusy(false);
      if (!r.ok) { toast(r.reason === 'closed' ? 'The video was closed early, so no hint this time.' : "Couldn't play the video. Try again in a little while."); return; }
    }
    const h = hintFor(grid, puzzle.solution);
    if (!h) return;
    startClock();
    setHints((n) => n + 1);
    setHint(h);
    setSelected(h.cell);
    toast(h.type === 'wrong' ? "That plant doesn't belong in the glowing square." : `A ${PLANT_NAMES[h.value]} goes in the glowing square.`);
    setTimeout(() => setHint((cur) => (cur === h ? null : cur)), 4000);
  };

  const newPractice = (lv) => {
    pauseClock();
    saveDailyTime();
    adBeforeNext();
    setLevel(lv);
    setMode('practice');
    setSeed(`mg-practice-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    setResult(null);
  };
  const backToDaily = () => {
    adBeforeNext();
    setResult(null);
    setMode('daily');
  };
  const share = async () => {
    const day = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const text = `Mini Garden ${day} 🪴\nSolved in ${fmtTime(result.seconds)}${result.hints ? ` (${result.hints} hint${result.hints === 1 ? '' : 's'})` : ''}\nhappyplants.club`;
    if (Capacitor.isNativePlatform()) {
      try { await registerPlugin('NotifyBridge').shareText({ text, title: 'Mini Garden' }); return; } catch { /* older build */ }
    }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); toast.success('Copied! Paste it anywhere.'); } catch { toast.error("Couldn't share."); }
  };

  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const btn = `flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold border active:scale-95 disabled:opacity-50 ${ui.chip}`;
  const thick = `2.5px solid ${dark ? '#000' : '#3f3f46'}`;
  const thin = `1px solid ${dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'}`;
  const bgA = dark ? '#1c2a22' : '#fffdf5';
  const bgB = dark ? '#22332a' : '#f1f7ea';
  const givenBg = dark ? '#2f3b33' : '#e6e0d2';
  const selValue = selected !== null ? grid[selected] : null;
  const streak = result?.daily ? streakFor('minigarden', today) : 0;

  return (
    <div className="min-h-screen theme-bg pb-28">
      {tutorial && <GameTutorial steps={tutorialSteps(dark, ui)} dark={dark} ui={ui} onClose={closeTutorial} />}
      <div className="max-w-xl mx-auto px-4 pt-4">
        <GameHeader
          title="Mini Garden" emoji="🪴" ui={ui} onHelp={openTutorial}
          subtitle={mode === 'daily' ? `Daily puzzle · ${dateLabel}` : `Practice · ${LEVEL_LIST.find((l) => l.key === level).label}`}
          right={(
            <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2 border font-mono font-bold ${ui.card} ${ui.text}`} aria-label="Time">
              <Timer className="w-4 h-4" /> {fmtTime(result ? result.seconds : elapsedMs() / 1000)}
            </div>
          )}
        />

        {/* Daily / practice */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <button onClick={() => mode !== 'daily' && backToDaily()}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold border ${mode === 'daily' ? 'bg-green-600 border-green-600 text-white' : ui.chip}`}>
            Daily
          </button>
          {LEVEL_LIST.map((l) => (
            <button key={l.key} onClick={() => newPractice(l.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold border ${mode === 'practice' && level === l.key ? 'bg-green-600 border-green-600 text-white' : ui.chip}`}>
              {l.label}
            </button>
          ))}
        </div>

        {/* The goal, always in view */}
        {!result && (
          <p className={`text-sm mb-2 ${ui.sub}`}>
            <b className={ui.text}>One of each plant</b> in every <b className={ui.text}>row</b>, <b className={ui.text}>column</b> and <b className={ui.text}>box</b>.{' '}
            <span className="whitespace-nowrap">· {filled} of {SIZE * SIZE} planted</span>
          </p>
        )}

        {/* The garden */}
        <div className="grid w-full max-w-[420px] mx-auto aspect-square rounded-xl overflow-hidden select-none"
          // Fixed, equal rows and columns: what's in a square can never stretch or squeeze it
          style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${SIZE}, minmax(0, 1fr))`, border: thick }} role="grid" aria-label="Mini Garden board">
          {grid.map((v, i) => {
            const r = rowOf(i), c = colOf(i), b = boxOf(i);
            const given = puzzle.givens[i] !== null;
            const bad = conflict.cells.has(i);
            const isSel = selected === i;
            const peer = selected !== null && !isSel && (rowOf(selected) === r || colOf(selected) === c || boxOf(selected) === b);
            const same = selValue !== null && !isSel && v === selValue;
            const hinted = hint && hint.cell === i;
            const checker = (Math.floor(b / 2) + (b % 2)) % 2 === 0;
            const ring = hinted
              ? (hint.type === 'wrong' ? 'ring-4 ring-inset ring-red-600 animate-pulse' : 'ring-4 ring-inset ring-green-600 animate-pulse')
              : isSel ? 'ring-4 ring-inset ring-sky-500'
                : bad ? 'ring-[3px] ring-inset ring-red-600'
                  : same ? 'ring-2 ring-inset ring-amber-400' : '';
            return (
              <button key={i} type="button" onClick={() => selectCell(i)} role="gridcell"
                aria-label={`Row ${r + 1}, column ${c + 1}${v !== null ? `, ${PLANT_NAMES[v]}` : ', empty'}${given ? ', came planted' : ''}${bad ? ', breaks a rule' : ''}`}
                className={`relative block min-w-0 min-h-0 p-0 overflow-hidden ${ring} ${isSel ? 'z-10' : ''}`}
                style={{
                  background: given ? givenBg : (checker ? bgA : bgB),
                  borderTop: r > 0 ? (r % 2 === 0 ? thick : thin) : 'none',
                  borderLeft: c > 0 ? (c % 3 === 0 ? thick : thin) : 'none',
                }}>
                {peer && <span className="absolute inset-0 bg-sky-400/15 pointer-events-none" aria-hidden />}
                {bad && <span className="absolute inset-0 bg-red-500/20 pointer-events-none" aria-hidden />}
                {v !== null && (
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                    <PlantIcon index={PLANT_ICONS[v]} className="w-[78%] h-[78%]" />
                  </span>
                )}
                {bad && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center pointer-events-none" aria-hidden>!</span>
                )}
              </button>
            );
          })}
        </div>

        {!result && (
          <>
            {/* The plants to choose from, with how many are left to plant */}
            <div className="grid grid-cols-6 gap-1.5 mt-3 max-w-[420px] mx-auto">
              {PLANT_VALUES.map((v) => {
                const left = Math.max(0, SIZE - grid.filter((x) => x === v).length);
                return (
                  <button key={v} type="button" onClick={() => place(v)}
                    aria-label={`Plant a ${PLANT_NAMES[v]}, ${left} left`}
                    className={`flex flex-col items-center rounded-xl border pt-1 pb-0.5 active:scale-95 ${ui.chip} ${left === 0 ? 'opacity-40' : ''} ${selValue === v ? 'ring-2 ring-sky-500' : ''}`}>
                    <span className="w-10 h-10 flex items-center justify-center"><PlantIcon index={PLANT_ICONS[v]} className="w-full h-full" /></span>
                    <span className="text-[11px] font-bold">{left} left</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <button onClick={undo} disabled={!history.length} className={btn}><Undo2 className="w-4 h-4" /> Undo</button>
              <button onClick={erase} disabled={selected === null || !editable(selected) || grid[selected] === null} className={btn}><Eraser className="w-4 h-4" /> Erase</button>
              <button onClick={askHint} disabled={hintBusy} className={btn}>
                {hintBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : needVideo ? <PlayCircle className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                Hint
              </button>
            </div>
            {!clock.current.started && (
              <p className={`text-xs mt-2 text-center ${ui.sub}`}>The clock starts when you tap a square.</p>
            )}
          </>
        )}

        {!result && conflict.problems.length > 0 && (
          <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3" role="status">
            {conflict.problems.slice(0, 3).map((p) => (
              <p key={p} className="text-sm font-semibold text-red-600">⚠️ {p}. Only 1 of each.</p>
            ))}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`rounded-2xl border p-5 mt-4 ${ui.card}`}>
            <p className="text-3xl" aria-hidden>🎉</p>
            <p className={`text-2xl font-bold mt-1 ${ui.text}`}>Solved in {fmtTime(result.seconds)}</p>
            {result.hints > 0 && (
              <p className={`text-xs ${ui.sub}`}>with {result.hints} hint{result.hints === 1 ? '' : 's'}</p>
            )}
            {result.daily && (
              <>
                {streak > 0 && (
                  <p className={`mt-2 font-semibold flex items-center gap-1.5 ${ui.text}`}>
                    <Flame className="w-4 h-4 text-orange-500" /> {streak} day{streak === 1 ? '' : 's'} in a row
                  </p>
                )}
                <p className={`text-xs mt-2 ${ui.sub}`}>A new daily garden comes tomorrow.</p>
              </>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              {result.daily && (
                <button onClick={share} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold bg-green-600 text-white active:scale-95">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
              <button onClick={() => newPractice(result.daily ? 'easy' : level)} className={btn}>
                <PlayCircle className="w-4 h-4" /> {result.daily ? 'Play another' : 'Next puzzle'}
              </button>
              {!result.daily && <button onClick={backToDaily} className={btn}>Daily puzzle</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
