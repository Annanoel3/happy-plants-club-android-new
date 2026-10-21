// Garden Groups: 16 plant words hide 4 groups of 4. This file holds the category bank and
// builds a fair puzzle from a seed (same date → same puzzle on every phone).
//
// The bank is word-first: every word lists the categories it truly belongs to ("in") and the
// ones it could LOOK like it belongs to ("maybe", e.g. MINT looks like a color too). A puzzle
// picks 4 categories (one per difficulty level), then only uses words that belong to their
// own group and don't belong to, or look like they belong to, any of the other 3. So a
// player can never be marked wrong for an answer that also makes sense.
import { seededRng, shuffleWith } from './common.js';

export const CATEGORIES = {
  // level 1 (easiest)
  herb: { name: 'Kitchen herbs', level: 1 },
  succ: { name: 'Succulents', level: 1 },
  tree: { name: 'Trees', level: 1 },
  rootveg: { name: 'Root vegetables', level: 1 },
  citrus: { name: 'Citrus fruits', level: 1 },
  greens: { name: 'Leafy greens', level: 1 },
  grain: { name: 'Grains', level: 1 },
  nut: { name: 'Nuts', level: 1 },
  part: { name: 'Parts of a plant', level: 1 },
  tool: { name: 'Garden tools', level: 1 },
  need: { name: 'Things a plant needs', level: 1 },
  house: { name: 'Popular houseplants', level: 1 },
  // level 2
  cactus: { name: 'Kinds of cactus', level: 2 },
  onion: { name: 'The onion family', level: 2 },
  spice: { name: 'Spices', level: 2 },
  potting: { name: 'Goes in potting mix', level: 2 },
  pest: { name: 'Plant pests', level: 2 },
  bulb: { name: 'Spring bulbs', level: 2 },
  vine: { name: 'Climbing vines', level: 2 },
  xmas: { name: 'Christmas plants', level: 2 },
  girl: { name: "Plants that are also girls' names", level: 2 },
  // level 3
  boy: { name: "Plants that are also boys' names", level: 3 },
  color: { name: 'Plants that are also colors', level: 3 },
  animal: { name: 'Plant names that start with an animal', level: 3 },
  lawn: { name: 'Lawn grasses', level: 3 },
  fruitveg: { name: 'Fruits we call vegetables', level: 3 },
  night: { name: 'The nightshade family', level: 3 },
  // level 4 (trickiest)
  berry: { name: 'Botanically, these are berries', level: 4 },
  berryP: { name: '___BERRY', level: 4 },
  flowerS: { name: '___FLOWER', level: 4 },
  fernP: { name: '___ FERN', level: 4 },
  palmP: { name: '___ PALM', level: 4 },
  treeS: { name: '___ TREE', level: 4 },
  rootS: { name: '___ROOT', level: 4 },
  mint: { name: 'All in the mint family', level: 4 },
  carrot: { name: 'All in the carrot family', level: 4 },
};

// W(word, 'categories it is in', 'categories it could look like it is in')
const WORDS = [];
const W = (w, inc, maybe = '') => WORDS.push({ w, in: inc.split(' ').filter(Boolean), maybe: maybe.split(' ').filter(Boolean) });

// Herbs, mint family, carrot family
W('BASIL', 'herb mint boy', 'greens');
W('THYME', 'herb mint');
W('OREGANO', 'herb mint');
W('ROSEMARY', 'herb mint girl');
W('SAGE', 'herb mint color', 'girl boy');
W('MINT', 'herb mint color');
W('PARSLEY', 'herb carrot', 'greens');
W('CILANTRO', 'herb carrot', 'greens spice');
W('DILL', 'herb carrot', 'spice greens');
W('CHIVES', 'herb onion');
W('TARRAGON', 'herb');
W('LAVENDER', 'mint color', 'girl herb');
W('CATNIP', 'mint animal', 'herb');
W('COLEUS', 'mint', 'house');
W('LEMON BALM', 'mint', 'herb citrus');
W('BEE BALM', 'mint animal', 'herb');
W('CARROT', 'rootveg carrot', 'color');
W('PARSNIP', 'rootveg carrot');
W('CELERIAC', 'rootveg carrot');
W('CELERY', 'carrot', 'rootS greens');
W('FENNEL', 'carrot', 'spice herb');
W('CUMIN', 'carrot spice');
W('ANISE', 'carrot spice');
W('CARAWAY', 'carrot spice');

