// Where plants live. Shared by "Add Plants" and the new-plant check.
export const AREA_OPTIONS = [
  { label: '🏠 Living Room', value: 'Living Room', environment: 'Indoor' },
  { label: '🍳 Kitchen', value: 'Kitchen', environment: 'Indoor' },
  { label: '🛏 Bedroom', value: 'Bedroom', environment: 'Indoor' },
  { label: '🪟 Window Sill', value: 'Window Sill', environment: 'Window Sill' },
  { label: '💼 Office', value: 'Office', environment: 'Office' },
  { label: '🌿 Greenhouse', value: 'Greenhouse', environment: 'Greenhouse' },
  { label: '🌳 Garden', value: 'Garden', environment: 'Outdoor' },
  { label: '🌞 Deck / Patio', value: 'Deck', environment: 'Patio' },
  { label: '🏡 Balcony', value: 'Balcony', environment: 'Balcony' },
  { label: '🌱 Raised Bed', value: 'Raised Bed', environment: 'Outdoor' },
  { label: '🏕 Front Yard', value: 'Front Yard', environment: 'Outdoor' },
  { label: '🌾 Backyard', value: 'Backyard', environment: 'Outdoor' },
];

export const ENVIRONMENTS = ['Indoor', 'Window Sill', 'Office', 'Greenhouse', 'Patio', 'Balcony', 'Outdoor'];

/** The areas this person already uses (most plants first), each with its usual environment. */
export function myAreas(plants, excludeId = null) {
  const m = new Map();
  for (const p of plants || []) {
    if (!p || p.id === excludeId) continue;
    const raw = String(p.location || '').trim();
    if (!raw) continue;
    const k = raw.toLowerCase();
    if (!m.has(k)) m.set(k, { value: raw, n: 0, envs: {} });
    const a = m.get(k);
    a.n++;
    if (p.environment) a.envs[p.environment] = (a.envs[p.environment] || 0) + 1;
  }
  return [...m.values()]
    .sort((a, b) => b.n - a.n)
    .map((a) => ({
      value: a.value,
      label: a.value,
      environment: Object.entries(a.envs).sort((x, y) => y[1] - x[1])[0]?.[0] || null,
      n: a.n,
    }));
}
