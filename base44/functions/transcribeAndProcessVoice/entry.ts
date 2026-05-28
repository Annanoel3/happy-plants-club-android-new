import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { audio_base64, mime_type } = await req.json();

    const binaryStr = atob(audio_base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    // Determine filename/type from mime_type reported by capacitor-voice-recorder
    const mimeToExt = {
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/mp4': 'm4a',
        'audio/aac': 'webm', // AAC from Android — wrap as webm for Whisper compatibility
    };
    const ext = mimeToExt[mime_type] || 'webm';
    const type = mime_type === 'audio/aac' ? 'audio/webm' : (mime_type || 'audio/webm');
    const audioFile = new File([bytes], `audio.${ext}`, { type });

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
    });

    const transcript = transcription.text;

    if (!transcript || !transcript.trim()) {
        return Response.json({ error: 'No speech detected' }, { status: 400 });
    }

    // Process transcript against user's plants
    const plants = await base44.entities.Plant.list();
    const plantsList = plants.map(p => `${p.name} (ID: ${p.id})`).join(', ');

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
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

Return ONLY valid JSON:
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

    const result = JSON.parse(response.choices[0].message.content);
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