// Succulents and cactus
W('ALOE', 'succ', 'house cactus');
W('AGAVE', 'succ', 'cactus');
W('JADE', 'succ color', 'house girl treeS');
W('ECHEVERIA', 'succ', 'house');
W('SEDUM', 'succ', 'house');
W('HAWORTHIA', 'succ', 'house');
W('KALANCHOE', 'succ', 'house xmas'); // sold as a Christmas plant
W('SAGUARO', 'succ cactus');
W('CHOLLA', 'succ cactus');
W('OPUNTIA', 'succ cactus');
W('PRICKLY PEAR', 'succ cactus', 'berry'); // the fruit is a berry
W('ORGAN PIPE', 'succ cactus');
W('BUNNY EARS', 'succ cactus animal', 'house');

// Trees (every tree also looks like it fits "___ TREE")
W('OAK', 'tree', 'treeS');
W('MAPLE', 'tree', 'treeS girl');
W('BIRCH', 'tree', 'treeS');
W('PINE', 'tree', 'treeS xmas color nut');
W('CEDAR', 'tree', 'treeS xmas boy color');
W('ELM', 'tree', 'treeS');
W('SPRUCE', 'tree', 'treeS xmas');
W('BEECH', 'tree', 'treeS animal');
W('SEQUOIA', 'tree', 'treeS');
W('REDWOOD', 'tree', 'treeS color');
W('CYPRESS', 'tree', 'treeS');
W('SYCAMORE', 'tree', 'treeS');
W('WILLOW', 'tree girl', 'treeS color');
W('ASPEN', 'tree', 'treeS girl boy animal');
W('OLIVE', 'tree girl color', 'treeS');
W('MAGNOLIA', 'tree girl', 'treeS color');
W('ASH', 'tree boy', 'treeS color');
W('ROWAN', 'tree boy', 'treeS girl berryP'); // rowanberry
W('ALDER', 'tree boy', 'treeS');
W('LINDEN', 'tree boy', 'treeS girl');
W('FIR', 'tree xmas', 'treeS');
W('DOGWOOD', 'tree animal', 'treeS');
W('HOLLY', 'tree girl xmas fernP', 'treeS berry');
W('LAUREL', 'tree girl', 'treeS herb'); // bay laurel = bay leaves
W('HAZEL', 'girl', 'tree treeS color nut');
W('JUNIPER', 'girl', 'tree treeS spice berry');
W('MYRTLE', 'girl', 'tree treeS');
W('REED', 'boy');
W('HEATH', 'boy');

// Root vegetables, onion family, nightshades
W('BEET', 'rootveg rootS', 'color greens animal');
W('RADISH', 'rootveg');
W('TURNIP', 'rootveg', 'greens');
W('RUTABAGA', 'rootveg');
W('DAIKON', 'rootveg');
W('GARLIC', 'onion', 'spice rootveg bulb');
W('ONION', 'onion', 'rootveg bulb');
W('SHALLOT', 'onion', 'rootveg bulb');
W('LEEK', 'onion');
W('SCALLION', 'onion');
W('RAMPS', 'onion', 'animal');
W('ALLIUM', 'onion bulb');
W('POTATO', 'night', 'rootveg');
W('PETUNIA', 'night', 'girl');
W('TOBACCO', 'night');
W('TOMATILLO', 'night', 'fruitveg berry');

// Citrus (all citrus trees look like trees; citrus fruits are a kind of berry)
W('LEMON', 'citrus color', 'tree treeS berry');
W('LIME', 'citrus color', 'tree treeS berry potting');
W('ORANGE', 'citrus color', 'tree treeS berry');
W('TANGERINE', 'citrus color', 'tree treeS berry');
W('GRAPEFRUIT', 'citrus', 'tree treeS berry');
W('CLEMENTINE', 'citrus girl', 'tree treeS berry');
W('MANDARIN', 'citrus', 'tree treeS berry color');
W('KUMQUAT', 'citrus', 'tree treeS berry');
W('POMELO', 'citrus', 'tree treeS berry');
W('YUZU', 'citrus', 'tree treeS berry');

