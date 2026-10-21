import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// Which OpenAI model names the plant and which writes its care sheet. Both are gpt-6-luna
// since Oct 20, 2026. Test on Anna's own plant photos: Luna named 21 of 33 right; on the 20
// hardest of them Astra got 9 and Luna 8. Astra costs ~12 cents a photo, Luna ~0.15 cents.
// Set the ID_MODEL / CARE_MODEL secrets to "gpt-6-astra" to switch back without a code change.
const MODEL = (Deno.env.get('ID_MODEL') || 'gpt-6-luna').trim();
const CARE_MODEL = (Deno.env.get('CARE_MODEL') || 'gpt-6-luna').trim();

// ---------------------------------------------------------------------------
// Identification runs as three steps:
//   1. Pl@ntNet (purpose-built plant classifier) scores the photo.
//   2. The LLM identifies the photo BLIND - it never sees Pl@ntNet's answer,
//      so the two opinions are independent.
//   3. A judge pass sees the photo, both opinions and a lookalike cheat sheet,
//      settles the name, and writes the care info.
// Without PLANTNET_API_KEY, steps 2 and 3 still run.
// ---------------------------------------------------------------------------

// ---- Pl@ntNet's free plan: 500 identifications a day for the whole app ------------------
// Under PN_SAVE_FROM calls today nothing changes: every photo gets Pl@ntNet's opinion too.
// From there on, Pl@ntNet is saved for the photos the botanist isn't sure about (a "high"
// confidence answer is used as is), so the rest of the day's 500 go to the hard ones.
// At 500 Pl@ntNet says no and the botanist + judge carry on alone, as they always have.
// Counted in AiUsage (user_id 'app', kind 'plantnet', the UTC day).
const PN_DAILY = 500;
const PN_SAVE_FROM = 350;
let pnDb: any = null; // service-role entities, set at the start of each request
const pnDay = () => new Date().toISOString().slice(0, 10);
let pnCache: { day: string; used: number; at: number } | null = null;
async function pnUsedToday(): Promise<number> {
    const day = pnDay();
    if (pnCache && pnCache.day === day && Date.now() - pnCache.at < 60_000) return pnCache.used;
    if (!pnDb) return pnCache?.day === day ? pnCache.used : 0;
    try {
        const row = (await pnDb.AiUsage.filter({ user_id: 'app', kind: 'plantnet', day }))?.[0];
        const used = Number(row?.count) || 0;
        pnCache = { day, used, at: Date.now() };
        return used;
    } catch {
        return pnCache?.day === day ? pnCache.used : 0;
    }
}
// remaining: Pl@ntNet's own count of what's left today, when its answer includes it
async function pnRecord(remaining?: number) {
    if (!pnDb) return;
    const day = pnDay();
    try {
        const row = (await pnDb.AiUsage.filter({ user_id: 'app', kind: 'plantnet', day }))?.[0];
        const used = typeof remaining === 'number' && remaining >= 0 ? PN_DAILY - remaining : (Number(row?.count) || 0) + 1;
        if (row) await pnDb.AiUsage.update(row.id, { count: used });
        else await pnDb.AiUsage.create({ user_id: 'app', day, kind: 'plantnet', count: used });
        pnCache = { day, used, at: Date.now() };
    } catch (e) {
        console.warn('[PlantNet] count failed:', (e as Error)?.message);
    }
}

// extra: a second photo of the same plant (close-up, flower, the nursery tag), sent as a file.
// Pl@ntNet scores all the photos of one plant together, which is more accurate than one.
// include-related-images: reference photos for each candidate, for "Is it one of these?".
async function identifyWithPlantNet(imageUrl, extra?: { bytes: Uint8Array; mime: string } | null) {
    const key = Deno.env.get("PLANTNET_API_KEY");
    if (!key) return null;
    try {
        const q = `include-related-images=true&lang=en&no-reject=true&api-key=${encodeURIComponent(key)}`;
        const url = `https://my-api.plantnet.org/v2/identify/all?images=${encodeURIComponent(imageUrl)}&organs=auto&${q}`;
        const send = async () => {
            if (!extra) return fetch(url);
            const main = await fetch(imageUrl).then((r) => r.blob());
            const form = new FormData();
            form.append('images', new File([main], 'plant.jpg', { type: main.type || 'image/jpeg' }));
            form.append('organs', 'auto');
            form.append('images', new File([extra.bytes], 'closeup.jpg', { type: extra.mime }));
            form.append('organs', 'auto');
            return fetch(`https://my-api.plantnet.org/v2/identify/all?${q}`, { method: 'POST', body: form });
        };
        let res = await send();
        if (res.status >= 500) {
            await new Promise(r => setTimeout(r, 1500));
            res = await send();
        }
        if (!res.ok) {
            // 429 = today's 500 are used up (not counted); anything else still used one
            if (res.status !== 429) pnRecord();
            else pnRecord(0);
            console.warn('[PlantNet] HTTP', res.status, await res.text().catch(() => ''));
            return null;
        }
        const data = await res.json();
        pnRecord(typeof data?.remainingIdentificationRequests === 'number' ? data.remainingIdentificationRequests : undefined);
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length === 0) return null;
        const toMatch = (r) => ({
            scientific_name: r?.species?.scientificNameWithoutAuthor || '',
            family: r?.species?.family?.scientificNameWithoutAuthor || '',
            common_names: Array.isArray(r?.species?.commonNames) ? r.species.commonNames : [],
            score: typeof r?.score === 'number' ? r.score : 0,
            photos: (Array.isArray(r?.images) ? r.images : []).slice(0, 3).map((i: any) => ({
                url: i?.url?.m || i?.url?.s || i?.url?.o || null, author: i?.author || null,
                license: i?.license || null, citation: i?.citation || null, organ: i?.organ || null,
            })).filter((i: any) => i.url),
        });
        const list = results.slice(0, 4).map(toMatch).filter(c => c.scientific_name);
        return list.length ? list : null;
    } catch (e) {
        console.warn('[PlantNet] failed:', e?.message || e);
        return null;
    }
}

const BOTANIST = `You are a working botanist who identifies plants from photos for a living. You specialise in succulents, cacti, caudiciforms and houseplants - the plants people actually keep in pots - as well as garden plants.

Method, always in this order:
1. Describe what is physically in the photo before naming anything: growth form (rosette, columnar, globular, caudex/fat stem, jointed segments, vine, shrub), stem surface (smooth, ribbed, tubercled/warty, spiny), leaf shape, thickness, colour, edges, any flowers, and the pot and substrate.
2. Decide the family, then the genus, then COMMIT to the single most likely species, cultivar or hybrid. Give the name a nursery would print on the tag. Express doubt through the confidence field and the alternatives list, never by refusing to name a species.
3. Check the name against the photo: every signature feature of that species must actually be visible. A famous name that does not match what you can see is wrong.
4. If the photo shows SEVERAL different plants (a mixed bowl, a propagation tray, a shelf), identify the single most prominent plant, say in identification_notes that it is a mixed planting and what else is in it, and set confidence no higher than medium.
5. A rooted cutting, seedling or leafless caudex gets confidence low or medium, never high.

Lookalikes that get confused in real collections - check these before answering:
- Euphorbia bupleurifolia (pine cone plant) is ONE tall cone-shaped stem covered in neat pine-cone scales with a leaf tuft on top. Lumpy, egg-shaped, grey-brown tubercled bodies that branch into a cluster with small leaf tufts are the hybrid Euphorbia x japonica (bupleurifolia x susannae), sometimes sold as "Cocklebur". Do not call a lumpy cluster a pine cone plant.
- Crassula 'Buddha's Temple' has flat, square-stacked, powdery grey leaves in a tight column. Anything with bulbous stems or spines is not it.
- Dark purple, ribbed, globular cactus with chin-like bumps under the spine clusters and no wool = Gymnocalycium (often G. mihanovichii), not Lobivia/Echinopsis.
- Clusters of small finger-like stems covered in tubercles with tiny star-shaped spine clusters = Mammillaria gracilis (thimble cactus); ribbed finger stems with bristly white spines = Echinopsis chamaecereus (peanut cactus). Rebutia is round, not finger-shaped.
- Plump egg-shaped pale blue-green leaves on a short stem = Pachyphytum oviferum (moonstones). Graptopetalum amethystinum is similar but pink-lavender and more pointed.
- Grey-blue pointed rosettes that go leggy with aerial roots = Graptopetalum paraguayense (ghost plant) or a Graptosedum hybrid, not a Sedum species from Europe.
- Stemless rosettes = Echeveria; rosettes on visible woody stems = Aeonium. Aeonium haworthii (pale green, red edges) and A. arboreum are the common ones; obscure Aeonium species are rarely in home collections.
- A cylindrical smooth green segment with a few spine spots is an opuntia-type cutting: Austrocylindropuntia subulata (Eve's needle) is the common one. "Baculellum"/Tephrocactus segments are egg-shaped and grey with papery spines.
- Small magenta Dendrobium flowers on a thin spike from a small plant = Dendrobium kingianum, far more common than rare Dendrobium species.
- Fat white/grey caudex with big serrated fleshy leaves = Cyphostemma juttae. Smooth green rounded caudex with thin vining stems = Adenia glauca. Swollen trunk with glossy oval leaves = Adenium (desert rose).
- Smooth, rounded grey-green caudex at soil level with one tall, thin, smooth stem (often leafless) = Adenia glauca. No spines, ribs or areoles, so it is not a cactus.
- Partly buried tuberous caudex with thin, branching, spiny stems and tufts of narrow leaves = Pachypodium succulentum. Pachypodium lamerei is one thick, spiny trunk topped by long leaves.
- Rosettes of flat, smooth, leathery leaves with slightly wavy edges, often a different color at the edge, often with pink, red or white veins or patches, on a short caudex = Euphorbia francoisii (very variable and widely sold).
- Thick, pointed, powdery grey to lavender leaves in loose rosettes on stems that trail and shed leaves = Graptopetalum paraguayense (ghost plant). Aeonium leaves are thin, flat and glossy, never powdery.
- Sedum nussbaumerianum is now treated as Sedum adolphii (coppertone stonecrop): use Sedum adolphii.
- Prefer the common, widely sold species over a rare one when both fit the photo equally well.`;

