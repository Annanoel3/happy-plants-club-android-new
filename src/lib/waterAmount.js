// How much water to give, in US fluid ounces (Plus).
//
// Rule of thumb from the Royal Horticultural Society: about 10% of the container's
// volume per watering, then adjust. Pot volume comes from the pot's width across the
// top (pot_diameter_in), treating it as a standard tapered pot about as tall as it is
// wide: volume ≈ 0.545 × width³ cubic inches. 1 cubic inch = 0.554 US fl oz.
//
// Missing pot width → a rough guess from the plant's size, clearly marked as a guess.
// Same formula lives in functions/wateringReminder (for the phone pop-up) — keep in sync.

export const POT_SIZES = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24];
const GUESS_BY_PLANT_SIZE = { Seedling: 3, Small: 4, Medium: 6, Large: 10, Mature: 12 };

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

export function waterMethod(plant) {
  if (plant?.water_method && METHOD_IDS.includes(plant.water_method)) return plant.water_method;
  if (plant?.pot_type === 'Self-watering') return 'reservoir';
  return 'pour';
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
  let width = Number(d) > 0 ? Number(d) : null;
  let guessed = false;
  if (!width) {
    width = GUESS_BY_PLANT_SIZE[plant.plant_size] || null;
    guessed = true;
  }
  if (!width) return { kind: 'unknown', short: null, text: null };
  const oz = roundOz(ozForDiameter(width));
  const cups = cupsText(oz);
  return {
    kind: 'oz',
    oz,
    guessed,
    width,
    short: `${guessed ? '~' : ''}${oz} oz`,
    headline: `About ${oz} oz${cups ? ` (${cups})` : ''}`,
    text: `About ${oz} oz${cups ? ` (${cups})` : ''}. Pour slowly; stop when a little drains out the bottom.`,
  };
}
