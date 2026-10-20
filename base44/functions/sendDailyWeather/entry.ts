import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OneSignal auth: new keys (os_v2_...) use "Key", legacy keys use "Basic".
function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}

function localParts(tz: string, d = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
        }).formatToParts(d);
        const get = (t: string) => parts.find(p => p.type === t)?.value || '';
        return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: parseInt(get('hour'), 10) };
    } catch {
        return localParts('America/Chicago', d);
    }
}

const DEFAULT_LOCAL_HOUR = 8; // 8 AM in the user's own time zone

// Runs every hour. Each user gets ONE weather push a day, at their chosen hour
// (legacy setting is stored as a UTC hour) or 8 AM their time by default.
// Previously this ran for every user every hour, generated an AI weather message
// each time (24/day/user), then threw it away because it read the reply wrong —
// so nobody ever received a weather push.
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
        const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
        if (!appId || !restKey) return Response.json({ error: 'Missing OneSignal credentials' }, { status: 500 });

        const now = new Date();
        const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 1000);
        let sent = 0, skipped = 0, failed = 0;

        for (const user of allUsers) {
            try {
                if (user.notifications_weather === false || !user.location || !user.email) { skipped++; continue; }

                const tz = user.timezone || 'America/Chicago';
                const { date: localDate, hour: localHour } = localParts(tz, now);

                const isTheirHour = (user.weather_notification_hour !== undefined && user.weather_notification_hour !== null)
                    ? now.getUTCHours() === Number(user.weather_notification_hour)
                    : localHour === DEFAULT_LOCAL_HOUR;
                if (!isTheirHour) { skipped++; continue; }
                if (user.last_weather_push_date === localDate) { skipped++; continue; } // already sent today

                // Claim today's slot first so an overlapping run can't double-send.
                await base44.asServiceRole.entities.User.update(user.id, { last_weather_push_date: localDate });

                const plants = await base44.asServiceRole.entities.Plant.filter({ created_by: user.email });
                if (!plants.length) { skipped++; continue; }

                // The note is written by functions/plus from real forecast numbers (MET Norway) on
                // our own OpenAI key. This used Base44's InvokeLLM with internet search, which spent
                // Base44 integration credits for every person every day.
                const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
                const noteRes = await fetch('https://happyplants.club/api/apps/68e7e07bd0e33d2da3f22dbf/functions/plus', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'weather_note_for', key: sweepKey, email: user.email }),
                }).then((r) => r.json()).catch(() => null);
                const message = noteRes?.success ? noteRes.message : '';
                /* old: base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt: `You are a friendly plant care assistant. Look up today's weather forecast for ${user.location} (today is ${localDate}) and write a short morning note about how the user's plants will experience it.

The user has ${hasOutdoor && hasIndoor ? 'both indoor and outdoor plants' : hasOutdoor ? 'outdoor plants' : 'only indoor plants'}.
${hasOutdoor ? 'Mention sun, heat, rain or wind exposure for the outdoor plants when it matters.' : 'Do not suggest moving plants outside or bringing them in; talk about indoor light, humidity and temperature.'}
Only mention tonight if there is a real hazard (frost below 35°F, freeze, storms, heavy rain, strong wind) and then give one specific action.

2–3 sentences, warm and practical, one or two emoji. Return only the message text — no links, no headings.`,
                    add_context_from_internet: true,
                }) */

                const text = String(typeof message === 'string' ? message : (message as any)?.response ?? '')
                    .replace(/\[?\(?https?:\/\/[^\s)]+\)?[\])]?/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (!text) { failed++; continue; }

                const res = await fetch('https://api.onesignal.com/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: osAuth(restKey) },
                    body: JSON.stringify({
                        app_id: appId,
                        include_aliases: { external_id: [user.email] },
                        target_channel: 'push',
                        headings: { en: "🌿 Today's Plant Weather" },
                        contents: { en: text },
                        data: { type: 'weather', weather: true },
                    }),
                });
                const result = await res.json().catch(() => ({}));
                if (!res.ok || !result.id) {
                    console.error('OneSignal weather push failed', user.email, res.status, JSON.stringify(result.errors || result));
                    failed++;
                } else {
                    sent++;
                }
            } catch (err) {
                console.error('Weather push error for', user.email, err?.message || err);
                failed++;
            }
        }

        return Response.json({ success: true, sent, skipped, failed, time: now.toISOString() });
    } catch (err) {
        return Response.json({ success: false, error: String(err) }, { status: 500 });
    }
});