const NAME_RULE = `common name US nurseries use for THIS species, in sentence case ("Eve's needle cactus") - no parentheses, no hedging words, never a name that belongs to a different species ("Congo fig" is Dorstenia elata, not D. foetida)`;

const JSON_ID_ONLY = `Return ONLY JSON:
{
  "name": "${NAME_RULE}",
  "plant_size": "Seedling" | "Small" | "Medium" | "Large" | "Mature",
  "scientific_name": "genus and species, or the hybrid/cultivar name if that is the real identity",
  "confidence": "high" | "medium" | "low",
  "what_i_see": "two sentences describing the visible features",
  "reasoning": "one or two sentences on why this name and not the closest lookalike",
  "alternatives": [ { "name": "common name", "scientific_name": "scientific name" } ]
}`;

// The judge only names the plant (and sizes it). The care sheet is written afterwards from
// the settled name WITHOUT the photo: see writeCare below.
const JSON_JUDGE = `Return ONLY JSON:
{
  "name": "${NAME_RULE}",
  "scientific_name": "genus and species, or the hybrid/cultivar name if that is the real identity",
  "confidence": "high" | "medium" | "low",
  "identification_notes": "one or two sentences: the features that settle it, and anything the owner should know (mixed planting, cutting, lookalike ruled out)",
  "plantnet_agreement": true | false | null,
  "alternatives": [ { "name": "common name", "scientific_name": "scientific name" } ],
  "plant_size": "Seedling" | "Small" | "Medium" | "Large" | "Mature"
}`;

// One photo, or several photos of the same plant (the main photo + a close-up or its tag)
function imageMessage(imageUrl: string | string[], text: string) {
    const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
    return {
        role: "user",
        content: [
            ...urls.map((u) => ({ type: "image_url", image_url: { url: u, detail: "high" } })),
            { type: "text", text }
        ]
    };
}
const MULTI_PHOTO_NOTE = `There are 2 photos of the SAME plant: the first is the whole plant, the second a close-up or its plant tag. Use both. If a photo shows a plant label or nursery tag, read the plant name printed on it and use that name unless the plant clearly doesn't match it.`;

// ---- What each plant costs on the OpenAI bill -------------------------------------------
// Prices: developers.openai.com/docs/models/gpt-6-astra (Oct 2026): $10 input, $1 cached
// input, $50 output per 1M tokens (output includes reasoning tokens); web search $10 per
// 1,000 calls. Pl@ntNet is free (500 a day). Saved on each new plant as add_info.cost.
// gpt-6-luna: $0.10 input, $0.01 cached, $0.50 output (developers.openai.com/docs/models/gpt-6-luna).
const PRICE: Record<string, { in: number; cached: number; out: number }> = {
    'gpt-6-astra': { in: 10, cached: 1, out: 50 },
    'gpt-6-luna': { in: 0.10, cached: 0.01, out: 0.50 },
};
const SEARCH_USD = 0.01;
type Meter = { calls: any[] };
const newMeter = (): Meter => ({ calls: [] });
function meterAdd(m: Meter | null | undefined, step: string, u: { input?: number; cached?: number; output?: number; reasoning?: number; searches?: number; model?: string }) {
    if (!m) return;
    const p = PRICE[u.model || MODEL] || PRICE['gpt-6-astra'];
    const input = u.input || 0, cached = u.cached || 0, output = u.output || 0, searches = u.searches || 0;
    const usd = ((input - cached) * p.in + cached * p.cached + output * p.out) / 1e6 + searches * SEARCH_USD;
    m.calls.push({ step, model: u.model || MODEL, input, cached, output, reasoning: u.reasoning || 0, searches, usd: Math.round(usd * 10000) / 10000 });
}
const meterUsd = (m: Meter | null | undefined) => Math.round((m?.calls || []).reduce((s, c) => s + c.usd, 0) * 10000) / 10000;

async function askJson(systemPrompt, imageUrl, userText, maxTokens, meter?: Meter | null, step = 'id', model = MODEL, effort?: string) {
    const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: systemPrompt }, imageMessage(imageUrl, userText)],
        response_format: { type: "json_object" },
        max_completion_tokens: effort === 'high' ? Math.max(maxTokens, 6000) : maxTokens,
        ...(effort ? { reasoning_effort: effort } : {}),
    } as any);
    const u: any = response.usage || {};
    meterAdd(meter, step, { model, input: u.prompt_tokens, cached: u.prompt_tokens_details?.cached_tokens, output: u.completion_tokens, reasoning: u.completion_tokens_details?.reasoning_tokens });
    return JSON.parse(response.choices[0].message.content);
}

function describePlantNet(pn) {
    if (!pn) return 'Pl@ntNet: unavailable for this photo.';
    return 'Pl@ntNet candidates (best first):\n' + pn.map((c, i) =>
        `${i + 1}. ${c.scientific_name} (family ${c.family || 'unknown'}) - score ${c.score.toFixed(2)}${c.common_names.length ? ' - common names: ' + c.common_names.slice(0, 3).join(', ') : ''}`
    ).join('\n') + '\nPl@ntNet is strong on wild and garden plants and weak on cultivated succulents, cacti and caudiciforms; a score under 0.20 means it is guessing.';
}

function describeBlind(blind) {
    if (!blind) return 'Independent botanist opinion: unavailable.';
    const alts = (blind.alternatives || []).map(a => `${a.scientific_name}`).join(', ') || 'none';
    return `Independent botanist opinion (made WITHOUT seeing Pl@ntNet):
- ${blind.scientific_name} ("${blind.name}"), confidence ${blind.confidence}
- What they saw: ${blind.what_i_see || ''}
- Reasoning: ${blind.reasoning || ''}
- Their alternatives: ${alts}`;
}

// ---- Daily AI limits (Happy Plants Plus) ----------------------------------
// Usage is always counted (AiUsage). Limits are only enforced once the secret
// AI_LIMITS_ON is "true" — i.e. after people can actually buy Plus.
const AI_LIMITS: Record<string, { free: number; plus: number }> = {
    identify: { free: 10, plus: 200 }, // not used for photo IDs any more: see ID_RULES below
    rename: { free: 30, plus: 100 },
    health: { free: 3, plus: 25 },
    chat: { free: 20, plus: 200 },
};

// ---- Photo IDs (always on) -----------------------------------------------------
// Free: 15 in the first 24 hours after signing up (to add the whole garden), then 5 a
// day; each reward video adds 5 more (up to 3 videos a day). Plus: 200 a day. Admins
// count as Plus. A plant is charged once, however many times naming it is retried.
// The same block is in functions/premium (status, reserve, reward) — keep them in step.
const ID_RULES = { intro: 15, introHours: 24, daily: 5, perAd: 5, maxAds: 3, plus: 200 };
function dayIn(tz: string | undefined, when: Date): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(when)) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}
async function plusOf(db: any, user: any) {
    if (user?.role === 'admin') return true;
    const sub = (await db.Subscription.filter({ user_id: user.id }))?.[0];
    return !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
}
async function idStatus(db: any, user: any, plus: boolean) {
    const now = new Date();
    const day = dayIn(user.timezone, now);
    const created = Date.parse(user.created_date || '') || 0;
    const introEnds = created ? created + ID_RULES.introHours * 3600e3 : 0;
    const intro = !plus && now.getTime() < introEnds;
    const rows = (await db.AiUsage.filter({ user_id: user.id, day })) || [];
    const row = rows.find((r: any) => r.kind === 'identify') || null;
    const ads = rows.find((r: any) => r.kind === 'identify_bonus')?.count || 0;
    let used = row?.count || 0;
    if (intro) {
        // The first 24 hours can cross midnight: yesterday's IDs count too if they were in it
        const yday = dayIn(user.timezone, new Date(now.getTime() - 86400e3));
        if (dayIn(user.timezone, new Date(created)) <= yday) {
            used += (await db.AiUsage.filter({ user_id: user.id, day: yday, kind: 'identify' }))?.[0]?.count || 0;
        }
    }
    const limit = plus ? ID_RULES.plus : intro ? ID_RULES.intro : ID_RULES.daily + Math.min(ads, ID_RULES.maxAds) * ID_RULES.perAd;
    return {
        day, plus, intro, intro_ends_at: intro ? new Date(introEnds).toISOString() : null,
        limit, used, left: Math.max(0, limit - used),
        ads_today: ads, max_ads: ID_RULES.maxAds, per_ad: ID_RULES.perAd, daily: ID_RULES.daily, intro_total: ID_RULES.intro,
        can_reward: !plus && !intro && ads < ID_RULES.maxAds,
        _row: row,
    };
}
async function chargeIds(db: any, user: any, st: any, n: number) {
    if (n <= 0) return;
    if (st._row) await db.AiUsage.update(st._row.id, { count: (st._row.count || 0) + n });
    else await db.AiUsage.create({ user_id: user.id, user_email: user.email, day: st.day, kind: 'identify', count: n });
}
function publicIds(st: any) { const { _row, ...rest } = st; return rest; }
function idLimitResponse(st: any) {
    return Response.json({ error: 'limit_reached', limit_reached: true, kind: 'identify', limit: st.limit, plus: st.plus, ids: publicIds(st) }, { status: 429 });
}
// Charge one photo ID now. Returns null when allowed, or the 429 response when out.
// If the count can't be read, let it through rather than block someone's plant.
async function takeOneId(base44: any, user: any) {
    try {
        const sdb = base44.asServiceRole.entities;
        const st = await idStatus(sdb, user, await plusOf(sdb, user));
        if (st.left <= 0) return { blocked: idLimitResponse(st), day: st.day };
        await chargeIds(sdb, user, st, 1);
        return { blocked: null, day: st.day };
    } catch (e) {
        console.warn('photo ID count failed, allowing:', (e as Error).message);
        return { blocked: null, day: null };
    }
}
function aiLocalDay(tz?: string): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}
async function useAiQuota(base44: any, user: any, kind: string) {
    try {
        const db = base44.asServiceRole.entities;
        const day = aiLocalDay(user.timezone);
        const [subs, rows] = await Promise.all([
            db.Subscription.filter({ user_id: user.id }),
            db.AiUsage.filter({ user_id: user.id, day, kind }),
        ]);
        const sub = subs?.[0];
        // Admins (you) get Plus limits, same as photo IDs, so testing never hits the free caps
        const plus = user?.role === 'admin' || !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
        const limit = (AI_LIMITS[kind] || AI_LIMITS.chat)[plus ? 'plus' : 'free'];
        const enforce = (Deno.env.get('AI_LIMITS_ON') || '').trim().toLowerCase() === 'true';
        const row = rows?.[0];
        const used = row?.count || 0;
        if (enforce && used >= limit) return { allowed: false, plus, limit, used };
        if (row) await db.AiUsage.update(row.id, { count: used + 1 });
        else await db.AiUsage.create({ user_id: user.id, user_email: user.email, day, kind, count: 1 });
        return { allowed: true, plus, limit, used: used + 1 };
    } catch (e) {
        console.warn('AI quota check failed, allowing:', (e as Error).message);
        return { allowed: true, plus: false, limit: 0, used: 0 };
    }
}
function aiLimitResponse(kind: string, q: any) {
    return Response.json({ error: 'limit_reached', limit_reached: true, kind, limit: q.limit, plus: q.plus }, { status: 429 });
}

