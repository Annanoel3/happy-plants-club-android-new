// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Plantdoku daily puzzle: the server keeps the time and the leaderboard.
// Everyone gets the same puzzle for a date (the player's local date). The clock runs only
// while the puzzle is on screen: the app calls "start" when it shows and "pause" when the
// app goes to the background. Hints add 30 seconds. Finishing checks the answer here.
//   { action: 'peek', date }             → state without touching the clock (has it been started?)
//   { action: 'start', date }            → state (starts or resumes the clock; nothing if done)
//   { action: 'pause', date }
//   { action: 'hint', date, plants }     → one hint (counted, +30 s)
//   { action: 'finish', date, plants }   → time, rank, top 5, stats
//   { action: 'board', date }            → top 5 + your place
//   { action: 'new_name' }               → a new leaderboard name (names are made up, never typed)
//   { action: 'remove', key, ids }       → (owner only, PLUS_SWEEP_KEY) take runs off the leaderboard,
//                                          e.g. a cheater or test data; { key, date } lists that day's runs
//
// The engine below is a copy of src/lib/plantdoku/engine.js (exports removed). If you change
// the engine, regenerate this file the same way, or the server and app will disagree.

const HINT_SECONDS = 30;
const MAX_STRETCH_MS = 2 * 60 * 60 * 1000; // a stretch with a lost "pause" counts at most 2 h

// ---- engine (copied from src/lib/plantdoku/engine.js) ----
// deno-lint-ignore-file
// Plantdoku puzzle engine (Star Battle / "Queens" style).
// N×N grid, N colour regions. One plant per row, per column and per region; plants never touch
// (not even diagonally). Every puzzle has exactly one solution.
//
// Pure ES module: no dependencies, no Math.random, no platform APIs. The same seed gives the same
// puzzle in the browser (Vite) and in a Deno function, so the server can rebuild the daily puzzle
// to check answers.

// ---------- Seeded random ----------

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** seededRng(seedString) → () => float in [0, 1). sfc32 seeded by xmur3. */
function seededRng(seedString) {
  const seed = xmur3(String(seedString));
  let a = seed(), b = seed(), c = seed(), d = seed();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next(); // warm up
  return next;
}

const randInt = (rng, n) => Math.floor(rng() * n);
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// ---------- Solving ----------

// Backtracking, one row at a time. Calls onSolution(colsArray) for each solution; stops when it returns true.
function search(size, regions, onSolution) {
  const colUsed = new Array(size).fill(false);
  const regUsed = new Array(size).fill(false);
  const maxRow = new Array(size).fill(-1); // last row each region reaches
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size);
    if (r > maxRow[regions[i]]) maxRow[regions[i]] = r;
  }
  const cols = new Array(size).fill(-1);
  let stop = false;
  const rec = (r) => {
    if (stop) return;
    if (r === size) { if (onSolution(cols.slice())) stop = true; return; }
    // A region we haven't used that ends above this row can never be filled
    for (let g = 0; g < size; g++) if (!regUsed[g] && maxRow[g] < r) return;
    const prev = r > 0 ? cols[r - 1] : -10;
    for (let c = 0; c < size; c++) {
      if (colUsed[c] || Math.abs(c - prev) <= 1) continue;
      const g = regions[r * size + c];
      if (regUsed[g]) continue;
      colUsed[c] = true; regUsed[g] = true; cols[r] = c;
      rec(r + 1);
      colUsed[c] = false; regUsed[g] = false; cols[r] = -1;
      if (stop) return;
    }
  };
  rec(0);
}

/** countSolutions(size, regions, limit = 2) → number of solutions, stopping at `limit`. */
function countSolutions(size, regions, limit = 2) {
  let n = 0;
  search(size, regions, () => ++n >= limit);
  return n;
}

function otherSolution(size, regions, solution) {
  let found = null;
  search(size, regions, (cols) => {
    for (let r = 0; r < size; r++) if (cols[r] !== solution[r]) { found = cols; return true; }
    return false;
  });
  return found;
}