// Leafy greens, grains, nuts
W('KALE', 'greens', 'boy');
W('SPINACH', 'greens');
W('LETTUCE', 'greens');
W('ARUGULA', 'greens');
W('CHARD', 'greens');
W('COLLARDS', 'greens');
W('BOK CHOY', 'greens');
W('CABBAGE', 'greens', 'palmP');
W('ROMAINE', 'greens');
W('WATERCRESS', 'greens');
W('WHEAT', 'grain color');
W('RICE', 'grain');
W('OATS', 'grain');
W('BARLEY', 'grain');
W('RYE', 'grain', 'lawn');
W('CORN', 'grain flowerS', 'color fruitveg');
W('MILLET', 'grain');
W('SORGHUM', 'grain');
W('QUINOA', 'grain');
W('SPELT', 'grain');
W('ALMOND', 'nut', 'tree treeS color');
W('WALNUT', 'nut tree', 'treeS color');
W('PECAN', 'nut tree', 'treeS color');
W('CHESTNUT', 'nut tree color', 'treeS xmas'); // roasting at Christmas
W('CASHEW', 'nut', 'tree treeS');
W('HAZELNUT', 'nut', 'tree color treeS');
W('PISTACHIO', 'nut color', 'tree treeS');
W('MACADAMIA', 'nut', 'tree treeS');
W('PEANUT', 'nut');
W('ACORN', 'nut', 'tree part');

// Spices
W('CINNAMON', 'spice color', 'tree fernP treeS');
W('NUTMEG', 'spice', 'nut tree color treeS');
W('CLOVE', 'spice', 'tree onion treeS');
W('PAPRIKA', 'spice', 'night color');
W('TURMERIC', 'spice', 'rootveg color rootS'); // turmeric root
W('SAFFRON', 'spice color', 'bulb girl');
W('GINGER', 'spice girl', 'rootveg color rootS');
W('VANILLA', 'spice', 'color vine');
W('CARDAMOM', 'spice');

// Plant parts, tools, potting mix, needs, pests
W('ROOT', 'part');
W('STEM', 'part');
W('LEAF', 'part');
W('PETAL', 'part');
W('SEED', 'part');
W('BUD', 'part', 'boy');
W('THORN', 'part');
W('NODE', 'part');
W('SEPAL', 'part');
W('STAMEN', 'part');
W('PISTIL', 'part');
W('BRANCH', 'part');
W('BARK', 'part potting');
W('TROWEL', 'tool');
W('RAKE', 'tool');
W('HOE', 'tool');
W('SPADE', 'tool');
W('SHEARS', 'tool');
W('PRUNERS', 'tool');
W('SHOVEL', 'tool');
W('DIBBER', 'tool');
W('WHEELBARROW', 'tool');
W('PITCHFORK', 'tool');
W('WATERING CAN', 'tool');
W('HOSE', 'tool');
W('PERLITE', 'potting');
W('PEAT', 'potting');
W('COMPOST', 'potting', 'need');
W('SAND', 'potting', 'color');
W('VERMICULITE', 'potting');
W('COCO COIR', 'potting');
W('PUMICE', 'potting');
W('CHARCOAL', 'potting', 'color');
W('LAVA ROCK', 'potting');
W('WATER', 'need');
W('LIGHT', 'need');
W('SOIL', 'need', 'potting');
W('AIR', 'need');
W('SUNLIGHT', 'need');
W('WARMTH', 'need');
W('NUTRIENTS', 'need', 'potting'); // mixes come "with added nutrients"
W('APHID', 'pest', 'animal');
W('MEALYBUG', 'pest', 'animal');
W('SPIDER MITE', 'pest', 'animal');
W('THRIPS', 'pest', 'animal');
W('SCALE', 'pest', 'animal part'); // bud and bulb scales
W('WHITEFLY', 'pest', 'animal');
W('FUNGUS GNAT', 'pest', 'animal');

// Houseplants
W('POTHOS', 'house', 'vine');
W('MONSTERA', 'house', 'vine');
W('PHILODENDRON', 'house', 'vine');
W('PEACE LILY', 'house', 'girl');
W('ZZ PLANT', 'house', 'succ');
W('CALATHEA', 'house');
W('DRACAENA', 'house');
W('PILEA', 'house');
W('HOYA', 'house', 'vine succ');
W('ANTHURIUM', 'house', 'animal');
W('ALOCASIA', 'house');
W('RUBBER PLANT', 'house', 'tree');
W('SNAKE PLANT', 'house animal', 'succ');
W('SPIDER PLANT', 'house animal');
W('ZEBRA PLANT', 'animal', 'house succ'); // also a haworthia
W('ELEPHANT EAR', 'animal', 'house');
W('MOTH ORCHID', 'animal', 'house');