// ---- Context: where the owner lives, what season it is there, where the plant sits ----
function seasonOf(day: string, lat: any): string {
    const m = Number(day.slice(5, 7));
    const south = typeof lat === 'number' && lat < -23.5;
    const tropics = typeof lat === 'number' && Math.abs(lat) < 23.5;
    if (tropics) return 'the tropics (no real winter)';
    const n = m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
    const flip: Record<string, string> = { winter: 'summer', summer: 'winter', spring: 'fall', fall: 'spring' };
    return `${south ? flip[n] : n} (${south ? 'southern' : 'northern'} hemisphere)`;
}
function contextFor(user: any, plant: any, day: string): string {
    const place = user?.location_label || user?.location || null;
    const lines = [
        `Today is ${day}; at the owner's location it is ${seasonOf(day, user?.location_lat)}.`,
        `Owner's location: ${place || 'unknown (assume a temperate climate in the northern hemisphere)'}.`,
    ];
    if (plant?.location || plant?.environment) lines.push(`Where the plant is kept: ${plant?.location || 'not given'} (${plant?.environment || 'not given'}).`);
    lines.push('water_frequency_days is for THIS time of year in this location and spot. Do not assume summer heat unless it is summer there. Describe how watering changes in other seasons in care_instructions.watering.');
    // Units people actually use where they live (the care text used to come back in °C and cm for US owners)
    // location_label is the geocoded "City, State, CC"; without one, assume US (most owners)
    const label = String(user?.location_label || '');
    const us = !label || /,\s*(US|USA|United States)\s*$/i.test(label);
    lines.push(us
        ? 'Write every care text in US units and American spelling: temperatures in °F, lengths and depths in inches, water in fluid ounces. Never use °C, cm or mL.'
        : 'Write every care text in metric units: temperatures in °C, lengths in cm, water in mL.');
    return lines.join('\n');
}
function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
const PLANT_TYPES = ['Houseplants', 'Succulents & Cacti', 'Flowers', 'Herbs', 'Vegetables', 'Trees & Shrubs', 'Perennials', 'Annuals', 'Seedlings'];
const PLANT_SIZES = ['Seedling', 'Small', 'Medium', 'Large', 'Mature'];

// Give the plant its watering profile right away (how it's watered, finicky or not,
// seasonal intervals). If this fails, the garden page and the hourly sweep do it later.
async function profileNow(base44: any, plantId: string) {
    try {
        await base44.functions.invoke('plus', { action: 'profile', plant_ids: [plantId] });
    } catch (e) {
        console.warn('profile call failed', (e as Error).message);
    }
}

// onBlind: called with the blind opinion as soon as it's in, so the care sheet can start
// while the judge works (most of the time the judge keeps the same species).
async function identify(rid: string, imageUrl: string, context: string, onBlind?: (b: any) => void, meter?: Meter | null, models: { blind?: string; judge?: string; effort?: string } = {}, extra?: { bytes: Uint8Array; mime: string; dataUrl: string } | null) {
    const blindModel = models.blind || MODEL, judgeModel = models.judge || MODEL, idEffort = models.effort;
    const t0 = Date.now();
    const timing: Record<string, number | null> = { plantnet_ms: null, blind_ms: null, judge_ms: null };
    const photos = extra ? [imageUrl, extra.dataUrl] : imageUrl;
    const note = extra ? `\n${MULTI_PHOTO_NOTE}` : '';
    const runPn = () => identifyWithPlantNet(imageUrl, extra).finally(() => { timing.plantnet_ms = Date.now() - t0; });
    const runBlind = () => askJson(`${BOTANIST}\n\n${JSON_ID_ONLY}`, photos, `Identify this plant following the method.${note} Return the JSON.`, 1200, meter, 'id: botanist', blindModel, idEffort)
        .then((b) => { timing.blind_ms = Date.now() - t0; try { onBlind?.(b); } catch { /* ignore */ } return b; })
        .catch(e => { console.warn(`[${rid}] blind ID failed:`, e?.message); return null; });
    let pn: any = null, blind: any = null;
    const usedToday = await pnUsedToday();
    if (usedToday < PN_SAVE_FROM) {
        // Normal day: both opinions at once
        [pn, blind] = await Promise.all([runPn(), runBlind()]);
    } else {
        // Busy day (see PN_SAVE_FROM): ask the botanist first and only spend a Pl@ntNet call
        // when it isn't sure
        blind = await runBlind();
        if (blind?.scientific_name && blind.confidence === 'high') {
            console.log(`[${rid}] 🌿 Saving Pl@ntNet (${usedToday} used today): botanist sure, ${blind.scientific_name}`);
            return {
                pn: null,
                plantData: { name: blind.name, scientific_name: blind.scientific_name, plant_size: blind.plant_size },
                identification: {
                    source: 'llm',
                    plantnet_top: null,
                    plantnet_score: null,
                    blind_llm: blind.scientific_name,
                    plantnet_agreement: null,
                    confidence: blind.confidence,
                    notes: blind.reasoning || null,
                    alternatives: Array.isArray(blind.alternatives) ? blind.alternatives.slice(0, 4) : [],
                    judge: `skipped (saving Pl@ntNet: ${usedToday} of ${PN_DAILY} used today, botanist sure)`,
                    timing,
                },
            };
        }
        if (usedToday < PN_DAILY) pn = await runPn();
    }
    console.log(`[${rid}] 🌿 PlantNet:`, pn ? pn.map(c => `${c.scientific_name} ${c.score.toFixed(2)}`).join(' | ') : 'none');
    console.log(`[${rid}] 🌿 Blind LLM:`, blind ? `${blind.scientific_name} (${blind.confidence})` : 'none');
    // Pl@ntNet is sure (0.50+) and the botanist, who never saw Pl@ntNet's answer, named the same
    // species: two independent opinions agree, which is the case where the judge confirms
    // anyway. Skip the judge (it's the slowest step) and use the botanist's answer.
    if (pn && blind?.scientific_name && pn[0].score >= 0.5 && blind.confidence !== 'low' && sameSpecies(pn[0].scientific_name, blind.scientific_name)) {
        console.log(`[${rid}] 🌿 Both agree: ${blind.scientific_name}; judge skipped`);
        return {
            pn,
            plantData: { name: blind.name, scientific_name: blind.scientific_name, plant_size: blind.plant_size },
            identification: {
                source: 'plantnet+llm',
                plantnet_top: pn[0].scientific_name,
                plantnet_score: pn[0].score,
                blind_llm: blind.scientific_name,
                plantnet_agreement: true,
                confidence: blind.confidence || null,
                notes: blind.reasoning || null,
                alternatives: Array.isArray(blind.alternatives) ? blind.alternatives.slice(0, 4) : [],
                judge: 'skipped (both agreed)',
                timing,
            },
        };
    }
    const judgePrompt = `${BOTANIST}

You are now the JUDGE. Two independent identifications of this photo were made:

${describePlantNet(pn)}

${describeBlind(blind)}

Settle the identification:
a) Look at the photo yourself and check each candidate against the visible features and the lookalike list.
b) If both opinions agree, confirm it unless the photo plainly contradicts them.
c) If they disagree, the photo decides. Pl@ntNet wins on wild/garden plants it scores 0.50+. The botanist wins on succulents, cacti and caudiciforms unless Pl@ntNet scored 0.50+ and the photo supports it. A Pl@ntNet score under 0.20 carries no weight on its own.
d) You may override both if the photo clearly shows something else - say why in identification_notes.
e) Set plantnet_agreement true if your final answer is one of Pl@ntNet's candidates, false if Pl@ntNet gave candidates and you chose otherwise, null if Pl@ntNet was unavailable.
f) Confidence: high only when the visible features clearly match one species; medium when genus is certain but species is a best guess, or the photo is a mixed planting; low for cuttings, seedlings and leafless plants.
Then assess its size.

${context}

${JSON_JUDGE}`;
    const tj = Date.now();
    const parsed = await askJson(judgePrompt, photos, `Judge the identification.${note} Return the JSON.`, 2500, meter, 'id: judge', judgeModel, idEffort);
    timing.judge_ms = Date.now() - tj;
    const { confidence, identification_notes, alternatives, plantnet_agreement, ...plantData } = parsed;
    console.log(`[${rid}] 🌿 Final:`, plantData.name, '|', plantData.scientific_name, '| confidence:', confidence);
    return {
        pn,
        plantData,
        identification: {
            source: pn ? 'plantnet+llm' : 'llm',
            plantnet_top: pn ? pn[0].scientific_name : null,
            plantnet_score: pn ? pn[0].score : null,
            blind_llm: blind ? blind.scientific_name : null,
            plantnet_agreement: pn ? (plantnet_agreement ?? null) : null,
            confidence: confidence || null,
            notes: identification_notes || null,
            alternatives: Array.isArray(alternatives) ? alternatives.slice(0, 4) : [],
            timing,
        },
    };
}

