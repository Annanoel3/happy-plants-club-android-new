// Vine engine: draw one vine (path) that starts on 1, passes the numbered flowers in order,
// ends on the biggest number and fills every square exactly once. Moves are up/down/left/right.
// Cell index = row * size + col.
// Pure module with its own seeded random (same algorithm as seededRng in games/common.js),
// so a seed always gives the same puzzle on every phone. No imports, so node can test it.

export const LEVELS = {
  starter: { size: 5, numbers: 5, maxNumbers: 10, walls: 0, maxWalls: 0, work: 40000, perTry: 15000, label: 'Starter' },
  easy: { size: 6, numbers: 6, maxNumbers: 12, walls: 0, maxWalls: 2, work: 40000, perTry: 15000, label: 'Easy' },
  medium: { size: 7, numbers: 7, maxNumbers: 13, walls: 2, maxWalls: 8, work: 40000, perTry: 12000, label: 'Medium' },
  hard: { size: 8, numbers: 8, maxNumbers: 14, walls: 6, maxWalls: 16, wallBias: 1, work: 40000, perTry: 10000, label: 'Hard' },
  daily: { size: 6, numbers: 6, maxNumbers: 12, walls: 0, maxWalls: 2, work: 40000, perTry: 15000, label: 'Daily' },
};
export const DAILY_LEVEL = 'daily';
export const PRACTICE_LEVELS = ['starter', 'easy', 'medium', 'hard'];

/** dailySeed('YYYY-MM-DD') → seed for that day's puzzle (same for everyone) */
export function dailySeed(dateStr) {
  return `vine-daily-${String(dateStr).slice(0, 10)}`;
}

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

// ---------- Grid helpers ----------
const NBR_CACHE = {};
/** neighbors(size)[cell] → cells up/down/left/right */
export function neighbors(size) {
  if (NBR_CACHE[size]) return NBR_CACHE[size];
  const out = [];
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size), c = i % size, list = [];
    if (r > 0) list.push(i - size);
    if (r < size - 1) list.push(i + size);
    if (c > 0) list.push(i - 1);
    if (c < size - 1) list.push(i + 1);
    out.push(list);
  }
  NBR_CACHE[size] = out;
  return out;
}
export function adjacent(size, a, b) {
  const ra = Math.floor(a / size), ca = a % size, rb = Math.floor(b / size), cb = b % size;
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
}

/** Walls are stored as [a, b] pairs (a < b) of next-door squares the vine can't cross between */
export const wallKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export function wallSet(puz) {
  if (!puz._wallSet) {
    const set = new Set((puz.walls || []).map(([a, b]) => wallKey(a, b)));
    Object.defineProperty(puz, '_wallSet', { value: set, enumerable: false });
  }
  return puz._wallSet;
}
/** Neighbor lists for this puzzle (walls removed) */
function openNeighbors(puz) {
  const base = neighbors(puz.size);
  if (!puz.walls || !puz.walls.length) return base;
  const ws = wallSet(puz);
  return base.map((list, i) => list.filter((j) => !ws.has(wallKey(i, j))));
}
/** Next door and no wall between? */
export function canStep(puz, a, b) {
  return adjacent(puz.size, a, b) && !wallSet(puz).has(wallKey(a, b));
}

// ---------- A random path through every square ("backbite" shuffling of a zigzag) ----------
function randomFullPath(size, rng) {
  const n = size * size;
  const nb = neighbors(size);
  const path = [];
  const flip = rng() < 0.5;
  for (let r = 0; r < size; r++) {
    for (let k = 0; k < size; k++) {
      const c = r % 2 ? size - 1 - k : k;
      path.push(flip ? c * size + r : r * size + c);
    }
  }
  const pos = new Int16Array(n);
  path.forEach((cell, i) => { pos[cell] = i; });
  const rev = (from, to) => { // reverse path[from..to] in place
    while (from < to) {
      const t = path[from]; path[from] = path[to]; path[to] = t;
      pos[path[from]] = from; pos[path[to]] = to;
      from++; to--;
    }
  };
  const steps = n * 80;
  for (let s = 0; s < steps; s++) {
    if (rng() < 0.5) {
      // bite from the front: link path[0] to a neighbor x, cut just before x
      const list = nb[path[0]];
      const x = list[Math.floor(rng() * list.length)];
      const k = pos[x];
      if (k <= 1) continue;
      rev(0, k - 1);
    } else {
      const list = nb[path[n - 1]];
      const x = list[Math.floor(rng() * list.length)];
      const k = pos[x];
      if (k >= n - 2) continue;
      rev(k + 1, n - 1);
    }
  }
  return path;
}

