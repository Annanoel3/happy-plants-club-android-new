import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// ---------------------------------------------------------------------------
// Pl@ntNet: a purpose-built plant identification model. When PLANTNET_API_KEY
// is set, it does the identification and the LLM only writes the care info.
// Without the key (or if Pl@ntNet can't see a plant) we fall back to the LLM.
// ---------------------------------------------------------------------------
async function identifyWithPlantNet(imageUrl) {
    const key = Deno.env.get("PLANTNET_API_KEY");
    if (!key) return null;
    try {
        const url = `https://my-api.plantnet.org/v2/identify/all?images=${encodeURIComponent(imageUrl)}&organs=auto&lang=en&no-reject=true&api-key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn('[PlantNet] HTTP', res.status, await res.text().catch(() => ''));
            return null;
        }
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length === 0) return null;
        const toMatch = (r) => ({
            scientific_name: r?.species?.scientificNameWithoutAuthor || '',
            genus: r?.species?.genus?.scientificNameWithoutAuthor || '',
            family: r?.species?.family?.scientificNameWithoutAuthor || '',
            common_names: Array.isArray(r?.species?.commonNames) ? r.species.commonNames : [],
            score: typeof r?.score === 'number' ? r.score : 0,
        });
        const top = toMatch(results[0]);
        const alternatives = results.slice(1, 4).map(toMatch).filter(a => a.scientific_name);
        if (!top.scientific_name) return null;
        return { top, alternatives };
    } catch (e) {
        console.warn('[PlantNet] failed:', e?.message || e);
        return null;
    }
}

function confidenceFromScore(score) {
    if (score >= 0.5) return 'high';
    if (score >= 0.2) return 'medium';
    return 'low';
}

const BASE_PROMPT = `You are a working botanist who identifies plants from photos for a living. You are careful, and you would rather give a correct genus than a wrong species.

How to identify:
1. First describe to yourself exactly what you can see: growth form (rosette, columnar, caudex/bulb-like stems, vine, shrub), stem texture (smooth, warty, spiny, tubercled), leaf shape, size, color, arrangement, flowers if any, pot and substrate.
2. Work from family to genus to species, then COMMIT to the single most likely species, cultivar or hybrid. Give the name a real botanist would put on the label. If two or more plants fit, pick the best match and list the others as alternatives. Show your uncertainty through the confidence field and the alternatives list, never by withholding the species.
3. Do not reach for a popular or "famous" plant name because it is the first thing that comes to mind. Check that its signature features are present in the photo. A name that does not match what is visible is worse than a less famous name that does.
4. Fall back to genus only (scientific_name "Euphorbia sp.", name "Euphorbia", no parentheses, no hedging words) in the rare case where the photo truly cannot support any species - for example a seedling, a cutting, or a plant with no distinguishing features visible. Most houseplant and succulent photos CAN be named to species; a genus-only answer should be the exception, not the default.
5. Care advice must be for the plant you actually identified. If the plant has toxic sap, spines, or is poisonous to pets or people, say so clearly in tips.`;

const JSON_SHAPE = `Return ONLY a JSON object in this exact format:
{
  "name": "common name - never use parentheses or hedging words",
  "scientific_name": "genus and species, or genus followed by sp. if unsure, or the hybrid/cultivar name if that is the real identity",
  "confidence": "high" | "medium" | "low",
  "identification_notes": "one or two sentences on the features that led to this ID and what would confirm it",
  "alternatives": [ { "name": "common name", "scientific_name": "scientific name" } ],
  "care_instructions": {
    "watering": "detailed watering instructions",
    "sunlight": "sunlight requirements",
    "soil": "soil preferences",
    "humidity": "humidity needs",
    "temperature": "temperature range",
    "fertilizing": "fertilizing schedule",
    "tips": "care tips and warnings, including toxicity"
  },
  "water_frequency_days": number
}
alternatives may be an empty array when confidence is high.`;

function plantNetBrief(pn) {
    const alts = pn.alternatives.map(a => `${a.scientific_name} (score ${a.score.toFixed(2)})`).join(', ') || 'none';
    const common = pn.top.common_names.length ? pn.top.common_names.slice(0, 3).join(', ') : 'none listed';
    return `A dedicated plant-identification model (Pl@ntNet) has already analysed this exact photo and returned:
- Best match: ${pn.top.scientific_name} (family ${pn.top.family || 'unknown'}), score ${pn.top.score.toFixed(2)}, common names: ${common}
- Other candidates: ${alts}

Use the Pl@ntNet best match as the identification. Only override it if the photo plainly contradicts it (wrong growth form, wrong organ type), and if you do, say why in identification_notes. Pick the best common name for "name" (Pl@ntNet's common names are a good source; if none fit, use the genus or a plain descriptive name). Set confidence from the Pl@ntNet score: 0.5 and above is high, 0.2 to 0.5 is medium, below 0.2 is low. Put the other candidates in alternatives. Then write the care instructions for that plant.`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { image_url } = await req.json();

        if (!image_url) {
            return Response.json({ error: 'No image_url provided' }, { status: 400 });
        }

        console.log('🌱 identifyPlantWithExpert called for', image_url);

        const pn = await identifyWithPlantNet(image_url);
        if (pn) {
            console.log('🌿 PlantNet top match:', pn.top.scientific_name, '| score:', pn.top.score.toFixed(2));
        } else {
            console.log('🌿 PlantNet unavailable (no key, no plant detected, or error) - using LLM identification');
        }

        const systemPrompt = pn
            ? `${BASE_PROMPT}\n\n${plantNetBrief(pn)}\n\n${JSON_SHAPE}`
            : `${BASE_PROMPT}\n\n${JSON_SHAPE}`;

        const response = await openai.chat.completions.create({
            model: "gpt-6-astra",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            // high detail so small features (spines, tubercles, leaf edges) are visible to the model
                            image_url: { url: image_url, detail: "high" }
                        },
                        {
                            type: "text",
                            text: pn
                                ? "Confirm the Pl@ntNet identification against the photo and write the care information. Return the JSON."
                                : "Identify this plant following the steps above and return the JSON."
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 4000
        });

        let parsed;
        try {
            parsed = JSON.parse(response.choices[0].message.content);
        } catch (e) {
            return Response.json({ success: false, error: 'Could not parse plant data' }, { status: 400 });
        }

        // Keep plantData to the fields the Plant entity already stores; the extra
        // identification fields ride alongside so the UI can show them later
        // without them being written into the Plant record.
        const { confidence, identification_notes, alternatives, ...plantData } = parsed;
        console.log('🌿 Identified:', plantData.name, '|', plantData.scientific_name, '| confidence:', confidence);

        return Response.json({
            success: true,
            plantData,
            identification: {
                source: pn ? 'plantnet' : 'llm',
                confidence: confidence || (pn ? confidenceFromScore(pn.top.score) : null),
                score: pn ? pn.top.score : null,
                notes: identification_notes || null,
                alternatives: Array.isArray(alternatives) ? alternatives : []
            }
        });
    } catch (error) {
        console.error('Error in identifyPlantWithExpert:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
