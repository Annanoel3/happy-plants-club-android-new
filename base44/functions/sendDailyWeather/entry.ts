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

// Every user, a page at a time, oldest first (a single list() call only returns the newest 1,000)
async function allUsers(db: any): Promise<any[]> {
    const out: any[] = [];
    const PAGE = 500;
    for (let skip = 0; skip < 100000; skip += PAGE) {
        const page = (await db.User.list('created_date', PAGE, skip)) || [];
        out.push(...page);
        if (page.length < PAGE) break;
    }
    return out;
}

// Why OneSignal said no, without the email addresses its errors can list
function osWhy(detail: any): string {
    const e = detail?.errors ?? detail;
    if (Array.isArray(e)) return e.map(String).join('; ').slice(0, 160);
    if (e && typeof e === 'object') return Object.keys(e).join(', ');
    return String(e || '').slice(0, 160);
}

// Is it this person's push hour? Settings saves weather_local_hour (0-23, their own clock),
// which follows daylight saving. Older accounts only have weather_notification_hour, saved
// as a UTC hour (it shifts an hour with daylight saving; kept as it was). Nothing saved: 8 AM.
function isTheirHour(user: any, now: Date, localHour: number): boolean {
    const lh = user.weather_local_hour;
    if (lh !== undefined && lh !== null && lh !== '' && Number.isInteger(Number(lh)) && Number(lh) >= 0 && Number(lh) <= 23) {
        return localHour === Number(lh);
    }
    const uh = user.weather_notification_hour;
    if (uh !== undefined && uh !== null && uh !== '') return now.getUTCHours() === Number(uh);
    return localHour === DEFAULT_LOCAL_HOUR;
}

// Runs every hour. Each user gets ONE weather push a day, at their chosen hour
// (see isTheirHour) or 8 AM their time by default.
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
        const users = await allUsers(base44.asServiceRole.entities);
        let sent = 0, skipped = 0, failed = 0;

        for (const user of users) {
            try {
                if (user.notifications_weather === false || !user.location || !user.email) { skipped++; continue; }

                const tz = user.timezone || 'America/Chicago';
                const { date: localDate, hour: localHour } = localParts(tz, now);

                if (!isTheirHour(user, now, localHour)) { skipped++; continue; }
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
                    console.error('OneSignal weather push failed', user.id, res.status, osWhy(result));
                    failed++;
                } else {
                    sent++;
                }
            } catch (err) {
                console.error('Weather push error for', user.id, err?.message || err);
                failed++;
            }
        }

        return Response.json({ success: true, sent, skipped, failed, time: now.toISOString() });
    } catch (err) {
        return Response.json({ success: false, error: String(err) }, { status: 500 });
    }
});