// ===========================================================================
// Care sheet. Written for the settled name, WITHOUT the photo, and checked against
// sources on the web when the model can search.
//
// Why (audit of 50 real plants, Oct 2026): when the judge wrote the care text while looking
// at the photo, the text described the photo ("the black nursery pot", "can't be determined
// from this picture", that day's leaf damage) and once was written for the wrong plant. The
// watering numbers came from a second, cheaper model that gave rot-prone caudiciforms a
// 21-day winter, gave only succulents a winter schedule, and put "let it dry out completely"
// on plants that must not dry out. Now ONE call writes the texts and the numbers together,
// the watering text uses {grow}/{rest} placeholders so text and schedule can never disagree,
// and there are numbers for indoors AND outdoors, because the owner says where the plant
// lives after it's named (the app picks the right pair then: functions/plus applyNumbers).
// ===========================================================================
const PROFILE_GROUPS = ['succulent', 'cactus', 'caudiciform', 'forest_cactus', 'tropical_foliage', 'fern', 'orchid', 'air_plant', 'carnivorous', 'aquatic', 'bulb', 'herb_vegetable', 'flowering', 'tree_shrub', 'other'];
const DRY_RULES = ['dry', 'top_half', 'top_inch', 'moist', 'in_water'];

const CARE_RULES = `You are a horticulturist writing the care sheet a plant-care app shows for ONE plant. Write for exactly the plant named, and get the facts right: if you can search the web, check the plant on reliable sources (university extension services, botanical gardens, LLIFLE, World of Succulents, SANBI, RHS, specialist societies) before writing.

First settle these facts, and make everything you write agree with them: where it grows wild; whether it grows in the warm months (summer grower) or the cool months (winter grower); whether it drops its leaves or goes dormant; the coldest temperature it handles; whether its soil should dry out completely.

Every text:
- Is general advice for this plant in the owner's climate. Never mention a photo, picture or image, the pot it is in now, its current condition, or how sure anyone is about the identification.
- Uses plain everyday words and short sentences. No filler. "watering" up to 4 sentences, every other text up to 3.
- Follows the units and spelling rule in the context.
- Has no links or citations in it. List the pages you relied on only in "sources".
- Holds all year: never refer to today's date or the current season ("this fall", "right now").
- Doesn't tie the watering numbers to indoors or outdoors: the app fills in the numbers for wherever the plant is kept, and the owner may move it.

The texts:
- watering: how to water and when (until it drains, then let the soil dry out completely / the top half / the top inch...). Write the placeholders {grow} and {rest} where the numbers of days go, for example "about every {grow} days while it grows" and "about every {rest} days in winter". The app fills in the numbers for the plant's spot. Never write a number of days or weeks yourself. If it drops its leaves to rest, say to stop or nearly stop watering once the leaves fall. If rest_season is null, use only {grow}.
- sunlight: how much direct sun it wants, and whether it needs shade from hot afternoon sun in this climate.
- soil: the mix to use.
- humidity: only what it really needs.
- temperature: the coldest it can take, as a clear action ("Bring it inside before nights drop below 50°F"), and whether frost kills it.
- fertilizing: only in its growing season, and say when to stop. Winter growers are fed from fall to spring, never in summer. Carnivorous plants are never fed through the soil.
- tips: two or three practical tips, then whether it is toxic to pets and people (say "not known to be toxic" when that is the case; never invent toxicity).

name: the common name US nurseries and extension services use for THIS species, in sentence case (only the first word and proper nouns capitalized: "Eve's needle cactus", "Shield flower"). Some popular names belong to a different species ("Congo fig" is Dorstenia elata, not Dorstenia foetida). Never borrow one. If it has no real common name, use the genus name.

watering_profile (the app reminds the owner on these numbers):
- rest_season: "winter" if it grows in the warm months. "summer" if it grows in the cool months and rests in summer (Aeonium, Aloinopsis, Conophytum, Lithops-type mesembs, winter-rainfall bulbs such as Albuca spiralis and Oxalis versicolor). Check this one: plants are often wrongly called winter growers (Albuca bracteata grows in summer). null only for plants that live in water, or that grow the same all year because the owner is in the tropics.
- indoor and outdoor: grow_days and rest_days for the plant kept indoors in a home, and kept outdoors in a pot, in the owner's climate. If it can't stay outdoors in the owner's winter, outdoor.rest_days is for it brought in or sheltered.
  grow_days: days between waterings while it grows. Guide: outdoor potted succulents in warm, dry weather 5-7; indoor succulents and cacti 10-21; tropical houseplants indoors 7-10; orchids in bark 4-7 (outdoors in heat 2-4); ferns and carnivorous plants 2-4.
  When the plant only goes dormant in some winters or some spots (it may stay leafy), give rest_days for a leafy plant, and say in the watering text to stop watering if the leaves die back.
  rest_days: days between waterings in its rest season, never less than grow_days. Almost every plant needs less water then, houseplants too (about 1.5 to 2 times longer indoors in winter). Most cacti and succulents: 30. Plants that rot easily when cold and wet, and plants that drop their leaves to rest (Adenium, Adenia, Cyphostemma, Pachypodium, Euphorbia bupleurifolia and other deciduous euphorbias): 45-60, and the watering text says to keep it nearly dry. Orchids that need a dry rest to flower (Dendrobium kingianum, nobile dendrobiums): 3 to 5 times grow_days. null when rest_season is null.
- dry_rule: "dry" (let the soil dry out completely: cacti, most succulents, snake plants), "top_half" (let the top half dry: Dorstenia, Albuca, hoya, peperomia, epiphytic cacti such as fishbone and Christmas cactus, and orchids in bark while they grow: water when the mix is almost dry), "top_inch" (most houseplants and garden plants), "moist" (never let it dry out: ferns, carnivorous plants), "in_water" (lives in water).
- drought_tolerant: true only for plants whose soil should dry out completely between waterings.
- group: one of ${PROFILE_GROUPS.join(', ')}. "caudiciform" only for plants with a swollen trunk or caudex (Adenium, Cyphostemma, Pachypodium, Dorstenia foetida); Aloe vera is "succulent".
- method: "pour" (normal watering, most plants), "soak" (mounted staghorn ferns, mounted orchids, air plants), "mist" (only when misting IS its watering, rare), "bottom" (African violets and other gesneriads that rot if the crown gets wet), "in_water" (lucky bamboo in water, cuttings in water, aquatic plants).
- strict: true if moving its watering day by a day or two could hurt it (tropical and humidity-loving plants, ferns, orchids, carnivorous plants, air plants, rare collector plants, plants with unusual growth cycles, seedlings and cuttings, anything watered every 3 days or less). false for tough, forgiving plants.
- why: one short sentence on the numbers.`;

const CARE_JSON = `Return ONLY the JSON, no markdown:
{
  "name": "common name",
  "scientific_name": "genus and species, or the cultivar/hybrid name",
  "plant_type": "Houseplants" | "Succulents & Cacti" | "Flowers" | "Herbs" | "Vegetables" | "Trees & Shrubs" | "Perennials" | "Annuals" | "Seedlings",
  "care_instructions": { "watering": "...{grow}...{rest}...", "sunlight": "", "soil": "", "humidity": "", "temperature": "", "fertilizing": "", "tips": "" },
  "watering_profile": {
    "group": "succulent", "method": "pour", "strict": false, "drought_tolerant": true, "dry_rule": "dry",
    "rest_season": "winter",
    "indoor": { "grow_days": 14, "rest_days": 30 },
    "outdoor": { "grow_days": 7, "rest_days": 30 },
    "why": "one short sentence"
  },
  "sources": ["https://..."]
}`;

const OUTDOOR_ENVS = ['Outdoor', 'Patio', 'Balcony', 'Greenhouse'];
const spotOf = (env: any) => (OUTDOOR_ENVS.includes(String(env || '')) ? 'outdoor' : 'indoor');

// Is `day` in this plant's rest season at the owner's latitude? Same rule as functions/plus
// (winter rest: Nov-Feb north, May-Aug south; summer rest: Jun-Aug north, Dec-Feb south).
function restNow(day: string, lat: any, restSeason: string | null): boolean {
    if (!restSeason) return false;
    if (typeof lat === 'number' && Math.abs(lat) < 23.5) return false;
    const south = typeof lat === 'number' && lat < 0;
    const m = Number(day.slice(5, 7));
    if (restSeason === 'summer') return south ? [12, 1, 2].includes(m) : [6, 7, 8].includes(m);
    return south ? [5, 6, 7, 8].includes(m) : [11, 12, 1, 2].includes(m);
}

// The watering text the app falls back to when the model's text can't be used.
// Same text in functions/plus: keep in sync.
function defaultWaterTpl(dry: string, restSeason: string | null): string {
    const how = dry === 'dry' ? 'Water until it drains out the bottom, then let the soil dry out completely before watering again.'
        : dry === 'top_half' ? 'Water until it drains out the bottom, then let the top half of the soil dry before watering again.'
        : dry === 'moist' ? 'Keep the soil evenly moist, but never soggy.'
        : 'Water until it drains out the bottom once the top inch of soil is dry.';
    const check = dry === 'moist' ? 'Check the soil first, and wait if it is still wet.' : 'Check the soil first, and skip a watering if it is not dry yet.';
    if (!restSeason) return `${how} That's about every {grow} days. ${check}`;
    const rest = restSeason === 'summer' ? 'in summer, when it rests' : dry === 'dry' ? 'in winter, when it rests' : 'in winter, when it grows more slowly';
    return `${how} While it's growing, that's about every {grow} days; ${rest}, about every {rest} days${dry === 'dry' ? ', or even less often' : ''}. ${check}`;
}
// The model's watering text is used only if the numbers come from the placeholders alone.
function waterTplOk(tpl: any, hasRest: boolean): boolean {
    if (typeof tpl !== 'string' || !tpl.includes('{grow}')) return false;
    if (hasRest !== tpl.includes('{rest}')) return false;
    const bare = tpl.replace(/\{(grow|rest)\}/g, '');
    return !/\{|\}/.test(bare) && !/\b\d+\s*(?:(?:-|–|to)\s*\d+\s*)?(?:days?|weeks?)\b/i.test(bare);
}
const fillTpl = (tpl: string, grow: number, rest: number | null) =>
    tpl.replace(/\{grow\}/g, String(grow)).replace(/\{rest\}/g, String(rest ?? grow));

