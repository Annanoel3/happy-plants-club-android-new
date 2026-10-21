import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OneSignal auth: new keys (os_v2_...) use "Key", legacy keys use "Basic".
function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}

const DAY = 24 * 60 * 60 * 1000;
// Never more than one "come back" push per person in this many days, however often this runs
const MIN_GAP_DAYS = 6;

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

// Called once a day by the "7-Day" workflow (body {}) and the "14-Day Inactivity" workflow
// (body { days_inactive: 14 }). Each user gets each nudge exactly ONCE: only when their last
// open falls on the day exactly N days ago.
// Anyone signed in can call a function, so it takes no other day counts (only 7 or 14; anything
// else means 7), and each person gets at most one inactivity push every MIN_GAP_DAYS days,
// recorded on their user record (inactivity_push_day), however many times it's called.
// No key: the workflows call it without one.
// Fixes: the day count was read from the URL (workflows send it in the body, so
// both ran as "7"), the app never recorded last_app_open (so nothing ever sent),
// and once it did, everyone past day 7 would have been pushed every single day.
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const body = await req.json().catch(() => ({}));
        const daysInactive = Number(body?.days_inactive) === 14 ? 14 : 7;

        const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
        const rest = Deno.env.get('ONESIGNAL_REST_API_KEY');
        if (!appId || !rest) return Response.json({ error: 'Missing OneSignal credentials' }, { status: 500 });

        const now = Date.now();
        const windowStart = now - (daysInactive + 1) * DAY; // last open older than N days…
        const windowEnd = now - daysInactive * DAY;         // …but not older than N+1 days

        const messages: Record<number, string> = {
            7: 'Your garden misses you! Pop in and check who needs water 🌱',
            14: 'Your plants have been holding down the fort for two weeks 🌿 Come see how they\'re doing.',
        };
        const message = messages[daysInactive];

        const allUsersList = await allUsers(db);
        // Nobody gets "your garden misses you" while they're on a trip they told us about.
        // (UTC day, padded by a day each side, is close enough for a once-a-day nudge.)
        const utcDay = new Date(now).toISOString().slice(0, 10);
        const shift = (day: string, n: number) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
        const away = new Set<string>();
        for (const v of ((await db.VacationDay.list('-created_date', 1000).catch(() => [])) || [])) {
            const s = String(v.start_date || '').slice(0, 10), e = String(v.end_date || '').slice(0, 10);
            if (v.created_by && s && e && utcDay >= shift(s, -1) && utcDay <= shift(e, 1)) away.add(v.created_by);
        }
        const lastAllowed = shift(utcDay, -MIN_GAP_DAYS); // sent on or before this day = OK to send again
        let sentCount = 0, skippedRecent = 0;

        for (const user of allUsersList) {
            if (!user.email || !user.last_app_open) continue;
            // All notifications off, or "Tips and reminders to come back" off in Settings
            if (user.notifications_enabled === false || user.notifications_tips === false) continue;
            if (away.has(user.email)) continue;
            const lastOpen = new Date(user.last_app_open).getTime();
            if (!(lastOpen >= windowStart && lastOpen < windowEnd)) continue;
            const prev = String(user.inactivity_push_day || '').slice(0, 10);
            if (prev && prev > lastAllowed) { skippedRecent++; continue; }

            try {
                // Claim first, so a second run at the same time can't send it again
                await db.User.update(user.id, { inactivity_push_day: utcDay });
                const res = await fetch('https://api.onesignal.com/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: osAuth(rest) },
                    body: JSON.stringify({
                        app_id: appId,
                        include_aliases: { external_id: [user.email] },
                        target_channel: 'push',
                        headings: { en: '👋 Welcome Back' },
                        contents: { en: message },
                        data: { type: 'inactivity', days: daysInactive },
                    }),
                });
                const result = await res.json().catch(() => ({}));
                if (res.ok && result.id) sentCount++;
                else console.error('Inactivity push failed', user.id, res.status);
            } catch (err) {
                console.error('Error sending inactivity notification to', user.id, (err as Error)?.message || err);
            }
        }

        return Response.json({ success: true, days_inactive: daysInactive, notifications_sent: sentCount, skipped_recent: skippedRecent, time: new Date(now).toISOString() });
    } catch (error) {
        console.error('Inactivity notification error:', (error as Error)?.message);
        return Response.json({ error: (error as Error).message }, { status: 500 });
    }
});
