import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Shuffle, Share2, PlayCircle, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { localToday } from '@/lib/dates';
import { useGameTheme, useToday, setDone, getDone, streakFor, countFinish, adBeforeNext } from '@/lib/games/common';
import GameHeader from '@/components/games/GameHeader';
import GameTutorial from '@/components/games/GameTutorial';
import NewDailyBar from '@/components/games/NewDailyBar';
import { makeGroupsPuzzle, dailyGroupsPuzzle } from '@/lib/games/groups';

// Garden Groups: 16 plant words, 4 hidden groups of 4. Tap 4, Submit. 4 tries.
// Group colors are our own (mint, peach, sky, lilac), easiest to trickiest.
const LEVELS = {
  1: { light: '#c6f0d4', dark: '#1f5f3b', emoji: '🌿', label: 'mint' },
  2: { light: '#fcd9b8', dark: '#7c3f16', emoji: '🍑', label: 'peach' },
  3: { light: '#c7e3fb', dark: '#1e4f7a', emoji: '💧', label: 'sky' },
  4: { light: '#e3d4fb', dark: '#4c2f7a', emoji: '🍇', label: 'lilac' },
};
const MAX_MISTAKES = 4;
const TUTORIAL_KEY = 'hp_gg_tutorial_v1';

// Text size goes by the longest single word on the tile (two-word names wrap onto two lines),
// so every name fits inside a tile of one fixed size
const sizeFor = (w) => {
  const longest = Math.max(...w.split(/[ -]/).map((s) => s.length));
  return w.length <= 6 ? 'text-[15px]' : longest <= 8 ? 'text-[13px]' : longest <= 10 ? 'text-[11.5px]' : 'text-[10px]';
};

