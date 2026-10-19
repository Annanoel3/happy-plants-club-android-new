import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

// Happy Plants Plus: weather-smart watering and care-schedule pushes.
//
// Called by:
//  - the hourly "Plus Daily" workflow → { action: 'sweep', key: PLUS_SWEEP_KEY } (no user needed)
//  - the app, signed in:
//      { action: 'geocode', location? }        save/look up the user's city
//      { action: 'weather' }                   today's weather + apply it to outdoor plants (Plus)
//      { action: 'rain_toggle', plant_id, gets_rain }   "rain doesn't reach this plant" (+ undo today's rain credit)
//      { action: 'care_suggest', plant_ids }   suggested fertilize / mist / rotate / repot intervals (Plus)
//
// Weather comes from MET Norway's Locationforecast API: free, commercial use allowed,
// asks for an identifying User-Agent and caching; data is CC BY 4.0 ("Data from MET Norway").
// City → coordinates uses OpenStreetMap Nominatim: one lookup when a user sets their
// location, saved on the user; max 1 request/second; "© OpenStreetMap contributors".
//
// Rules (outdoor plants only, Plus only, once per local day from 5 AM):
//  - Rain in the last 24h ≥ the plant's threshold → counts as a watering (cycle restarts).
//  - Rain forecast for the rest of today ≥ threshold and the plant is due → hold until tomorrow;
//    tomorrow it's either credited (it rained) or due again ("the rain didn't come").
//  - High today ≥ 90°F and the plant is due tomorrow → due today instead.
//  - Low tonight ≤ 32°F → frost warning on the plant, and one push around 4 PM local
//    ("Frost tonight") from the freshest forecast, if they have outdoor plants.
// Threshold: 0.5 in, or more for big pots (rain only lands on the pot's opening):
// max(0.5, 0.07 × pot diameter in inches).

const UA = 'HappyPlants/1.0 (+https://happyplants.club)';
const DEFAULT_TZ = 'America/Chicago';
const H = 3600 * 1000;
const RAIN_ENVS = ['Outdoor', 'Patio', 'Balcony'];
const HEAT_ENVS = ['Outdoor', 'Patio', 'Balcony', 'Greenhouse'];
const FROST_ENVS = ['Outdoor', 'Patio', 'Balcony'];
const HOT_F = 90;
const FROST_F = 32;
const MIN_RAIN_IN = 0.5;
const EVAL_FROM_HOUR = 5;
const CARE_FROM_HOUR = 9;
const CARE_UNTIL_HOUR = 11;
const FROST_FROM_HOUR = 16; // the hourly sweep runs at :20, so the first try is 4:20 PM
const FROST_UNTIL_HOUR = 19;

// ---------------------------------------------------------------- time helpers
const pad = (n: number) => String(n).padStart(2, '0');
function validTz(tz?: string | null): string {
    if (!tz) return DEFAULT_TZ;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}
function tzParts(ms: number, tz: string) {
    const f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const o: Record<string, string> = {};
    for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}
function tzOffsetMs(ms: number, tz: string): number {
    const p = tzParts(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}
function localToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let t = guess - tzOffsetMs(guess, tz);
    t = guess - tzOffsetMs(t, tz);
    return t;
}
function dayOf(ms: number, tz: string): string {
    const p = tzParts(ms, tz);
    return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function dayStartUtc(day: string, tz: string): number {
    const [y, m, d] = day.split('-').map(Number);
    return localToUtc(y, m, d, 0, 0, tz);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- units
const mmToIn = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
function fmtIn(inches: number): string {
    if (inches < 0.1) return 'a little rain';
    return `${Math.round(inches * 100) / 100} in`;
}

// ---------------------------------------------------------------- plants
function onVacation(p: any, today: string): boolean {
    if (!p.vacation_mode_enabled) return false;
    const start = p.vacation_start_date ? String(p.vacation_start_date).slice(0, 10) : null;
    const end = p.vacation_end_date ? String(p.vacation_end_date).slice(0, 10) : null;
    if (start && today < start) return false;
    if (end && today > end) return false;
    return true;
}
const plantName = (p: any) => p.nickname || p.name || 'Your plant';
function rainThreshold(p: any): number {
    const d = Number(p.pot_diameter_in);
    if (d > 0) return Math.max(MIN_RAIN_IN, Math.round(0.07 * d * 100) / 100);
    return MIN_RAIN_IN;
}
function getsRain(p: any): boolean {
    if (p.gets_rain === true) return true;
    if (p.gets_rain === false) return false;
    return RAIN_ENVS.includes(p.environment);
}
function pushHistory(list: any, entry: any) {
    const arr = Array.isArray(list) ? list.slice(-59) : [];
    arr.push(entry);
    return arr;
}

// ---------------------------------------------------------------- Plus
async function isPlus(db: any, userId: string): Promise<boolean> {
    const s = (await db.Subscription.filter({ user_id: userId }))?.[0];
    return !!(s && s.active && (!s.expires_at || Date.parse(s.expires_at) > Date.now()));
}

// ---------------------------------------------------------------- place search (Nominatim)
let lastNominatim = 0;
async function geocode(text: string) {
    const q = String(text || '').trim().slice(0, 120);
    if (!q) return { status: 'missing' as const };
    const wait = lastNominatim + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastNominatim = Date.now();
    const zip = q.match(/^(\d{5})(?:-\d{4})?$/);
    const params = zip ? `postalcode=${zip[1]}&countrycodes=us` : `q=${encodeURIComponent(q)}`;
    let res: Response;
    try {
        res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&${params}`, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
        });
    } catch (e) {
        return { status: 'error' as const, detail: (e as Error).message };
    }
    if (!res.ok) return { status: 'error' as const, detail: `HTTP ${res.status}` };
    const arr = await res.json().catch(() => []);
    const hit = arr?.[0];
    if (!hit) return { status: 'not_found' as const };
    const a = hit.address || {};
    const town = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.city_district || null;
    const region = a.state || a.province || a.region || a.state_district || null;
    const country = (a.country_code || '').toUpperCase() || null;
    const type = String(hit.addresstype || hit.type || '');
    const broad = ['state', 'country', 'region', 'province', 'territory', 'continent', 'state_district'].includes(type) || (!town && type !== 'postcode');
    const parts = [type === 'postcode' ? a.postcode : null, town, region, country].filter(Boolean);
    const label = [...new Set(parts)].join(', ') || String(hit.display_name || q).slice(0, 80);
    return { status: broad ? 'too_broad' as const : 'ok' as const, lat: +hit.lat, lon: +hit.lon, label, type };
}

async function saveGeo(db: any, user: any, text: string, g: any) {
    if (g.status === 'error') return; // try again next time; don't record a network hiccup as "not found"
    const patch: any = { location_geocoded_for: text, location_status: g.status };
    if (g.status === 'ok' || g.status === 'too_broad') {
        patch.location_lat = Math.round(g.lat * 1000) / 1000;
        patch.location_lon = Math.round(g.lon * 1000) / 1000;
        patch.location_label = g.label;
    } else {
        patch.location_lat = null; patch.location_lon = null; patch.location_label = null;
    }
    await db.User.update(user.id, patch);
    Object.assign(user, patch);
}

function needsGeocode(user: any): boolean {
    const loc = String(user.location || '').trim();
    if (!loc) return false;
    return user.location_geocoded_for !== loc;
}

// ---------------------------------------------------------------- weather (MET Norway)
// Hourly rows are stored per ~11 km grid square so past hours (rain that already fell)
// stay around after they drop off the forecast. Only 1-hour rows are kept.
async function loadWeather(db: any, lat: number, lon: number, memo: Map<string, any>) {
    const glat = (Math.round(lat * 10) / 10).toFixed(1);
    const glon = (Math.round(lon * 10) / 10).toFixed(1);
    const grid = `${glat},${glon}`;
    if (memo.has(grid)) return memo.get(grid);
    const now = Date.now();
    const row = (await db.WeatherCache.filter({ grid }))?.[0] || null;
    let hours: Record<string, any> = row?.hours || {};
    let fetchedAt = row?.fetched_at || null;
    let error: string | null = null;
    const fresh = row?.expires_at && Date.parse(row.expires_at) > now;
    if (!fresh) {
        try {
            const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' };
            if (row?.last_modified) headers['If-Modified-Since'] = row.last_modified;
            const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${glat}&lon=${glon}`, { headers });
            const expHeader = res.headers.get('expires');
            let expires = expHeader ? Date.parse(expHeader) : NaN;
            if (isNaN(expires) || expires < now + 10 * 60 * 1000) expires = now + 30 * 60 * 1000;
            if (res.status === 200) {
                const j = await res.json();
                const next: Record<string, any> = { ...hours };
                for (const t of j?.properties?.timeseries || []) {
                    const ms = Date.parse(t.time);
                    const d = t.data || {};
                    const p = d.next_1_hours?.details?.precipitation_amount;
                    if (isNaN(ms) || typeof p !== 'number') continue;
                    next[new Date(ms).toISOString().slice(0, 13)] = { p, t: d.instant?.details?.air_temperature ?? null };
                }
                for (const k of Object.keys(next)) {
                    if (Date.parse(k + ':00:00Z') < now - 72 * H) delete next[k];
                }
                hours = next;
                fetchedAt = new Date(now).toISOString();
                const patch = {
                    grid, lat: +glat, lon: +glon, hours, fetched_at: fetchedAt,
                    expires_at: new Date(expires).toISOString(),
                    last_modified: res.headers.get('last-modified') || null,
                };
                if (row) await db.WeatherCache.update(row.id, patch);
                else await db.WeatherCache.create(patch);
            } else if (res.status === 304 && row) {
                await db.WeatherCache.update(row.id, { expires_at: new Date(expires).toISOString() });
            } else {
                error = `MET ${res.status}`;
                await res.text().catch(() => '');
            }
        } catch (e) {
            error = (e as Error).message;
        }
    }
    const wx = { grid, hours, fetchedAt, error };
    memo.set(grid, wx);
    return wx;
}