// ---------- Checks used by the UI ----------

/** findConflicts(size, regions, plants: [r, c][]) → array of cell indexes that break a rule. */
function findConflicts(size, regions, plants) {
  const bad = new Set();
  const list = (plants || []).filter((p) => Array.isArray(p) && p[0] >= 0 && p[0] < size && p[1] >= 0 && p[1] < size);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [r1, c1] = list[i], [r2, c2] = list[j];
      const a = r1 * size + c1, b = r2 * size + c2;
      if (a === b) continue;
      const clash = r1 === r2 || c1 === c2 || regions[a] === regions[b]
        || (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1);
      if (clash) { bad.add(a); bad.add(b); }
    }
  }
  return [...bad].sort((x, y) => x - y);
}

/** isSolved(size, regions, plants) → true when there are N plants and nothing breaks a rule. */
function isSolved(size, regions, plants) {
  if (!Array.isArray(plants) || plants.length !== size) return false;
  const cells = new Set(plants.map(([r, c]) => r * size + c));
  if (cells.size !== size) return false;
  for (const [r, c] of plants) if (!(r >= 0 && r < size && c >= 0 && c < size)) return false;
  return findConflicts(size, regions, plants).length === 0;
}

/**
 * hintFor(size, regions, solution, plants) → { type: 'wrong', cell } | { type: 'place', cell } | null
 * A wrong plant is pointed out first. Otherwise, one correct cell from the row/column/region
 * with the fewest open spots left.
 */
function hintFor(size, regions, solution, plants) {
  const list = plants || [];
  for (const [r, c] of list) if (solution[r] !== c) return { type: 'wrong', cell: r * size + c };
  const placed = new Set(list.map(([r, c]) => r * size + c));
  const rowDone = new Array(size).fill(false), colDone = new Array(size).fill(false), regDone = new Array(size).fill(false);
  const blocked = new Array(size * size).fill(false);
  for (const [r, c] of list) {
    rowDone[r] = true; colDone[c] = true; regDone[regions[r * size + c]] = true;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) blocked[rr * size + cc] = true;
    }
  }
  const open = (i) => {
    const r = Math.floor(i / size), c = i % size;
    return !blocked[i] && !rowDone[r] && !colDone[c] && !regDone[regions[i]];
  };
  const houses = [];
  for (let k = 0; k < size; k++) {
    if (!rowDone[k]) houses.push({ cells: Array.from({ length: size }, (_, c) => k * size + c), target: k * size + solution[k] });
    if (!colDone[k]) {
      const r = solution.indexOf(k);
      houses.push({ cells: Array.from({ length: size }, (_, r2) => r2 * size + k), target: r * size + k });
    }
    if (!regDone[k]) {
      const cells = [];
      for (let i = 0; i < size * size; i++) if (regions[i] === k) cells.push(i);
      const t = cells.find((i) => solution[Math.floor(i / size)] === i % size);
      houses.push({ cells, target: t });
    }
  }
  let best = null, bestN = Infinity;
  for (const h of houses) {
    if (placed.has(h.target)) continue;
    const n = h.cells.filter(open).length;
    if (n < bestN) { bestN = n; best = h.target; }
  }
  return best == null ? null : { type: 'place', cell: best };
}

// ---------- Logic check (prefer puzzles a person can solve without guessing) ----------

