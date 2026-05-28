import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

// Strips markdown fences and extracts the first JSON object from a string
function extractJSON(str) {
    // Remove markdown code fences if present
    const cleaned = str.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    // Find the first { ... } block
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in LLM response');
    return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transcript } = await req.json();

    if (!transcript || !transcript.trim()) {
        return Response.json({ error: 'No transcript provided' }, { status: 400 });
    }

    const plants = await base44.entities.Plant.list();
    const plantsList = plants.map(p => `${p.name} (ID: ${p.id})`).join(', ');

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `You are a plant care log parser. Given a transcript and list of plants, extract:
1. Which plants were watered
2. Any observations or notes about the plants

Available plants: ${plantsList}

Parse phrases like:
- "I watered everything except X" -> water all but X
- "I watered X and Y" -> water only X and Y
- "The monstera looks wilted" -> note for monstera

Return ONLY valid JSON with no markdown:
{
    "watered_plant_ids": ["id1", "id2"],
    "plant_notes": [{"plant_id": "id", "note": "observation"}],
    "summary": "brief summary of what was logged"
}`
            },
            { role: "user", content: transcript }
        ],
        response_format: { type: "json_object" }
    });

    let result;
    try {
        result = extractJSON(response.choices[0].message.content);
    } catch (e) {
        return Response.json({ error: 'Failed to parse LLM response: ' + e.message }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];

    for (const plantId of result.watered_plant_ids || []) {
        const plant = plants.find(p => p.id === plantId);
        if (plant) {
            await base44.asServiceRole.entities.WateringLog.create({
                plant_id: plantId,
                plant_name: plant.name,
                watered_date: today,
                method: 'voice'
            });
            const nextWatering = new Date();
            nextWatering.setDate(nextWatering.getDate() + (plant.water_frequency_days || 7));
            await base44.asServiceRole.entities.Plant.update(plantId, {
                last_watered: today,
                next_watering_due: nextWatering.toISOString().split('T')[0]
            });
        }
    }

    for (const plantNote of result.plant_notes || []) {
        const plant = plants.find(p => p.id === plantNote.plant_id);
        if (plant) {
            const currentNotes = plant.notes || '';
            const timestamp = new Date().toLocaleDateString();
            const updatedNotes = currentNotes
                ? `${currentNotes}\n\n[${timestamp}] ${plantNote.note}`
                : `[${timestamp}] ${plantNote.note}`;
            await base44.asServiceRole.entities.Plant.update(plantNote.plant_id, {
                notes: updatedNotes
            });
        }
    }

    return Response.json({
        success: true,
        transcript,
        watered_count: result.watered_plant_ids?.length || 0,
        notes_count: result.plant_notes?.length || 0,
        summary: result.summary
    });
});