function summarize(hours: Record<string, any>, now: number, tz: string) {
    const today = dayOf(now, tz);
    const start = dayStartUtc(today, tz);
    const end = dayStartUtc(addDays(today, 1), tz);
    const lowFrom = Math.max(now, start + 15 * H); // "tonight" = from 3 PM today…
    const lowUntil = end + 10 * H; // …through tomorrow ~10 AM
    const curHour = Math.floor(now / H) * H;
    let past = 0, pastN = 0, rest = 0, restN = 0, hi = -Infinity, lo = Infinity;
    for (const [k, v] of Object.entries(hours)) {
        const ms = Date.parse(k + ':00:00Z');
        if (isNaN(ms)) continue;
        const p = typeof v?.p === 'number' ? v.p : 0;
        const t = typeof v?.t === 'number' ? v.t : null;
        if (ms >= curHour - 24 * H && ms < curHour) { past += p; pastN++; }
        if (ms >= curHour && ms < end) { rest += p; restN++; }
        if (t !== null && ms >= start && ms < end) hi = Math.max(hi, t);
        if (t !== null && ms >= Math.floor(lowFrom / H) * H && ms < lowUntil) lo = Math.min(lo, t);
    }
    return {
        day: today,
        rain_past_in: mmToIn(past),
        past_hours: pastN,
        rain_today_in: mmToIn(rest),
        forecast_hours: restN,
        high_f: hi === -Infinity ? null : cToF(hi),
        low_f: lo === Infinity ? null : cToF(lo),
    };
}

