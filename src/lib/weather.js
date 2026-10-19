// Weather-smart watering (Plus) on the app side.
// The server decides once a day (functions/plus); plants carry the result in
// weather_hint, which only counts on the day it was made.
import { base44, clearUserCache } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import { refreshPlantData } from '@/lib/query-client';
import { isPlusCached } from '@/lib/premium';

export const RAIN_ENVS = ['Outdoor', 'Patio', 'Balcony'];
export const WEATHER_ENVS = ['Outdoor', 'Patio', 'Balcony', 'Greenhouse'];

export function todayHint(plant) {
  const h = plant?.weather_hint;
  if (!h || h.day !== localToday()) return null;
  return h;
}

export function getsRain(plant) {
  if (plant?.gets_rain === true) return true;
  if (plant?.gets_rain === false) return false;
  return RAIN_ENVS.includes(plant?.environment);
}

export function weatherApplies(plant) {
  return getsRain(plant) || WEATHER_ENVS.includes(plant?.environment);
}

/** Short chip text for plant cards, or null. */
export function hintChip(plant) {
  const h = todayHint(plant);
  if (!h) return null;
  if (h.kind === 'rain_credit') return { icon: '🌧️', text: 'Rain watered it' };
  if (h.kind === 'rain_hold') return { icon: '🌦️', text: 'Rain coming' };
  if (h.kind === 'rain_missed') return { icon: '☀️', text: 'No rain came' };
  if (h.kind === 'heat') return { icon: '🔥', text: 'Hot day' };
  if (h.frost_low_f != null) return { icon: '🥶', text: 'Frost tonight' };
  return null;
}

async function call(body) {
  const { data } = await base44.functions.invoke('plus', body);
  return data;
}

export async function saveLocation(location) {
  const data = await call({ action: 'geocode', location });
  clearUserCache(); // the server saved location fields on the user
  refreshPlantData();
  try { window.dispatchEvent(new CustomEvent('hp-location', { detail: data })); } catch { /* noop */ }
  return data;
}

export async function setGetsRain(plantId, getsRainValue) {
  const data = await call({ action: 'rain_toggle', plant_id: plantId, gets_rain: getsRainValue });
  refreshPlantData();
  return data;
}

// On app open: a location typed before (or outside) the app hasn't been looked up on
// the map yet. One lookup per location change, for everyone (free users too), so a
// typo or a whole-state location can be caught and asked about.
let geocodedFor = null;
export function ensureGeocoded(user) {
  const loc = String(user?.location || '').trim();
  if (!loc || user.location_geocoded_for === loc || geocodedFor === loc) return null;
  geocodedFor = loc;
  return call({ action: 'geocode' })
    .then((d) => {
      clearUserCache();
      try { window.dispatchEvent(new CustomEvent('hp-location', { detail: d })); } catch { /* noop */ }
      return d;
    })
    .catch(() => { geocodedFor = null; return null; });
}

// Once a day on app open: make sure today's weather has been applied (normally the
// hourly server job already did it at 5 AM; this covers a new location or a missed run).
let ran = null;
export function ensureTodayWeather(user) {
  if (!user?.email || !isPlusCached()) return null;
  const today = localToday();
  if (ran === today) return null;
  if (user.weather_day === today && user.weather_today?.place) { ran = today; return null; }
  ran = today;
  return call({ action: 'weather' })
    .then((d) => { if (d?.status === 'ok') { clearUserCache(); refreshPlantData(); } return d; })
    .catch(() => { ran = null; return null; });
}
