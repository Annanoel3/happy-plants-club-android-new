import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

// Internal-call token: only our own backend functions can call push senders.
// Derived from an existing secret, so there's nothing extra to configure.
async function internalToken(): Promise<string> {
    const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}



// ---- timezone helpers (local wall-clock <-> UTC, DST-safe) ----
function tzParts(ms: number, tz: string) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const o: Record<string, string> = {};
    for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}
function tzOffsetMs(ms: number, tz: string) { const p = tzParts(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; }
function localToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string) { const g = Date.UTC(y, mo - 1, d, h, mi); let t = g - tzOffsetMs(g, tz); t = g - tzOffsetMs(t, tz); return t; }
function localDateOf(ms: number, tz: string) { const p = tzParts(ms, tz); return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }

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

    const { transcript, userTimezone } = await req.json();
    console.log('processPlantCareLog: transcript received, length:', transcript?.length, 'preview:', transcript?.substring(0, 60));

    if (!transcript || !transcript.trim()) {
        return Response.json({ error: 'No transcript provided' }, { status: 400 });
    }

    // Use provided timezone or fall back to UTC
    let timezone = userTimezone || user.timezone || 'UTC';
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { timezone = 'UTC'; }
    const createdReminders: any[] = [];
    console.log('Using timezone:', timezone);

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
    
    // Get current local time in user's timezone for LLM context
    const localFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const localTimeStr = localFormatter.format(now);
    const [datePart, timePart] = localTimeStr.split(', ');
    const [month, day, year] = datePart.split('/');
    const localDateTimeStr = `${year}-${month}-${day}T${timePart}`;

    const response = await openai.chat.completions.create({
        model: "gpt-6-luna",
        messages: [
            {
                role: "system",
                content: `You are a plant care log parser. User's timezone: ${timezone}. Current local time in user's timezone: ${localDateTimeStr}. Current UTC time: ${nowISO}

Available plants: ${plantsList}

Given a transcript, extract:
1. Which plants were watered — match using the plant's name, nickname, OR scientific name fuzzily (e.g. "tulips" matches name "Tulip" or scientific "Tulipa", "my monstera" matches "Monstera"). If the user says "everything", "all", "all my plants", return "ALL". If they reference a location like "everything on the porch" / "all the indoor plants", return "LOCATION:<location>". If they say "everything overdue", "all the overdue ones", "everything that needed water", return "OVERDUE".
2. Any observations or notes about specific plants.
3. Any reminders the user wants to set. Extract the time string exactly as the user said it (e.g. "8 PM", "tomorrow at 9am", "in 2 hours"). Do NOT try to convert timezones yourself — just extract the raw time phrase. Return it in reminder_time_phrase. ALSO resolve it to the exact local date and time the user means, using the current local time above, and return it in reminder_local_datetime as "YYYY-MM-DDTHH:mm" (24-hour, user's local time, no timezone suffix). Rules: a time with no day means the next time that clock time happens (if it already passed today, use tomorrow); "tonight" means today in the evening; "tomorrow morning" with no time means 09:00; a day with no time means 09:00. For relative phrases like "in 2 hours" just add to the current local time. If it's vague like "later" or "soon", set reminder_time_phrase to null and needs_time_clarification to true. Also detect recurrence patterns: if they say "every X hours/days/weeks/months", extract the recurrence_type. Supported types: "daily", "weekly", "biweekly", "monthly", "every_two_hours".

Return ONLY valid JSON:
{
    "watered_plant_names": ["Tulip"],
    "plant_notes": [{"plant_name": "Monstera", "note": "observation"}],
    "reminders": [{"description": "what to do", "plant_name": "plant it is about, or null", "reminder_time_phrase": "user's exact time phrase or null", "reminder_local_datetime": "YYYY-MM-DDTHH:mm in the user's LOCAL time, or null", "needs_time_clarification": false, "recurrence_type": null}],
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
        const today = localDateOf(Date.now(), timezone);

        // Expand ALL / LOCATION / OVERDUE special tokens into real plant lists
        let wateredNames = result.watered_plant_names || [];
        for (const token of wateredNames) {
            if (token === 'ALL') {
                plantsToWater.push(...plants);
            } else if (token === 'OVERDUE') {
                plantsToWater.push(...plants.filter(p => p.next_watering_due && p.next_watering_due <= today));
                console.log('OVERDUE filter - today:', today, 'matched:', plantsToWater.map(p => p.name));
            } else if (token.startsWith('LOCATION:')) {
                // "everything on the deck" may come back as "the deck", "deck plants", "outside"...
                const clean = (s: string) => String(s || '').toLowerCase().replace(/\b(the|my|on|in|at|all|everything|plants?|area)\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
                const loc = clean(token.replace('LOCATION:', ''));
                const envWord = /^(outside|outdoors?|outdoor)$/.test(loc) ? 'outdoor' : /^(inside|indoors?|indoor)$/.test(loc) ? 'indoor' : null;
                plantsToWater.push(...plants.filter(p => {
                    if (envWord) return String(p.environment || '').toLowerCase() === envWord;
                    const l = clean(p.location);
                    return !!loc && !!l && (l.includes(loc) || loc.includes(l));
                }));
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
                await base44.entities.WateringLog.create({
                    plant_id: plant.id,
                    plant_name: plant.name,
                    watered_date: today,
                    method: 'voice',
                    created_by: user.email
                });
                const nextWatering = new Date(today + 'T12:00:00Z');
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

        // Reminders: the LLM resolves the phrase to a local date+time in the user's timezone,
        // we convert that to UTC here, save the Reminder, and hand it to the reminder engine
        // (sendCustomReminders), which queues the exact push and handles repeats.
        for (const reminder of result.reminders || []) {
            if (!reminder.reminder_time_phrase && !reminder.reminder_local_datetime) continue;
            try {
                let fireMs: number | null = null;
                const phrase = String(reminder.reminder_time_phrase || '').toLowerCase().trim();
                const rel = phrase.match(/in\s+(\d+|an?|one)\s+(hour|hr|minute|min)s?/);
                if (rel) {
                    const amt = /^\d+$/.test(rel[1]) ? parseInt(rel[1]) : 1;
                    fireMs = Date.now() + amt * (rel[2].startsWith('h') ? 3600000 : 60000);
                } else if (reminder.reminder_local_datetime) {
                    const m = String(reminder.reminder_local_datetime).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
                    if (m) fireMs = localToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], timezone);
                }
                if (fireMs === null || isNaN(fireMs)) {
                    console.warn('Could not resolve reminder time:', reminder.reminder_time_phrase, reminder.reminder_local_datetime);
                    continue;
                }
                // "8 PM" said at 9 PM means tomorrow at 8 PM, not right now
                if (fireMs < Date.now() - 60000) fireMs += 24 * 3600000;

                const rec = ['daily', 'weekly', 'biweekly', 'monthly', 'every_two_hours'].includes(reminder.recurrence_type) ? reminder.recurrence_type : null;
                const matched = reminder.plant_name ? findPlant(reminder.plant_name) : null;
                const record = await base44.entities.Reminder.create({
                    plant_id: matched?.id || 'general',
                    plant_name: matched?.name || 'General',
                    title: reminder.description,
                    description: reminder.description,
                    due_date: localDateOf(fireMs, timezone),
                    schedule_time: new Date(fireMs).toISOString(),
                    completed: false,
                    is_recurring: !!rec,
                    recurrence_type: rec,
                    original_time_phrase: reminder.reminder_time_phrase || reminder.reminder_local_datetime,
                });
                createdReminders.push({ id: record.id, title: reminder.description, at: new Date(fireMs).toISOString() });
                try {
                    await base44.functions.invoke('sendCustomReminders', { action: 'sync', reminder_id: record.id });
                } catch (e) {
                    // The 15-minute sweep will still pick it up
                    console.warn('engine sync failed, sweep will catch it:', (e as Error).message);
                }
            } catch (remErr) {
                console.error('Failed to create reminder:', (remErr as Error).message);
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
        reminder_count: createdReminders.length,
        reminders: createdReminders,
        summary: result.summary
    });
});