// Decide today's changes for each plant. Pure: returns patches, doesn't write.
function decide(plants: any[], s: any, today: string) {
    const out: { id: string; patch: any }[] = [];
    const counts = { rain_credit: 0, rain_hold: 0, rain_missed: 0, heat: 0, frost: 0 };
    const yesterday = addDays(today, -1);
    const pastTrusted = s.past_hours >= 18;
    for (const p of plants) {
        if (onVacation(p, today)) continue;
        const rainOk = getsRain(p);
        const heatOk = HEAT_ENVS.includes(p.environment);
        const frostOk = FROST_ENVS.includes(p.environment);
        if (!rainOk && !heatOk && !frostOk) {
            if (p.weather_hint) out.push({ id: p.id, patch: { weather_hint: null } });
            continue;
        }
        const lastW = String(p.last_watered || '').slice(0, 10);
        const due = String(p.next_watering_due || '').slice(0, 10);
        const freq = Number(p.water_frequency_days) || 7;
        const thr = rainThreshold(p);
        const prev = p.weather_hint && p.weather_hint.day === yesterday ? p.weather_hint : null;
        const patch: any = {};
        let hint: any = null;

        if (rainOk && due && pastTrusted && s.rain_past_in >= thr) {
            if (lastW < today) {
                hint = {
                    kind: 'rain_credit', rain_in: s.rain_past_in,
                    text: `It rained about ${fmtIn(s.rain_past_in)}, so that counts as today's watering.`,
                    prev_last_watered: p.last_watered || null, prev_next_due: p.next_watering_due || null,
                };
                patch.last_watered = today;
                patch.next_watering_due = addDays(today, freq);
                patch.care_history = pushHistory(p.care_history, { type: 'rain', date: today, amount_in: s.rain_past_in });
                if (p.status === 'wilted') patch.status = 'healthy';
                counts.rain_credit++;
            }
        } else if (rainOk && due && due <= today && lastW !== today && s.rain_today_in >= thr && prev?.kind !== 'rain_hold') {
            // Hold at most one day: if yesterday's rain didn't add up, it gets watered today
            // even if more rain is forecast, so a drizzly week can't keep it dry for days.
            hint = {
                kind: 'rain_hold', rain_in: s.rain_today_in,
                text: `Rain is on the way today (about ${fmtIn(s.rain_today_in)}). Skip watering; we'll check again tomorrow.`,
                prev_next_due: p.next_watering_due || null,
            };
            patch.next_watering_due = addDays(today, 1);
            counts.rain_hold++;
        } else if (rainOk && prev?.kind === 'rain_hold' && due && due <= today && lastW !== today) {
            hint = { kind: 'rain_missed', text: 'Not enough rain fell. Water it today.' };
            counts.rain_missed++;
        } else if (heatOk && s.high_f !== null && s.high_f >= HOT_F && due === addDays(today, 1) && lastW !== today) {
            hint = {
                kind: 'heat', high_f: s.high_f,
                text: `Hot day (${s.high_f}°F). Water today instead of tomorrow.`,
                prev_next_due: p.next_watering_due || null,
            };
            patch.next_watering_due = today;
            counts.heat++;
        }

        if (frostOk && s.low_f !== null && s.low_f <= FROST_F) {
            hint = hint || { kind: 'frost' };
            hint.frost_low_f = s.low_f;
            hint.frost_text = `Frost tonight (${s.low_f}°F). Cover it or bring it inside.`;
            counts.frost++;
        }

        if (hint) {
            hint.day = today;
            patch.weather_hint = hint;
        } else if (p.weather_hint) {
            patch.weather_hint = null;
        }
        if (Object.keys(patch).length) out.push({ id: p.id, patch });
    }
    return { patches: out, counts };
}

async function evaluateUser(db: any, user: any, now: number, memo: Map<string, any>, opts: { force?: boolean } = {}) {
    const tz = validTz(user.timezone);
    const today = dayOf(now, tz);
    if (!opts.force && user.weather_day === today) return { status: 'already' };
    if (tzParts(now, tz).h < EVAL_FROM_HOUR && !opts.force) return { status: 'too_early' };
    if (typeof user.location_lat !== 'number' || typeof user.location_lon !== 'number') return { status: 'no_location' };
    const wx = await loadWeather(db, user.location_lat, user.location_lon, memo);
    if (!Object.keys(wx.hours || {}).length) return { status: 'no_weather', error: wx.error };
    const s = summarize(wx.hours, now, tz);
    if (s.forecast_hours === 0 && s.past_hours === 0) return { status: 'no_weather', error: wx.error || 'stale' };
    const plants = (await db.Plant.filter({ created_by: user.email }, '-created_date', 500)) || [];
    const { patches, counts } = decide(plants, s, today);
    for (const { id, patch } of patches) {
        try { await db.Plant.update(id, patch); } catch (e) { console.warn('plant patch failed', id, (e as Error).message); }
    }
    const weather_today = {
        ...s, place: user.location_label || user.location || null, updated_at: new Date(now).toISOString(),
        rain_trusted: s.past_hours >= 18, counts,
    };
    await db.User.update(user.id, { weather_day: today, weather_today });
    user.weather_day = today;
    user.weather_today = weather_today;
    return { status: 'ok', weather_today, changed: patches.length };
}

// ---------------------------------------------------------------- care pushes
const CARE_TYPES = ['fertilize', 'repot', 'mist', 'rotate'];
function careLine(type: string, name: string): string {
    if (type === 'fertilize') return `Fertilize ${name}`;
    if (type === 'mist') return `Mist ${name}`;
    if (type === 'rotate') return `Give ${name} a quarter turn`;
    return `Check if ${name} needs a bigger pot`;
}
// Same winter rule as src/lib/care.js: fertilizing rests Nov–Feb up north, May–Aug down
// south, never in the tropics, and a resting task is never due before spring.
function hemisphereOf(lat: any): 'north' | 'south' | 'tropics' {
    if (typeof lat !== 'number') return 'north';
    if (Math.abs(lat) < 23.5) return 'tropics';
    return lat < 0 ? 'south' : 'north';
}
function isDormant(day: string, hemi: string): boolean {
    const m = Number(day.slice(5, 7));
    if (hemi === 'tropics') return false;
    if (hemi === 'south') return m >= 5 && m <= 8;
    return m === 11 || m === 12 || m === 1 || m === 2;
}
function seasonStart(day: string, hemi: string): string {
    const y = Number(day.slice(0, 4));
    const m = Number(day.slice(5, 7));
    if (hemi === 'south') return m >= 9 ? `${y + 1}-09-01` : `${y}-09-01`;
    return m >= 3 ? `${y + 1}-03-01` : `${y}-03-01`;
}
function effectiveNext(type: string, task: any, hemi: string, today: string): string {
    const next = String(task?.next || '').slice(0, 10);
    if (!next) return next;
    if (type === 'fertilize' && task?.winter_pause !== false && hemi !== 'tropics') {
        if (isDormant(today, hemi)) {
            const spring = seasonStart(today, hemi);
            if (next < spring) return spring;
        }
        if (isDormant(next, hemi)) return seasonStart(next, hemi);
    }
    return next;
}
function careDueToday(plants: any[], today: string, lat?: any) {
    const hemi = hemisphereOf(lat);
    const due: { plant: any; type: string; next: string }[] = [];
    for (const p of plants) {
        if (onVacation(p, today)) continue;
        const cs = p.care_schedule || {};
        for (const t of CARE_TYPES) {
            const task = cs[t];
            if (!task?.on || !task.next) continue;
            const next = effectiveNext(t, task, hemi, today);
            if (next <= today) due.push({ plant: p, type: t, next });
        }
    }
    due.sort((a, b) => a.next.localeCompare(b.next));
    return due;
}
function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}
async function sendCarePush(email: string, due: any[]) {
    const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
    const key = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !key) return { id: null, detail: 'no onesignal' };
    const first = careLine(due[0].type, plantName(due[0].plant));
    const body = due.length === 1 ? first : `${first} + ${due.length - 1} more`;
    const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: osAuth(key) },
        body: JSON.stringify({
            app_id: appId,
            include_aliases: { external_id: [email] },
            target_channel: 'push',
            headings: { en: '🌱 Plant care today' },
            contents: { en: body },
            data: { type: 'care', count: due.length, screen: '/Schedule' },
            priority: 10,
            ttl: 8 * 60 * 60,
        }),
    });
    const j = await res.json().catch(() => ({}));
    return { id: j?.id || null, detail: j };
}