// Bulbs, vines, Christmas, names, colors, animals
W('TULIP', 'bulb', 'treeS');
W('DAFFODIL', 'bulb', 'color');
W('HYACINTH', 'bulb', 'girl color');
W('CROCUS', 'bulb', 'animal');
W('SNOWDROP', 'bulb');
W('MUSCARI', 'bulb');
W('IRIS', 'bulb girl', 'color');
W('IVY', 'vine girl', 'color xmas house');
W('WISTERIA', 'vine', 'color');
W('CLEMATIS', 'vine');
W('JASMINE', 'vine girl', 'color house');
W('HONEYSUCKLE', 'vine', 'color');
W('GRAPE', 'vine berry', 'color');
W('HOPS', 'vine');
W('KUDZU', 'vine', 'pest');
W('POINSETTIA', 'xmas', 'house');
W('MISTLETOE', 'xmas', 'berry');
W('AMARYLLIS', 'xmas', 'house bulb girl');
W('ROSE', 'girl color', 'vine');
W('LILY', 'girl', 'bulb');
W('DAISY', 'girl');
W('VIOLET', 'girl color');
W('POPPY', 'girl', 'color spice');
W('DAHLIA', 'girl', 'bulb');
W('CAMELLIA', 'girl', 'animal'); // starts with CAMEL
W('AZALEA', 'girl', 'color');
W('LILAC', 'color', 'girl');
W('FUCHSIA', 'color');
W('PERIWINKLE', 'color', 'vine animal');
W('FOXGLOVE', 'animal');
W('COWSLIP', 'animal');
W('HORSETAIL', 'animal');
W('CATTAIL', 'animal');
W('TIGER LILY', 'animal', 'girl bulb');
W("LAMB'S EAR", 'animal');

// Lawn grasses
W('FESCUE', 'lawn');
W('BERMUDA', 'lawn');
W('ZOYSIA', 'lawn');
W('BUFFALO', 'lawn', 'animal berryP');
W('CENTIPEDE', 'lawn', 'animal pest');
W('ST AUGUSTINE', 'lawn', 'boy');
W('RYEGRASS', 'lawn', 'grain');

// Fruits we call vegetables, true berries
W('TOMATO', 'fruitveg berry night color', 'vine');
W('EGGPLANT', 'fruitveg berry night color');
W('BELL PEPPER', 'fruitveg berry night');
W('CUCUMBER', 'fruitveg', 'berry vine');
W('ZUCCHINI', 'fruitveg', 'berry vine');
W('PUMPKIN', 'fruitveg color', 'berry vine');
W('OKRA', 'fruitveg');
W('SQUASH', 'fruitveg', 'berry vine');
W('GREEN BEAN', 'fruitveg', 'vine');
W('AVOCADO', 'color', 'berry fruitveg tree treeS'); // drupe or berry depending on the source
W('BANANA', 'berry', 'tree treeS color');
W('KIWI', 'berry', 'vine color animal');
W('BLUEBERRY', 'berry', 'color');
W('CRANBERRY', 'berry color');
W('GOOSEBERRY', 'berry', 'animal');

