import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

// "Today" in the USER's calendar, not the server's (UTC). The app sends localDate
// (YYYY-MM-DD) with every request; without it, fall back to the UTC date.
const __DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function todayFor(body: any): string {
    const d = body?.localDate;
    return (typeof d === 'string' && __DATE_RE.test(d)) ? d : new Date().toISOString().split('T')[0];
}


const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const __body = await req.json();
        const { plant_names, location, environment } = __body;

        if (!plant_names || !Array.isArray(plant_names) || plant_names.length === 0) {
            return Response.json({ error: 'No plant names provided' }, { status: 400 });
        }

        // Join input (handles both natural language and comma-separated lists)
        const rawInput = plant_names.join(', ');
        const today = todayFor(__body);
        const m = Number(today.slice(5, 7));
        const lat = typeof user.location_lat === 'number' ? user.location_lat : null;
        const nSeason = m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
        const flip: Record<string, string> = { winter: 'summer', summer: 'winter', spring: 'fall', fall: 'spring' };
        const season = lat !== null && Math.abs(lat) < 23.5 ? 'tropics (no real winter)' : (lat !== null && lat < 0 ? flip[nSeason] : nSeason);
        const context = `Today is ${today}; at the owner's location it is ${season}. Owner's location: ${user.location_label || user.location || 'unknown (assume a temperate northern-hemisphere climate)'}.${location || environment ? ` The plants are kept: ${location || ''} ${environment ? `(${environment})` : ''}.` : ''}
water_frequency_days is the number of days between waterings for THIS time of year in this location and spot (do not assume summer heat unless it is summer there). Describe other seasons in care_instructions.watering.`;

        const response = await openai.chat.completions.create({
            model: "gpt-6-luna",
            messages: [
                {
                    role: "system",
                    content: `You are a botanist. The user will describe their plants in natural language or list them by name. Extract each plant name and provide care information.

Return ONLY a JSON object with a "plants" array:
{
  "plants": [
    {
      "name": "common name",
      "scientific_name": "scientific name",
      "care_instructions": {
        "watering": "detailed watering instructions",
        "sunlight": "sunlight requirements",
        "soil": "soil preferences",
        "humidity": "humidity needs",
        "temperature": "temperature range",
        "fertilizing": "fertilizing schedule",
        "tips": "care tips"
      },
      "water_frequency_days": number
    }
  ]
}

Extract only actual plant names. Skip filler words like "I have a", "and", "also", etc.

${context}`
                },
                {
                    role: "user",
                    content: rawInput
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        const plantsData = result.plants || [];

        if (!Array.isArray(plantsData) || plantsData.length === 0) {
            return Response.json({ success: false, error: 'Could not identify any plants' }, { status: 400 });
        }

        const addedPlants = [];

        for (const plantData of plantsData) {
            const nextWatering = new Date(today + 'T12:00:00Z');
            nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

            const newPlant = await base44.entities.Plant.create({
                ...plantData,
                last_watered: today,
                next_watering_due: nextWatering.toISOString().split('T')[0],
                ...(location ? { location } : {}),
                ...(environment ? { environment } : {}),
                // One plant: the app asks right away where it is, the pot and the name.
                // Several: no question per plant; they wait under "Newly added" in the garden
                // until the owner opens each one and says where it lives (or skip it when
                // the area was already picked on the Add screen; the names were typed).
                add_status: plantsData.length > 1 && location ? 'done' : 'review',
                add_info: { bulk: plantsData.length > 1, added_at: new Date().toISOString() },
            });

            addedPlants.push(newPlant);
        }

        return Response.json({ success: true, count: addedPlants.length, plants: addedPlants });
    } catch (error) {
        console.error('Error in processBulkPlants:', error.message);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});