async function sendFrostPush(email: string, cold: any[], lowF: number) {
    const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
    const key = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !key) return { id: null, detail: 'no onesignal' };
    const first = plantName(cold[0]);
    const body = cold.length === 1
        ? `Cover ${first} or bring it inside.`
        : `Cover or bring in ${first} + ${cold.length - 1} more outdoor plant${cold.length === 2 ? '' : 's'}.`;
    const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: osAuth(key) },
        body: JSON.stringify({
            app_id: appId,
            include_aliases: { external_id: [email] },
            target_channel: 'push',
            headings: { en: `🥶 Frost tonight (${lowF}°F)` },
            contents: { en: body },
            data: { type: 'frost', count: cold.length, screen: '/' },
            priority: 10,
            ttl: 6 * 60 * 60,
        }),
    });
    const j = await res.json().catch(() => ({}));
    return { id: j?.id || null, detail: j };
}

// ---------------------------------------------------------------- care suggestions (LLM)
function clampInt(v: any, min: number, max: number, dflt: number) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
const INDOORISH = ['Indoor', 'Window Sill', 'Office'];
function fallbackCare(p: any) {
    const type = p.plant_type || '';
    const indoor = !p.environment || INDOORISH.includes(p.environment);
    const humid = /high humidity|humid|mist/i.test(String(p.care_instructions?.humidity || ''));
    let fert = 30, repotMonths = 18, mist = false;
    if (type === 'Succulents & Cacti') { fert = 45; repotMonths = 24; }
    else if (['Herbs', 'Vegetables', 'Annuals', 'Flowers'].includes(type)) { fert = 14; repotMonths = 12; }
    else if (['Trees & Shrubs', 'Perennials'].includes(type)) { fert = 60; repotMonths = 24; }
    else if (type === 'Houseplants') { mist = humid && indoor; }
    return {
        fertilize: { every_days: fert, winter_pause: true },
        mist: { useful: mist, every_days: 3 },
        rotate: { useful: indoor, every_days: 14 },
        repot: { every_days: repotMonths * 30 },
        note: null,
        source: 'default',
    };
}

async function suggestCare(plants: any[]) {
    const out: Record<string, any> = {};
    for (const p of plants) out[p.id] = fallbackCare(p);
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key || !plants.length) return out;
    const list = plants.slice(0, 25).map((p) => ({
        id: p.id,
        name: p.name,
        scientific_name: p.scientific_name || null,
        type: p.plant_type || null,
        environment: p.environment || null,
        fertilizing_notes: String(p.care_instructions?.fertilizing || '').slice(0, 200) || null,
        humidity_notes: String(p.care_instructions?.humidity || '').slice(0, 200) || null,
    }));
    try {
        const openai = new OpenAI({ apiKey: key });
        const r = await openai.chat.completions.create({
            model: 'gpt-6-luna',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `You are a careful horticulturist. For each plant, suggest a simple home-care schedule.
Return JSON: {"plants":[{"id":"...","fertilize":{"every_days":30,"winter_pause":true},"mist":{"useful":false,"every_days":3},"rotate":{"useful":true,"every_days":14},"repot":{"every_months":18},"note":"one short sentence, or null"}]}
Rules:
- fertilize.every_days between 7 and 90, for the growing season. winter_pause true unless the plant actively grows in winter.
- mist.useful true ONLY for plants that benefit from extra humidity (ferns, calatheas, orchids, air plants...). Never for succulents, cacti or fuzzy-leaved plants.
- rotate.useful true only for plants kept indoors near a window (they lean toward light). False for outdoor plants.
- repot.every_months between 6 and 36 (this is a "check if it needs a bigger pot" reminder).
- Use the given notes when they say something specific. Keep the same ids.`,
                },
                { role: 'user', content: JSON.stringify(list) },
            ],
        });
        const j = JSON.parse(r.choices?.[0]?.message?.content || '{}');
        for (const s of j?.plants || []) {
            if (!s?.id || !out[s.id]) continue;
            const fb = out[s.id];
            out[s.id] = {
                fertilize: {
                    every_days: clampInt(s.fertilize?.every_days, 7, 90, fb.fertilize.every_days),
                    winter_pause: s.fertilize?.winter_pause !== false,
                },
                mist: { useful: !!s.mist?.useful, every_days: clampInt(s.mist?.every_days, 1, 14, 3) },
                rotate: { useful: !!s.rotate?.useful, every_days: clampInt(s.rotate?.every_days, 7, 30, 14) },
                repot: { every_days: clampInt(s.repot?.every_months, 6, 36, 18) * 30 },
                note: typeof s.note === 'string' ? s.note.slice(0, 160) : null,
                source: 'ai',
            };
        }
    } catch (e) {
        console.warn('care suggestion LLM failed, using defaults:', (e as Error).message);
    }
    return out;
}

// ---------------------------------------------------------------- watering profiles (everyone)
// For each plant, once: how it gets its water (pour / self-watering reservoir / soak /
// mist / bottom / lives in water), whether it's finicky about watering timing (then
// "Even out my schedule" never moves it), and for succulents, cacti and other
// drought-tolerant plants a growing-season and a rest-season interval, switched
// automatically with the seasons. Filled in by the hourly sweep for every user's new
// plants, or right away from the app. A person's own edits are never overwritten.
//
// Anchors for the intervals (see the report to Anna for sources):
//  - outdoor potted succulents in warm, dry weather: about every 5-7 days (Gardenia)
//  - indoors: every 2-3 weeks; winter: only a couple of times (Illinois Extension)
//  - fall/winter rest: every 3-4 weeks or less (Gardenia)
const PROFILE_V = 1;
const WATER_METHODS = ['pour', 'reservoir', 'soak', 'mist', 'bottom', 'in_water'];
const PROFILE_GROUPS = ['succulent', 'cactus', 'caudiciform', 'forest_cactus', 'tropical_foliage', 'fern', 'orchid', 'air_plant', 'carnivorous', 'aquatic', 'bulb', 'herb_vegetable', 'flowering', 'tree_shrub', 'other'];

function inRestSeason(day: string, hemi: string, rest: string | null | undefined): boolean {
    if (!rest || hemi === 'tropics') return false;
    const m = Number(day.slice(5, 7));
    if (rest === 'summer') return hemi === 'south' ? [12, 1, 2].includes(m) : [6, 7, 8].includes(m);
    return isDormant(day, hemi); // winter: Nov-Feb north, May-Aug south
}