// ---------- Solver (used to give each puzzle just one answer where it can, and for hints) ----------
/**
 * Finds up to `limit` full answers that start with `prefix` (default: just the 1).
 * Returns { solutions, exhausted, nodes } — exhausted = gave up (too much work) before finishing.
 */
export function solve(puz, { prefix = null, limit = 2, budget = 60000 } = {}) {
  const { size, nums, waypoints } = puz;
  const n = size * size;
  const nb = openNeighbors(puz);
  const K = waypoints.length;
  const endCell = waypoints[K - 1];
  const visited = new Uint8Array(n);
  const start = prefix && prefix.length ? prefix : [waypoints[0]];
  const path = [];
  let nextWp = 0;
  for (const cell of start) {
    if (visited[cell]) return { solutions: [], exhausted: false, nodes: 0 };
    if (nums[cell]) {
      if (nums[cell] - 1 !== nextWp) return { solutions: [], exhausted: false, nodes: 0 };
      nextWp++;
    }
    visited[cell] = 1;
    path.push(cell);
  }
  if (path[0] !== waypoints[0]) return { solutions: [], exhausted: false, nodes: 0 };
  for (let i = 1; i < path.length; i++) if (!canStep(puz, path[i - 1], path[i])) return { solutions: [], exhausted: false, nodes: 0 };

  const solutions = [];
  let nodes = 0;
  let exhausted = false;
  const queue = new Int16Array(n);
  const seen = new Uint8Array(n);

  // Every empty square is still reachable from the vine's end?
  const connected = (head, left) => {
    if (left === 0) return true;
    seen.fill(0);
    let qh = 0, qt = 0, got = 0;
    for (const w of nb[head]) if (!visited[w] && !seen[w]) { seen[w] = 1; queue[qt++] = w; }
    while (qh < qt) {
      const u = queue[qh++];
      got++;
      for (const w of nb[u]) if (!visited[w] && !seen[w]) { seen[w] = 1; queue[qt++] = w; }
    }
    return got === left;
  };
  // Squares next to the old end lost a way in or out. A middle square needs 2, the last flower 1.
  const deadAround = (oldHead, head) => {
    for (const u of nb[oldHead]) {
      if (visited[u]) continue;
      let deg = 0;
      for (const w of nb[u]) if (!visited[w] || w === head) deg++;
      if (deg < (u === endCell ? 1 : 2)) return true;
    }
    return false;
  };

  // The next number can still be reached without going through a later number?
  const nextReachable = (head) => {
    if (nextWp >= K) return true;
    const target = waypoints[nextWp];
    seen.fill(0);
    let qh = 0, qt = 0;
    queue[qt++] = head; seen[head] = 1;
    while (qh < qt) {
      const u = queue[qh++];
      for (const w of nb[u]) {
        if (seen[w] || visited[w]) continue;
        if (w === target) return true;
        if (nums[w]) continue; // a later number blocks the way
        seen[w] = 1; queue[qt++] = w;
      }
    }
    return false;
  };

  const dfs = (head, count) => {
    if (count === n) {
      if (head === endCell && nextWp === K) solutions.push(path.slice());
      return;
    }
    if (++nodes > budget) { exhausted = true; return; }
    for (const v of nb[head]) {
      if (visited[v]) continue;
      if (nums[v] && nums[v] - 1 !== nextWp) continue;
      if (v === endCell && count + 1 !== n) continue;
      visited[v] = 1;
      path.push(v);
      if (nums[v]) nextWp++;
      if (!deadAround(head, v) && connected(v, n - count - 1) && nextReachable(v)) dfs(v, count + 1);
      if (nums[v]) nextWp--;
      path.pop();
      visited[v] = 0;
      if (solutions.length >= limit || exhausted) return;
    }
  };
  const head = path[path.length - 1];
  if (path.length === n) {
    if (head === endCell && nextWp === K) solutions.push(path.slice());
  } else if (connected(head, n - path.length)) {
    dfs(head, path.length);
  }
  return { solutions, exhausted, nodes };
}

