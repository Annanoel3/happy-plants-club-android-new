import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

// Add > type or say plant names. The quick model only pulls the plant names out of what the
// person typed or said. Each plant's care sheet is then written by identifyPlantWithExpert
// (the same researched care sheet a photo gets, with indoor and outdoor watering numbers);
// the app starts those right after this returns, and the Dashboard and the hourly sweep
// retry any that get stuck. This used to write the care here with the quick model and none
// of the rules (units, seasons, which plants may dry out), so typed plants came out worse
// than photographed ones.

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
        const rawInput = plant_names.join(', ').slice(0, 4000);
        const today = todayFor(__body);

        const response = await openai.chat.completions.create({
            model: "gpt-6-luna",
            messages: [
                {
                    role: "system",
                    content: `The user describes the plants they want to add, in their own words or as a list. Pull out each plant.
Return ONLY JSON: {"plants":[{"name":"the plant's common name, spelled correctly","scientific_name":"its scientific name, or null if you are not sure which plant they mean"}]}
- One entry per plant they mention ("two aloes" is one entry).
- Skip filler words ("I have a", "and", "also") and anything that isn't a plant.
- Keep cultivar names they give ("pothos Manjula" -> scientific_name "Epipremnum aureum 'Manjula'").
- At most 25 plants.`
                },
                {
                    role: "user",
                    content: rawInput
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        const found = (Array.isArray(result.plants) ? result.plants : [])
            .filter((p: any) => p && typeof p.name === 'string' && p.name.trim())
            .slice(0, 25);

        if (found.length === 0) {
            return Response.json({ success: false, error: 'Could not identify any plants' }, { status: 400 });
        }

        const bulk = found.length > 1;
        const addedPlants = [];
        for (const p of found) {
            const newPlant = await base44.entities.Plant.create({
                name: String(p.name).trim().slice(0, 80),
                scientific_name: typeof p.scientific_name === 'string' && p.scientific_name.trim() ? p.scientific_name.trim().slice(0, 120) : null,
                // Placeholder until its care sheet is written (a minute or less)
                water_frequency_days: 7,
                // Never watered in the app: due today (no made-up "watered today"). One plant:
                // the new-plant check asks when it was last watered. Several: not asked.
                next_watering_due: today,
                ...(location ? { location } : {}),
                ...(environment ? { environment } : {}),
                // One plant: the app asks right away where it is, the pot and the name.
                // Several: no question per plant; they wait under "Newly added" in the garden
                // until the owner opens each one and says where it lives (or skip it when
                // the area was already picked on the Add screen; the names were typed).
                // The owner can do that right away; the care sheet lands a few seconds later.
                add_status: bulk && location ? 'done' : 'review',
                add_info: {
                    typed: true, bulk, tries: 0, care_pending: true,
                    added_at: new Date().toISOString(), started_at: new Date().toISOString(),
                },
            });
            addedPlants.push(newPlant);
        }

        return Response.json({ success: true, count: addedPlants.length, plants: addedPlants });
    } catch (error) {
        console.error('Error in processBulkPlants:', (error as Error).message);
        return Response.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
});