// Put the right season's interval in water_frequency_days (and move the next date to
// match). Returns null when nothing needs to change.
function seasonalPatch(p: any, today: string, hemi: string): any {
    const grow = Number(p.water_days_grow) || 0, rest = Number(p.water_days_rest) || 0;
    if (!grow || !rest) return null;
    const season = inRestSeason(today, hemi, p.water_rest_season || 'winter') ? 'rest' : 'grow';
    const every = season === 'rest' ? rest : grow;
    if (p.water_season === season && Number(p.water_frequency_days) === every) return null;
    const patch: any = { water_season: season, water_frequency_days: every };
    const last = String(p.last_watered || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(last)) {
        let next = addDays(last, every);
        if (next < today) next = today; // overdue stays due today; never a date in the past
        patch.next_watering_due = next;
    }
    return patch;
}

async function aiProfiles(plants: any[], ctx: { today: string; place: string | null; hemi: string }) {
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key || !plants.length) return null;
    const list = plants.slice(0, 25).map((p) => ({
        id: p.id,
        name: p.name,
        scientific_name: p.scientific_name || null,
        type: p.plant_type || null,
        environment: p.environment || null,
        pot_type: p.pot_type || null,
        substrate: p.substrate_type || null,
        sun: p.sun_exposure || null,
        size: p.plant_size || null,
        current_every_days: Number(p.water_frequency_days) || null,
        watering_notes: String(p.care_instructions?.watering || '').slice(0, 400) || null,
    }));
    const openai = new OpenAI({ apiKey: key });
    const r = await openai.chat.completions.create({
        model: 'gpt-6-luna',
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: `You are a careful horticulturist setting up a plant-care app's watering schedule.
Today is ${ctx.today}. The owner's location: ${ctx.place || 'unknown'} (${ctx.hemi === 'tropics' ? 'tropics' : ctx.hemi + 'ern hemisphere'}).
Return JSON: {"plants":[{"id":"...","group":"succulent","method":"pour","strict":false,"drought_tolerant":true,"rest_season":"winter","grow_days":7,"rest_days":21,"why":"..."}]}
Fields:
- group: one of ${PROFILE_GROUPS.join(', ')}.
- method: how the plant gets its water.
  "pour" = normal watering of the soil (most plants).
  "soak" = dunk or soak the whole plant or its mount: mounted staghorn ferns, mounted orchids, air plants (Tillandsia).
  "mist" = only when misting IS the plant's watering (rare).
  "bottom" = usually watered from below: African violets and other gesneriads that rot if the crown gets wet.
  "in_water" = the plant lives in water: lucky bamboo in water, cuttings in water, aquatic plants.
  Never answer "reservoir" (the app sets that from the pot type).
- strict: true if the plant is finicky about watering timing, so moving its watering day by one or two days could hurt it: tropical and humidity-loving plants, ferns, orchids, carnivorous plants, air plants, rare or collector plants (when unsure about a collector plant, say true), plants with unusual growth cycles (living stones, winter-growing bulbs), seedlings and cuttings, and anything that needs water every 3 days or less. false for tough, forgiving plants (most succulents and cacti, snake plants, ZZ, pothos, dracaenas).
- drought_tolerant: true for succulents, cacti, caudiciforms and other plants that should dry out fully between waterings.
- rest_season, grow_days, rest_days: ONLY for drought_tolerant plants whose needs follow a simple growing season and rest season; otherwise null.
  rest_season: "winter" for most (they grow in the warm months), "summer" for winter growers (Aeonium, many mesembs).
  grow_days: days between waterings in its growing season, for THIS plant's spot (indoor/outdoor, pot, sun) in the owner's climate. Guide: outdoor potted succulents in warm, dry weather about every 5-7 days; indoors about every 10-21 days. Small pots and terracotta dry faster.
  rest_days: days between waterings in its rest season. Guide: every 21-30 days or less often.
  If the plant's watering depends on its own cycle in a way two seasons can't capture (Lithops and other living stones, Conophytum, winter bulbs), use null for all three.
- why: one short sentence.
Keep the same ids. Be realistic, not cautious-to-a-fault: overwatering kills more succulents than underwatering.`,
            },
            { role: 'user', content: JSON.stringify(list) },
        ],
    });
    const j = JSON.parse(r.choices?.[0]?.message?.content || '{}');
    const out: Record<string, any> = {};
    for (const s of j?.plants || []) if (s?.id) out[s.id] = s;
    return out;
}

// The watering paragraph for seasonal plants, written from the saved numbers so the text
// and the schedule can never disagree.
function seasonalWateringText(grow: number, rest: number, restSeason: string): string {
    const resting = restSeason === 'summer' ? 'in summer, when it rests' : 'in winter, when it rests';
    return `Water until it drains out the bottom, then let the soil dry out completely. While it's growing, that's about every ${grow} days; ${resting}, about every ${rest} days or less. Always check that the soil is dry first, and skip a watering if it isn't.`;
}

// What to save for one plant, given the AI's answer. Never undoes a person's own choices.
function profilePatch(p: any, ai: any, today: string, hemi: string): any {
    const prof = p.care_profile || {};
    const patch: any = {};
    const every = Number(p.water_frequency_days) || 7;
    if (!prof.user_method) {
        const m = p.pot_type === 'Self-watering' ? 'reservoir'
            : (WATER_METHODS.includes(ai?.method) && ai.method !== 'reservoir' ? ai.method : 'pour');
        patch.water_method = m;
    }
    if (!prof.user_strict) patch.water_strict = !!ai?.strict || every <= 3;
    const grow = clampInt(ai?.grow_days, 3, 45, 0);
    const rest = clampInt(ai?.rest_days, 7, 60, 0);
    // Sanity limits, because the model can contradict itself: a drought-tolerant plant
    // watered more often than every 5 days, resting less than 2 weeks, or a big jump to
    // more watering than it had (under half its old interval) is not applied.
    const prevEvery = Number(prof.prev_every) || every;
    const sane = grow >= 5 && rest >= 14 && grow >= Math.floor(prevEvery / 2);
    const seasonal = !!ai?.drought_tolerant && grow > 0 && rest > 0 && sane && !prof.user_interval
        && (patch.water_method || p.water_method) !== 'in_water';
    if (seasonal) {
        const restSeason = ai.rest_season === 'summer' ? 'summer' : 'winter';
        const restDays = Math.max(rest, grow);
        patch.water_days_grow = grow;
        patch.water_days_rest = restDays;
        patch.water_rest_season = restSeason;
        patch.care_instructions = { ...(p.care_instructions || {}), watering: seasonalWateringText(grow, restDays, restSeason) };
        Object.assign(patch, seasonalPatch({ ...p, ...patch, water_season: null }, today, hemi) || {});
    }
    patch.care_profile = {
        ...prof,
        v: PROFILE_V,
        group: PROFILE_GROUPS.includes(ai?.group) ? ai.group : 'other',
        why: typeof ai?.why === 'string' ? ai.why.slice(0, 200) : null,
        at: new Date().toISOString(),
        source: 'ai',
        prev_every: every,
        prev_next_due: p.next_watering_due || null,
    };
    return patch;
}

