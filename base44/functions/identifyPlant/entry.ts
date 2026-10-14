import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const MODEL = "gpt-6-astra";

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
  "hybrid_name": "cultivar/hybrid name or null",
  "is_hybrid_uncertain": boolean,
  "growth_habit": "climber" | "trailer" | "crawler" | "upright" | "bushy",
  "plant_size": "Seedling" | "Small" | "Medium" | "Large" | "Mature",
  "care_instructions": {
    "watering": "detailed watering instructions",
    "sunlight": "sunlight requirements",
    "soil": "soil preferences",
    "humidity": "humidity needs",
    "temperature": "temperature range",
    "fertilizing": "fertilizing schedule",
    "tips": "MUST include: climate-specific and environment-specific care tips. Explain how the location, pot type, sun exposure, substrate and plant size affect the watering frequency you calculated. Include toxicity to pets and people.",
    "growth_optimization": "Growth tips if applicable"
  },
  "water_frequency_days": number (BE REALISTIC - consider hot climate, pot type, sun exposure, plant size. Austin summer outdoor medium plant in terracotta might need water every 3-4 days!)
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

Deno.serve(async (req) => {
    const rid = Math.random().toString(36).slice(2, 7);
    console.log(`[${rid}] 🌱 identifyPlant function called`);

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { image_url, user_location, environment, sun_exposure, pot_type, pot_size, substrate_type } = await req.json();
        console.log('📸 Image URL:', image_url);
        console.log('📍 User location:', user_location);
        console.log('🏡 Environment details:', { environment, sun_exposure, pot_type, pot_size, substrate_type });

        // Build detailed context for accurate watering recommendations
        let contextStr = '';
        if (user_location) {
            contextStr += `Location: ${user_location} - Consider this climate for watering frequency.\n`;
        }
        if (environment) {
            contextStr += `Environment: ${environment}\n`;
        }
        if (sun_exposure) {
            contextStr += `Sun exposure: ${sun_exposure} - More sun = faster soil drying = more frequent watering.\n`;
        }
        if (pot_type) {
            contextStr += `Pot type: ${pot_type} - `;
            if (pot_type.includes('Terracotta') || pot_type.includes('Clay')) {
                contextStr += 'Terracotta is porous and dries quickly, needs more frequent watering.\n';
            } else if (pot_type.includes('Plastic')) {
                contextStr += 'Plastic retains moisture longer, needs less frequent watering.\n';
            } else if (pot_type.includes('Self-watering')) {
                contextStr += 'Self-watering pot, adjust frequency accordingly.\n';
            } else {
                contextStr += '\n';
            }
        }
        if (pot_size) {
            contextStr += `Pot size relative to plant: ${pot_size} - `;
            if (pot_size.includes('smaller') || pot_size.includes('root-bound')) {
                contextStr += 'Smaller pot dries faster, needs more frequent watering.\n';
            } else if (pot_size.includes('large')) {
                contextStr += 'Larger pot retains more moisture, needs less frequent watering.\n';
            } else {
                contextStr += '\n';
            }
        }
        if (substrate_type) {
            contextStr += `Substrate: ${substrate_type} - `;
            if (substrate_type.includes('Cactus') || substrate_type.includes('succulent')) {
                contextStr += 'Fast-draining mix, may need adjusted watering.\n';
            } else if (substrate_type.includes('Peat')) {
                contextStr += 'Peat retains moisture well.\n';
            } else {
                contextStr += '\n';
            }
        }

        // Steps 1 and 2 run in parallel and independently.
        const [pn, blind] = await Promise.all([
            identifyWithPlantNet(image_url),
            askJson(`${BOTANIST}\n\n${JSON_ID_ONLY}`, image_url, "Identify this plant following the method. Return the JSON.", 1200).catch(e => { console.warn(`[${rid}] blind ID failed:`, e?.message); return null; })
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

Then assess the plant's size/maturity (Seedling, Small, Medium, Large, or Mature) and write personalised care instructions.

${contextStr}

CRITICAL: Calculate watering frequency considering ALL these factors:
- Climate/location (hot climates like Austin, TX need MORE frequent watering)
- Indoor vs outdoor (outdoor plants dry faster)
- Sun exposure (more sun = more water needed)
- Pot material (terracotta dries faster than plastic)
- Pot size (smaller pots dry faster)
- Substrate type (affects water retention)
- Plant species natural needs
- PLANT SIZE/MATURITY (larger/older plants need more water, seedlings need less)

For context: In hot climates like Austin, Texas (90-100°F summers), most indoor plants need watering every 5-7 days, outdoor plants every 3-5 days or even daily for full sun plants.

${JSON_FULL}`;

        const parsed = await askJson(judgePrompt, image_url, "Judge the identification, assess size/maturity, and write the personalised care information. Return the JSON.", 4000);

        const { confidence, identification_notes, alternatives, plantnet_agreement, ...plantData } = parsed;
        console.log(`[${rid}] 🌿 Final:`, plantData.name, '|', plantData.scientific_name, '| confidence:', confidence, '| agrees with PlantNet:', plantnet_agreement);
        console.log(`[${rid}] 📏 Plant size:`, plantData.plant_size, '| 💧 Watering frequency:', plantData.water_frequency_days, 'days');

        return Response.json({
            success: true,
            plantData,
            identification: {
                source: pn ? 'plantnet+llm' : 'llm',
                plantnet_top: pn ? pn[0].scientific_name : null,
                plantnet_score: pn ? pn[0].score : null,
                blind_llm: blind ? blind.scientific_name : null,
                plantnet_agreement: pn ? (plantnet_agreement ?? null) : null,
                confidence: confidence || null,
                notes: identification_notes || null,
                alternatives: Array.isArray(alternatives) ? alternatives : []
            }
        });
    } catch (error) {
        console.error(`[${rid}] ❌ Error in identifyPlant:`, error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});