// A word that shrinks just enough to fit its tile without breaking mid-word. Measured on the
// phone itself (fonts differ between phones), so the tile never has to grow to fit it.
let measureCtx = null;
function FitWord({ word, max = 15, min = 8 }) {
  const ref = useRef(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return undefined;
    const fit = () => {
      const pad = parseFloat(getComputedStyle(box).paddingLeft) + parseFloat(getComputedStyle(box).paddingRight);
      const avail = box.clientWidth - pad - 2;
      if (avail <= 0) return;
      const cs = getComputedStyle(el);
      measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
      measureCtx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
      const widest = Math.max(...word.toUpperCase().split(/[ -]/).map((t) => measureCtx.measureText(t).width)) / 100;
      setSize(Math.max(min, Math.min(max, Math.floor((avail / widest) * 2) / 2)));
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [word, max, min]);
  return <span ref={ref} style={{ fontSize: `${size}px` }}>{word}</span>;
}

function MiniTile({ word, selected, dark }) {
  return (
    <span className={`flex items-center justify-center rounded-lg px-1 h-11 text-center font-bold uppercase leading-tight ${sizeFor(word)} ${
      selected ? 'bg-green-700 text-white' : dark ? 'bg-white/10 text-white' : 'bg-[#f3ede1] text-gray-900'}`}>
      {word}
    </span>
  );
}
// row: fills exactly one row of tiles on the board (fixed height, text can't make it grow)
function Bar({ group, dark, small, row }) {
  const lv = LEVELS[group.level];
  return (
    <div className={`rounded-xl text-center ${row ? 'h-full px-2 py-1 flex flex-col justify-center overflow-hidden' : small ? 'p-2' : 'p-3'}`} style={{ background: dark ? lv.dark : lv.light }}>
      <p className={`font-bold ${small ? 'text-xs' : 'text-sm'} ${row ? 'leading-5 truncate' : ''} ${dark ? 'text-white' : 'text-gray-900'}`}>{group.name}</p>
      <p className={`${small || row ? 'text-[11px]' : 'text-xs'} ${row ? 'leading-[14px] line-clamp-2' : ''} uppercase ${dark ? 'text-white/85' : 'text-gray-800'}`}>{group.words.join(', ')}</p>
    </div>
  );
}

export default function GardenGroups() {
  const { dark, ui } = useGameTheme();
  // The daily's date is locked when the screen opens, so midnight can't save yesterday's board
  // under today's date or mark today done. It moves on via Daily / "Play it" or a fresh visit.
  const today = useToday();
  const [day, setDay] = useState(localToday);
  const [mode, setMode] = useState('daily');
  const [seed, setSeed] = useState(null); // practice only
  const puzzle = useMemo(() => (mode === 'daily' ? dailyGroupsPuzzle(day) : makeGroupsPuzzle(seed)), [mode, day, seed]);
  const stateKey = mode === 'daily' ? `hp_gg_state_${day}` : null;
  const ending = useRef(false); // set the moment a game ends, so a quick second tap can't finish it twice

  const fresh = () => ({ seed: puzzle.seed, order: puzzle.tiles, solved: [], mistakes: 0, guesses: [], tried: [], over: false, won: false });
  const [game, setGame] = useState(fresh);
  const [selected, setSelected] = useState([]);
  const [shake, setShake] = useState(false);
  const [tutorial, setTutorial] = useState(() => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; } });

  // New puzzle: pick up where the daily left off, or start fresh. A fresh one is a new puzzle
  // starting, so it's when the "one ad per two finished puzzles" check runs.
  useEffect(() => {
    let g = null;
    if (stateKey) {
      try {
        const s = JSON.parse(localStorage.getItem(stateKey) || 'null');
        const keys = puzzle.groups.map((x) => x.key);
        if (s && s.seed === puzzle.seed && Array.isArray(s.order) && Array.isArray(s.solved)
          && s.order.every((w) => puzzle.tiles.includes(w)) && s.solved.every((k) => keys.includes(k))) g = s;
      } catch { /* ignore */ }
    }
    ending.current = !!g?.over;
    setGame(g || fresh());
    setSelected([]);
    if (!g?.guesses?.length && !(mode === 'daily' && getDone('gardengroups', day))) adBeforeNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);
  useEffect(() => {
    // Only save a board into today's slot if it really is today's board (not a practice one mid-switch)
    if (stateKey && game.seed === puzzle.seed) { try { localStorage.setItem(stateKey, JSON.stringify(game)); } catch { /* ignore */ } }
  }, [game, stateKey, puzzle]);

  const groupOf = (w) => puzzle.groups.find((g) => g.words.includes(w));
  const solvedGroups = game.solved.map((k) => puzzle.groups.find((g) => g.key === k)).filter(Boolean);

  // Losses get a done mark too (no replaying the daily); only wins keep the streak going
  const finished = (g) => {
    countFinish();
    if (mode === 'daily') setDone('gardengroups', { mistakes: g.mistakes, solved: g.won, won: g.won }, day);
  };

  const toggle = (w) => {
    if (game.over || ending.current) return;
    setSelected((s) => (s.includes(w) ? s.filter((x) => x !== w) : s.length >= 4 ? s : [...s, w]));
  };

  const submit = () => {
    if (selected.length !== 4 || game.over || ending.current) return;
    const key = [...selected].sort().join('|');
    if (game.tried.includes(key)) { toast('You already tried those 4.'); return; }
    const levels = selected.map((w) => groupOf(w).level);
    const hit = puzzle.groups.find((g) => selected.every((w) => g.words.includes(w)));
    if (hit) {
      const solved = [...game.solved, hit.key];
      const won = solved.length === 4;
      const next = { ...game, solved, order: game.order.filter((w) => !hit.words.includes(w)), guesses: [...game.guesses, levels], tried: [...game.tried, key], over: won, won };
      if (won) ending.current = true;
      setGame(next);
      setSelected([]);
      if (won) finished(next);
      return;
    }
    const oneAway = puzzle.groups.some((g) => selected.filter((w) => g.words.includes(w)).length === 3);
    const mistakes = game.mistakes + 1;
    setShake(true);
    setTimeout(() => setShake(false), 450);
    if (mistakes >= MAX_MISTAKES) {
      // Over right away (not after the shake), so a second tap on Submit can't finish it twice
      ending.current = true;
      const rest = puzzle.groups.filter((g) => !game.solved.includes(g.key)).sort((a, b) => a.level - b.level).map((g) => g.key);
      const next = { ...game, mistakes, guesses: [...game.guesses, levels], tried: [...game.tried, key], solved: [...game.solved, ...rest], order: [], over: true, won: false };
      setGame(next);
      setSelected([]);
      finished(next);
      toast("Out of tries. Here's how they group.");
    } else {
      setGame({ ...game, mistakes, guesses: [...game.guesses, levels], tried: [...game.tried, key] });
      toast(oneAway ? 'One away!' : 'Not a group. Try again.');
    }
  };

  const shuffle = () => {
    const a = game.order.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    setGame({ ...game, order: a });
  };

  const playAnother = () => {
    setMode('practice');
    setSeed(`gg-practice-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  };
  const backToDaily = () => {
    setDay(localToday());
    setMode('daily');
  };
  const closeTutorial = () => {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
    setTutorial(false);
  };

  const share = async () => {
    const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const head = game.won
      ? `solved with ${game.mistakes} mistake${game.mistakes === 1 ? '' : 's'}`
      : 'ran out of tries';
    const grid = game.guesses.map((row) => row.map((l) => LEVELS[l].emoji).join('')).join('\n');
    const text = `Garden Groups ${dayLabel} 🧺 ${head}\n${grid}\nhappyplants.club`;
    if (Capacitor.isNativePlatform()) {
      try { await registerPlugin('NotifyBridge').shareText({ text, title: 'Garden Groups' }); return; } catch { /* older build */ }
    }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); toast.success('Copied! Paste it anywhere.'); } catch { toast.error("Couldn't share."); }
  };

  const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const btn = `flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold border active:scale-95 disabled:opacity-50 ${ui.chip}`;
  const streak = mode === 'daily' ? streakFor('gardengroups', day) : 0;
  const doneToday = !!getDone('gardengroups', day);
  const newDay = mode === 'daily' && today !== day;

  const tutorialSteps = [
    {
      title: 'Find 4 groups of 4',
      text: 'There are 16 plant words. They make 4 secret groups of 4 words that have something in common.',
      pic: (
        <div className="space-y-2">
          <Bar small dark={dark} group={{ level: 1, name: 'Kitchen herbs', words: ['BASIL', 'THYME', 'DILL', 'OREGANO'] }} />
          <div className="grid grid-cols-4 gap-1.5">
            {['TULIP', 'RAKE', 'OAK', 'HOE', 'CROCUS', 'ELM', 'SPADE', 'BIRCH'].map((w) => <MiniTile key={w} word={w} dark={dark} />)}
          </div>
        </div>
      ),
    },
    {
      title: 'Tap 4 words, then Submit',
      text: 'Tap the 4 you think go together. Tap one again to unpick it.',
      pic: (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {[['RAKE', true], ['OAK', false], ['HOE', true], ['TULIP', false], ['SPADE', true], ['ELM', false], ['TROWEL', true], ['BIRCH', false]].map(([w, s]) => <MiniTile key={w} word={w} selected={s} dark={dark} />)}
          </div>
          <div className="flex justify-end"><span className="rounded-xl px-4 py-2 text-sm font-bold bg-green-600 text-white">Submit</span></div>
        </div>
      ),
    },
    {
      title: 'One group is word play',
      text: 'Groups go from easy to tricky. The trickiest one is often word play, so a word might not be a plant on its own.',
      pic: (
        <div>
          <div className="grid grid-cols-4 gap-1.5">
            {['DATE', 'FAN', 'QUEEN', 'OIL'].map((w) => <MiniTile key={w} word={w} dark={dark} />)}
          </div>
          <p className={`text-sm mt-2 text-center ${ui.sub}`}>Add <b className={ui.text}>PALM</b> to each one: date palm, fan palm, queen palm, oil palm.</p>
        </div>
      ),
    },
    {
      title: 'You get 4 tries',
      text: "Each wrong guess wilts a leaf. If 3 of your 4 are right, we'll tell you you're one away.",
      pic: <p className="text-3xl text-center tracking-widest" aria-label="3 tries left">🌱🌱🌱🍂</p>,
    },
  ];

  return (
    <div className="min-h-screen theme-bg pb-28">
      <style>{'@keyframes ggshake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}'}</style>
      {tutorial && <GameTutorial steps={tutorialSteps} dark={dark} ui={ui} onClose={closeTutorial} />}
      <div className="max-w-xl mx-auto px-4 pt-4">
        <GameHeader title="Garden Groups" emoji="🧺" ui={ui} onHelp={() => setTutorial(true)}
          subtitle={mode === 'daily' ? `Daily puzzle · ${dateLabel}` : 'Practice puzzle'} />

        {newDay && <NewDailyBar ui={ui} onGo={backToDaily} />}

        <div className="flex gap-2 mb-3">
          <button onClick={() => (mode !== 'daily' || newDay) && backToDaily()}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${mode === 'daily' ? 'bg-green-600 border-green-600 text-white' : ui.chip}`}>
            Daily{doneToday ? ' ✓' : ''}
          </button>
          <button onClick={playAnother}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${mode === 'practice' ? 'bg-green-600 border-green-600 text-white' : ui.chip}`}>
            {mode === 'practice' ? 'New practice puzzle' : 'Practice'}
          </button>
        </div>

        {!game.over && (
          <p className={`text-sm mb-3 ${ui.sub}`}>Find <b className={ui.text}>4 groups of 4</b>. Tap 4 words, then Submit.</p>
        )}

        {/* Solved groups and tiles share one grid: a solved group's bar takes exactly the row
            its 4 tiles left, so the board stays the same height and nothing below moves */}
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Words">
          {solvedGroups.map((g) => (
            <div key={g.key} className="col-span-4 h-16"><Bar group={g} dark={dark} row /></div>
          ))}
          {game.order.map((w) => {
            const on = selected.includes(w);
            return (
              <button key={w} onClick={() => toggle(w)} aria-pressed={on}
                className={`h-16 min-w-0 overflow-hidden break-words rounded-xl px-1 font-bold uppercase leading-tight text-center transition active:scale-95 ${
                  on ? 'bg-green-700 text-white shadow-inner' : dark ? 'bg-white/10 text-white' : 'bg-[#f3ede1] text-gray-900 shadow-sm'}`}
                style={on && shake ? { animation: 'ggshake .45s' } : undefined}>
                <FitWord word={w} />
              </button>
            );
          })}
        </div>

        {!game.over && (
          <>
            <div className="flex items-center justify-center gap-2 mt-4" aria-label={`${MAX_MISTAKES - game.mistakes} tries left`}>
              <span className={`text-sm ${ui.sub}`}>Tries left:</span>
              <span className="text-xl tracking-wider">
                {Array.from({ length: MAX_MISTAKES }, (_, i) => (i < MAX_MISTAKES - game.mistakes ? '🌱' : '🍂')).join('')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button onClick={shuffle} className={btn}><Shuffle className="w-4 h-4" /> Shuffle</button>
              <button onClick={() => setSelected([])} disabled={!selected.length} className={btn}>Deselect</button>
              <button onClick={submit} disabled={selected.length !== 4}
                className="flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-bold bg-green-600 text-white active:scale-95 disabled:opacity-40">
                Submit
              </button>
            </div>
          </>
        )}

        {game.over && (
          <div className={`rounded-2xl border p-5 mt-4 ${ui.card}`}>
            <p className="text-3xl" aria-hidden>{game.won ? '🎉' : '🍂'}</p>
            <p className={`text-2xl font-bold mt-1 ${ui.text}`}>{game.won ? 'You found all 4 groups!' : 'Out of tries'}</p>
            <p className={`text-sm mt-1 ${ui.sub}`}>
              {game.won ? `${game.mistakes} mistake${game.mistakes === 1 ? '' : 's'}.` : `The answers are above.${mode === 'daily' && !newDay ? ' A new puzzle comes tomorrow.' : ''}`}
              {mode === 'daily' && streak > 0 && <span> <Flame className="w-4 h-4 inline text-orange-500" /> {streak} day streak</span>}
            </p>
            <div className="mt-3 space-y-1 text-lg leading-none" aria-label="Your guesses">
              {game.guesses.map((row, i) => <p key={i}>{row.map((l) => LEVELS[l].emoji).join('')}</p>)}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {mode === 'daily' && (
                <button onClick={share} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold bg-green-600 text-white active:scale-95">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              )}
              <button onClick={playAnother} className={btn}><PlayCircle className="w-4 h-4" /> {mode === 'practice' ? 'Play another' : 'Play a practice puzzle'}</button>
              {mode === 'practice' && <button onClick={backToDaily} className={btn}>Daily puzzle</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
