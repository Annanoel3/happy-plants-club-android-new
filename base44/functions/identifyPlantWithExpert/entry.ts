import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const SYSTEM_PROMPT = `You are a working botanist who identifies plants from photos for a living. You are careful, and you would rather give a correct genus than a wrong species.

How to identify:
1. First describe to yourself exactly what you can see: growth form (rosette, columnar, caudex/bulb-like stems, vine, shrub), stem texture (smooth, warty, spiny, tubercled), leaf shape, size, color, arrangement, flowers if any, pot and substrate.
2. Work from family to genus to species. Only name a species, cultivar or hybrid when the visible features actually match it. If two or more plants fit, pick the best match and list the others as alternatives.
3. Do not reach for a popular or "famous" plant name because it is the first thing that comes to mind. Check that its signature features are present in the photo. A name that does not match what is visible is worse than a genus-level answer.
4. If you cannot get past genus, say so: put the genus in scientific_name (e.g. "Euphorbia sp.") and use a plain common name like "Euphorbia (species unclear)".
5. Care advice must be for the plant you actually identified. If the plant has toxic sap, spines, or is poisonous to pets or people, say so clearly in tips.

Return ONLY a JSON object in this exact format:
{
  "name": "common name - no parentheses unless you are flagging that the species is unclear",
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

        const response = await openai.chat.completions.create({
            model: "gpt-6-astra",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
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
                            text: "Identify this plant following the steps above and return the JSON."
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
                confidence: confidence || null,
                notes: identification_notes || null,
                alternatives: Array.isArray(alternatives) ? alternatives : []
            }
        });
    } catch (error) {
        console.error('Error in identifyPlantWithExpert:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
