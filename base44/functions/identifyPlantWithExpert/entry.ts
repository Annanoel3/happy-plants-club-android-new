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

const JSON_FULL = `Return ONLY JSON:
{
  "name": "common name - no parentheses, no hedging words",
  "scientific_name": "genus and species, or the hybrid/cultivar name if that is the real identity",
  "confidence": "high" | "medium" | "low",
  "identification_notes": "one or two sentences: the features that settle it, and anything the owner should know (mixed planting, cutting, lookalike ruled out)",
  "plantnet_agreement": true | false | null,
  "alternatives": [ { "name": "common name", "scientific_name": "scientific name" } ],
  "care_instructions": {
    "watering": "detailed watering instructions",
    "sunlight": "sunlight requirements",
    "soil": "soil preferences",
    "humidity": "humidity needs",
    "temperature": "temperature range",
    "fertilizing": "fertilizing schedule",
    "tips": "care tips and warnings, including toxicity to pets and people"
  },
  "plant_size": "Seedling" | "Small" | "Medium" | "Large" | "Mature",
  "plant_type": "Houseplants" | "Succulents & Cacti" | "Flowers" | "Herbs" | "Vegetables" | "Trees & Shrubs" | "Perennials" | "Annuals" | "Seedlings",
  "water_frequency_days": number (days between waterings RIGHT NOW: this time of year, in the owner's location, in the spot it's kept)
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
    identify: { free: 10, plus: 200 }, // adding plants uses this; a whole shelf in one go must fit
    health: { free: 3, plus: 25 },
    chat: { free: 20, plus: 200 },
};
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
Then assess its size and write the care instructions for the plant you settled on.

${context}

${JSON_FULL}`;
    const parsed = await askJson(judgePrompt, imageUrl, "Judge the identification and write the care information. Return the JSON.", 4000);
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

// The owner corrected the scientific name: trust them, and redo the care for that plant.
async function careForName(imageUrl: string | null, scientificName: string, context: string) {
    const prompt = `${BOTANIST}

The owner says this plant is "${scientificName}". Trust the owner's name (they may know a cultivar or hybrid you can't see). If it is clearly misspelled, use the correct spelling of the same plant. Give its usual common name and write the care instructions for THAT plant.

${context}

${JSON_FULL}`;
    if (imageUrl) return askJson(prompt, imageUrl, `This is my ${scientificName}. Return the JSON.`, 3500);
    const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: `My plant is ${scientificName}. Return the JSON.` }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 3500,
    });
    return JSON.parse(response.choices[0].message.content || '{}');
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
            const aiQuota = await useAiQuota(base44, user, 'identify');
            if (!aiQuota.allowed) {
                await db.Plant.update(plant.id, { add_status: 'failed', add_info: { ...(plant.add_info || {}), error: 'limit_reached' } }).catch(() => {});
                return aiLimitResponse('identify', aiQuota);
            }
            const info = { ...(plant.add_info || {}) };
            const context = contextFor(user, plant, today);

            // a) Owner typed a different scientific name
            const corrected = typeof body.scientific_name === 'string' ? body.scientific_name.trim().slice(0, 120) : '';
            if (corrected) {
                const raw = await careForName(plant.image_url || null, corrected, context);
                const d = cleanPlantData({ ...raw, scientific_name: raw?.scientific_name || corrected });
                const last = String(plant.last_watered || '').slice(0, 10) || today;
                const prof = { ...(plant.care_profile || {}) };
                delete prof.v; // re-profile for the new plant, keeping the owner's own choices
                prof.prev_every = d.water_frequency_days;
                const patch: any = {
                    ...d,
                    next_watering_due: addDays(last, d.water_frequency_days),
                    care_profile: prof,
                    add_info: { ...info, error: null, renamed_from: plant.scientific_name || null, renamed_at: new Date().toISOString() },
                    // A plant we couldn't name is named now: on to the check
                    ...(plant.add_status === 'failed' || plant.add_status === 'identifying' ? { add_status: 'review' } : {}),
                };
                // Seasonal numbers belonged to the old name
                if (!prof.user_interval) { patch.water_days_grow = null; patch.water_days_rest = null; patch.water_rest_season = null; patch.water_season = null; }
                await db.Plant.update(plant.id, patch);
                if (!svc) await profileNow(base44, plant.id);
                const fresh = (await db.Plant.filter({ id: plant.id }))?.[0] || { ...plant, ...patch };
                return Response.json({ success: true, plant: fresh });
            }

            // b) Identify from the photo
            if (!plant.image_url) return Response.json({ error: 'No photo on this plant' }, { status: 400 });
            info.tries = (Number(info.tries) || 0) + 1;
            info.started_at = new Date().toISOString();
            delete info.error;
            await db.Plant.update(plant.id, { add_status: 'identifying', add_info: info });
            try {
                const r = await identify(rid, plant.image_url, context);
                const d = cleanPlantData(r.plantData);
                const last = String(plant.last_watered || '').slice(0, 10) || today;
                // Added in bulk with the area already picked, and a sure name: nothing left to
                // ask, so it skips "Newly added". Otherwise the owner checks it.
                const settled = info.bulk && String(plant.location || '').trim() && r.identification?.confidence === 'high';
                const patch = {
                    ...d,
                    last_watered: last,
                    next_watering_due: addDays(last, d.water_frequency_days),
                    add_status: settled ? 'done' : 'review',
                    add_info: { ...info, ...r.identification, done_at: new Date().toISOString() },
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
        const aiQuota = await useAiQuota(base44, user, 'identify');
        if (!aiQuota.allowed) return aiLimitResponse('identify', aiQuota);
        if (!image_url) return Response.json({ error: 'No image_url provided' }, { status: 400 });
        console.log(`[${rid}] 🌱 identifyPlantWithExpert`, image_url);
        const r = await identify(rid, image_url, contextFor(user, null, today));
        return Response.json({ success: true, plantData: r.plantData, identification: r.identification });
    } catch (error) {
        console.error(`[${rid}] Error in identifyPlantWithExpert:`, error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