// ---- Text clean-up (a backstop; the prompt asks for all of this) ----
const fRound = (c: number) => Math.round(c * 9 / 5 + 32);
const inRound = (cm: number) => { const v = cm / 2.54; return v >= 3 ? Math.round(v) : Math.round(v * 2) / 2; };
const ozRound = (ml: number) => { const v = ml / 29.57; return v >= 4 ? Math.round(v) : Math.round(v * 2) / 2 || 0.5; };
const BRITISH: [RegExp, string][] = [
    [/\bcolour/gi, 'color'], [/\bfertiliser/gi, 'fertilizer'], [/\bfertilis(e|ing|ed)\b/gi, 'fertiliz$1'],
    [/\blabelled\b/gi, 'labeled'], [/\blitres?\b/gi, 'liter'], [/\bcentre\b/gi, 'center'], [/\bmould/gi, 'mold'],
    [/\borganis(e|ed|ing)\b/gi, 'organiz$1'], [/\bfavour/gi, 'favor'], [/\bbehaviour/gi, 'behavior'],
];
const RANGE = '(-?\\d+(?:\\.\\d+)?)(?:\\s*(?:–|-|to)\\s*(-?\\d+(?:\\.\\d+)?))?';
function toUsUnits(s: string): string {
    let t = s;
    // "50°F (10°C)" → "50°F"; "4 inches (10 cm)" → "4 inches"
    t = t.replace(new RegExp(`\\s*\\((?:about |around |approx\\.? |roughly )?${RANGE}\\s*°\\s*C\\)`, 'g'), '');
    t = t.replace(new RegExp(`\\s*\\((?:about |around )?${RANGE}\\s*(?:cm|mm|ml|mL|L)\\)`, 'g'), '');
    t = t.replace(new RegExp(`${RANGE}\\s*°\\s*C\\b`, 'g'), (_m, a, b) => b ? `${fRound(+a)}–${fRound(+b)}°F` : `${fRound(+a)}°F`);
    t = t.replace(new RegExp(`${RANGE}\\s*cm\\b`, 'g'), (_m, a, b) => b ? `${inRound(+a)}–${inRound(+b)} inches` : `${inRound(+a)} inch${inRound(+a) === 1 ? '' : 'es'}`);
    t = t.replace(new RegExp(`${RANGE}\\s*(?:ml|mL|millilit(?:er|re)s?)\\b`, 'g'), (_m, a, b) => b ? `${ozRound(+a)}–${ozRound(+b)} fl oz` : `${ozRound(+a)} fl oz`);
    for (const [re, to] of BRITISH) t = t.replace(re, (m) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to));
    return t;
}
// Sentences about the photo or the identification don't belong in a care sheet.
const PHOTO_TALK = /\b(photo|photograph|picture|pictured|image|snapshot)s?\b|\b(?:can ?not|can't|couldn't) be (?:determined|assessed|confirmed|seen|told)|identification (?:is |was |remains )?(?:uncertain|unclear|not certain|tentative)|\bthis (?:specimen|particular pot|container)\b/i;
function tidyText(s: any, us: boolean): string {
    let t = String(s || '')
        // web-search citations: "([nc.edu](https://...))", "[NC State](https://...)", bare URLs
        .replace(/\s*\(\s*\[[^\]]*\]\([^)]*\)\s*\)/g, '')
        .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1')
        .replace(/\s*\(?https?:\/\/\S+\)?/g, '')
        .replace(/\s+([.,;])/g, '$1')
        .replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const kept = t.split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter((x) => !PHOTO_TALK.test(x));
    t = kept.join(' ').trim();
    return us ? toUsUnits(t) : t;
}
const isUsOwner = (user: any) => { const label = String(user?.location_label || ''); return !label || /,\s*(US|USA|United States)\s*$/i.test(label); };

