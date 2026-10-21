import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Delete, Share2, PlayCircle, Flame, Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { localToday } from '@/lib/dates';
import { ALL_ANSWERS, dailyAnswer, practiceWord } from '@/lib/games/sproutAnswers';
import { useGameTheme, useToday, getDone, setDone, streakFor, countFinish, adBeforeNext } from '@/lib/games/common';
import { markPlantdokuFound } from '@/lib/plantdoku/egg';
import { usePlus } from '@/lib/plus';
import { rewardedAvailable, showRewardedAd } from '@/lib/admob';
import GameHeader from '@/components/games/GameHeader';
import GameTutorial from '@/components/games/GameTutorial';
import NewDailyBar from '@/components/games/NewDailyBar';

// Sprout Word: guess the hidden 5-letter plant, garden or nature word in 6 tries.
// Which word is today's, and the separate practice words: src/lib/games/sproutAnswers.js.
// Green = right letter, right spot. Yellow = in the word, somewhere else. Gray = not in it.
// Guesses can be any real 5-letter English word. Same daily word for everyone.
// Hints: each one shows one letter in its right spot and costs a reward video (Plus: unlimited).

const TRIES = 6;
const LEN = 5;
const TUTORIAL_KEY = 'hp_sw_tutorial_v1';
const COLORS = {
  right: 'bg-green-600 border-green-600 text-white',
  close: 'bg-amber-400 border-amber-400 text-gray-900',
  no: 'bg-gray-400 border-gray-400 text-white',
};
const RANK = { no: 1, close: 2, right: 3 };

/** ['right'|'close'|'no'] per letter, counting repeated letters correctly */
export function scoreGuess(guess, answer) {
  const res = new Array(LEN).fill('no');
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) res[i] = 'right';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (res[i] === 'right') continue;
    if (left[guess[i]] > 0) { res[i] = 'close'; left[guess[i]]--; }
  }
  return res;
}

let wordSet = null;
async function loadWords() {
  if (wordSet) return wordSet;
  const m = await import('@/lib/games/words5');
  wordSet = new Set(m.WORDS.split(' '));
  ALL_ANSWERS.forEach((a) => wordSet.add(a));
  return wordSet;
}

function Tile({ letter, state, big = true }) {
  return (
    <span className={`${big ? 'w-full aspect-square text-2xl' : 'w-9 h-9 text-base'} flex items-center justify-center rounded-lg border-2 font-bold uppercase select-none transition-colors duration-300 ${state ? COLORS[state] : 'border-gray-300 bg-white/80 text-gray-900'}`}>
      {letter}
    </span>
  );
}

