import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OneSignal auth: new keys (os_v2_...) use "Key", legacy keys use "Basic".
function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}

const DAY = 24 * 60 * 60 * 1000;

// Called once a day by the "7-Day" and "14-Day Inactivity" workflows, which pass
// { days_inactive: 7 | 14 } in the body. Each user gets each nudge exactly ONCE:
// only when their last open falls on the day exactly N days ago.
// Fixes: the day count was read from the URL (workflows send it in the body, so
// both ran as "7"), the app never recorded last_app_open (so nothing ever sent),
// and once it did, everyone past day 7 would have been pushed every single day.
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const url = new URL(req.url);
        const daysInactive = parseInt(String(body?.days_inactive ?? url.searchParams.get('days_inactive') ?? '7'), 10) || 7;

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
        const message = messages[daysInactive] || `It's been ${daysInactive} days — your plants would love a check-in 🌱`;

        const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 1000);
        let sentCount = 0;

        for (const user of allUsers) {
            if (!user.email || !user.last_app_open) continue;
            if (user.notifications_enabled === false) continue;
            const lastOpen = new Date(user.last_app_open).getTime();
            if (!(lastOpen >= windowStart && lastOpen < windowEnd)) continue;

            try {
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
                else console.error('Inactivity push failed', user.email, JSON.stringify(result.errors || result));
            } catch (err) {
                console.error(`Error sending inactivity notification to ${user.email}:`, err);
            }
        }

        return Response.json({ success: true, days_inactive: daysInactive, notifications_sent: sentCount, time: new Date(now).toISOString() });
    } catch (error) {
        console.error('Inactivity notification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
