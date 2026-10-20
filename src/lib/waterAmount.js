// How much water to give, in US fluid ounces (Plus).
//
// Rule of thumb from the Royal Horticultural Society: about 10% of the container's
// volume per watering, then adjust. Pot volume comes from the pot's width across the
// top (pot_diameter_in), treating it as a standard tapered pot about as tall as it is
// wide: volume ≈ 0.545 × width³ cubic inches. 1 cubic inch = 0.554 US fl oz.
//
// Missing pot width → no amount at all (we don't guess); the plant page asks for the pot size.
// Same formula lives in functions/wateringReminder (for the phone pop-up) — keep in sync.

export const POT_SIZES = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24];

export function ozForDiameter(d) {
  const volIn3 = 0.545 * d * d * d;
  return volIn3 * 0.10 * 0.554;
}

function roundOz(oz) {
  if (oz < 1) return 1;
  if (oz < 16) return Math.round(oz);
  if (oz < 64) return Math.round(oz / 2) * 2;
  return Math.round(oz / 8) * 8;
}

function cupsText(oz) {
  const cups = oz / 8;
  if (cups < 0.2) return null;
  const quarters = Math.round(cups * 4) / 4;
  const whole = Math.floor(quarters);
  const frac = quarters - whole;
  const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  if (!whole && !f) return null;
  const n = `${whole || ''}${f}`;
  return `${n} cup${quarters > 1 ? 's' : ''}`;
}

// How a plant gets its water. Set per plant (water_method); a self-watering pot means
// "reservoir" unless the owner picked something else; everything else is "pour".
// Sources for the instructions: soak (air plants: Penn State Extension, 20 min-1 hr),
// bottom watering (African violets: UW-Madison Extension, ~30 min), self-watering pots
// (refill once the reservoir is empty), plants in water (change it at least every 3 weeks).
export const WATER_METHODS = [
  { id: 'pour', label: 'Water the soil', verb: 'Water', icon: '💧' },
  { id: 'reservoir', label: 'Self-watering pot (fill the reservoir)', verb: 'Refill the reservoir', icon: '🪣' },
  { id: 'soak', label: 'Soak or dunk (staghorns, air plants)', verb: 'Soak', icon: '🛁' },
  { id: 'mist', label: 'Mist only', verb: 'Mist', icon: '🌫️' },
  { id: 'bottom', label: 'Water from below (African violets)', verb: 'Water from below', icon: '⬆️' },
  { id: 'in_water', label: 'Lives in water (lucky bamboo, cuttings)', verb: 'Change the water', icon: '🫙' },
];
const METHOD_IDS = WATER_METHODS.map((m) => m.id);

// Same rule on the server (functions/wateringReminder, sendWateringReminders): keep in sync.
export function waterMethod(plant) {
  const set = plant?.water_method && METHOD_IDS.includes(plant.water_method) ? plant.water_method : null;
  if (set && plant?.care_profile?.user_method) return set; // the owner's own choice wins
  if (plant?.pot_type === 'Self-watering') return 'reservoir';
  return set || 'pour';
}

export function methodInfo(plant) {
  const id = waterMethod(plant);
  return WATER_METHODS.find((m) => m.id === id) || WATER_METHODS[0];
}

/** "Water every 7 days" / "Soak every 7 days", plus the seasonal note when it has one. */
export function scheduleText(plant) {
  const n = Number(plant?.water_frequency_days) || 0;
  if (!n) return null;
  const m = methodInfo(plant);
  const main = `${m.verb} every ${n} day${n === 1 ? '' : 's'}`;
  const grow = Number(plant?.water_days_grow) || 0;
  const rest = Number(plant?.water_days_rest) || 0;
  if (!grow || !rest || grow === rest) return { main, note: null };
  const restName = plant.water_rest_season === 'summer' ? 'summer' : 'winter';
  const growName = plant.water_rest_season === 'summer' ? 'fall' : 'spring';
  const note = plant.water_season === 'rest'
    ? `Resting now. Back to every ${grow} days in ${growName}.`
    : `Slows to every ${rest} days in ${restName}, when it rests.`;
  return { main, note };
}