export default function SproutWord() {
  const { dark, ui } = useGameTheme();
  // The daily's date is locked when the screen opens: midnight never swaps the word mid-game.
  // It moves to the new day only when the player taps Daily / "Play it", or leaves and comes back.
  const today = useToday();
  const [day, setDay] = useState(localToday);
  const [mode, setMode] = useState('daily');
  const [practice, setPractice] = useState(null);
  const recent = useRef([]);
  const answer = mode === 'daily' ? dailyAnswer(day) : practice;
  const storeKey = mode === 'daily' ? `hp_sw_${day}` : null;

  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState('');
  const [shake, setShake] = useState(false);
  const [words, setWords] = useState(null);
  const [wordsFailed, setWordsFailed] = useState(false);
  const [tutorial, setTutorial] = useState(() => { try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return true; } });

  // The guess list is a separate download; if it fails, say so instead of rejecting every guess
  const fetchWords = useCallback(() => {
    setWordsFailed(false);
    loadWords().then(setWords).catch(() => setWordsFailed(true));
  }, []);
  useEffect(() => { markPlantdokuFound(); fetchWords(); }, [fetchWords]);

  // New puzzle: restore the daily's guesses or start fresh. A fresh one is a new puzzle
  // starting, so it's when the "one ad per two finished puzzles" check runs.
  useEffect(() => {
    if (!answer) return;
    let g = [];
    if (storeKey) { try { g = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { g = []; } }
    g = Array.isArray(g) ? g.filter((x) => typeof x === 'string' && x.length === LEN).slice(0, TRIES) : [];
    setGuesses(g);
    setCurrent('');
    if (!g.length && !(mode === 'daily' && getDone('sproutword', day))) adBeforeNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, storeKey]);
  useEffect(() => { if (storeKey) { try { localStorage.setItem(storeKey, JSON.stringify(guesses)); } catch { /* ignore */ } } }, [guesses, storeKey]);

  // Hints: letters shown in their right spot (positions), kept for today's word
  const plus = usePlus();
  const hintKey = storeKey ? `${storeKey}_hints` : null;
  const [revealed, setRevealed] = useState([]);
  const [hintBusy, setHintBusy] = useState(false);
  useEffect(() => {
    let r = [];
    if (hintKey) { try { r = JSON.parse(localStorage.getItem(hintKey) || '[]'); } catch { r = []; } }
    setRevealed(Array.isArray(r) ? r.filter((i) => Number.isInteger(i) && i >= 0 && i < LEN) : []);
  }, [answer, hintKey]);
  useEffect(() => { if (hintKey) { try { localStorage.setItem(hintKey, JSON.stringify(revealed)); } catch { /* ignore */ } } }, [revealed, hintKey]);

  const won = guesses.includes(answer);
  const lost = !won && guesses.length >= TRIES;
  const over = won || lost;

  const askHint = async () => {
    if (over || hintBusy || !answer) return;
    // The next letter they don't already have in its right spot
    const known = new Set(revealed);
    guesses.forEach((g) => [...g].forEach((ch, i) => { if (ch === answer[i]) known.add(i); }));
    const next = [...Array(LEN).keys()].find((i) => !known.has(i));
    if (next === undefined) { toast('You already know where every letter goes. Just type it in!'); return; }
    if (!plus) {
      if (!rewardedAvailable()) { toast('No video is ready right now, so no hint yet. Try again in a little while.'); return; }
      setHintBusy(true);
      const r = await showRewardedAd();
      setHintBusy(false);
      if (!r.ok) { toast(r.reason === 'closed' ? 'The video was closed early, so no hint this time.' : "Couldn't play the video. Try again in a little while."); return; }
    }
    setRevealed((r) => (r.includes(next) ? r : [...r, next]));
  };

  // The day is done once: mark it (for the games list and the streak) and count it for ads
  const [counted, setCounted] = useState(null);
  useEffect(() => {
    if (!over || counted === answer) return;
    setCounted(answer);
    if (mode === 'daily') {
      // Losses get a done mark too (no replaying the daily); only wins keep the streak going
      if (!getDone('sproutword', day)) { setDone('sproutword', { won, tries: guesses.length, hints: revealed.length }, day); countFinish(); }
    } else countFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, answer]);

  // Best color seen for each letter, for the keyboard
  const keyStates = useMemo(() => {
    const k = {};
    for (const g of guesses) {
      const s = scoreGuess(g, answer);
      [...g].forEach((ch, i) => { if (!k[ch] || RANK[s[i]] > RANK[k[ch]]) k[ch] = s[i]; });
    }
    return k;
  }, [guesses, answer]);

  const bump = (msg) => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
    if (msg) toast(msg);
  };
  const submit = useCallback(() => {
    if (over) return;
    if (current.length < LEN) { bump('Not enough letters'); return; }
    if (!words) {
      if (wordsFailed) { bump("Couldn't load the word list. Check your signal."); fetchWords(); } else bump('One sec, loading words…');
      return;
    }
    if (!words.has(current)) { bump("That's not in the word list"); return; }
    setGuesses((g) => [...g, current]);
    setCurrent('');
  }, [current, over, words, wordsFailed, fetchWords]);
  const press = useCallback((key) => {
    if (over || tutorial) return;
    if (key === 'enter') submit();
    else if (key === 'back') setCurrent((c) => c.slice(0, -1));
    else if (/^[a-z]$/.test(key)) setCurrent((c) => (c.length < LEN ? c + key : c));
  }, [over, tutorial, submit]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') press('enter');
      else if (e.key === 'Backspace') press('back');
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  // Practice words come from their own list, never a daily word (see sproutAnswers.js)
  const playAnother = () => {
    const w = practiceWord(recent.current);
    recent.current = [...recent.current.slice(-19), w];
    setPractice(w);
    setMode('practice');
  };
  const toDaily = () => {
    setDay(localToday());
    setMode('daily');
  };
  const share = async () => {
    const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const grid = guesses.map((g) => scoreGuess(g, answer).map((s) => (s === 'right' ? '🟩' : s === 'close' ? '🟨' : '⬜')).join('')).join('\n');
    const hintsText = revealed.length ? ` (${revealed.length} hint${revealed.length === 1 ? '' : 's'})` : '';
    const text = `Sprout Word ${dayLabel} 🔤 ${won ? guesses.length : 'X'}/${TRIES}${hintsText}\n${grid}\nhappyplants.club`;
    if (Capacitor.isNativePlatform()) {
      try { await registerPlugin('NotifyBridge').shareText({ text, title: 'Sprout Word' }); return; } catch { /* older build */ }
    }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); toast.success('Copied! Paste it anywhere.'); } catch { toast.error("Couldn't share."); }
  };

  const rows = Array.from({ length: TRIES }, (_, r) => {
    if (r < guesses.length) return { letters: [...guesses[r]], states: scoreGuess(guesses[r], answer) };
    if (r === guesses.length && !over) return { letters: [...current.padEnd(LEN, ' ')], states: null, active: true };
    return { letters: Array(LEN).fill(' '), states: null };
  });
  const streak = streakFor('sproutword', day);
  const newDay = mode === 'daily' && today !== day;
  const steps = [
    {
      title: 'Guess the hidden plant word',
      text: "It's always a 5-letter plant, garden or nature word, like TULIP, BASIL or FROST. You get 6 tries.",
      pic: <div className="grid grid-cols-5 gap-1.5 max-w-[220px] mx-auto">{[...'tulip'].map((c, i) => <Tile key={i} letter={c} />)}</div>,
    },
    {
      title: 'The colors are your clues',
      text: '',
      pic: (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-1.5 max-w-[220px] mx-auto">
            <Tile letter="p" state="right" /><Tile letter="e" state="close" /><Tile letter="t" state="no" /><Tile letter="a" state="no" /><Tile letter="l" state="no" />
          </div>
          <p className={`text-sm ${ui.sub}`}><b className="text-green-600">Green:</b> right letter, right spot.</p>
          <p className={`text-sm ${ui.sub}`}><b className="text-amber-500">Yellow:</b> the word has this letter, but in a different spot.</p>
          <p className={`text-sm ${ui.sub}`}><b className="text-gray-500">Gray:</b> this letter isn't in the word.</p>
        </div>
      ),
    },
    {
      title: 'Any real word counts',
      text: "Your guesses don't have to be plants, just real 5-letter words. Use them to test letters, then go for the plant.",
    },
    {
      title: 'Stuck? Get a hint',
      text: plus ? 'Tap Hint to see one letter in its right spot.' : 'Tap Hint and watch a short video to see one letter in its right spot.',
    },
  ];
  const closeTutorial = () => { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ } setTutorial(false); };
  const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  return (
    <div className="min-h-screen theme-bg pb-28">
      {tutorial && <GameTutorial steps={steps} dark={dark} ui={ui} onClose={closeTutorial} />}
      <style>{'@keyframes hp-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}'}</style>
      <div className="max-w-md mx-auto px-4 pt-4">
        <GameHeader title="Sprout Word" emoji="🔤" ui={ui} onHelp={() => setTutorial(true)}
          subtitle={mode === 'daily' ? `Daily word · ${new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}` : 'Practice word'}
          right={streak > 0 ? <span className={`flex items-center gap-1 rounded-xl px-3 py-2 border font-bold ${ui.card} ${ui.text}`}><Flame className="w-4 h-4 text-orange-500" />{streak}</span> : null} />

        {newDay && <NewDailyBar ui={ui} onGo={toDaily} />}

        <p className={`text-sm mb-3 ${ui.sub}`}>Guess the <b className={ui.text}>5-letter plant, garden or nature word</b>. 🟩 right spot · 🟨 in the word, wrong spot · ⬜ not in the word.</p>

        <div className="grid gap-1.5 max-w-[300px] mx-auto" role="grid" aria-label="Guesses">
          {rows.map((row, r) => (
            <div key={r} className="grid grid-cols-5 gap-1.5" style={row.active && shake ? { animation: 'hp-shake .45s' } : undefined}>
              {row.letters.map((ch, i) => <Tile key={i} letter={ch.trim()} state={row.states?.[i]} />)}
            </div>
          ))}
        </div>

        {!over && (
          // Hint row: always the same height, so nothing moves when a hint shows up
          <div className="mt-3 h-10 max-w-[300px] mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-1" aria-live="polite">
              {revealed.length > 0 && (
                <>
                  <span className="text-base mr-0.5" aria-hidden>💡</span>
                  {[...Array(LEN).keys()].map((i) => (
                    <span key={i} className={`w-7 h-7 flex items-center justify-center rounded-md border-2 text-sm font-bold uppercase ${revealed.includes(i) ? COLORS.right : 'border-gray-300 bg-white/60 text-transparent'}`}
                      aria-label={revealed.includes(i) ? `Letter ${i + 1} is ${answer[i].toUpperCase()}` : undefined}>
                      {revealed.includes(i) ? answer[i] : '·'}
                    </span>
                  ))}
                </>
              )}
            </div>
            <button onClick={askHint} disabled={hintBusy}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold border active:scale-95 ${dark ? 'bg-white/15 text-white border-white/10' : 'bg-white text-gray-900 border-gray-300'}`}>
              {hintBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : plus ? <Lightbulb className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
              Hint
            </button>
          </div>
        )}

        {!over && (
          <div className="mt-3 space-y-1.5 select-none" aria-label="Keyboard">
            {KEYS.map((line, li) => (
              <div key={line} className="flex justify-center gap-1">
                {li === 2 && (
                  <button onClick={() => press('enter')} className="h-12 px-2.5 rounded-lg text-xs font-bold bg-green-600 text-white active:scale-95">ENTER</button>
                )}
                {[...line].map((ch) => (
                  <button key={ch} onClick={() => press(ch)}
                    className={`h-12 flex-1 max-w-[36px] rounded-lg text-sm font-bold uppercase active:scale-95 border ${keyStates[ch] ? COLORS[keyStates[ch]] : dark ? 'bg-white/15 text-white border-white/10' : 'bg-white text-gray-900 border-gray-300'}`}>
                    {ch}
                  </button>
                ))}
                {li === 2 && (
                  <button onClick={() => press('back')} aria-label="Delete letter" className={`h-12 px-2.5 rounded-lg active:scale-95 border ${dark ? 'bg-white/15 text-white border-white/10' : 'bg-white text-gray-900 border-gray-300'}`}><Delete className="w-5 h-5" /></button>
                )}
              </div>
            ))}
          </div>
        )}

        {over && (
          <div className={`rounded-2xl border p-5 mt-5 ${ui.card}`}>
            <p className="text-3xl" aria-hidden>{won ? '🎉' : '🥀'}</p>
            <p className={`text-2xl font-bold mt-1 ${ui.text}`}>{won ? (guesses.length === 1 ? 'First try!' : `Got it in ${guesses.length}/${TRIES}`) : 'So close!'}</p>
            <p className={`mt-1 ${ui.sub}`}>The word was <b className={`uppercase ${ui.text}`}>{answer}</b>.</p>
            {mode === 'daily' && (
              <p className={`text-sm mt-2 ${ui.sub}`}>
                {won ? <><Flame className="w-4 h-4 inline text-orange-500" /> {streak} day streak</> : 'Streak starts again with your next win'}
                {!newDay && ' · New word tomorrow'}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              {mode === 'daily' && (
                <button onClick={share} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold bg-green-600 text-white active:scale-95"><Share2 className="w-4 h-4" /> Share</button>
              )}
              <button onClick={playAnother} className={`flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold border active:scale-95 ${ui.chip}`}><PlayCircle className="w-4 h-4" /> Play another</button>
              {mode === 'practice' && (
                <button onClick={toDaily} className={`rounded-xl px-3 py-2.5 text-sm font-semibold border active:scale-95 ${ui.chip}`}>Today's word</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
