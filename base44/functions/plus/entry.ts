import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

// Happy Plants Plus: weather-smart watering and care-schedule pushes.
//
// Called by:
//  - the hourly "Plus Daily" workflow → { action: 'sweep' } (no user needed)
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
//  - Low tonight ≤ 32°F → frost warning on the plant.
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
    return `${inches.toFixed(inches < 1 ? 2 : 1).replace(/0$/, '')} in`;
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
    const lowUntil = end + 10 * H; // through tomorrow ~10 AM
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
        if (t !== null && ms >= curHour && ms < lowUntil) lo = Math.min(lo, t);
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
        } else if (rainOk && due && due <= today && lastW !== today && s.rain_today_in >= thr) {
            hint = {
                kind: 'rain_hold', rain_in: s.rain_today_in,
                text: `Rain is on the way today (about ${fmtIn(s.rain_today_in)}). Skip watering; we'll check again tomorrow.`,
                prev_next_due: p.next_watering_due || null,
            };
            patch.next_watering_due = addDays(today, 1);
            counts.rain_hold++;
        } else if (rainOk && prev?.kind === 'rain_hold' && due && due <= today && lastW !== today) {
            hint = { kind: 'rain_missed', text: "The rain didn't come through. Water it today." };
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
function careDueToday(plants: any[], today: string) {
    const due: { plant: any; type: string; next: string }[] = [];
    for (const p of plants) {
        if (onVacation(p, today)) continue;
        const cs = p.care_schedule || {};
        for (const t of CARE_TYPES) {
            const task = cs[t];
            if (!task?.on || !task.next) continue;
            if (String(task.next).slice(0, 10) <= today) due.push({ plant: p, type: t, next: String(task.next).slice(0, 10) });
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

        if (action === 'sweep') {
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
                        const due = careDueToday(plants, today);
                        if (due.length) {
                            await db.User.update(u.id, { care_push_day: today }); // claim first: never twice
                            const s = await sendCarePush(u.email, due);
                            bump(s.id ? 'care_sent' : 'care_failed');
                            if (!s.id) console.warn('care push failed', u.email, JSON.stringify(s.detail).slice(0, 200));
                        }
                    }
                } catch (e) {
                    bump('error');
                    console.error('plus sweep user error', u.email, (e as Error).message);
                }
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

        if (action === 'rain_toggle') {
            const pid = String(body.plant_id || '');
            const p = (await db.Plant.filter({ id: pid }))?.[0];
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
            const plants = ((await db.Plant.filter({ id: { $in: ids } })) || []).filter((p: any) => p.created_by === user.email);
            const suggestions = await suggestCare(plants);
            return Response.json({ success: true, suggestions });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('plus error', error);
        return Response.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
});
