// Mini Garden engine: a 6×6 Sudoku with plants instead of numbers.
// Every row, every column and every 2×3 box gets each of the 6 plants once.
// Values 0–5 (PlantIcon index), null = empty. Cell index = row * 6 + col.
// Pure module with its own seeded random (same algorithm as seededRng in common.js), so a
// seed always gives the same puzzle on every phone.

export const SIZE = 6;
export const BOX_ROWS = 2;
export const BOX_COLS = 3;
export const LEVELS = { easy: 18, medium: 14, hard: 10 }; // target number of given squares

// Same order as PLANTS in src/components/games/PlantIcon.jsx (indexes 0–5)
// Six plants with different shapes (not just different colors), so they're easy to tell apart.
export const PLANT_ICONS = [0, 1, 2, 3, 6, 7]; // indexes into PLANTS in components/games/PlantIcon
export const PLANT_NAMES = ['red flower', 'sunflower', 'blue tulip', 'cactus', 'succulent', 'daisy'];
// Slot by slot with PLANT_NAMES (slots 4 and 5 are PlantIcon 6 and 7: the succulent and the white daisy)
export const PLANT_PLURALS = ['red flowers', 'sunflowers', 'blue tulips', 'cacti', 'succulents', 'daisies'];

// ---------- Seeded random (xmur3 + sfc32) ----------
function seededRng(seedString) {
  const s = String(seedString);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const seed = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
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
  for (let i = 0; i < 12; i++) next();
  return next;
}
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// ---------- Geometry ----------
export const rowOf = (i) => Math.floor(i / SIZE);
export const colOf = (i) => i % SIZE;
export const boxOf = (i) => Math.floor(rowOf(i) / BOX_ROWS) * (SIZE / BOX_COLS) + Math.floor(colOf(i) / BOX_COLS);
const ROWS = Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
const COLS = Array.from({ length: SIZE }, (_, c) => Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
const BOXES = Array.from({ length: SIZE }, (_, b) => {
  const out = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (boxOf(i) === b) out.push(i);
  return out;
});
const PEERS = Array.from({ length: SIZE * SIZE }, (_, i) => {
  const s = new Set([...ROWS[rowOf(i)], ...COLS[colOf(i)], ...BOXES[boxOf(i)]]);
  s.delete(i);
  return [...s];
});
export const BOX_NAMES = ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'];

const isEmpty = (v) => v === null || v === undefined || v < 0;

// Bitmask of values still possible at cell i
function candidates(grid, i) {
  let used = 0;
  for (const j of PEERS[i]) if (!isEmpty(grid[j])) used |= 1 << grid[j];
  return ~used & 0b111111;
}

// ---------- Solving ----------
/** countSolutions(grid, limit = 2) → number of ways to finish the grid (stops at limit). */
export function countSolutions(grid, limit = 2) {
  const g = grid.map((v) => (isEmpty(v) ? -1 : v));
  // A given that already clashes means no solution
  for (let i = 0; i < g.length; i++) {
    if (g[i] < 0) continue;
    for (const j of PEERS[i]) if (g[j] === g[i]) return 0;
  }
  let count = 0;
  const rec = () => {
    // Most constrained empty cell first
    let best = -1, bestMask = 0, bestN = 99;
    for (let i = 0; i < g.length; i++) {
      if (g[i] >= 0) continue;
      const m = candidates(g, i);
      let n = 0;
      for (let v = 0; v < SIZE; v++) if (m & (1 << v)) n++;
      if (n === 0) return;
      if (n < bestN) { bestN = n; best = i; bestMask = m; if (n === 1) break; }
    }
    if (best === -1) { count++; return; }
    for (let v = 0; v < SIZE && count < limit; v++) {
      if (!(bestMask & (1 << v))) continue;
      g[best] = v;
      rec();
      g[best] = -1;
    }
  };
  rec();
  return count;
}

function fullSolution(rng) {
  const g = new Array(SIZE * SIZE).fill(-1);
  const rec = (i) => {
    if (i === g.length) return true;
    const m = candidates(g, i);
    for (const v of shuffle(rng, [0, 1, 2, 3, 4, 5])) {
      if (!(m & (1 << v))) continue;
      g[i] = v;
      if (rec(i + 1)) return true;
      g[i] = -1;
    }
    return false;
  };
  rec(0);
  return g;
}

/**
 * makePuzzle(seed, level = 'medium') → { level, givens, solution }
 *   givens: 36 values (0–5) or null for the squares the player fills
 *   solution: 36 values
 * Same seed + level → same puzzle. Always exactly one solution.
 */
export function makePuzzle(seed, level = 'medium') {
  const lv = LEVELS[level] ? level : 'medium';
  const target = LEVELS[lv];
  const rng = seededRng(`${seed}|${lv}`);
  const solution = fullSolution(rng);
  const grid = solution.slice();
  let givens = grid.length;
  for (const i of shuffle(rng, Array.from({ length: grid.length }, (_, k) => k))) {
    if (givens <= target) break;
    const keep = grid[i];
    grid[i] = -1;
    if (countSolutions(grid, 2) === 1) givens--;
    else grid[i] = keep;
  }
  return { level: lv, givens: grid.map((v) => (v < 0 ? null : v)), solution };
}

/** dailySeed('YYYY-MM-DD') → seed for that day's puzzle (same for everyone). The daily is 'medium'. */
export function dailySeed(dateStr) {
  return `minigarden-daily-${String(dateStr).slice(0, 10)}`;
}
export const DAILY_LEVEL = 'medium';

// ---------- Checks for the UI ----------
const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
/**
 * findConflicts(grid) → { cells: Set of cell indexes that break a rule, problems: [plain text] }
 * e.g. "Two sunflowers in row 2", "Two cacti in column 4", "Two blue tulips in the top-left box"
 */
export function findConflicts(grid) {
  const cells = new Set();
  const problems = [];
  const check = (group, where) => {
    const byValue = {};
    for (const i of group) {
      const v = grid[i];
      if (isEmpty(v)) continue;
      (byValue[v] = byValue[v] || []).push(i);
    }
    for (const v of Object.keys(byValue)) {
      const list = byValue[v];
      if (list.length < 2) continue;
      list.forEach((i) => cells.add(i));
      problems.push(`${NUMBER_WORDS[list.length] || list.length} ${PLANT_PLURALS[v]} in ${where}`);
    }
  };
  ROWS.forEach((g, r) => check(g, `row ${r + 1}`));
  COLS.forEach((g, c) => check(g, `column ${c + 1}`));
  BOXES.forEach((g, b) => check(g, `the ${BOX_NAMES[b]} box`));
  return { cells, problems };
}

/** isSolved(grid, solution?) → every square filled and no rule broken (and matches solution if given). */
export function isSolved(grid, solution) {
  if (!Array.isArray(grid) || grid.length !== SIZE * SIZE) return false;
  if (grid.some(isEmpty)) return false;
  if (findConflicts(grid).cells.size) return false;
  if (solution) for (let i = 0; i < grid.length; i++) if (grid[i] !== solution[i]) return false;
  return true;
}

/**
 * hintFor(grid, solution) → { type: 'wrong', cell } for a plant in the wrong square, or
 * { type: 'place', cell, value } for the easiest empty square to fill (fewest options), or null.
 */
export function hintFor(grid, solution) {
  for (let i = 0; i < grid.length; i++) {
    if (!isEmpty(grid[i]) && grid[i] !== solution[i]) return { type: 'wrong', cell: i };
  }
  const g = grid.map((v) => (isEmpty(v) ? -1 : v));
  let best = null, bestN = 99;
  for (let i = 0; i < g.length; i++) {
    if (g[i] >= 0) continue;
    const m = candidates(g, i);
    let n = 0;
    for (let v = 0; v < SIZE; v++) if (m & (1 << v)) n++;
    if (n < bestN) { bestN = n; best = i; }
  }
  return best === null ? null : { type: 'place', cell: best, value: solution[best] };
}