/** solvesByLogic(size, regions) → true if simple deductions (no guessing) finish the puzzle. */
function solvesByLogic(size, regions) {
  const N = size, NN = size * size;
  const cand = new Array(NN).fill(true);
  const placed = new Array(NN).fill(false);
  const houses = [];
  for (let k = 0; k < N; k++) {
    houses.push(Array.from({ length: N }, (_, c) => k * N + c));
    houses.push(Array.from({ length: N }, (_, r) => r * N + k));
  }
  const regCells = Array.from({ length: N }, () => []);
  for (let i = 0; i < NN; i++) regCells[regions[i]].push(i);
  houses.push(...regCells);
  const houseOf = Array.from({ length: NN }, () => []);
  houses.forEach((h, hi) => h.forEach((i) => houseOf[i].push(hi)));
  const done = new Array(houses.length).fill(false);
  const killedBy = (i) => {
    const out = new Set();
    for (const hi of houseOf[i]) for (const j of houses[hi]) if (j !== i) out.add(j);
    const r = Math.floor(i / N), c = i % N;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < N && cc >= 0 && cc < N) out.add(rr * N + cc);
    }
    return out;
  };
  let count = 0;
  const place = (i) => {
    placed[i] = true; count++;
    for (const j of killedBy(i)) cand[j] = false;
    for (const hi of houseOf[i]) done[hi] = true;
  };
  let changed = true;
  while (changed && count < N) {
    changed = false;
    // Only one spot left in a row / column / region
    for (let hi = 0; hi < houses.length; hi++) {
      if (done[hi]) continue;
      const open = houses[hi].filter((i) => cand[i] && !placed[i]);
      if (open.length === 0) return false;
      if (open.length === 1) { place(open[0]); changed = true; }
    }
    if (changed) continue;
    // All of a house's spots sit inside one other house → clear the rest of that other house
    for (let hi = 0; hi < houses.length; hi++) {
      if (done[hi]) continue;
      const open = houses[hi].filter((i) => cand[i] && !placed[i]);
      let common = null;
      for (const i of open) {
        const hs = houseOf[i].filter((x) => x !== hi);
        common = common == null ? hs : common.filter((x) => hs.includes(x));
      }
      for (const other of common || []) {
        for (const j of houses[other]) {
          if (cand[j] && !placed[j] && !houses[hi].includes(j)) { cand[j] = false; changed = true; }
        }
      }
    }
    if (changed) continue;
    // A spot that would leave some row / column / region with nowhere to go can't be right
    for (let i = 0; i < NN; i++) {
      if (!cand[i] || placed[i]) continue;
      const kill = killedBy(i);
      const mine = new Set(houseOf[i]);
      for (let hi = 0; hi < houses.length; hi++) {
        if (done[hi] || mine.has(hi)) continue;
        if (!houses[hi].some((j) => cand[j] && !placed[j] && !kill.has(j))) { cand[i] = false; changed = true; break; }
      }
    }
  }
  return count === N;
}

// ---------- Generation ----------

function placeSolution(rng, size) {
  const cols = new Array(size).fill(-1);
  const used = new Array(size).fill(false);
  const rec = (r) => {
    if (r === size) return true;
    const order = shuffle(rng, Array.from({ length: size }, (_, i) => i));
    for (const c of order) {
      if (used[c] || (r > 0 && Math.abs(c - cols[r - 1]) <= 1)) continue;
      used[c] = true; cols[r] = c;
      if (rec(r + 1)) return true;
      used[c] = false; cols[r] = -1;
    }
    return false;
  };
  rec(0);
  return cols;
}

const nbrs4 = (size, i) => {
  const r = Math.floor(i / size), c = i % size, out = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
};

