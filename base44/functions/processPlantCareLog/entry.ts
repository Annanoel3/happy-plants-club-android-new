import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

function extractJSON(str) {
    const cleaned = str.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
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
    console.log('processPlantCareLog: transcript received, length:', transcript?.length, 'preview:', transcript?.substring(0, 60));

    if (!transcript || !transcript.trim()) {
        return Response.json({ error: 'No transcript provided' }, { status: 400 });
    }

    // Fetch plants using user-scoped call (RLS automatically filters to user's plants)
    const plants = await base44.entities.Plant.list('-created_date', 200);
    const plantsList = plants.map(p => {
        const parts = [`name: "${p.name}"`];
        if (p.nickname) parts.push(`nickname: "${p.nickname}"`);
        if (p.scientific_name) parts.push(`scientific: "${p.scientific_name}"`);
        if (p.location) parts.push(`location: "${p.location}"`);
        return `{${parts.join(', ')}}`;
    }).join(', ');
    console.log('Available plants:', plantsList, '| count:', plants.length);

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const now = new Date();
    const nowISO = now.toISOString();
    const userTimezone = 'America/Chicago'; // User's timezone

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `You are a plant care log parser. User's timezone: ${userTimezone}. Current time: ${nowISO}

Available plants: ${plantsList}

Given a transcript, extract:
1. Which plants were watered — match using the plant's name, nickname, OR scientific name fuzzily (e.g. "tulips" matches name "Tulip" or scientific "Tulipa", "my monstera" matches "Monstera"). If the user says "everything", "all", "all my plants", return "ALL". If they reference a location like "everything on the porch" / "all the indoor plants", return "LOCATION:<location>". If they say "everything overdue", "all the overdue ones", "everything that needed water", return "OVERDUE".
2. Any observations or notes about specific plants.
3. Any reminders the user wants to set. If the user says a specific time (e.g. "at 5pm", "at 3:30", "tomorrow morning"), compute the ISO datetime for that reminder IN THE USER'S TIMEZONE (${userTimezone}). If the user says something vague like "later" or "soon" with no specific time, set reminder_time to null and needs_time_clarification to true.

Return ONLY valid JSON:
{
    "watered_plant_names": ["Tulip"],
    "plant_notes": [{"plant_name": "Monstera", "note": "observation"}],
    "reminders": [{"description": "what to do", "reminder_time": "ISO datetime in user timezone or null", "needs_time_clarification": false}],
    "summary": "brief summary"
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

    console.log('LLM result - watered_plant_names:', result.watered_plant_names, 'reminders:', result.reminders?.length);

    // Helper: find plant by name, nickname, or scientific name (fuzzy)
    const findPlant = (name) => {
        const n = name.toLowerCase();
        return plants.find(p =>
            p.name?.toLowerCase() === n ||
            p.nickname?.toLowerCase() === n ||
            p.scientific_name?.toLowerCase() === n
        ) || plants.find(p =>
            p.name?.toLowerCase().includes(n) || n.includes(p.name?.toLowerCase()) ||
            p.nickname?.toLowerCase().includes(n) || n.includes(p.nickname?.toLowerCase()) ||
            p.scientific_name?.toLowerCase().includes(n) || n.includes(p.scientific_name?.toLowerCase())
        );
    };

    // Check if any reminder needs time clarification before proceeding
    const pendingReminders = (result.reminders || []).filter(r => r.needs_time_clarification);
    if (pendingReminders.length > 0) {
        return Response.json({
            success: false,
            needs_clarification: true,
            clarification_prompt: `What time would you like to be reminded to ${pendingReminders[0].description}?`,
            partial_result: result,
        });
    }

    let plantsToWater = [];
    try {
        const today = new Date().toISOString().split('T')[0];

        // Expand ALL / LOCATION / OVERDUE special tokens into real plant lists
        let wateredNames = result.watered_plant_names || [];
        for (const token of wateredNames) {
            if (token === 'ALL') {
                plantsToWater.push(...plants);
            } else if (token === 'OVERDUE') {
                plantsToWater.push(...plants.filter(p => p.next_watering_due && p.next_watering_due <= today));
                console.log('OVERDUE filter - today:', today, 'matched:', plantsToWater.map(p => p.name));
            } else if (token.startsWith('LOCATION:')) {
                const loc = token.replace('LOCATION:', '').trim().toLowerCase();
                plantsToWater.push(...plants.filter(p => p.location?.toLowerCase().includes(loc)));
            } else {
                const found = findPlant(token);
                if (found) plantsToWater.push(found);
                else console.warn('Plant name not matched:', token, '| available:', plants.map(p => p.name));
            }
        }
        // Deduplicate
        const seenIds = new Set();
        plantsToWater = plantsToWater.filter(p => { if (seenIds.has(p.id)) return false; seenIds.add(p.id); return true; });

        for (const plant of plantsToWater) {
            if (plant) {
                console.log('Logging watering for plant:', plant.name, plant.id);
                await base44.asServiceRole.entities.WateringLog.create({
                    plant_id: plant.id,
                    plant_name: plant.name,
                    watered_date: today,
                    method: 'voice',
                    created_by: user.email
                });
                const nextWatering = new Date();
                nextWatering.setDate(nextWatering.getDate() + (plant.water_frequency_days || 7));
                await base44.entities.Plant.update(plant.id, {
                    last_watered: today,
                    next_watering_due: nextWatering.toISOString().split('T')[0],
                    status: 'healthy'
                });
                console.log('Plant updated:', plant.name, 'next watering:', nextWatering.toISOString().split('T')[0]);
            }
        }

        for (const plantNote of result.plant_notes || []) {
            const plant = findPlant(plantNote.plant_name);
            if (plant) {
                const currentNotes = plant.notes || '';
                const timestamp = new Date().toLocaleDateString();
                const updatedNotes = currentNotes
                    ? `${currentNotes}\n\n[${timestamp}] ${plantNote.note}`
                    : `[${timestamp}] ${plantNote.note}`;
                await base44.entities.Plant.update(plant.id, { notes: updatedNotes });
            }
        }

        // Schedule reminders with specific times
        for (const reminder of result.reminders || []) {
            if (reminder.reminder_time) {
                // Calculate delay in minutes until the reminder time
                const reminderDateTime = new Date(reminder.reminder_time);
                const delayMinutes = Math.max(0, Math.floor((reminderDateTime.getTime() - Date.now()) / (60 * 1000)));
                
                console.log('Scheduling reminder:', reminder.description, 'at', reminder.reminder_time, 'delay:', delayMinutes, 'minutes');

                // Create the reminder record
                const reminderRecord = await base44.asServiceRole.entities.Reminder.create({
                    plant_id: 'general',
                    plant_name: 'General',
                    title: reminder.description,
                    description: reminder.description,
                    due_date: reminder.reminder_time.split('T')[0],
                    schedule_time: reminder.reminder_time,
                    completed: false,
                    is_recurring: false,
                });

                // Schedule the push notification for the specific time
                try {
                    const schedulePushResult = await base44.asServiceRole.functions.invoke('schedulePush', {
                        toUserExternalId: user.email,
                        title: '🔔 ' + reminder.description,
                        body: 'Time to ' + reminder.description.toLowerCase(),
                        minutesFromNow: delayMinutes,
                        data: { screen: '/Dashboard' }
                    });
                    
                    // Store the OneSignal notification ID in the reminder
                    if (schedulePushResult?.notificationId) {
                        await base44.asServiceRole.entities.Reminder.update(reminderRecord.id, {
                            onesignal_notification_id: schedulePushResult.notificationId
                        });
                        console.log('✅ Reminder scheduled with notification ID:', schedulePushResult.notificationId);
                    }
                } catch (scheduleErr) {
                    console.error('Failed to schedule reminder notification:', scheduleErr.message);
                }
            }
        }

    } catch (dbErr) {
        console.error('processPlantCareLog DB error:', dbErr.message, dbErr.stack?.substring(0, 200));
        return Response.json({ error: 'DB operation failed: ' + dbErr.message }, { status: 500 });
    }

    console.log('processPlantCareLog success, summary:', result?.summary, 'watered:', result?.watered_plant_ids?.length);
    return Response.json({
        success: true,
        transcript,
        watered_count: plantsToWater?.length || 0,
        notes_count: result.plant_notes?.length || 0,
        reminder_count: (result.reminders || []).filter(r => r.reminder_time).length,
        summary: result.summary
    });
});