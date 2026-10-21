// Sprout Word answers. Every word here is in words5.js (the guess list).
//
// How the daily word is picked (dailyAnswer):
// - FIRST_DAYS: the words already played on Oct 19, 20 and 21, 2026. Fixed for good.
// - From Oct 22, 2026 the daily walks through DAILY (304 everyday plant, garden and nature words).
//   Each full pass gets its own seeded shuffle ("sprout-daily-v2-<pass>"), so a word only comes
//   back after every other word has had its day, and a date gives the same word on every phone.
//   Where one pass ends and the next starts, a word waits at least GAP (100) days to come back.
// - PRACTICE: "Play another" only draws from here, never from DAILY or FIRST_DAYS, so practice
//   can't give away a coming daily word.
import { seededRng, shuffleWith } from './common.js';

export const FIRST_DAYS = ['beets', 'trees', 'shrub']; // 2026-10-19, -20, -21

export const DAILY = `
aster daisy lilac lotus pansy peony poppy tulip roses bloom petal ferns palms vines reeds herbs
weeds grass hedge holly yucca agave cacti grove woods flora plant mossy maple cedar birch aspen
beech pines olive hazel ebony balsa acorn cones trunk limbs bough twigs stump woody leafy roots
resin plank stems stalk sprig shoot thorn bulbs seeds blade husks rinds peels spine spiky tuber
apple grape lemon mango melon peach pears plums limes berry guava dates kiwis prune fruit juicy
juice basil thyme chive mints cumin clove spice beans leeks onion chard chili gourd maize wheat
grain straw pecan cocoa spuds salad pesto grows grown ripen graft mulch water sowed raked mowed
trims snips picks pluck yield wilts droop tills plows climb crops field farms barns bales plots
patch yards lawns fence gates porch patio decks bench arbor sheds tools spade rakes hoses glove
boots pails stake twine mower trays vases broom gnome hutch swing silos coops shade sunny rainy
earth frost storm cloud windy humid misty sandy muddy rocky rocks stone moist soggy scent aroma
stony hilly wasps moths aphid snail slugs worms frogs toads birds robin finch crows moles bunny
hares grubs hives nests honey swarm mites larva gnats mouse snake ticks pests flies doves wrens
hawks geese ducks heron larks goose foxes eagle otter trout swans quail skunk raven fawns sweet
bushy nutty seedy weedy shady fresh green fungi algae river creek brook marsh swamp ponds lakes
beach shore dunes hills ridge cliff caves slope plain trail paths oasis falls peaks ocean coral
parks acres ranch glade waves coast tides sands stars gorge isles reefs delta wilds inlet skies
foggy snowy sleet gusty balmy muggy chill thaws melts winds gusts light dusty rains drips drops
mists spray pumps wells spout soaks clump canes mound dried cider syrup sugar jelly flour chaff
`.trim().split(/\s+/);

export const PRACTICE = `
spore frond calla caper cress ficus hosta viola curry salsa spicy tangy zesty minty fuzzy hairy
amber cores clips crate wagon apron tents camps hikes cabin gecko lambs sheep goats chick bayou
flint voles rural soils roost shell hiker canoe moose bears crane bison mazes fairy chips posts
cages drain basin flood kayak brush scrub horse llama rapid
`.trim().split(/\s+/);

/** Every Sprout Word answer, for the guess check */
export const ALL_ANSWERS = [...FIRST_DAYS, ...DAILY, ...PRACTICE];

const dayNumber = (day) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
const START = dayNumber('2026-10-19');
const GAP = 100;
const passes = new Map();
function passOrder(k) {
  if (passes.has(k)) return passes.get(k);
  const rest = shuffleWith(seededRng(`sprout-daily-v2-${k}`), DAILY);
  // Words from the last GAP days of the previous pass wait until they're GAP days old
  const earliest = new Map(k > 0 ? passOrder(k - 1).slice(-GAP).map((w, j) => [w, j]) : []);
  const order = [];
  while (rest.length) {
    const i = rest.findIndex((w) => (earliest.get(w) || 0) <= order.length);
    order.push(rest.splice(i, 1)[0]);
  }
  passes.set(k, order);
  return order;
}

/** dailyAnswer('YYYY-MM-DD') → that day's word */
export function dailyAnswer(day) {
  const n = dayNumber(day) - START;
  if (n >= 0 && n < FIRST_DAYS.length) return FIRST_DAYS[n];
  const i = n - FIRST_DAYS.length; // 0 on 2026-10-22
  const k = Math.floor(i / DAILY.length);
  return passOrder(k)[i - k * DAILY.length];
}

/** A random practice word, skipping the ones in `not` (recent ones) when it can */
export function practiceWord(not = []) {
  const fresh = PRACTICE.filter((w) => !not.includes(w));
  const pool = fresh.length ? fresh : PRACTICE;
  return pool[Math.floor(Math.random() * pool.length)];
}