function ownerCtx(u: any, now: number) {
    const tz = validTz(u?.timezone);
    return {
        today: dayOf(now, tz),
        place: u?.location_label || u?.location || null,
        hemi: hemisphereOf(u?.location_lat),
    };
}

// Profile up to `limit` plants that don't have one yet (oldest first per owner batch).
async function profilePlants(db: any, plants: any[], owner: any, now: number) {
    const ctx = ownerCtx(owner, now);
    let done = 0;
    for (let i = 0; i < plants.length; i += 25) {
        const batch = plants.slice(i, i + 25);
        let ai: Record<string, any> | null = null;
        try { ai = await aiProfiles(batch, ctx); } catch (e) { console.warn('profile AI failed', (e as Error).message); }
        if (!ai) break; // try again on the next run
        for (const p of batch) {
            if (!ai[p.id]) continue;
            try { await db.Plant.update(p.id, profilePatch(p, ai[p.id], ctx.today, ctx.hemi)); done++; } catch (e) { console.warn('profile save failed', p.id, (e as Error).message); }
        }
    }
    return done;
}

const needsProfile = (p: any) => !p?.care_profile || (Number(p.care_profile.v) || 0) < PROFILE_V;

// Spread out a pile-up of watering days. Moves only forgiving plants (not strict, not on
// vacation, watered every 5+ days), by at most 1-3 days depending on how long they go
// between waterings, and never to a day in the past. Overdue plants are never pushed later.
function planEvenOut(plants: any[], today: string, horizon = 14) {
    const days: string[] = [];
    for (let i = 0; i < horizon; i++) days.push(addDays(today, i));
    const last = days[days.length - 1];
    const due = (p: any) => {
        const d = String(p.next_watering_due || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
        return d < today ? today : d;
    };
    const active = plants.filter((p) => !onVacation(p, today) && due(p) && due(p)! <= last);
    const count: Record<string, number> = {};
    for (const d of days) count[d] = 0;
    for (const p of active) count[due(p)!]++;
    const before = Math.max(0, ...Object.values(count));
    const cap = Math.max(3, Math.ceil((active.length / horizon) * 1.25));
    const movable = (p: any) => !p.water_strict && (Number(p.water_frequency_days) || 7) >= 5
        && p.water_method !== 'in_water' && String(p.last_watered || '').slice(0, 10) !== today;
    const maxShift = (p: any) => { const e = Number(p.water_frequency_days) || 7; return e >= 14 ? 3 : e >= 7 ? 2 : 1; };
    const moves: any[] = [];
    const moved = new Set<string>();
    for (const d of days) {
        if (count[d] <= cap) continue;
        const here = active.filter((p) => due(p) === d && movable(p) && !moved.has(p.id))
            .sort((a, b) => (Number(b.water_frequency_days) || 7) - (Number(a.water_frequency_days) || 7));
        for (const p of here) {
            if (count[d] <= cap) break;
            const overdue = String(p.next_watering_due).slice(0, 10) < today;
            const s = maxShift(p);
            let best: string | null = null;
            for (let k = 1; k <= s && !best; k++) {
                const later = addDays(d, k), earlier = addDays(d, -k);
                const opts = [!overdue ? later : null, earlier >= today ? earlier : null]
                    .filter((t): t is string => !!t && t <= last && count[t] < cap)
                    .sort((a, b) => count[a] - count[b]);
                if (opts.length) best = opts[0];
            }
            if (!best) continue;
            count[d]--; count[best]++;
            moved.add(p.id);
            moves.push({ id: p.id, name: plantName(p), area: (p.location || '').trim() || null, from: String(p.next_watering_due).slice(0, 10), to: best });
        }
    }
    const after = Math.max(0, ...Object.values(count));
    const strictCount = active.filter((p) => p.water_strict).length;
    return { moves, before_max: before, after_max: after, cap, strict_skipped: strictCount, per_day: days.map((d) => ({ day: d, count: count[d] })) };
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const action = body?.action || 'sweep';
        const db = base44.asServiceRole.entities;
        const now = Date.now();
        const memo = new Map<string, any>();

        // Admin, one-time repair: rewrite the watering paragraph of every seasonal plant from its
        // saved numbers (the first rollout used the model's own text, which could disagree).
        if (action === 'profile_retext') {
            const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
            if (!sweepKey || body.key !== sweepKey) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const rows = (await db.Plant.filter({ water_days_rest: { $gt: 0 } }, '-created_date', 2000)) || [];
            let n = 0;
            for (const p of rows) {
                const g = Number(p.water_days_grow) || 0, r = Number(p.water_days_rest) || 0;
                if (!g || !r) continue;
                const text = seasonalWateringText(g, r, p.water_rest_season || 'winter');
                if (p.care_instructions?.watering === text) continue;
                await db.Plant.update(p.id, { care_instructions: { ...(p.care_instructions || {}), watering: text } });
                n++;
            }
            return Response.json({ success: true, rewritten: n });
        }

        // Admin check: what "Even out my schedule" would move for one account (no writes).
        if (action === 'even_out_preview') {
            const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
            if (!sweepKey || body.key !== sweepKey) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const owner = (await db.User.filter({ email: String(body.email || '') }))?.[0];
            if (!owner) return Response.json({ error: 'Not found' }, { status: 404 });
            const mine = (await db.Plant.filter({ created_by: owner.email }, '-created_date', 1000)) || [];
            return Response.json({ success: true, ...planEvenOut(mine, dayOf(now, validTz(owner.timezone))) });
        }

        // Admin check before rolling profiles out: what WOULD change for one account (no writes).
        if (action === 'profile_preview') {
            const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
            if (!sweepKey || body.key !== sweepKey) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const owner = (await db.User.filter({ email: String(body.email || '') }))?.[0];
            if (!owner) return Response.json({ error: 'Not found' }, { status: 404 });
            const ctx = ownerCtx(owner, now);
            const plants = ((await db.Plant.filter({ created_by: owner.email }, '-created_date', 500)) || [])
                .filter((p: any) => body.all === true || needsProfile(p)).slice(0, 50);
            const rows: any[] = [];
            for (let i = 0; i < plants.length; i += 25) {
                const batch = plants.slice(i, i + 25);
                const ai = await aiProfiles(batch, ctx);
                for (const p of batch) {
                    const a = ai?.[p.id];
                    const patch = a ? profilePatch(p, a, ctx.today, ctx.hemi) : null;
                    rows.push({
                        name: plantName(p), area: p.location || null, was_every: p.water_frequency_days, was_next: p.next_watering_due,
                        ai: a ? { group: a.group, method: a.method, strict: a.strict, drought_tolerant: a.drought_tolerant, rest_season: a.rest_season, grow_days: a.grow_days, rest_days: a.rest_days, why: a.why } : null,
                        now_every: patch?.water_frequency_days ?? p.water_frequency_days, now_next: patch?.next_watering_due ?? p.next_watering_due,
                        method: patch?.water_method, strict: patch?.water_strict, watering_text: patch?.care_instructions?.watering ?? null,
                    });
                }
            }
            return Response.json({ success: true, ctx, rows });
        }

        if (action === 'sweep') {
            // Only the Plus Daily workflow may run the sweep (it passes this key in its args),
            // so nobody can hammer the weather/map services through it.
            const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
            if (!sweepKey || body.key !== sweepKey) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            // Testing only: { test_frost: { email, low_f } } pretends tonight's low is low_f for
            // that one account (any time of day), so the frost push can be checked end to end.
            const tf = body.test_frost;
            const testFrost = tf && typeof tf.email === 'string' && Number.isFinite(Number(tf.low_f))
                ? { email: tf.email, low_f: Math.round(Number(tf.low_f)) } : null;
            const subs = (await db.Subscription.filter({ active: true }, '-updated_date', 1000)) || [];
            const plusIds = new Set(subs
                .filter((s: any) => !s.expires_at || Date.parse(s.expires_at) > now)
                .map((s: any) => s.user_id));
            const users = (await db.User.list('-created_date', 1000)) || [];
            const stats: Record<string, number> = {};
            const bump = (k: string) => { stats[k] = (stats[k] || 0) + 1; };
            let geocodes = 0;
            for (const u of users) {
                if (!plusIds.has(u.id) || !u.email) continue;
                try {
                    if (needsGeocode(u) && geocodes < 20) {
                        geocodes++;
                        await saveGeo(db, u, String(u.location).trim(), await geocode(String(u.location)));
                        bump('geocoded');
                    }
                    const tz = validTz(u.timezone);
                    const hour = tzParts(now, tz).h;
                    // Keep this user's weather square fresh every hour, so rain that falls
                    // overnight is on record when the morning check runs.
                    if (typeof u.location_lat === 'number' && typeof u.location_lon === 'number') {
                        await loadWeather(db, u.location_lat, u.location_lon, memo);
                    }
                    const r = await evaluateUser(db, u, now, memo);
                    bump(`weather_${r.status}`);

                    // One care push a day, max.
                    const today = dayOf(now, tz);
                    if (hour >= CARE_FROM_HOUR && hour <= CARE_UNTIL_HOUR && u.care_push_day !== today && u.notifications_care !== false) {
                        const plants = (await db.Plant.filter({ created_by: u.email }, '-created_date', 500)) || [];
                        const due = careDueToday(plants, today, u.location_lat);
                        if (due.length) {
                            await db.User.update(u.id, { care_push_day: today }); // claim first: never twice
                            const s = await sendCarePush(u.email, due);
                            bump(s.id ? 'care_sent' : 'care_failed');
                            if (!s.id) console.warn('care push failed', u.email, JSON.stringify(s.detail).slice(0, 200));
                        }
                    }

                    // Frost alert: one a day at most, late afternoon, from the freshest forecast
                    // (this user's weather square was refreshed above). test_frost lets the
                    // sweep key holder fake a low for one account to test the whole path.
                    const fakeLow = testFrost && testFrost.email === u.email ? testFrost.low_f : null;
                    const frostHour = fakeLow !== null || (hour >= FROST_FROM_HOUR && hour <= FROST_UNTIL_HOUR);
                    if (frostHour && u.frost_push_day !== today && u.notifications_frost !== false
                        && typeof u.location_lat === 'number' && typeof u.location_lon === 'number') {
                        let low: number | null = fakeLow;
                        if (low === null) {
                            const wx = await loadWeather(db, u.location_lat, u.location_lon, memo);
                            low = Object.keys(wx.hours || {}).length ? summarize(wx.hours, now, tz).low_f : null;
                        }
                        if (low !== null && low <= FROST_F) {
                            const plants = (await db.Plant.filter({ created_by: u.email }, '-created_date', 500)) || [];
                            const cold = plants.filter((p: any) => FROST_ENVS.includes(p.environment) && !onVacation(p, today));
                            if (cold.length) {
                                await db.User.update(u.id, { frost_push_day: today }); // claim first: never twice
                                // Plant pages show the same warning as the push
                                const frostText = `Frost tonight (${low}°F). Cover it or bring it inside.`;
                                for (const p of cold) {
                                    const h = p.weather_hint && p.weather_hint.day === today ? p.weather_hint : null;
                                    if (h && h.frost_low_f === low) continue;
                                    const next = { ...(h || { kind: 'frost' }), day: today, frost_low_f: low, frost_text: frostText };
                                    try { await db.Plant.update(p.id, { weather_hint: next }); } catch { /* the push still goes */ }
                                }
                                const f = await sendFrostPush(u.email, cold, low);
                                bump(f.id ? 'frost_sent' : 'frost_failed');
                                if (!f.id) console.warn('frost push failed', u.email, JSON.stringify(f.detail).slice(0, 200));
                            }
                        }
                    }
                } catch (e) {
                    bump('error');
                    console.error('plus sweep user error', u.email, (e as Error).message);
                }
            }
            // Watering profiles and seasons: everyone, not just Plus.
            try {
                const byEmail = new Map<string, any>();
                for (const u of users) if (u?.email) byEmail.set(u.email, u);
                // 1) New plants get a profile (up to 50 a run, in per-owner batches)
                let pending: any[] = [];
                try {
                    pending = (await db.Plant.filter({ 'care_profile.v': { $exists: false } }, 'created_date', 50)) || [];
                } catch {
                    pending = ((await db.Plant.list('-created_date', 1000)) || []).filter(needsProfile).slice(0, 50);
                }
                const byOwner = new Map<string, any[]>();
                for (const p of pending) {
                    if (!p?.created_by || !needsProfile(p)) continue;
                    if (!byOwner.has(p.created_by)) byOwner.set(p.created_by, []);
                    byOwner.get(p.created_by)!.push(p);
                }
                for (const [email, list] of byOwner) {
                    const n = await profilePlants(db, list, byEmail.get(email), now);
                    if (n) stats.profiled = (stats.profiled || 0) + n;
                }
                // 2) Season changes (checked every run; writes only on the switch day)
                const seasonal = (await db.Plant.filter({ water_days_rest: { $gt: 0 } }, '-created_date', 2000)) || [];
                for (const p of seasonal) {
                    const ctx = ownerCtx(byEmail.get(p.created_by), now);
                    const patch = seasonalPatch(p, ctx.today, ctx.hemi);
                    if (!patch) continue;
                    try { await db.Plant.update(p.id, patch); bump('season_switched'); } catch { bump('season_failed'); }
                }
            } catch (e) {
                bump('profile_error');
                console.error('profile/season sweep error', (e as Error).message);
            }
            return Response.json({ success: true, at: new Date(now).toISOString(), plus_users: plusIds.size, stats });
        }

        // ---------- signed-in actions ----------
        let user: any = null;
        try { user = await base44.auth.me(); } catch { user = null; }
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        // Work on the stored record (auth.me can be a cached copy)
        const stored = (await db.User.filter({ id: user.id }))?.[0];
        if (stored) user = { ...user, ...stored };
        const plus = await isPlus(db, user.id);

        if (action === 'geocode') {
            let text = String(user.location || '').trim();
            if (typeof body.location === 'string') {
                text = body.location.trim().slice(0, 120);
                if (!text) return Response.json({ error: 'Type a city first' }, { status: 400 });
                if (text !== user.location) {
                    await db.User.update(user.id, { location: text });
                    user.location = text;
                }
            }
            if (!text) return Response.json({ success: true, status: 'missing' });
            const g = await geocode(text);
            if (g.status === 'error') {
                return Response.json({ success: false, status: 'error', error: "Couldn't reach the map service. Try again in a minute." }, { status: 502 });
            }
            await saveGeo(db, user, text, g);
            // New place → re-check today's weather right away for Plus users
            let weather = null;
            if (plus && (g.status === 'ok' || g.status === 'too_broad')) {
                const firstToday = user.weather_day !== dayOf(now, validTz(user.timezone)) || !user.weather_today?.place;
                if (firstToday) weather = await evaluateUser(db, user, now, memo, { force: true });
            }
            return Response.json({ success: true, status: g.status, label: user.location_label || null, location: text, weather });
        }

        if (action === 'weather') {
            if (!plus) return Response.json({ success: true, plus: false });
            if (needsGeocode(user)) {
                const g = await geocode(String(user.location));
                await saveGeo(db, user, String(user.location).trim(), g);
            }
            const today = dayOf(now, validTz(user.timezone));
            // Re-run today only if this morning's check couldn't use a location
            const force = user.weather_day === today && !user.weather_today?.place && typeof user.location_lat === 'number';
            const r = await evaluateUser(db, user, now, memo, { force });
            return Response.json({
                success: true, plus: true, status: r.status,
                location: user.location || null, location_status: user.location_status || (user.location ? null : 'missing'),
                label: user.location_label || null,
                weather_today: user.weather_day === today ? user.weather_today : null,
            });
        }

        // Profile the signed-in user's own plants that don't have one yet (right after adding
        // plants, so they don't wait for the hourly sweep). Everyone, not just Plus.
        if (action === 'profile') {
            const mine = ((await db.Plant.filter({ created_by: user.email }, '-created_date', 500)) || []).filter(needsProfile);
            const ids = Array.isArray(body.plant_ids) ? new Set(body.plant_ids.map(String)) : null;
            const todo = (ids ? mine.filter((p: any) => ids.has(p.id)) : mine).slice(0, 50);
            const n = await profilePlants(db, todo, user, now);
            return Response.json({ success: true, profiled: n, remaining: Math.max(0, mine.length - n) });
        }

        // Even out my schedule: { apply?: boolean }. Without apply it's only a preview.
        if (action === 'even_out') {
            const today = dayOf(now, validTz(user.timezone));
            const mine = (await db.Plant.filter({ created_by: user.email }, '-created_date', 1000)) || [];
            const plan = planEvenOut(mine, today);
            if (body.apply === true) {
                const byId = new Map(mine.map((p: any) => [p.id, p]));
                let applied = 0;
                for (const m of plan.moves) {
                    const p: any = byId.get(m.id);
                    if (!p || String(p.next_watering_due || '').slice(0, 10) !== m.from) continue;
                    try { await db.Plant.update(m.id, { next_watering_due: m.to }); applied++; } catch { /* skip */ }
                }
                return Response.json({ success: true, applied, ...plan });
            }
            return Response.json({ success: true, ...plan });
        }

        if (action === 'rain_toggle') {
            const pid = String(body.plant_id || '');
            let p: any = null;
            try { p = (await db.Plant.filter({ id: pid }))?.[0]; } catch { p = null; } // malformed id
            if (!p || p.created_by !== user.email) return Response.json({ error: 'Not found' }, { status: 404 });
            const gets = body.gets_rain === true;
            const patch: any = { gets_rain: gets };
            const today = dayOf(now, validTz(user.timezone));
            const h = p.weather_hint;
            let undone = false;
            if (!gets && h && h.day === today && (h.kind === 'rain_credit' || h.kind === 'rain_hold' || h.kind === 'rain_missed')) {
                if (h.kind === 'rain_credit') {
                    patch.last_watered = h.prev_last_watered ?? null;
                    patch.next_watering_due = h.prev_next_due ?? null;
                    const hist = Array.isArray(p.care_history) ? p.care_history : [];
                    patch.care_history = hist.filter((x: any) => !(x?.type === 'rain' && x?.date === today));
                } else if (h.kind === 'rain_hold') {
                    patch.next_watering_due = h.prev_next_due ?? p.next_watering_due;
                }
                const keepFrost = h.frost_text ? { kind: 'frost', day: today, frost_low_f: h.frost_low_f, frost_text: h.frost_text } : null;
                patch.weather_hint = keepFrost;
                undone = true;
            }
            await db.Plant.update(p.id, patch);
            return Response.json({ success: true, gets_rain: gets, undone });
        }

        if (action === 'care_suggest') {
            if (!plus) return Response.json({ error: 'plus_required', plus: false }, { status: 402 });
            const ids: string[] = Array.isArray(body.plant_ids) ? body.plant_ids.filter((x: any) => typeof x === 'string').slice(0, 25) : [];
            if (!ids.length) return Response.json({ success: true, suggestions: {} });
            let plants: any[] = [];
            try { plants = ((await db.Plant.filter({ id: { $in: ids } })) || []).filter((p: any) => p.created_by === user.email); } catch { plants = []; }
            const suggestions = await suggestCare(plants);
            return Response.json({ success: true, suggestions });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('plus error', error);
        return Response.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
});