// ---- The model call: Responses API with web search, else plain chat (no search) ----
function parseJsonLoose(s: string): any {
    try { return JSON.parse(s); } catch { /* fall through */ }
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('no JSON in reply');
    return JSON.parse(s.slice(a, b + 1));
}
async function askCare(system: string, userText: string, effortIn?: string, meter?: Meter | null, step = 'care sheet', modelIn?: string, searchSizeIn?: string) {
    const key = Deno.env.get('OPENAI_API_KEY') || '';
    const model = modelIn || CARE_MODEL;
    // How much of each web page the model reads. Most of a care sheet's cost is reading pages.
    const searchSize = (searchSizeIn || Deno.env.get('CARE_SEARCH_SIZE') || '').trim().toLowerCase();
    const t0 = Date.now();
    // Reasoning effort. Astra: "low" gave the same numbers as the default in half the time.
    // Luna: its default (medium) was closer to the researched answers than "low" (8-plant test).
    const effort = (effortIn || Deno.env.get('CARE_EFFORT') || (model === 'gpt-6-astra' ? 'low' : 'medium')).trim().toLowerCase();
    if ((Deno.env.get('CARE_WEB_SEARCH') || 'on').trim().toLowerCase() !== 'off') {
        for (const tool of ['web_search', 'web_search_preview']) {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 100_000);
            try {
                const res = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST', signal: ctl.signal,
                    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                    // At most 2 searches: each one is a cent, more than the rest of the care sheet
                    body: JSON.stringify({ model, instructions: system, input: userText, tools: [{ type: tool, ...(['low', 'medium', 'high'].includes(searchSize) ? { search_context_size: searchSize } : {}) }], max_tool_calls: 2, max_output_tokens: 12000, ...(['low', 'medium', 'high'].includes(effort) ? { reasoning: { effort } } : {}) }),
                });
                const j = await res.json().catch(() => null);
                if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(j?.error?.message || j).slice(0, 200)}`);
                let text = typeof j?.output_text === 'string' ? j.output_text : '';
                const cited: string[] = [];
                let searches = 0;
                for (const item of j?.output || []) {
                    if (item?.type === 'web_search_call') searches++;
                    if (item?.type !== 'message') continue;
                    for (const c of item.content || []) {
                        if (c?.type === 'output_text') {
                            if (!j?.output_text) text += c.text || '';
                            for (const a of c.annotations || []) if (a?.url) cited.push(String(a.url));
                        }
                    }
                }
                const u: any = j?.usage || {};
                meterAdd(meter, step, { model, input: u.input_tokens, cached: u.input_tokens_details?.cached_tokens, output: u.output_tokens, reasoning: u.output_tokens_details?.reasoning_tokens, searches });
                const data = parseJsonLoose(text);
                return { data, searched: tool, searches, cited, ms: Date.now() - t0 };
            } catch (e) {
                console.warn(`care call with ${tool} failed:`, (e as Error).message);
            } finally { clearTimeout(timer); }
        }
    }
    const r = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: userText }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 8000,
    });
    const u: any = r.usage || {};
    meterAdd(meter, `${step} (no search)`, { model, input: u.prompt_tokens, cached: u.prompt_tokens_details?.cached_tokens, output: u.completion_tokens, reasoning: u.completion_tokens_details?.reasoning_tokens });
    return { data: JSON.parse(r.choices[0].message.content || '{}'), searched: null, searches: 0, cited: [] as string[], ms: Date.now() - t0 };
}

const clampDays = (v: any, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : null; };
function cleanNumbers(x: any, hasRest: boolean) {
    const grow = clampDays(x?.grow_days, 1, 60);
    if (!grow) return null;
    const rest = hasRest ? clampDays(x?.rest_days, 1, 90) : null;
    return { grow, rest: hasRest ? Math.max(rest || grow, grow) : null };
}

// ---- Care sheet cache -------------------------------------------------------------------
// Researching a species costs about 20 cents (Astra reading ~20,000 tokens of web pages), so
// each species is researched once per region and reused for everyone there, free. The sheet
// is written to be shareable: general advice for the climate, numbers for indoors and
// outdoors, no city names, nothing about one person's spot. Bump CARE_V when the care
// prompt changes so old sheets aren't reused. Rows can be deleted to force a re-check.
const CARE_V = 1;
function speciesKey(s: any): string | null {
    const words = String(s || '').toLowerCase().replace(/['"‘’“”].*$/, '').replace(/×/g, 'x').replace(/\s+x\s+/g, ' x')
        .replace(/[^a-z\s.-]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return null; // a genus alone or a common name: research it
    const sp = /^spp?\.?$/.test(words[1]) ? 'sp' : words[1];
    return `${words[0]} ${sp}`;
}
// "Austin, Texas, US" → "us-texas"; no location → "unknown". Region + units decide the climate
// and the units the sheet is written in.
function regionKey(user: any): string {
    const parts = String(user?.location_label || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (parts.length >= 3) return `${parts[parts.length - 1]}-${parts[parts.length - 2]}`;
    if (parts.length === 2) {
        const lat = typeof user?.location_lat === 'number' ? Math.round(user.location_lat / 5) * 5 : 'x';
        return `${parts[1]}-lat${lat}`;
    }
    return 'unknown';
}
const cacheKeyFor = (sp: string, user: any) => `${CARE_V}|${sp}|${regionKey(user)}|${isUsOwner(user) ? 'us' : 'metric'}`;

// Write the care sheet for a plant whose name is settled.
//   ident.scientific_name / ident.name: what the photo ID settled on, or what the owner typed
//   ident.typed: true when the name came from the owner (fix the spelling, keep the plant)
//   ident.cache: service-role entities, to reuse/keep researched sheets (CareSheet)

async function writeCare(user: any, plant: any, today: string, ident: { name?: string; scientific_name?: string; typed?: boolean; plant_size?: string | null; effort?: string; meter?: Meter | null; step?: string; model?: string; search_size?: string; cache?: any }) {
    const us = isUsOwner(user);
    const who = ident.typed
        ? `The owner says the plant is "${ident.scientific_name || ident.name}". Trust the owner (they may know a cultivar or hybrid). If it is clearly misspelled or a common name, use the correct scientific name of the same plant.`
        : `The plant is ${ident.scientific_name || ident.name}${ident.name && ident.scientific_name ? ` (identified from a photo; the identifier called it "${ident.name}")` : ''}. Keep this scientific name.`;
    const userText = [
        who,
        contextFor(user, null, today),
        'This care sheet is shared by everyone in the owner\'s region who has this plant: never name the owner\'s city, and give both indoor and outdoor numbers.',
        'Write the care sheet. Return the JSON.',
    ].filter(Boolean).join('\n');
    // Already researched for this region?
    const lookupKey = ident.cache ? (() => { const sp = speciesKey(ident.scientific_name); return sp ? cacheKeyFor(sp, user) : null; })() : null;
    let r: any = null;
    let cachedRow: any = null;
    if (lookupKey) {
        try { cachedRow = (await ident.cache.CareSheet.filter({ key: lookupKey }))?.[0] || null; } catch { cachedRow = null; }
        if (cachedRow?.data) {
            r = { data: cachedRow.data, searched: 'cache', searches: 0, cited: cachedRow.cited || [], ms: 0 };
            meterAdd(ident.meter, `${ident.step || 'care sheet'} (reused, free)`, {});
            await ident.cache.CareSheet.update(cachedRow.id, { hits: (Number(cachedRow.hits) || 0) + 1, last_hit_at: new Date().toISOString() }).catch(() => {});
        }
    }
    if (!r) r = await askCare(`${CARE_RULES}\n\n${CARE_JSON}`, userText, ident.effort, ident.meter, ident.step, ident.model, ident.search_size);
    const d = r.data || {};
    const ci = d.care_instructions && typeof d.care_instructions === 'object' ? d.care_instructions : {};
    const wp = d.watering_profile && typeof d.watering_profile === 'object' ? d.watering_profile : {};
    const method = ['pour', 'soak', 'mist', 'bottom', 'in_water'].includes(wp.method) ? wp.method : 'pour';
    let dry = DRY_RULES.includes(wp.dry_rule) ? wp.dry_rule : wp.drought_tolerant ? 'dry' : 'top_inch';
    if (method === 'in_water') dry = 'in_water';
    const restSeason = dry === 'in_water' ? null : wp.rest_season === 'summer' ? 'summer' : wp.rest_season === 'winter' ? 'winter' : null;
    const indoor = cleanNumbers(wp.indoor, !!restSeason);
    const outdoor = cleanNumbers(wp.outdoor, !!restSeason) || indoor;
    const numbers = indoor || outdoor ? { indoor: indoor || outdoor, outdoor: outdoor || indoor } : null;
    const rawTpl = tidyText(ci.watering, us);
    const tpl = waterTplOk(rawTpl, !!restSeason) ? rawTpl : (numbers ? defaultWaterTpl(dry, restSeason) : null);
    // Right now: this spot's numbers for today's season
    const n = numbers?.[spotOf(plant?.environment)] || null;
    const every = n ? (restNow(today, user?.location_lat, restSeason) ? (n.rest || n.grow) : n.grow) : (clampDays(d.water_frequency_days, 1, 60) || 7);
    const care: Record<string, string> = {};
    for (const k of ['watering', 'sunlight', 'soil', 'humidity', 'temperature', 'fertilizing', 'tips']) {
        const v = k === 'watering' ? (tpl && n ? fillTpl(tpl, n.grow, n.rest) : rawTpl.replace(/\{(grow|rest)\}/g, String(every))) : tidyText(ci[k], us);
        if (v) care[k] = v;
    }
    const sources = [...new Set([...(Array.isArray(d.sources) ? d.sources : []), ...r.cited].map(String).filter((u) => /^https?:\/\//.test(u)).map((u) => u.replace(/[?&]utm_[^&]+/g, '')))].slice(0, 6);
    const ai = {
        source: 'care', group: PROFILE_GROUPS.includes(wp.group) ? wp.group : 'other', method, strict: !!wp.strict,
        drought_tolerant: dry === 'dry' || (!!wp.drought_tolerant && dry !== 'moist'), dry_rule: dry, rest_season: restSeason, numbers,
        water_tpl: tpl, why: typeof wp.why === 'string' ? tidyText(wp.why, us).slice(0, 200) : null, sources,
    };
    const name = String(d.name || ident.name || 'Plant').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 80);
    const sci = ident.typed ? String(d.scientific_name || ident.scientific_name || ident.name || '').slice(0, 120) : String(ident.scientific_name || d.scientific_name || '').slice(0, 120);
    // Keep a good fresh answer for the next person in this region with this species
    if (ident.cache && !cachedRow && numbers && waterTplOk(rawTpl, !!restSeason) && d.name) {
        const sp = speciesKey(sci) || speciesKey(d.scientific_name);
        if (sp) {
            const key = cacheKeyFor(sp, user);
            const last = ident.meter?.calls?.[ident.meter.calls.length - 1];
            await ident.cache.CareSheet.filter({ key }).then((rows: any[]) => rows?.length ? null : ident.cache.CareSheet.create({
                key, species: sp, region: regionKey(user), units: us ? 'us' : 'metric', version: CARE_V,
                model: last?.model || CARE_MODEL, data: d, cited: r.cited || [], cost_usd: last?.usd ?? null, hits: 0,
            })).catch((e: any) => console.warn('care cache save failed', e?.message));
        }
    }
    console.log(`care for ${sci}: search=${r.searched || 'none'} (${r.searches}) ${r.ms}ms, ${numbers ? `in ${numbers.indoor.grow}/${numbers.indoor.rest} out ${numbers.outdoor.grow}/${numbers.outdoor.rest}` : 'no numbers'} ${restSeason || ''} ${dry}`);
    return {
        fields: {
            name: name || 'Plant',
            scientific_name: sci || null,
            care_instructions: care,
            water_frequency_days: every,
            ...(PLANT_TYPES.includes(d.plant_type) ? { plant_type: d.plant_type } : {}),
        },
        ai,
        meta: { searched: r.searched, searches: r.searches, ms: r.ms },
        raw: d,
    };
}

// ---- "Is it one of these?": a reference photo for each guess ------------------------------
// When the name isn't certain, the new-plant check shows the top guesses with a photo each,
// so the owner can pick the one that looks like their plant (no plant knowledge needed).
// Photos: Pl@ntNet's own reference photos for its candidates, else one freely licensed
// iNaturalist photo of the species (free API, no key), looked up once per species and kept
// in PlantPhotoRef. Only licenses that allow use in an app with ads: CC0, CC BY, CC BY-SA
// (never "all rights reserved" or non-commercial ones). Each photo shows its credit line.
const OK_LICENSE = /^(cc0|cc[-_ ]?by|cc[-_ ]?by[-_ ]?sa)([-_ ]?[\d.]+)?$/i;
async function getJson(url: string, ms = 6000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'HappyPlants/1.0 (+https://happyplants.club)', Accept: 'application/json' } });
        return r.ok ? await r.json() : null;
    } catch { return null; } finally { clearTimeout(t); }
}
async function inatPhoto(sci: string) {
    const sp = speciesKey(sci);
    if (!sp || sp.endsWith(' sp')) return null;
    const found = await getJson(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(sp)}&per_page=3`);
    const taxon = (found?.results || []).find((t: any) => speciesKey(t?.name) === sp);
    if (!taxon?.id) return null;
    const full = await getJson(`https://api.inaturalist.org/v1/taxa/${taxon.id}`);
    for (const tp of full?.results?.[0]?.taxon_photos || []) {
        const p = tp?.photo;
        if (p?.medium_url && OK_LICENSE.test(String(p.license_code || ''))) {
            return { url: p.medium_url, credit: String(p.attribution || '').slice(0, 160), license: p.license_code, source: 'iNaturalist', page: `https://www.inaturalist.org/taxa/${taxon.id}` };
        }
    }
    return null;
}
// Wikipedia's lead photo of the species, if Wikimedia Commons says it's CC0 / CC BY / CC BY-SA
// / public domain (most iNaturalist photos are "all rights reserved" or non-commercial)
const stripHtml = (s: any) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
async function commonsPhoto(sci: string) {
    const sp = speciesKey(sci);
    if (!sp || sp.endsWith(' sp')) return null;
    const title = sp.charAt(0).toUpperCase() + sp.slice(1).replace(/ /g, '_');
    const sum = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const src = String(sum?.originalimage?.source || sum?.thumbnail?.source || '');
    const file = decodeURIComponent((src.split('?')[0].split('/').pop() || '').replace(/^\d+px-/, ''));
    if (!file || !/^upload\.wikimedia\.org$/.test(new URL(src || 'https://x').hostname)) return null;
    const info = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500&titles=${encodeURIComponent('File:' + file)}`);
    const page: any = Object.values(info?.query?.pages || {})[0];
    const ii = page?.imageinfo?.[0];
    const meta = ii?.extmetadata || {};
    const lic = stripHtml(meta.LicenseShortName?.value);
    const okLic = /^(cc0|public domain|cc by( |-)?[\d.]*|cc by-sa( |-)?[\d.]*)$/i.test(lic) || /^cc[- ]by(-sa)?[- ][\d.]+$/i.test(lic);
    if (!ii?.thumburl || !okLic) return null;
    const artist = stripHtml(meta.Artist?.value).slice(0, 100) || 'Wikimedia Commons';
    return { url: String(ii.thumburl).replace(/\?utm_[^#]*$/, ''), credit: `${artist} / Wikimedia Commons, ${lic}`.slice(0, 160), license: lic, source: 'Wikimedia Commons', page: ii.descriptionurl || null };
}
async function photoFor(sci: string, pn: any[] | null, cache: any) {
    const sp = speciesKey(sci);
    if (!sp) return null;
    const hit = (pn || []).find((c: any) => speciesKey(c.scientific_name) === sp);
    const p = hit?.photos?.find((x: any) => OK_LICENSE.test(String(x.license || '').replace(/\s+/g, '-')));
    if (p) return { url: p.url, credit: String(p.citation || p.author || 'Pl@ntNet').slice(0, 160), license: p.license, source: 'Pl@ntNet' };
    if (!cache) return null;
    const row = (await cache.PlantPhotoRef.filter({ species: sp }).catch(() => []))?.[0];
    // A species with no free photo is checked again after 30 days (rows from before the
    // Wikimedia fallback, without source 'none-v2', are checked again now)
    if (row && (row.url || (row.source === 'none-v2' && Date.now() - Date.parse(row.checked_at || 0) < 30 * 86400e3))) {
        return row.url ? { url: row.url, credit: row.credit, license: row.license, source: row.source, page: row.page } : null;
    }
    const got = (await inatPhoto(sci)) || (await commonsPhoto(sci).catch(() => null));
    const data = { species: sp, url: got?.url ? String(got.url).replace(/\?utm_[^#]*$/, '') : null, credit: got?.credit || null, license: got?.license || null, source: got?.source || 'none-v2', page: got?.page || null, checked_at: new Date().toISOString() };
    await (row ? cache.PlantPhotoRef.update(row.id, data) : cache.PlantPhotoRef.create(data)).catch(() => {});
    return got;
}
// The best guess first, then up to 3 others, each with a photo when one is free to use
async function buildChoices(best: any, alternatives: any[], pn: any[] | null, cache: any, capMs = 5000) {
    const seen = new Set<string>();
    const list: any[] = [];
    for (const c of [best, ...(alternatives || [])]) {
        if (!c?.scientific_name) continue;
        const k = speciesKey(c.scientific_name) || String(c.scientific_name).toLowerCase().trim();
        if (seen.has(k)) continue;
        seen.add(k);
        list.push({ name: String(c.name || '').slice(0, 80) || null, scientific_name: String(c.scientific_name).slice(0, 120) });
        if (list.length >= 4) break;
    }
    const photos = await Promise.race([
        Promise.all(list.map((c) => photoFor(c.scientific_name, pn, cache).catch(() => null))),
        new Promise<any[]>((r) => setTimeout(() => r(list.map(() => null)), capMs)),
    ]);
    return list.map((c, i) => ({ ...c, photo: photos[i] || null }));
}

// "Echeveria colorata 'Lindsayana'" and "echeveria colorata" are the same species; "Echeveria sp." is not.
function sameSpecies(a: any, b: any): boolean {
    const key = (s: any) => String(s || '').toLowerCase().replace(/['"‘’“”].*$/, '').replace(/×/g, 'x').replace(/\s+x\s+/g, ' x').trim().split(/\s+/).slice(0, 2).join(' ');
    const ka = key(a), kb = key(b);
    return !!ka && ka === kb && !/\bsp{1,2}\.?$/.test(ka) && ka.split(' ').length === 2;
}

// The care_profile to save with a fresh care sheet: the owner's own choices are kept, and the
// new answer waits in `ai` for functions/plus to apply (it sets v when it does).
function pendingProfile(plant: any, ai: any, every: number) {
    const prof = { ...(plant?.care_profile || {}) };
    delete prof.v;
    delete prof.ai;
    // A review of the old care sheet doesn't apply to the new one
    delete prof.audit_note;
    delete prof.audited_at;
    prof.prev_every = every;
    prof.ai = ai;
    return prof;
}

Deno.serve(async (req) => {
    const rid = Math.random().toString(36).slice(2, 7);
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        // The hourly sweep retries plants that got stuck mid-add (app closed, no signal):
        // it calls with the sweep key and works as the plant's owner.
        const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
        const svc = !!(sweepKey && body?.key && body.key === sweepKey && body?.plant_id);

        // Admin test: write a care sheet for a name without saving anything
        // { key, test_care: { scientific_name, name?, typed?, environment?, location?, owner_email } }
        if (sweepKey && body?.key === sweepKey && body?.test_care) {
            const tc = body.test_care;
            const owner = (await base44.asServiceRole.entities.User.filter({ email: String(tc.owner_email || '') }))?.[0] || {};
            const fake = { environment: tc.environment || null, location: tc.location || null };
            const today = aiLocalDay(owner.timezone);
            const meter = newMeter();
            const c = await writeCare(owner, fake, today, { name: tc.name, scientific_name: tc.scientific_name, typed: !!tc.typed, effort: tc.effort, meter, model: tc.model, search_size: tc.search_size, cache: tc.cache === true ? base44.asServiceRole.entities : null });
            return Response.json({ success: true, today, ...c, cost: { usd: meterUsd(meter), calls: meter.calls } });
        }
        // Admin test: the whole photo flow (name + care sheet) for a photo, without saving anything,
        // with timings and what it cost. { key, test_photo: { image_url, owner_email, environment?, location? } }
        if (sweepKey && body?.key === sweepKey && body?.test_photo) {
            const tp = body.test_photo;
            const owner = (await base44.asServiceRole.entities.User.filter({ email: String(tp.owner_email || '') }))?.[0] || {};
            const fake = { environment: tp.environment || null, location: tp.location || null };
            const today = aiLocalDay(owner.timezone);
            const meter = newMeter();
            const t0 = Date.now();
            let spec: any = null;
            const r = await identify(rid, String(tp.image_url), contextFor(owner, fake, today), (b) => {
                if (b?.scientific_name && tp.speculate !== false && tp.care !== false) spec = { sci: b.scientific_name, p: writeCare(owner, fake, today, { name: b.name, scientific_name: b.scientific_name, meter, step: 'care sheet (started early)', model: tp.model, search_size: tp.search_size, cache: tp.cache === true ? base44.asServiceRole.entities : null }).catch(() => null) };
            }, meter, { blind: tp.blind_model, judge: tp.judge_model, effort: tp.id_effort });
            if (tp.care === false) {
                const choices = tp.choices ? await buildChoices(r.plantData, r.identification.alternatives, r.pn, base44.asServiceRole.entities) : undefined;
                return Response.json({ success: true, name: r.plantData.name, scientific_name: r.plantData.scientific_name, confidence: r.identification.confidence,
                    judge: r.identification.judge || 'ran', blind: r.identification.blind_llm, plantnet: r.identification.plantnet_top, plantnet_score: r.identification.plantnet_score,
                    named_ms: Date.now() - t0, timing: r.identification.timing, cost: { usd: meterUsd(meter), calls: meter.calls },
                    choices, pn_photos: tp.choices ? (r.pn || []).map((c: any) => ({ sci: c.scientific_name, photos: c.photos })) : undefined });
            }
            const namedMs = Date.now() - t0;
            const same = !!spec && sameSpecies(spec.sci, r.plantData.scientific_name);
            let c: any = same ? await spec.p : null;
            if (!c) c = await writeCare(owner, fake, today, { name: r.plantData.name, scientific_name: r.plantData.scientific_name, meter, model: tp.model, search_size: tp.search_size, cache: tp.cache === true ? base44.asServiceRole.entities : null });
            const careMs = Date.now() - t0;
            if (spec && !same) await spec.p; // wasted, but paid for: count it
            return Response.json({
                success: true, name: c.fields.name, scientific_name: r.plantData.scientific_name, confidence: r.identification.confidence,
                judge: r.identification.judge || 'ran', blind: spec?.sci || null, early_care_used: same,
                named_ms: namedMs, care_ready_ms: careMs, timing: r.identification.timing,
                cost: { usd: meterUsd(meter), calls: meter.calls },
            });
        }
        let user: any = null;
        if (!svc) {
            try { user = await base44.auth.me(); } catch { user = null; }
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const db = svc ? base44.asServiceRole.entities : base44.entities;
        const cache = base44.asServiceRole.entities; // CareSheet: researched care sheets, shared per region

        // ---- New flow: the plant record already exists; do the work here and save it,
        // so it finishes even if the phone closes the app or loses signal.
        if (body?.plant_id) {
            let plant: any = null;
            try { plant = (await db.Plant.filter({ id: String(body.plant_id) }))?.[0]; } catch { plant = null; }
            if (svc && plant) user = (await db.User.filter({ email: plant.created_by }))?.[0] || null;
            if (!plant || !user || plant.created_by !== user.email) return Response.json({ error: 'Not found' }, { status: 404 });
            const today = aiLocalDay(user.timezone);
            const info = { ...(plant.add_info || {}) };
            const corrected = typeof body.scientific_name === 'string' ? body.scientific_name.trim().slice(0, 120) : '';
            const typedNew = !corrected && !plant.image_url && !!info.typed && !info.care_done;
            if (corrected || typedNew) {
                // Typing a name isn't a photo ID
                const q = await useAiQuota(base44, user, 'rename');
                if (!q.allowed) return aiLimitResponse('rename', q);
            } else if (!info.id_paid && plant.image_url) {
                const t = await takeOneId(base44, user);
                if (t.blocked) {
                    await db.Plant.update(plant.id, { add_status: 'failed', add_info: { ...info, error: 'limit_reached' } }).catch(() => {});
                    return t.blocked;
                }
                info.id_paid = t.day || today;
            }
            const context = contextFor(user, plant, today);
            // Seasonal numbers belong to the plant the care sheet was written for
            const clearSeasons = (p: any) => (p.care_profile?.user_interval ? {} : { water_days_grow: null, water_days_rest: null, water_rest_season: null, water_season: null });

            // Write the care sheet for a plant that already has its name and save it. The owner
            // can be setting the plant up meanwhile (where it lives, pot, how it's watered), so
            // this re-reads the plant and only touches the care fields; if they renamed it in the
            // meantime, the rename wrote its own care sheet and this one is dropped.
            //   ready: a care sheet already being written (the photo flow starts one early)
            const saveCare = async (ident: any, ready: Promise<any> | null, extraInfo: any = {}) => {
                const t0 = Date.now();
                let c: any = ready ? await ready : null;
                const early = !!c;
                if (!c) c = await writeCare(user, plant, today, ident);
                const fresh = (await db.Plant.filter({ id: plant.id }))?.[0];
                if (!fresh) return null;
                const fi = fresh.add_info || {};
                if (ident.renamedAt ? fi.renamed_at !== ident.renamedAt : (fi.renamed_at && Date.parse(fi.renamed_at) >= t0 - 1000)) return fresh;
                const d = c.fields;
                // Numbers for where it lives NOW (the owner may have just said)
                const n = c.ai?.numbers?.[spotOf(fresh.environment)] || null;
                const every = n ? (restNow(today, user?.location_lat, c.ai.rest_season) ? (n.rest || n.grow) : n.grow) : d.water_frequency_days;
                const last = String(fresh.last_watered || '').slice(0, 10) || today;
                const own = !!fresh.care_profile?.user_interval;
                const patch: any = {
                    care_instructions: d.care_instructions,
                    ...(d.plant_type ? { plant_type: d.plant_type } : {}),
                    // The care sheet never renames the plant (the photo ID or the owner named it);
                    // for typed names it only fills in the scientific name, and a common name when
                    // what they typed was the scientific name itself.
                    ...(ident.typed ? { scientific_name: d.scientific_name,
                        ...(d.name && [d.scientific_name, ident.scientific_name].some((x) => String(fresh.name || '').trim().toLowerCase() === String(x || '').trim().toLowerCase()) ? { name: d.name } : {}) } : {}),
                    ...(own ? {} : { ...clearSeasons(fresh), water_frequency_days: every, next_watering_due: addDays(last, every) }),
                    last_watered: last,
                    care_profile: pendingProfile(fresh, c.ai, every),
                    add_info: { ...fi, ...extraInfo, care_pending: false, care_done: true, care_error: null, done_at: new Date().toISOString(),
                        care_run: { early, searches: c.meta?.searches ?? null, ms: Date.now() - t0 },
                        ...(ident.meter ? { cost: { usd: meterUsd(ident.meter), calls: ident.meter.calls } } : {}) },
                };
                if (fresh.add_status === 'identifying') patch.add_status = fi.final_status === 'done' ? 'done' : 'review';
                await db.Plant.update(plant.id, patch);
                if (!svc) await profileNow(base44, plant.id);
                return (await db.Plant.filter({ id: plant.id }))?.[0] || { ...fresh, ...patch };
            };
            const careFailed = async (e: any) => {
                console.error(`[${rid}] care sheet failed`, (e as Error).message);
                const fresh = (await db.Plant.filter({ id: plant.id }))?.[0] || plant;
                await db.Plant.update(plant.id, { add_info: { ...(fresh.add_info || {}), care_pending: true, care_error: (e as Error).message.slice(0, 200) } }).catch(() => {});
                return Response.json({ error: "Couldn't write this plant's care", detail: (e as Error).message }, { status: 502 });
            };

            // a) Owner changed the name: typed a scientific name, or tapped one in "Is it one of
            //    these?". The new name is saved right away (the app shows it at once); the care
            //    sheet for it follows a few seconds later.
            if (corrected) {
                const picked = typeof body.name === 'string' ? body.name.replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 80) : '';
                const renamedAt = new Date().toISOString();
                await db.Plant.update(plant.id, {
                    scientific_name: corrected,
                    // Typed: the care sheet swaps in the common name for it
                    name: picked || corrected,
                    add_info: { ...info, error: null, renamed_from: plant.scientific_name || null, renamed_at: renamedAt, care_started_at: renamedAt,
                        care_pending: true, care_done: false, care_error: null },
                    // A plant we couldn't name is named now: on to the check
                    ...(plant.add_status === 'failed' || plant.add_status === 'identifying' ? { add_status: 'review' } : {}),
                });
                try {
                    const fresh = await saveCare({ name: picked || corrected, scientific_name: corrected, typed: true, meter: newMeter(), cache, renamedAt }, null);
                    return Response.json({ success: true, plant: fresh });
                } catch (e) { return careFailed(e); }
            }

            // d) A second photo of a named plant (a close-up, a flower, or its nursery tag), sent
            //    inline (no upload, so no Base44 credit): name it again from both photos, and if
            //    it's a different plant now, write the care sheet for the new name.
            if (typeof body.extra_photo === 'string' && body.extra_photo.length) {
                if (!plant.image_url) return Response.json({ error: 'No photo on this plant' }, { status: 400 });
                if ((Number(info.extra_tries) || 0) >= 3) return Response.json({ error: 'too_many', detail: 'Three extra photos already tried for this plant' }, { status: 429 });
                if (body.extra_photo.length > 6_000_000) return Response.json({ error: 'Photo too large' }, { status: 413 });
                const mime = /^image\/(jpeg|png|webp)$/.test(String(body.mime || '')) ? String(body.mime) : 'image/jpeg';
                const b64 = body.extra_photo.replace(/^data:[^,]*,/, '');
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const meter = newMeter();
                info.extra_tries = (Number(info.extra_tries) || 0) + 1;
                const r = await identify(rid, plant.image_url, context, undefined, meter, {}, { bytes, mime, dataUrl: `data:${mime};base64,${b64}` });
                const judged = r.plantData;
                const changed = !!judged.scientific_name && !sameSpecies(judged.scientific_name, plant.scientific_name);
                const choices = r.identification?.confidence === 'high' ? [] : await buildChoices(judged, r.identification?.alternatives || [], r.pn, cache).catch(() => []);
                const size = PLANT_SIZES.includes(judged.plant_size) ? judged.plant_size : null;
                await db.Plant.update(plant.id, {
                    ...(changed ? {
                        name: String(judged.name || 'Plant').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 80) || 'Plant',
                        scientific_name: String(judged.scientific_name).slice(0, 120),
                        ...(size ? { plant_size: size } : {}),
                    } : {}),
                    add_info: { ...info, ...r.identification, choices, extra_photo_at: new Date().toISOString(), extra_cost: { usd: meterUsd(meter), calls: meter.calls },
                        ...(changed ? { care_pending: true, care_done: false, renamed_from: plant.scientific_name || null } : {}) },
                });
                if (!changed) {
                    const fresh = (await db.Plant.filter({ id: plant.id }))?.[0];
                    return Response.json({ success: true, changed: false, plant: fresh });
                }
                try {
                    const fresh = await saveCare({ name: judged.name, scientific_name: String(judged.scientific_name).slice(0, 120), plant_size: size, meter: newMeter(), cache }, null);
                    return Response.json({ success: true, changed: true, plant: fresh });
                } catch (e) { return careFailed(e); }
            }

            // b) Added by typing its name (Add > type or say names), or named from a photo but its
            //    care sheet didn't finish (app closed, error): write the care sheet once
            const typedPlant = !plant.image_url && info.typed;
            const namedNoCare = !!plant.image_url && info.care_pending && !info.care_done && !!plant.scientific_name;
            if (typedPlant || namedNoCare) {
                if (info.care_done) return Response.json({ success: true, plant });
                info.tries = (Number(info.tries) || 0) + 1;
                info.care_started_at = new Date().toISOString();
                if (typedPlant) info.started_at = info.care_started_at;
                await db.Plant.update(plant.id, { add_info: { ...info, care_pending: true } }).catch(() => {});
                try {
                    const meter = newMeter();
                    const fresh = await saveCare(typedPlant
                        ? { name: plant.name, scientific_name: plant.scientific_name || plant.name, typed: true, meter, cache }
                        : { name: plant.name, scientific_name: plant.scientific_name, plant_size: plant.plant_size || null, meter, cache }, null);
                    return Response.json({ success: true, plant: fresh });
                } catch (e) { return careFailed(e); }
            }

            // c) Identify from the photo. The name is saved as soon as it's settled, so the owner
            //    can set the plant up right away; the care sheet (written for that name, not from
            //    the photo, and usually already started while the name was being settled) is saved
            //    a few seconds later.
            if (!plant.image_url) return Response.json({ error: 'No photo on this plant' }, { status: 400 });
            info.tries = (Number(info.tries) || 0) + 1;
            info.started_at = new Date().toISOString();
            delete info.error;
            await db.Plant.update(plant.id, { add_status: 'identifying', add_info: info });
            let spec: any = null;
            let r: any = null;
            const meter = newMeter();
            try {
                // Start the care sheet for the blind opinion's species while the name is settled;
                // use it if the final name is the same species, else write it again.
                r = await identify(rid, plant.image_url, context, (b) => {
                    if (b?.scientific_name) spec = { sci: b.scientific_name, p: writeCare(user, plant, today, { name: b.name, scientific_name: b.scientific_name, meter, step: 'care sheet (started early)', cache }).catch(() => null) };
                }, meter);
            } catch (e) {
                console.error(`[${rid}] identify failed`, (e as Error).message);
                await db.Plant.update(plant.id, { add_status: 'failed', add_info: { ...info, error: (e as Error).message.slice(0, 200) } }).catch(() => {});
                return Response.json({ error: "Couldn't identify this plant", detail: (e as Error).message }, { status: 502 });
            }
            const judged = r.plantData;
            const size = PLANT_SIZES.includes(judged.plant_size) ? judged.plant_size : null;
            // Added in bulk with the area already picked, and a sure name: nothing left to
            // ask, so it skips "Newly added". Otherwise the owner checks it.
            const settled = info.bulk && String(plant.location || '').trim() && r.identification?.confidence === 'high';
            // Photos for "Is it one of these?" (only shown when the name isn't certain)
            const choices = r.identification?.confidence === 'high' ? [] : await buildChoices(judged, r.identification?.alternatives || [], r.pn, cache).catch(() => []);
            const named = {
                name: String(judged.name || 'Plant').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 80) || 'Plant',
                scientific_name: judged.scientific_name ? String(judged.scientific_name).slice(0, 120) : null,
                ...(size ? { plant_size: size } : {}),
                add_status: settled ? 'done' : 'review',
                add_info: { ...info, ...r.identification, choices, care_pending: true, named_at: new Date().toISOString(),
                    named_ms: Date.now() - Date.parse(info.started_at) },
            };
            await db.Plant.update(plant.id, named);
            try {
                const ready = spec && sameSpecies(spec.sci, judged.scientific_name) ? spec.p : null;
                let fresh = await saveCare({ name: named.name, scientific_name: named.scientific_name, plant_size: size, meter, cache }, ready);
                // An early care sheet for a different species was paid for too: count it
                if (spec && !ready && fresh) {
                    await spec.p;
                    const cost = { usd: meterUsd(meter), calls: meter.calls };
                    await db.Plant.update(plant.id, { add_info: { ...(fresh.add_info || {}), cost } }).catch(() => {});
                    fresh = { ...fresh, add_info: { ...(fresh.add_info || {}), cost } };
                }
                return Response.json({ success: true, plant: fresh });
            } catch (e) { return careFailed(e); }
        }

        // ---- Old flow (older app screens): identify a photo and return the data
        const today = aiLocalDay(user.timezone);
        const { image_url } = body || {};
        if (!image_url) return Response.json({ error: 'No image_url provided' }, { status: 400 });
        const t = await takeOneId(base44, user);
        if (t.blocked) return t.blocked;
        console.log(`[${rid}] 🌱 identifyPlantWithExpert`, image_url);
        const r = await identify(rid, image_url, contextFor(user, null, today));
        const c = await writeCare(user, null, today, { name: r.plantData.name, scientific_name: r.plantData.scientific_name, cache: base44.asServiceRole.entities });
        return Response.json({ success: true, plantData: { ...r.plantData, ...c.fields }, identification: r.identification });
    } catch (error) {
        console.error(`[${rid}] Error in identifyPlantWithExpert:`, error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