// Word play: ___BERRY, ___FLOWER, ___ FERN, ___ PALM, ___ TREE, ___ROOT
W('STRAW', 'berryP flowerS', 'color');
W('BLUE', 'berryP', 'color');
W('RASP', 'berryP');
W('BLACK', 'berryP', 'color rootS');
W('GOOSE', 'berryP', 'animal');
W('CRAN', 'berryP');
W('ELDER', 'berryP flowerS', 'tree treeS');
W('MUL', 'berryP');
W('BOYSEN', 'berryP');
W('HUCKLE', 'berryP');
W('LOGAN', 'berryP', 'boy');
W('LINGON', 'berryP');
W('CLOUD', 'berryP');
W('SNOW', 'berryP', 'color flowerS');
W('BAR', 'berryP');
W('SUN', 'flowerS', 'need rootS berryP');
W('CAULI', 'flowerS');
W('WALL', 'flowerS');
W('MAY', 'flowerS', 'girl berryP'); // Mayberry
W('PASSION', 'flowerS', 'vine');
W('MOON', 'flowerS');
W('CONE', 'flowerS', 'part');
W('WILD', 'flowerS');
W('BELL', 'flowerS');
W('STAR', 'flowerS', 'xmas'); // "Christmas star" is a poinsettia
W('BOSTON', 'fernP', 'house boy');
W('STAGHORN', 'fernP animal', 'house');
W('MAIDENHAIR', 'fernP', 'tree treeS house');
W('SWORD', 'fernP');
W('ASPARAGUS', 'fernP', 'house animal');
W('CHRISTMAS', 'fernP treeS', 'xmas palmP');
W('TREE', 'fernP');
W('LADY', 'fernP', 'palmP');
W('DATE', 'palmP', 'tree treeS berry');
W('COCONUT', 'palmP', 'nut tree treeS potting');
W('FAN', 'palmP', 'flowerS');
W('PARLOR', 'palmP', 'house');
W('SAGO', 'palmP', 'house');
W('ARECA', 'palmP', 'house');
W('PONYTAIL', 'palmP', 'house animal succ');
W('QUEEN', 'palmP');
W('ROYAL', 'palmP', 'fernP boy');
W('OIL', 'palmP');
W('BOTTLE', 'palmP', 'treeS');
W('MAJESTY', 'palmP', 'house');
W('FAMILY', 'treeS');
W('SHOE', 'treeS');
W('MONEY', 'treeS', 'house tree');
W('GUM', 'treeS', 'tree');
W('JOSHUA', 'treeS', 'boy tree');
W('DECISION', 'treeS');
W('ARROW', 'rootS');
W('TAP', 'rootS');
W('BLOOD', 'rootS', 'color flowerS');
W('BITTER', 'rootS');
W('SNAKE', 'rootS', 'animal');
W('UP', 'rootS');

export const WORD_LIST = WORDS;

const MEMBERS = {};
const TAGS = {};
for (const k of Object.keys(CATEGORIES)) MEMBERS[k] = [];
for (const { w, in: inc, maybe } of WORDS) {
  TAGS[w] = new Set([...inc, ...maybe]);
  for (const c of inc) MEMBERS[c].push(w);
}
const BY_LEVEL = { 1: [], 2: [], 3: [], 4: [] };
for (const [k, c] of Object.entries(CATEGORIES)) BY_LEVEL[c.level].push(k);

export const dailyGroupsSeed = (date) => `garden-groups-${String(date).slice(0, 10)}`;
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayNum = (day) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);

/** Words that can be the answer for category c when the other chosen categories are `others` */
function poolFor(c, others) {
  return MEMBERS[c].filter((w) => !others.some((o) => TAGS[w].has(o)));
}

/**
 * makeGroupsPuzzle(seed) → { seed, groups: [{ key, name, level, words: [4] }] (level 1→4), tiles: [16 words, shuffled] }
 * Deterministic for a given seed.
 */
export function makeGroupsPuzzle(seed) {
  const rng = seededRng(`gg|${seed}`);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  for (let attempt = 0; attempt < 400; attempt++) {
    const chosen = [1, 2, 3, 4].map((l) => pick(BY_LEVEL[l]));
    const pools = chosen.map((c) => poolFor(c, chosen.filter((o) => o !== c)));
    if (pools.some((p) => p.length < 4)) continue;
    const groups = chosen.map((c, i) => ({ key: c, name: CATEGORIES[c].name, level: CATEGORIES[c].level, words: shuffleWith(rng, pools[i]).slice(0, 4) }));
    return { seed, groups, tiles: shuffleWith(rng, groups.flatMap((g) => g.words)) };
  }
  // Never expected; a known-fair fallback
  const chosen = ['tool', 'onion', 'lawn', 'palmP'];
  const groups = chosen.map((c) => ({ key: c, name: CATEGORIES[c].name, level: CATEGORIES[c].level, words: poolFor(c, chosen.filter((o) => o !== c)).slice(0, 4) }));
  return { seed, groups, tiles: shuffleWith(rng, groups.flatMap((g) => g.words)) };
}

// ---------- Daily puzzles ----------
// Before ROTATE_FROM each daily picked its 4 categories at random with no memory, so the same
// category often came back the next day. Those days are kept as they were (people played them).
// From ROTATE_FROM on, each level is dealt like a deck: the category used longest ago that still
// makes a fair puzzle with the other three, ties broken by the day's seed, and never one used in
// the last MIN_GAP days unless nothing else fits. Words go the same way (longest unused first),
// so a group rarely shows the same words twice in a row. It's worked out day by day from
// ROTATE_FROM (cached), so every phone gets the same puzzle for the same date.
export const ROTATE_FROM = '2026-10-21';
const MIN_GAP = { 1: 7, 2: 7, 3: 6, 4: 7 }; // level 3 has only 6 categories
const feasibleCache = new Map();
function poolsFor(chosen) {
  return chosen.map((c) => poolFor(c, chosen.filter((o) => o !== c)));
}
function feasible(chosen) {
  const k = chosen.join('|');
  if (!feasibleCache.has(k)) feasibleCache.set(k, poolsFor(chosen).every((p) => p.length >= 4));
  return feasibleCache.get(k);
}