function buildNums(n, path, idxs) {
  const nums = new Array(n).fill(0);
  const waypoints = idxs.map((pi) => path[pi]);
  waypoints.forEach((cell, k) => { nums[cell] = k + 1; });
  return { nums, waypoints };
}

/**
 * makePuzzle(seed, levelKey) → { size, solution, nums, waypoints, walls, unique, level }
 *  nums[cell] = flower number (1…K) or 0; waypoints[k] = cell of number k+1;
 *  walls = [[a, b], …] next-door squares with a wall between them;
 *  unique = proven to have just one answer (true for nearly all boards up to 7×7, most 8×8).
 *  Any vine that follows the rules counts as solved, even if a puzzle has more than one answer.
 */
export function makePuzzle(seed, levelKey = 'easy') {
  const lv = LEVELS[levelKey] || LEVELS.easy;
  const size = lv.size;
  const n = size * size;
  const rng = seededRng(`${seed}|${levelKey}`);
  const path = randomFullPath(size, rng);
  const onPath = new Set();
  for (let i = 1; i < n; i++) onPath.add(wallKey(path[i - 1], path[i]));
  // Every edge the answer doesn't use could be a wall
  const freeEdges = [];
  const nb = neighbors(size);
  for (let a = 0; a < n; a++) for (const b of nb[a]) if (a < b && !onPath.has(wallKey(a, b))) freeEdges.push([a, b]);

  // Spread the starting numbers along the path, with a little wobble
  const K = Math.max(2, Math.min(lv.numbers, n));
  const idxSet = new Set([0, n - 1]);
  const gap = (n - 1) / (K - 1);
  for (let j = 1; j < K - 1; j++) {
    let pi = Math.round(j * gap + (rng() - 0.5) * gap * 0.6);
    pi = Math.max(1, Math.min(n - 2, pi));
    while (idxSet.has(pi) && pi < n - 2) pi++;
    idxSet.add(pi);
  }
  let idxs = [...idxSet].sort((a, b) => a - b);
  // A few starting walls on bigger boards
  const walls = [];
  const wallKeys = new Set();
  const addWall = (e) => { walls.push(e); wallKeys.add(wallKey(e[0], e[1])); };
  for (let w = 0; w < (lv.walls || 0) && freeEdges.length; w++) {
    const pick = freeEdges[Math.floor(rng() * freeEdges.length)];
    if (!wallKeys.has(wallKey(pick[0], pick[1]))) addWall(pick);
  }

  // Keep adding numbers (or walls) until there's only one way to solve it, up to a cap per level.
  // Work is counted in search steps (not seconds), so the same seed gives the same puzzle on every phone.
  let unique = false;
  let work = lv.work;
  const build = () => ({ size, ...buildNums(n, path, idxs), walls: walls.slice() });
  for (let tries = 0; tries < 80 && work > 0; tries++) {
    const res = solve(build(), { limit: 24, budget: Math.min(work, lv.perTry) });
    work -= res.nodes;
    const alts = res.solutions.filter((sol) => sol.some((c, i) => c !== path[i]));
    if (!res.exhausted && !alts.length) { unique = true; break; }
    const canNumber = idxs.length < lv.maxNumbers;
    const canWall = walls.length < (lv.maxWalls || 0);
    if (!canNumber && !canWall) break;
    let best = null, bestScore = -1;
    if (alts.length) {
      const altPos = alts.map((sol) => { const p = new Int16Array(n); sol.forEach((c, i) => { p[c] = i; }); return p; });
      if (canNumber) {
        for (let pi = 1; pi < n - 1; pi++) {
          if (idxs.includes(pi)) continue;
          const cell = path[pi];
          let lo = 0, hi = n - 1; // the numbers just before and after this spot on the answer
          for (const x of idxs) { if (x < pi) lo = x; else if (x > pi) { hi = x; break; } }
          let kills = 0;
          for (const ap of altPos) if (ap[cell] < ap[path[lo]] || ap[cell] > ap[path[hi]]) kills++; // out of order there
          if (!kills) continue;
          const score = kills * 100 + Math.min(pi - lo, hi - pi) + rng();
          if (score > bestScore) { bestScore = score; best = { num: pi }; }
        }
      }
      if (canWall) {
        // A wall on a step the other answers take (and the real one doesn't)
        const used = new Map();
        for (const sol of alts) {
          for (let i = 1; i < n; i++) {
            const k = wallKey(sol[i - 1], sol[i]);
            if (!onPath.has(k) && !wallKeys.has(k)) used.set(k, (used.get(k) || 0) + 1);
          }
        }
        for (const [k, kills] of used) {
          const score = kills * 100 + 50 * (lv.wallBias || 0) + rng();
          if (score > bestScore) { bestScore = score; best = { wall: k.split('-').map(Number) }; }
        }
      }
    }
    if (!best) {
      // The search ran out of steps before settling it: pin the middle of the longest stretch
      let bi = 0, bestLen = 0;
      for (let i = 1; i < idxs.length; i++) {
        const len = idxs[i] - idxs[i - 1];
        if (len > bestLen) { bestLen = len; bi = i; }
      }
      if (!canNumber || bestLen < 2) break;
      best = { num: Math.floor((idxs[bi - 1] + idxs[bi]) / 2) };
    }
    if (best.wall) addWall(best.wall);
    else idxs = [...idxs, best.num].sort((a, b) => a - b);
  }
  walls.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { size, solution: path, ...buildNums(n, path, idxs), walls, unique, level: levelKey };
}

