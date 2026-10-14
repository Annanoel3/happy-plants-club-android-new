import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// Pl@ntNet does the identification when PLANTNET_API_KEY is set; the LLM then
// only confirms it and writes care info. Without the key we fall back to the LLM.
async function identifyWithPlantNet(imageUrl) {
    const key = Deno.env.get("PLANTNET_API_KEY");
    if (!key) return null;
    try {
        const url = `https://my-api.plantnet.org/v2/identify/all?images=${encodeURIComponent(imageUrl)}&organs=auto&lang=en&no-reject=true&api-key=${encodeURIComponent(key)}`;
        let res = await fetch(url);
        if (res.status >= 500) {
            // Pl@ntNet occasionally throws a 500 - one retry before giving up
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

function plantNetBrief(pn) {
    const list = [pn.top, ...pn.alternatives].map((c, i) =>
        `${i + 1}. ${c.scientific_name} (family ${c.family || 'unknown'}) - score ${c.score.toFixed(2)}${c.common_names.length ? ' - common names: ' + c.common_names.slice(0, 3).join(', ') : ''}`
    ).join('\n');
    return `A dedicated plant-identification model (Pl@ntNet) has analysed this exact photo. Its candidates, best first:
${list}

YOUR JOB IS TO CHECK THIS, NOT TO RUBBER-STAMP IT AND NOT TO IGNORE IT. Pl@ntNet is strong on wild and garden plants and weaker on cultivated succulents, cacti and rare houseplants, and a score below 0.20 means it is mostly guessing.
Do this, in order:
a) Describe what is actually in the photo (growth form, stem, leaves, spines, flowers, pot).
b) For each candidate above, name one or two visible features that support it and any visible feature that contradicts it. Think about whether the candidate is even the right family and growth form - an orchid, a cactus and a rosette succulent cannot be confused if you look.
c) Decide: pick the candidate the photo actually supports, or, if none of them fit, give your own identification. To override a candidate with a score of 0.50 or higher you must cite a concrete visible contradiction in identification_notes. To reject all candidates with scores under 0.20 you need no special reason, just say what the photo shows instead.
d) Set confidence from your own judgement: high only when the visible features clearly match one species, medium when genus is sure but species is a best guess, low when even the genus is uncertain.
Set plantnet_agreement to true if your final answer is one of the candidates, false if you overrode them, and explain in identification_notes. Put the candidates you did not pick in alternatives.
Then write the care instructions for the plant you settled on.`;
}

Deno.serve(async (req) => {
    const rid = Math.random().toString(36).slice(2, 7);
    console.log('🌱 identifyPlant function called');
    
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

        const pn = await identifyWithPlantNet(image_url);
        if (pn) {
            console.log(`[${rid}] 🌿 PlantNet candidates:`, [pn.top, ...pn.alternatives].map(c => `${c.scientific_name} ${c.score.toFixed(2)}`).join(' | '));
        } else {
            console.log(`[${rid}] 🌿 PlantNet unavailable (no key, no plant detected, or error) - using LLM identification`);
        }

        const systemPrompt = `You are a working botanist who identifies plants from photos for a living, with expertise in plant care across different climates and environments. You are careful, and you would rather give a correct genus than a wrong species.

HOW TO IDENTIFY (do this before anything else):
1. First describe to yourself exactly what you can see: growth form (rosette, columnar, caudex/bulb-like stems, vine, shrub), stem texture (smooth, warty, spiny, tubercled), leaf shape, size, color, arrangement, flowers if any, pot and substrate.
2. Work from family to genus to species, then COMMIT to the single most likely species, cultivar or hybrid. Give the name a real botanist would put on the label. Show your uncertainty through the confidence field and the alternatives list, never by withholding the species.
3. Do not reach for a popular or "famous" plant name because it is the first thing that comes to mind. Check that its signature features are present in the photo. A name that does not match what is visible is worse than a less famous name that does.
4. Fall back to genus only (scientific_name "Euphorbia sp.", name "Euphorbia", no parentheses, no hedging words) in the rare case where the photo truly cannot support any species - for example a seedling, a cutting, or a plant with no distinguishing features visible. Most houseplant and succulent photos CAN be named to species; a genus-only answer should be the exception, not the default.
5. Care advice must be for the plant you actually identified. If the plant has toxic sap, spines, or is poisonous to pets or people, say so clearly in tips.

${pn ? plantNetBrief(pn) + '\n\n' : ''}${contextStr}

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

From the image, assess the plant's size/maturity level (Seedling, Small, Medium, Large, or Mature).

IMPORTANT: In the care_instructions.tips field, explain HOW you calculated the watering frequency based on ALL the environmental factors provided. Be specific about what factors increased or decreased the frequency.

Return ONLY valid JSON:
{
    "name": "common name - never use parentheses or hedging words",
    "scientific_name": "genus and species, or genus followed by sp. if unsure, or the hybrid/cultivar name if that is the real identity",
    "hybrid_name": "cultivar/hybrid name or null",
    "is_hybrid_uncertain": boolean,
    "confidence": "high" | "medium" | "low",
    "identification_notes": "one or two sentences on the features that led to this ID and what would confirm it",
    "plantnet_agreement": true | false | null,
    "alternatives": [ { "name": "common name", "scientific_name": "scientific name" } ],
    "growth_habit": "climber" | "trailer" | "crawler" | "upright" | "bushy",
    "plant_size": "Seedling" | "Small" | "Medium" | "Large" | "Mature",
    "care_instructions": {
        "watering": "Detailed watering instructions considering ALL factors above",
        "sunlight": "Light requirements",
        "soil": "Soil preferences",
        "humidity": "Humidity needs",
        "temperature": "Temperature range",
        "fertilizing": "Fertilizing schedule",
        "tips": "MUST include: Climate-specific and environment-specific care tips. Explain how the location (${user_location}), pot type (${pot_type}), sun exposure (${sun_exposure}), substrate (${substrate_type}), and plant size affect the watering frequency you calculated.",
        "growth_optimization": "Growth tips if applicable"
    },
    "water_frequency_days": number (BE REALISTIC - consider hot climate, pot type, sun exposure, plant size. Austin summer outdoor medium plant in terracotta might need water every 3-4 days!)
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-6-astra",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: image_url, detail: "high" }
                        },
                        {
                            type: "text",
                            text: pn
                                ? "Confirm the Pl@ntNet identification against the photo, assess its size/maturity, and provide comprehensive, personalized care instructions in the exact JSON format."
                                : "Identify this plant following the HOW TO IDENTIFY steps, assess its size/maturity, and provide comprehensive, personalized care instructions in the exact JSON format."
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        });

        console.log('✅ OpenAI response received');
        const parsed = JSON.parse(response.choices[0].message.content);
        // Keep the extra identification fields out of plantData so they are never written into the Plant record
        const { confidence, identification_notes, alternatives, plantnet_agreement, ...plantData } = parsed;
        console.log(`[${rid}] 🌿 Final:`, plantData.name, '|', plantData.scientific_name, '| confidence:', confidence, '| agrees with PlantNet:', plantnet_agreement);
        console.log('📏 Plant size:', plantData.plant_size);
        console.log('💧 Watering frequency:', plantData.water_frequency_days, 'days');

        return Response.json({
            success: true,
            plantData,
            identification: {
                source: pn ? 'plantnet' : 'llm',
                plantnet_top: pn ? pn.top.scientific_name : null,
                plantnet_agreement: pn ? (plantnet_agreement ?? null) : null,
                confidence: confidence || (pn ? confidenceFromScore(pn.top.score) : null),
                score: pn ? pn.top.score : null,
                notes: identification_notes || null,
                alternatives: Array.isArray(alternatives) ? alternatives : []
            }
        });
    } catch (error) {
        console.error('❌ Error in identifyPlant:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});