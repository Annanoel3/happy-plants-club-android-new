import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.20.1';

// "Today" in the USER's calendar, not the server's (UTC). The app sends localDate
// (YYYY-MM-DD) with every request; without it, fall back to the UTC date.
const __DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function todayFor(body: any): string {
    const d = body?.localDate;
    return (typeof d === 'string' && __DATE_RE.test(d)) ? d : new Date().toISOString().split('T')[0];
}


Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const __body = await req.json();
        const { transcript } = __body;

        const plants = await base44.entities.Plant.list('-created_date', 1000);
        const plantsList = plants.map(p => `${p.name} (ID: ${p.id})`).join(', ');

        const response = await openai.chat.completions.create({
            model: "gpt-6-luna",
            messages: [
                {
                    role: "system",
                    content: `You are a plant care log parser. Given a transcript and list of plants, extract:
                    1. Which plants were mentioned
                    2. Any watering actions
                    3. Any observations or notes about the plants
                    
                    Available plants: ${plantsList}
                    
                    Parse phrases like:
                    - "I watered everything except X" -> water all but X
                    - "I watered X and Y" -> water only X and Y
                    - "The monstera looks wilted" -> note for monstera
                    - "Need to move the snake plant inside soon" -> note for snake plant
                    
                    Return ONLY valid JSON:
                    {
                        "watered_plant_ids": ["id1", "id2"],
                        "plant_notes": [
                            {"plant_id": "id", "note": "observation or action needed"}
                        ],
                        "summary": "brief summary of what was logged"
                    }`
                },
                {
                    role: "user",
                    content: transcript
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        const today = todayFor(__body);
        
        // Handle watering
        for (const plantId of result.watered_plant_ids || []) {
            const plant = plants.find(p => p.id === plantId);
            if (plant) {
                await base44.entities.WateringLog.create({
                    plant_id: plantId,
                    plant_name: plant.name,
                    watered_date: today,
                    method: 'voice'
                });

                const nextWatering = new Date(today + 'T12:00:00Z');
                nextWatering.setDate(nextWatering.getDate() + (plant.water_frequency_days || 7));
                
                await base44.entities.Plant.update(plantId, {
                    last_watered: today,
                    next_watering_due: nextWatering.toISOString().split('T')[0]
                });
            }
        }

        // Handle notes
        for (const plantNote of result.plant_notes || []) {
            const plant = plants.find(p => p.id === plantNote.plant_id);
            if (plant) {
                const currentNotes = plant.notes || '';
                const timestamp = new Date().toLocaleDateString();
                const updatedNotes = currentNotes 
                    ? `${currentNotes}\n\n[${timestamp}] ${plantNote.note}`
                    : `[${timestamp}] ${plantNote.note}`;
                
                await base44.entities.Plant.update(plantNote.plant_id, {
                    notes: updatedNotes
                });
            }
        }

        return Response.json({ 
            success: true, 
            watered_count: result.watered_plant_ids?.length || 0,
            notes_count: result.plant_notes?.length || 0,
            summary: result.summary
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});