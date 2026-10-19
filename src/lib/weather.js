// Weather-smart watering (Plus) on the app side.
// The server decides once a day (functions/plus); plants carry the result in
// weather_hint, which only counts on the day it was made.
import { base44 } from '@/api/base44Client';
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
  refreshPlantData();
  return data;
}

export async function setGetsRain(plantId, getsRainValue) {
  const data = await call({ action: 'rain_toggle', plant_id: plantId, gets_rain: getsRainValue });
  refreshPlantData();
  return data;
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
    .then((d) => { if (d?.status === 'ok') refreshPlantData(); return d; })
    .catch(() => { ran = null; return null; });
}