const sim = { day: null, catUsed: {}, wordUsed: {}, byDay: new Map() };
function remember(day, p) {
  const n = dayNum(day);
  p.groups.forEach((g) => {
    sim.catUsed[g.key] = n;
    g.words.forEach((w) => { sim.wordUsed[w] = n; });
  });
}
function rotatedPuzzle(day) {
  const n = dayNum(day);
  const seed = dailyGroupsSeed(day);
  const rng = seededRng(`gg|${seed}`);
  const ago = (last) => (last === undefined ? 1e6 : n - last); // never used = long ago (a number, so sorts stay exact)
  // Per level: categories longest-unused first, each with a cost (its place in line, plus a big
  // cost if it was used too recently)
  const lines = [1, 2, 3, 4].map((l) => shuffleWith(rng, BY_LEVEL[l])
    .sort((a, b) => ago(sim.catUsed[b]) - ago(sim.catUsed[a]))
    .map((c, i) => ({ c, cost: i + Math.max(0, MIN_GAP[l] - ago(sim.catUsed[c])) * 1000 })));
  // Cheapest fair combination (costs only grow down each line, so cut off early)
  let best = null, bestCost = Infinity;
  const rec = (l, picked, cost) => {
    if (cost >= bestCost) return;
    if (l === 4) { if (feasible(picked)) { best = picked; bestCost = cost; } return; }
    for (const x of lines[l]) {
      if (cost + x.cost >= bestCost) break;
      rec(l + 1, [...picked, x.c], cost + x.cost);
    }
  };
  rec(0, [], 0);
  if (!best) return makeGroupsPuzzle(seed);
  const pools = poolsFor(best);
  const groups = best.map((c, i) => ({
    key: c, name: CATEGORIES[c].name, level: CATEGORIES[c].level,
    words: shuffleWith(rng, pools[i]).sort((a, b) => ago(sim.wordUsed[b]) - ago(sim.wordUsed[a])).slice(0, 4),
  }));
  return { seed, groups, tiles: shuffleWith(rng, groups.flatMap((g) => g.words)) };
}

/** dailyGroupsPuzzle('YYYY-MM-DD') → that day's puzzle (same shape as makeGroupsPuzzle, seed = dailyGroupsSeed(date)) */
export function dailyGroupsPuzzle(date) {
  const day = String(date).slice(0, 10);
  if (day < ROTATE_FROM) return makeGroupsPuzzle(dailyGroupsSeed(day));
  if (sim.byDay.has(day)) return sim.byDay.get(day);
  if (!sim.day) {
    // Start from the last two weeks of the old random puzzles, so day one doesn't repeat them
    for (let d = addDays(ROTATE_FROM, -14); d < ROTATE_FROM; d = addDays(d, 1)) remember(d, makeGroupsPuzzle(dailyGroupsSeed(d)));
    sim.day = addDays(ROTATE_FROM, -1);
  }
  while (sim.day < day) {
    const d = addDays(sim.day, 1);
    const p = rotatedPuzzle(d);
    remember(d, p);
    sim.byDay.set(d, p);
    sim.day = d;
  }
  return sim.byDay.get(day);
}

/** For tests: 16 distinct words, 4 per group, and no word belongs (or looks like it belongs) to another group */
export function checkPuzzle(p) {
  const all = p.groups.flatMap((g) => g.words);
  if (all.length !== 16 || new Set(all).size !== 16) return 'not 16 distinct words';
  for (const g of p.groups) {
    if (g.words.length !== 4) return `${g.key} has ${g.words.length} words`;
    for (const w of g.words) {
      if (!MEMBERS[g.key].includes(w)) return `${w} is not in ${g.key}`;
      for (const o of p.groups) if (o !== g && TAGS[w].has(o.key)) return `${w} also fits ${o.key}`;
    }
  }
  if (p.tiles.length !== 16 || new Set(p.tiles).size !== 16) return 'tiles wrong';
  return null;
}
