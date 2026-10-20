import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const MODEL = "gpt-6-astra";

// ---------------------------------------------------------------------------
// Identification runs as three steps:
//   1. Pl@ntNet (purpose-built plant classifier) scores the photo.
//   2. The LLM identifies the photo BLIND - it never sees Pl@ntNet's answer,
//      so the two opinions are independent.
//   3. A judge pass sees the photo, both opinions and a lookalike cheat sheet,
//      settles the name, and writes the care info.
// Without PLANTNET_API_KEY, steps 2 and 3 still run.
// ---------------------------------------------------------------------------

async function identifyWithPlantNet(imageUrl) {
    const key = Deno.env.get("PLANTNET_API_KEY");
    if (!key) return null;
    try {
        const url = `https://my-api.plantnet.org/v2/identify/all?images=${encodeURIComponent(imageUrl)}&organs=auto&lang=en&no-reject=true&api-key=${encodeURIComponent(key)}`;
        let res = await fetch(url);
        if (res.status >= 500) {
            await new Promise(r => setTimeout(r, 1500));
            res = await fetch(url);
        }
        if (!res.ok) {
            console.warn('[PlantNet] HTTP', res.status, await res.text().catch(() => ''));
            return null;
        }
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length === 0) return null;
        const toMatch = (r) => ({
            scientific_name: r?.species?.scientificNameWithoutAuthor || '',
            family: r?.species?.family?.scientificNameWithoutAuthor || '',
            common_names: Array.isArray(r?.species?.commonNames) ? r.species.commonNames : [],
            score: typeof r?.score === 'number' ? r.score : 0,
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
- Prefer the common, widely sold species over a rare one when both fit the photo equally well.`;

const JSON_ID_ONLY = `Return ONLY JSON:
{
  "name": "common name - no parentheses, no hedging words",
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
  "name": "common name - no parentheses, no hedging words",
  "scientific_name": "genus and species, or the hybrid/cultivar name if that is the real identity",
  "confidence": "high" | "medium" | "low",
  "identification_notes": "one or two sentences: the features that settle it, and anything the owner should know (mixed planting, cutting, lookalike ruled out)",
  "plantnet_agreement": true | false | null,
  "alternatives": [ { "name": "common name", "scientific_name": "scientific name" } ],
  "plant_size": "Seedling" | "Small" | "Medium" | "Large" | "Mature"
}`;

function imageMessage(imageUrl, text) {
    return {
        role: "user",
        content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text }
        ]
    };
}

async function askJson(systemPrompt, imageUrl, userText, maxTokens) {
    const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt }, imageMessage(imageUrl, userText)],
        response_format: { type: "json_object" },
        max_completion_tokens: maxTokens
    });
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
// Free: 30 in the first 24 hours after signing up (to add the whole garden), then 5 a
// day; each reward video adds 5 more (up to 3 videos a day). Plus: 200 a day. Admins
// count as Plus. A plant is charged once, however many times naming it is retried.
// The same block is in functions/premium (status, reserve, reward) — keep them in step.
const ID_RULES = { intro: 30, introHours: 24, daily: 5, perAd: 5, maxAds: 3, plus: 200 };
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
        const plus = !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
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
function cleanPlantData(d: any) {
    const freq = Math.round(Number(d?.water_frequency_days));
    return {
        name: String(d?.name || 'Plant').slice(0, 80),
        scientific_name: d?.scientific_name ? String(d.scientific_name).slice(0, 120) : null,
        care_instructions: d?.care_instructions && typeof d.care_instructions === 'object' ? d.care_instructions : {},
        water_frequency_days: Number.isFinite(freq) ? Math.min(60, Math.max(1, freq)) : 7,
        ...(PLANT_SIZES.includes(d?.plant_size) ? { plant_size: d.plant_size } : {}),
        ...(PLANT_TYPES.includes(d?.plant_type) ? { plant_type: d.plant_type } : {}),
    };
}

// Give the plant its watering profile right away (how it's watered, finicky or not,
// seasonal intervals). If this fails, the garden page and the hourly sweep do it later.
async function profileNow(base44: any, plantId: string) {
    try {
        await base44.functions.invoke('plus', { action: 'profile', plant_ids: [plantId] });
    } catch (e) {
        console.warn('profile call failed', (e as Error).message);
    }
}

async function identify(rid: string, imageUrl: string, context: string) {
    const [pn, blind] = await Promise.all([
        identifyWithPlantNet(imageUrl),
        askJson(`${BOTANIST}\n\n${JSON_ID_ONLY}`, imageUrl, "Identify this plant following the method. Return the JSON.", 1200).catch(e => { console.warn(`[${rid}] blind ID failed:`, e?.message); return null; })
    ]);
    console.log(`[${rid}] 🌿 PlantNet:`, pn ? pn.map(c => `${c.scientific_name} ${c.score.toFixed(2)}`).join(' | ') : 'none');
    console.log(`[${rid}] 🌿 Blind LLM:`, blind ? `${blind.scientific_name} (${blind.confidence})` : 'none');
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
    const parsed = await askJson(judgePrompt, imageUrl, "Judge the identification. Return the JSON.", 2500);
    const { confidence, identification_notes, alternatives, plantnet_agreement, ...plantData } = parsed;
    console.log(`[${rid}] 🌿 Final:`, plantData.name, '|', plantData.scientific_name, '| confidence:', confidence);
    return {
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
- Is general advice for this plant in the owner's climate and spot. Never mention a photo, picture or image, the pot it is in now, its current condition, or how sure anyone is about the identification.
- Uses plain everyday words and short sentences. No filler. "watering" up to 4 sentences, every other text up to 3.
- Follows the units and spelling rule in the context.

The texts:
- watering: how to water and when (until it drains, then let the soil dry out completely / the top half / the top inch...). Write the placeholders {grow} and {rest} where the numbers of days go, for example "about every {grow} days while it grows" and "about every {rest} days in winter". The app fills in the numbers for the plant's spot. Never write a number of days or weeks yourself. If it drops its leaves to rest, say to stop or nearly stop watering once the leaves fall. If rest_season is null, use only {grow}.
- sunlight: how much direct sun it wants, and whether it needs shade from hot afternoon sun in this climate.
- soil: the mix to use.
- humidity: only what it really needs.
- temperature: the coldest it can take, as a clear action ("Bring it inside before nights drop below 50°F"), and whether frost kills it.
- fertilizing: only in its growing season, and say when to stop. Winter growers are fed from fall to spring, never in summer. Carnivorous plants are never fed through the soil.
- tips: two or three practical tips, then whether it is toxic to pets and people (say "not known to be toxic" when that is the case; never invent toxicity).

name: the common name US nurseries and extension services use for THIS species. Some popular names belong to a different species ("Congo fig" is Dorstenia elata, not Dorstenia foetida). Never borrow one. If it has no real common name, use the genus name.

watering_profile (the app reminds the owner on these numbers):
- rest_season: "winter" if it grows in the warm months. "summer" if it grows in the cool months and rests in summer (Aeonium, Aloinopsis, Conophytum, Lithops-type mesembs, winter-rainfall bulbs such as Albuca spiralis and Oxalis versicolor). Check this one: plants are often wrongly called winter growers (Albuca bracteata grows in summer). null only for plants that live in water, or that grow the same all year because the owner is in the tropics.
- indoor and outdoor: grow_days and rest_days for the plant kept indoors in a home, and kept outdoors in a pot, in the owner's climate. If it can't stay outdoors in the owner's winter, outdoor.rest_days is for it brought in or sheltered.
  grow_days: days between waterings while it grows. Guide: outdoor potted succulents in warm, dry weather 5-7; indoor succulents and cacti 10-21; tropical houseplants indoors 7-10; orchids in bark 4-7 (outdoors in heat 2-4); ferns and carnivorous plants 2-4.
  rest_days: days between waterings in its rest season, never less than grow_days. Almost every plant needs less water then, houseplants too (about 1.5 to 2 times longer indoors in winter). Most cacti and succulents: 30. Plants that rot easily when cold and wet, and plants that drop their leaves to rest (Adenium, Adenia, Cyphostemma, Pachypodium, Euphorbia bupleurifolia and other deciduous euphorbias): 45-60, and the watering text says to keep it nearly dry. Orchids that need a dry rest to flower (Dendrobium kingianum, nobile dendrobiums): 3 to 5 times grow_days. null when rest_season is null.
- dry_rule: "dry" (let the soil dry out completely: cacti, most succulents, snake plants), "top_half" (let the top half dry: Dorstenia, Albuca, hoya, peperomia, epiphytic cacti such as fishbone and Christmas cactus), "top_inch" (most houseplants and garden plants), "moist" (never let it dry out: ferns, carnivorous plants), "in_water" (lives in water).
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
    let t = String(s || '').replace(/\s+/g, ' ').trim();
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
async function askCare(system: string, userText: string) {
    const key = Deno.env.get('OPENAI_API_KEY') || '';
    const t0 = Date.now();
    if ((Deno.env.get('CARE_WEB_SEARCH') || 'on').trim().toLowerCase() !== 'off') {
        for (const tool of ['web_search', 'web_search_preview']) {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 100_000);
            try {
                const res = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST', signal: ctl.signal,
                    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: MODEL, instructions: system, input: userText, tools: [{ type: tool }], max_output_tokens: 12000 }),
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
                const data = parseJsonLoose(text);
                return { data, searched: tool, searches, cited, ms: Date.now() - t0 };
            } catch (e) {
                console.warn(`care call with ${tool} failed:`, (e as Error).message);
            } finally { clearTimeout(timer); }
        }
    }
    const r = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: userText }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 8000,
    });
    return { data: JSON.parse(r.choices[0].message.content || '{}'), searched: null, searches: 0, cited: [] as string[], ms: Date.now() - t0 };
}

const clampDays = (v: any, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : null; };
function cleanNumbers(x: any, hasRest: boolean) {
    const grow = clampDays(x?.grow_days, 1, 60);
    if (!grow) return null;
    const rest = hasRest ? clampDays(x?.rest_days, 1, 90) : null;
    return { grow, rest: hasRest ? Math.max(rest || grow, grow) : null };
}

// Write the care sheet for a plant whose name is settled.
//   ident.scientific_name / ident.name: what the photo ID settled on, or what the owner typed
//   ident.typed: true when the name came from the owner (fix the spelling, keep the plant)
async function writeCare(user: any, plant: any, today: string, ident: { name?: string; scientific_name?: string; typed?: boolean; plant_size?: string | null }) {
    const us = isUsOwner(user);
    const spotBits = [plant?.location, plant?.environment, plant?.pot_type, Number(plant?.pot_diameter_in) > 0 ? `${plant.pot_diameter_in}-inch pot` : null, plant?.sun_exposure].filter(Boolean);
    const who = ident.typed
        ? `The owner says the plant is "${ident.scientific_name || ident.name}". Trust the owner (they may know a cultivar or hybrid). If it is clearly misspelled or a common name, use the correct scientific name of the same plant.`
        : `The plant is ${ident.scientific_name || ident.name}${ident.name && ident.scientific_name ? ` (identified from a photo; the identifier called it "${ident.name}")` : ''}. Keep this scientific name.`;
    const userText = [
        who,
        ident.plant_size ? `Its size: ${ident.plant_size}.` : null,
        contextFor(user, plant, today),
        spotBits.length ? `What the owner has said about its spot so far: ${spotBits.join(', ')}.` : 'The owner has not said yet where it is kept; give both indoor and outdoor numbers.',
        'Write the care sheet. Return the JSON.',
    ].filter(Boolean).join('\n');
    const r = await askCare(`${CARE_RULES}\n\n${CARE_JSON}`, userText);
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
        water_tpl: tpl, why: typeof wp.why === 'string' ? wp.why.slice(0, 200) : null, sources,
    };
    const name = String(d.name || ident.name || 'Plant').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 80);
    const sci = ident.typed ? String(d.scientific_name || ident.scientific_name || ident.name || '').slice(0, 120) : String(ident.scientific_name || d.scientific_name || '').slice(0, 120);
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

// The care_profile to save with a fresh care sheet: the owner's own choices are kept, and the
// new answer waits in `ai` for functions/plus to apply (it sets v when it does).
function pendingProfile(plant: any, ai: any, every: number) {
    const prof = { ...(plant?.care_profile || {}) };
    delete prof.v;
    delete prof.ai;
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
            const c = await writeCare(owner, fake, today, { name: tc.name, scientific_name: tc.scientific_name, typed: !!tc.typed });
            return Response.json({ success: true, today, ...c });
        }
        let user: any = null;
        if (!svc) {
            try { user = await base44.auth.me(); } catch { user = null; }
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const db = svc ? base44.asServiceRole.entities : base44.entities;

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
            if (corrected) {
                // Typing a name isn't a photo ID
                const q = await useAiQuota(base44, user, 'rename');
                if (!q.allowed) return aiLimitResponse('rename', q);
            } else if (!info.id_paid) {
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

            // a) Owner typed a different scientific name
            if (corrected) {
                const c = await writeCare(user, plant, today, { scientific_name: corrected, typed: true });
                const d = c.fields;
                const last = String(plant.last_watered || '').slice(0, 10) || today;
                const patch: any = {
                    ...d,
                    ...clearSeasons(plant),
                    next_watering_due: addDays(last, d.water_frequency_days),
                    care_profile: pendingProfile(plant, c.ai, d.water_frequency_days),
                    add_info: { ...info, error: null, renamed_from: plant.scientific_name || null, renamed_at: new Date().toISOString(), care_done: true },
                    // A plant we couldn't name is named now: on to the check
                    ...(plant.add_status === 'failed' || plant.add_status === 'identifying' ? { add_status: 'review' } : {}),
                };
                await db.Plant.update(plant.id, patch);
                if (!svc) await profileNow(base44, plant.id);
                const fresh = (await db.Plant.filter({ id: plant.id }))?.[0] || { ...plant, ...patch };
                return Response.json({ success: true, plant: fresh });
            }

            // b) Added by typing its name (Add > type or say names): write its care sheet once
            if (!plant.image_url && info.typed) {
                if (info.care_done) return Response.json({ success: true, plant });
                info.tries = (Number(info.tries) || 0) + 1;
                info.started_at = new Date().toISOString();
                delete info.error;
                try {
                    const c = await writeCare(user, plant, today, { name: plant.name, scientific_name: plant.scientific_name || plant.name, typed: true });
                    const d = c.fields;
                    const last = String(plant.last_watered || '').slice(0, 10) || today;
                    const patch: any = {
                        ...d,
                        ...clearSeasons(plant),
                        last_watered: last,
                        next_watering_due: addDays(last, d.water_frequency_days),
                        care_profile: pendingProfile(plant, c.ai, d.water_frequency_days),
                        add_status: info.final_status === 'done' ? 'done' : 'review',
                        add_info: { ...info, care_done: true, done_at: new Date().toISOString() },
                    };
                    await db.Plant.update(plant.id, patch);
                    if (!svc) await profileNow(base44, plant.id);
                    const fresh = (await db.Plant.filter({ id: plant.id }))?.[0] || { ...plant, ...patch };
                    return Response.json({ success: true, plant: fresh });
                } catch (e) {
                    console.error(`[${rid}] care for typed plant failed`, (e as Error).message);
                    await db.Plant.update(plant.id, { add_status: 'failed', add_info: { ...info, error: (e as Error).message.slice(0, 200) } }).catch(() => {});
                    return Response.json({ error: "Couldn't write this plant's care", detail: (e as Error).message }, { status: 502 });
                }
            }

            // c) Identify from the photo, then write the care sheet for that name (not from the photo)
            if (!plant.image_url) return Response.json({ error: 'No photo on this plant' }, { status: 400 });
            info.tries = (Number(info.tries) || 0) + 1;
            info.started_at = new Date().toISOString();
            delete info.error;
            await db.Plant.update(plant.id, { add_status: 'identifying', add_info: info });
            try {
                const r = await identify(rid, plant.image_url, context);
                const c = await writeCare(user, plant, today, {
                    name: r.plantData.name, scientific_name: r.plantData.scientific_name,
                    plant_size: PLANT_SIZES.includes(r.plantData.plant_size) ? r.plantData.plant_size : null,
                });
                const d = c.fields;
                const last = String(plant.last_watered || '').slice(0, 10) || today;
                // Added in bulk with the area already picked, and a sure name: nothing left to
                // ask, so it skips "Newly added". Otherwise the owner checks it.
                const settled = info.bulk && String(plant.location || '').trim() && r.identification?.confidence === 'high';
                const patch = {
                    ...d,
                    ...clearSeasons(plant),
                    ...(PLANT_SIZES.includes(r.plantData.plant_size) ? { plant_size: r.plantData.plant_size } : {}),
                    last_watered: last,
                    next_watering_due: addDays(last, d.water_frequency_days),
                    care_profile: pendingProfile(plant, c.ai, d.water_frequency_days),
                    add_status: settled ? 'done' : 'review',
                    add_info: { ...info, ...r.identification, care_done: true, done_at: new Date().toISOString() },
                };
                await db.Plant.update(plant.id, patch);
                if (!svc) await profileNow(base44, plant.id);
                const fresh = (await db.Plant.filter({ id: plant.id }))?.[0] || { ...plant, ...patch };
                return Response.json({ success: true, plant: fresh });
            } catch (e) {
                console.error(`[${rid}] identify failed`, (e as Error).message);
                await db.Plant.update(plant.id, { add_status: 'failed', add_info: { ...info, error: (e as Error).message.slice(0, 200) } }).catch(() => {});
                return Response.json({ error: "Couldn't identify this plant", detail: (e as Error).message }, { status: 502 });
            }
        }

        // ---- Old flow (older app screens): identify a photo and return the data
        const today = aiLocalDay(user.timezone);
        const { image_url } = body || {};
        if (!image_url) return Response.json({ error: 'No image_url provided' }, { status: 400 });
        const t = await takeOneId(base44, user);
        if (t.blocked) return t.blocked;
        console.log(`[${rid}] 🌱 identifyPlantWithExpert`, image_url);
        const r = await identify(rid, image_url, contextFor(user, null, today));
        const c = await writeCare(user, null, today, { name: r.plantData.name, scientific_name: r.plantData.scientific_name });
        return Response.json({ success: true, plantData: { ...r.plantData, ...c.fields }, identification: r.identification });
    } catch (error) {
        console.error(`[${rid}] Error in identifyPlantWithExpert:`, error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
