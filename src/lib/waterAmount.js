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

/**
 * { kind: 'oz' | 'ground' | 'reservoir' | 'unknown', oz, guessed, short, text }
 */
export function waterAmount(plant) {
  if (!plant) return { kind: 'unknown' };
  if (plant.pot_type === 'Self-watering') {
    return { kind: 'reservoir', short: 'Fill reservoir', text: 'Self-watering pot: top up the reservoir instead of watering the soil.' };
  }
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
    text: `About ${oz} oz${cups ? ` (${cups})` : ''}. Pour slowly; stop when a little drains out the bottom.`,
  };
}