function growRegions(rng, size, solution) {
  const NN = size * size;
  const regions = new Array(NN).fill(-1);
  const sizes = new Array(size).fill(1);
  for (let r = 0; r < size; r++) regions[r * size + solution[r]] = r;
  let left = NN - size;
  while (left > 0) {
    // Frontier: unassigned cells next to a region
    const frontier = [];
    for (let i = 0; i < NN; i++) {
      if (regions[i] !== -1) continue;
      if (nbrs4(size, i).some((j) => regions[j] !== -1)) frontier.push(i);
    }
    let cell, reg;
    if (rng() < 0.55) {
      // Pick a region (smaller ones more often) and grow it by one cell
      const growable = [];
      for (const i of frontier) for (const j of nbrs4(size, i)) if (regions[j] !== -1 && !growable.includes(regions[j])) growable.push(regions[j]);
      growable.sort((a, b) => a - b);
      let total = 0;
      const w = growable.map((g) => { const x = 1 / sizes[g]; total += x; return x; });
      let pick = rng() * total, k = 0;
      while (k < growable.length - 1 && pick >= w[k]) { pick -= w[k]; k++; }
      reg = growable[k];
      const opts = frontier.filter((i) => nbrs4(size, i).some((j) => regions[j] === reg));
      cell = opts[randInt(rng, opts.length)];
    } else {
      cell = frontier[randInt(rng, frontier.length)];
      const opts = [];
      for (const j of nbrs4(size, cell)) if (regions[j] !== -1 && !opts.includes(regions[j])) opts.push(regions[j]);
      opts.sort((a, b) => a - b);
      reg = opts[randInt(rng, opts.length)];
    }
    regions[cell] = reg; sizes[reg]++; left--;
  }
  return regions;
}