// ---------- Checks for the UI ----------
/** The number the vine needs to reach next (1-based), given the vine so far */
export function nextNumber(puz, path) {
  let k = 0;
  for (const c of path) if (puz.nums[c]) k++;
  return k + 1;
}

/**
 * Can the vine grow from its end onto `cell`? → { ok, why }
 * why: 'start' (must start on 1), 'far' (not next door), 'wall', 'used', 'order' (a later number), 'ended'
 */
export function canGrow(puz, path, cell) {
  const { size, nums, waypoints } = puz;
  if (!path.length) return cell === waypoints[0] ? { ok: true } : { ok: false, why: 'start' };
  const end = path[path.length - 1];
  if (end === waypoints[waypoints.length - 1]) return { ok: false, why: 'ended' };
  if (!adjacent(size, end, cell)) return { ok: false, why: 'far' };
  if (wallSet(puz).has(wallKey(end, cell))) return { ok: false, why: 'wall' };
  if (path.includes(cell)) return { ok: false, why: 'used' };
  if (nums[cell] && nums[cell] !== nextNumber(puz, path)) return { ok: false, why: 'order' };
  return { ok: true };
}

/** Is this vine a full, correct answer? (checked by the rules, not against one stored answer) */
export function isSolved(puz, path) {
  const { size, nums, waypoints } = puz;
  const n = size * size;
  if (!Array.isArray(path) || path.length !== n) return false;
  if (path[0] !== waypoints[0] || path[n - 1] !== waypoints[waypoints.length - 1]) return false;
  const seen = new Uint8Array(n);
  let expect = 1;
  for (let i = 0; i < n; i++) {
    const c = path[i];
    if (!Number.isInteger(c) || c < 0 || c >= n || seen[c]) return false;
    seen[c] = 1;
    if (i > 0 && !canStep(puz, path[i - 1], c)) return false;
    if (nums[c]) {
      if (nums[c] !== expect) return false;
      expect++;
    }
  }
  return expect === waypoints.length + 1;
}

/**
 * Hint: how much of the vine is right, and the next few squares.
 * → { keep, add, wrong } keep = how many squares of the current vine to keep; add = squares to grow
 *   next; wrong = part of their vine had to be cut. Always leads to a real answer.
 */
export function hintFor(puz, path, steps = 3) {
  const sol = puz.solution;
  let keep = 0;
  while (keep < path.length && path[keep] === sol[keep]) keep++;
  if (!puz.unique && keep < path.length) {
    // There may be more than one answer: if their vine still works (or nearly), keep it
    for (let len = path.length; len > keep && len > path.length - 6; len--) {
      const res = solve(puz, { prefix: path.slice(0, len), limit: 1, budget: 6000 });
      if (res.solutions.length) {
        const s = res.solutions[0];
        return { keep: len, add: s.slice(len, len + steps), wrong: len < path.length };
      }
    }
  }
  return { keep, add: sol.slice(keep, keep + steps), wrong: keep < path.length };
}