const METHOD_AMOUNTS = {
  reservoir: { short: 'Fill reservoir', headline: 'Fill the reservoir', text: 'Self-watering pot: refill the reservoir once it’s empty, instead of watering the soil.' },
  soak: { short: 'Soak 20 min', headline: 'Soak for about 20 minutes', text: 'Dunk the plant or its mount in room-temperature water for about 20 minutes, then let it drain and dry well before hanging it back up.' },
  mist: { short: 'Mist', headline: 'Mist it', text: 'Mist until water runs off, then let it dry with good air flow.' },
  bottom: { short: 'From below, 30 min', headline: 'Water from below', text: 'Set the pot in a saucer of water for about 30 minutes, then pour off what’s left.' },
  in_water: { short: 'Fresh water', headline: 'Change the water', text: 'Swap in fresh water (at least every 3 weeks). Keep the roots under water and the leaves above it.' },
};

/**
 * { kind: 'oz' | 'ground' | 'reservoir' | 'soak' | 'mist' | 'bottom' | 'in_water' | 'unknown',
 *   oz, guessed, short, headline, text }
 */
export function waterAmount(plant) {
  if (!plant) return { kind: 'unknown' };
  const method = waterMethod(plant);
  if (method !== 'pour') return { kind: method, ...METHOD_AMOUNTS[method] };
  const d = plant.pot_diameter_in;
  if (d === 0) {
    return { kind: 'ground', short: 'Deep soak', text: 'In the ground: water slowly at the base until the soil is soaked several inches down.' };
  }
  const width = Number(d) > 0 ? Number(d) : null;
  // No pot size, no number: a guess from the plant's size was often way off (52 oz for a small pot)
  if (!width) return { kind: 'unknown', needsPot: true, short: null, text: null };
  const oz = roundOz(ozForDiameter(width));
  const cups = cupsText(oz);
  return {
    kind: 'oz',
    oz,
    guessed: false,
    width,
    short: `${oz} oz`,
    headline: `About ${oz} oz${cups ? ` (${cups})` : ''}`,
    text: `About ${oz} oz${cups ? ` (${cups})` : ''}. Pour slowly; stop when a little drains out the bottom.`,
  };
}


// ---- "What does that look like?" ------------------------------------------------------
// Everyday US containers to picture an amount. Standard US sizes: tablespoon 0.5 fl oz,
// shot glass 1.5, measuring cup 8, soda can 12, bottled water 16.9 (500 mL), soda bottle 20,
// quart 32, half gallon 64, gallon 128.
const CONTAINERS = [
  { oz: 0.5, one: 'tablespoon', many: 'tablespoons', max: 6 },
  { oz: 1.5, one: 'shot glass', many: 'shot glasses', max: 3 },
  { oz: 8, one: 'measuring cup', many: 'measuring cups', max: 4 },
  { oz: 12, one: 'soda can', many: 'soda cans', max: 4, bonus: 0.02 },
  { oz: 16.9, one: 'regular 16.9 oz water bottle', many: 'regular 16.9 oz water bottles', max: 4, bonus: 0.07 }, // the one everyone has
  { oz: 20, one: '20 oz soda bottle', many: '20 oz soda bottles', max: 3 },
  { oz: 32, one: 'quart jug (32 oz)', many: 'quart jugs (32 oz)', max: 3 },
  { oz: 64, one: 'half-gallon jug', many: 'half-gallon jugs', max: 2 },
  { oz: 128, one: 'gallon jug', many: 'gallon jugs', max: 4 },
];
const NICE = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6];
const COUNT_WORDS = { 0.25: 'a quarter of a', 0.5: 'half a', 0.75: 'three-quarters of a', 1: 'one', 1.5: 'one and a half', 2: 'two', 2.5: 'two and a half', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

/** Up to 3 comparisons, best first: [{ text: "A little less than one regular 16.9 oz water bottle" }] */
export function compareOz(oz) {
  if (!(oz > 0)) return [];
  const options = [];
  for (const c of CONTAINERS) {
    const n = oz / c.oz;
    let best = null;
    for (const k of NICE) {
      if (k > c.max) continue;
      const err = Math.abs(n - k) / k;
      if (!best || err < best.err) best = { k, err };
    }
    if (!best || best.err > 0.3) continue;
    // Whole containers are easier to picture than fractions
    const score = best.err + (best.k < 1 ? 0.08 : 0) + (best.k > 3 ? 0.05 : 0) - (c.bonus || 0);
    const how = n > best.k * 1.07 ? 'a little more than' : n < best.k * 0.93 ? 'a little less than' : 'about';
    const noun = best.k <= 1 ? c.one : c.many;
    const count = COUNT_WORDS[best.k];
    const text = `${how[0].toUpperCase()}${how.slice(1)} ${count} ${noun}`;
    options.push({ text, score, container: c.one });
  }
  options.sort((a, b) => a.score - b.score);
  return options.slice(0, 3);
}