function contiguousWithout(size, regions, reg, removed) {
  const cells = [];
  for (let i = 0; i < size * size; i++) if (regions[i] === reg && i !== removed) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    for (const j of nbrs4(size, i)) {
      if (j !== removed && regions[j] === reg && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === cells.length;
}

// Change regions until the planted solution is the only one. Returns false if stuck.
function makeUnique(rng, size, regions, solution) {
  const isSol = (i) => solution[Math.floor(i / size)] === i % size;
  for (let step = 0; step < 60; step++) {
    const other = otherSolution(size, regions, solution);
    if (!other) return true;
    // Move one of the other solution's cells into a neighbouring region: that region then holds
    // two of its plants, so it stops working. The real solution doesn't use that cell, so it still works.
    const cells = [];
    for (let r = 0; r < size; r++) if (other[r] !== solution[r]) cells.push(r * size + other[r]);
    shuffle(rng, cells);
    let moved = false;
    for (const x of cells) {
      if (isSol(x)) continue;
      const from = regions[x];
      const targets = [];
      for (const j of nbrs4(size, x)) if (regions[j] !== from && !targets.includes(regions[j])) targets.push(regions[j]);
      targets.sort((a, b) => a - b);
      shuffle(rng, targets);
      if (!targets.length || !contiguousWithout(size, regions, from, x)) continue;
      regions[x] = targets[0];
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return countSolutions(size, regions, 2) === 1;
}

function regionSizes(size, regions) {
  const s = new Array(size).fill(0);
  for (const g of regions) s[g]++;
  return s;
}

/**
 * makePuzzle(seedString, size) → { size, regions, solution }
 *   regions: flat row-major array (size*size) of region ids 0..size-1
 *   solution: solution[row] = column
 * Deterministic for a given seed + size. Sizes 5–9.
 */
function makePuzzle(seedString, size) {
  const N = Math.max(5, Math.min(9, Math.floor(Number(size) || 8)));
  const rng = seededRng(`${seedString}|${N}`);
  // Best: solvable by plain deduction, no 1-cell region, at most two tiny (1–2 cell) regions.
  // Next best: the same but with one 1-cell region. Last resort: any unique puzzle.
  let good = null, fallback = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const solution = placeSolution(rng, N);
    const regions = growRegions(rng, N, solution);
    if (!makeUnique(rng, N, regions, solution)) continue;
    const sizes = regionSizes(N, regions);
    const ones = sizes.filter((s) => s === 1).length;
    const tiny = sizes.filter((s) => s <= 2).length;
    if (ones > 1) continue; // never more than one single-cell region
    // Shuffle the region ids so a colour never hints at a row (region k was grown from row k)
    const perm = shuffle(rng, Array.from({ length: N }, (_, i) => i));
    const out = { size: N, regions: regions.map((g) => perm[g]), solution };
    if (tiny <= 2 && solvesByLogic(N, out.regions)) {
      if (ones === 0) return out;
      if (!good) good = out;
    } else if (!fallback) fallback = out;
    if (attempt >= 40 && good) return good;
    if (attempt >= 80 && fallback) return fallback;
  }
  return good || fallback;
}

// ---------- Daily puzzle ----------

/** dailySeed('YYYY-MM-DD') → seed string for that day's puzzle (same for everyone). */
function dailySeed(dateStr) {
  return `plantdoku-daily-${String(dateStr).slice(0, 10)}`;
}

/**
 * dailySize('YYYY-MM-DD') → 7 on Monday and Tuesday (easier start to the week), 8 the rest of the week.
 */
function dailySize(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
  return day === 1 || day === 2 ? 7 : 8;
}

// ---------- Colours (index = region id) ----------
// Light mode: soft pastels, dark text reads on all of them. Order puts the most different colours
// first, since smaller grids use only the first N. Hue AND lightness vary to help colour-blind players.
const REGION_COLORS = [
  '#F4A6A6', // rose
  '#FBE89B', // butter yellow
  '#A3C4F3', // sky blue
  '#B6DE98', // leaf green
  '#CDB4F0', // lavender
  '#F8C68A', // apricot
  '#94D8CC', // aqua
  '#D4D4D8', // stone grey
  '#F5BCE0', // orchid pink
];
// Dark mode: muted, darker versions in the same order; light text reads on all of them.
const REGION_COLORS_DARK = [
  '#8E4B4B', // rose
  '#857536', // butter yellow
  '#3F5F8F', // sky blue
  '#4C7A3A', // leaf green
  '#68508F', // lavender
  '#97602A', // apricot
  '#2F7A70', // aqua
  '#5A5A63', // stone grey
  '#8C4A78', // orchid pink
];


function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function okDate(date: any): string | null {
    const d = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const utc = new Date().toISOString().slice(0, 10);
    // Any time zone's "today" is within a day of UTC's
    return [addDays(utc, -1), utc, addDays(utc, 1)].includes(d) ? d : null;
}
function h32(s: string): number {
    let x = 0;
    for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return x;
}
const ADJ = ['Mossy', 'Sunny', 'Leafy', 'Dewy', 'Sprouty', 'Breezy', 'Misty', 'Rooty', 'Petal', 'Fuzzy', 'Spiky', 'Bloomy', 'Cozy', 'Happy', 'Sleepy', 'Zippy'];
const NOUN = ['Fern', 'Cactus', 'Pothos', 'Monstera', 'Violet', 'Aloe', 'Ivy', 'Orchid', 'Basil', 'Tulip', 'Daisy', 'Pilea', 'Hoya', 'Sprout', 'Bonsai', 'Clover'];
function makeName(seed: string): string {
    const x = h32('name:' + seed);
    return `${ADJ[x % 16]} ${NOUN[(x >>> 4) % 16]} ${10 + ((x >>> 8) % 90)}`;
}
function nameOf(user: any): string {
    return user?.plantdoku_name || makeName(String(user?.id || user?.email));
}
function cleanPlants(size: number, plants: any): [number, number][] {
    if (!Array.isArray(plants)) return [];
    const out: [number, number][] = [];
    const seen = new Set<number>();
    for (const p of plants.slice(0, 20)) {
        const r = Number(p?.[0]), c = Number(p?.[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= size || c >= size) continue;
        if (seen.has(r * size + c)) continue;
        seen.add(r * size + c);
        out.push([r, c]);
    }
    return out;
}
const activeMs = (run: any, now: number) =>
    (Number(run.active_ms) || 0) + (run.running_since ? Math.min(MAX_STRETCH_MS, Math.max(0, now - Date.parse(run.running_since))) : 0);

async function boardFor(db: any, date: string, userId: string) {
    const rows = ((await db.PlantdokuRun.filter({ date }, 'seconds', 5000)) || [])
        .filter((r: any) => typeof r.seconds === 'number' && r.finished_at);
    rows.sort((a: any, b: any) => a.seconds - b.seconds || String(a.finished_at).localeCompare(String(b.finished_at)));
    const total = rows.length;
    const idx = rows.findIndex((r: any) => r.user_id === userId);
    const row = (r: any, i: number) => ({ rank: i + 1, name: r.board_name || makeName(r.user_id), seconds: r.seconds, hints: r.hints || 0, me: r.user_id === userId });
    const sorted = rows.map((r: any) => r.seconds);
    const median = total ? sorted[Math.floor((total - 1) / 2)] : null;
    let faster_than = null;
    if (idx >= 0 && total > 1) {
        const slower = rows.filter((r: any) => r.seconds > rows[idx].seconds).length;
        faster_than = Math.round((100 * slower) / (total - 1));
    }
    return {
        total,
        median,
        top: rows.slice(0, 5).map(row),
        me: idx >= 0 ? row(rows[idx], idx) : null,
        faster_than,
    };
}

async function statsFor(db: any, userId: string, today: string) {
    const runs = ((await db.PlantdokuRun.filter({ user_id: userId }, '-date', 400)) || []).filter((r: any) => r.finished_at);
    const days = new Set(runs.map((r: any) => String(r.date).slice(0, 10)));
    let streak = 0;
    let d = days.has(today) ? today : addDays(today, -1);
    while (days.has(d)) { streak++; d = addDays(d, -1); }
    let best = 0;
    let run = 0;
    const sortedDays = [...days].sort();
    for (let i = 0; i < sortedDays.length; i++) {
        run = i && addDays(sortedDays[i - 1], 1) === sortedDays[i] ? run + 1 : 1;
        best = Math.max(best, run);
    }
    const times = runs.map((r: any) => r.seconds).filter((s: any) => typeof s === 'number');
    return {
        solved: runs.length,
        streak,
        best_streak: best,
        best_time: times.length ? Math.min(...times) : null,
        avg_time: times.length ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length) : null,
    };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const db = base44.asServiceRole.entities;
        const now = Date.now();

        // Owner tools: see or remove leaderboard entries
        const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
        if (body.action === 'remove' || body.action === 'list') {
            if (!sweepKey || body.key !== sweepKey) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (body.action === 'list') {
                const rows = (await db.PlantdokuRun.filter({ date: String(body.date || '').slice(0, 10) }, 'seconds', 5000)) || [];
                return Response.json({ success: true, runs: rows.map((r: any) => ({ id: r.id, name: r.board_name, email: r.user_email, seconds: r.seconds, raw: r.raw_seconds, hints: r.hints, finished_at: r.finished_at })) });
            }
            const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 200);
            const res = await Promise.allSettled(ids.map((id: string) => db.PlantdokuRun.delete(id)));
            return Response.json({ success: true, removed: res.filter((r) => r.status === 'fulfilled').length });
        }

        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        if (body.action === 'new_name') {
            const n = (Number(user.plantdoku_name_n) || 0) + 1;
            const name = makeName(`${user.id}:${n}`);
            await db.User.update(user.id, { plantdoku_name: name, plantdoku_name_n: n });
            // Today's (and yesterday's) entries show the new name too
            const runs = (await db.PlantdokuRun.filter({ user_id: user.id }, '-date', 2)) || [];
            await Promise.allSettled(runs.map((r: any) => db.PlantdokuRun.update(r.id, { board_name: name })));
            return Response.json({ success: true, name });
        }

        const date = okDate(body.date);
        if (!date) return Response.json({ error: 'bad_date' }, { status: 400 });
        const size = dailySize(date);
        let run = ((await db.PlantdokuRun.filter({ user_id: user.id, date })) || [])[0] || null;

        if (body.action === 'board') {
            return Response.json({ success: true, date, board: await boardFor(db, date, user.id), name: nameOf(user) });
        }

        if (body.action === 'peek') {
            const done = !!run?.finished_at;
            return Response.json({
                success: true, date, size,
                started: !!run,
                finished: done,
                elapsed_ms: run ? (done ? (run.raw_seconds || 0) * 1000 : activeMs(run, now)) : 0,
                hints: run?.hints || 0,
                seconds: done ? run.seconds : null,
                name: nameOf(user),
                ...(done ? { board: await boardFor(db, date, user.id), stats: await statsFor(db, user.id, date) } : {}),
            });
        }

        if (body.action === 'start') {
            if (!run) {
                run = await db.PlantdokuRun.create({
                    user_id: user.id, user_email: user.email, date, size,
                    started_at: new Date(now).toISOString(), active_ms: 0,
                    running_since: new Date(now).toISOString(), hints: 0, board_name: nameOf(user),
                });
            } else if (!run.finished_at && !run.running_since) {
                run = { ...run, running_since: new Date(now).toISOString() };
                await db.PlantdokuRun.update(run.id, { running_since: run.running_since });
            }
            const done = !!run.finished_at;
            return Response.json({
                success: true, date, size, started: true,
                elapsed_ms: done ? (run.raw_seconds || 0) * 1000 : activeMs(run, now),
                hints: run.hints || 0,
                finished: done,
                seconds: done ? run.seconds : null,
                name: nameOf(user),
                ...(done ? { board: await boardFor(db, date, user.id), stats: await statsFor(db, user.id, date) } : {}),
            });
        }

        if (!run) return Response.json({ error: 'not_started' }, { status: 400 });

        if (body.action === 'pause') {
            if (!run.finished_at && run.running_since) {
                await db.PlantdokuRun.update(run.id, { active_ms: activeMs(run, now), running_since: null });
            }
            return Response.json({ success: true });
        }

        if (body.action === 'hint') {
            if (run.finished_at) return Response.json({ error: 'finished' }, { status: 400 });
            const puzzle = makePuzzle(dailySeed(date), size);
            const hint = hintFor(size, puzzle.regions, puzzle.solution, cleanPlants(size, body.plants));
            if (!hint) return Response.json({ success: true, hint: null, hints: run.hints || 0 });
            const hints = (run.hints || 0) + 1;
            await db.PlantdokuRun.update(run.id, { hints });
            return Response.json({ success: true, hint, hints });
        }

        if (body.action === 'finish') {
            if (run.finished_at) {
                return Response.json({ success: true, already: true, seconds: run.seconds, raw_seconds: run.raw_seconds, hints: run.hints || 0, board: await boardFor(db, date, user.id), stats: await statsFor(db, user.id, date) });
            }
            const puzzle = makePuzzle(dailySeed(date), size);
            const plants = cleanPlants(size, body.plants);
            if (!isSolved(size, puzzle.regions, plants)) return Response.json({ error: 'not_solved' }, { status: 400 });
            const raw = Math.round(activeMs(run, now) / 1000);
            if (raw < 3) return Response.json({ error: 'too_fast' }, { status: 400 });
            const seconds = raw + HINT_SECONDS * (run.hints || 0);
            await db.PlantdokuRun.update(run.id, {
                finished_at: new Date(now).toISOString(), raw_seconds: raw, seconds,
                active_ms: activeMs(run, now), running_since: null, board_name: nameOf(user),
            });
            return Response.json({ success: true, seconds, raw_seconds: raw, hints: run.hints || 0, board: await boardFor(db, date, user.id), stats: await statsFor(db, user.id, date) });
        }

        return Response.json({ error: 'unknown_action' }, { status: 400 });
    } catch (error) {
        console.error('plantdoku', (error as Error)?.message);
        return Response.json({ error: (error as Error)?.message || 'error' }, { status: 500 });
    }
});
