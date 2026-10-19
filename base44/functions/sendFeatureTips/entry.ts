import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// "Did you know…" pushes about things Happy Plants can do, so people find the features
// they haven't used. Runs every hour (workflow "Feature Tips"); each person gets at most
// two a week, on their own two weekdays, around lunchtime (12-2 PM their time), and never:
//   - on a day they already got another push (watering, care, frost),
//   - while they're away on a trip,
//   - if they turned Tips (or all notifications) off in Settings,
//   - about a feature they've used lately, or the same tip again within 90 days,
//   - in their first 3 days (they're still finding their way around anyway).
// Tapping a tip opens the screen it's about (data.screen; the app build with the
// notification click handler routes it, older builds just open the app).
//   { key }                          normal hourly run
//   { key, dry: true, any_time? }    who would get what right now, nothing sent
//   { key, test_email, tip }         send one tip to one account now (testing)

function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}
function validTz(tz: any): string {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'America/Chicago'; }
}
function localParts(tz: string) {
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date())) p[x.type] = x.value;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { day: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour, 10), weekday: wd };
}
function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function hash(s: string): number {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
}

// Where the hidden Plantdoku link sits today (copy of eggFor in src/lib/plantdoku/egg.js — keep in step)
function eggPath(day: string): string {
    const pages = ['/Dashboard', '/Schedule', '/Feed', '/PlantChat'];
    const n = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
    const offset = hash(`week${Math.floor(n / 7)}`) % 4;
    return pages[(n + offset) % 4];
}

// Each tip: what it says, where a tap goes, and when it's pointless for this person.
type Ctx = { plants: number; plus: boolean; usedChat: boolean; usedHealth: boolean; hasTrip: boolean; hasCare: boolean; hasPhotos: boolean; foundGame: boolean; ageDays: number };
const TIPS: { key: string; title: string; body: string; screen: string | ((day: string) => string); skip: (c: Ctx) => boolean }[] = [
    {
        key: 'expert', title: '🌿 Ask the Plant Expert',
        body: 'Did you know the Plant Expert can tell you what your plant needs? Ask about yellow leaves, repotting, anything.',
        screen: '/PlantChat', skip: (c) => c.usedChat,
    },
    {
        key: 'plantdoku', title: '🌱 Psst… a hidden game',
        body: "There's a tiny puzzle game hiding in Happy Plants. Today it's on this screen: look for small text that says \"what's this?\"",
        screen: (day) => eggPath(day), skip: (c) => c.foundGame || c.plants < 3 || c.ageDays < 7,
    },
    {
        key: 'health', title: '🩺 Something look off?',
        body: "Open a plant and tap Health Checkup. Snap a photo and you'll get a quick read on what's wrong and what to do.",
        screen: '/Dashboard', skip: (c) => c.usedHealth,
    },
    {
        key: 'round', title: '💧 Lots to water at once?',
        body: 'Start a Watering round: just the plants that are due, grouped by room, one tap per room.',
        screen: '/Dashboard', skip: (c) => c.plants < 5,
    },
    {
        key: 'even_out', title: '📅 Too many plants due on one day?',
        body: 'Even out my schedule (on the Schedule page) spreads them across the week. Your fussy plants stay put.',
        screen: '/Schedule', skip: (c) => c.plants < 8,
    },
    {
        key: 'vacation', title: '🏖️ Going away soon?',
        body: 'Add a vacation and get a plant-sitter plan sorted by day and room. Watering reminders pause while you\'re gone.',
        screen: '/Schedule', skip: (c) => c.hasTrip,
    },
    {
        key: 'quicklog', title: '🎙️ Watered a bunch?',
        body: 'Use Quick Log and just say it, like "I watered the ferns and the pothos." It logs them for you.',
        screen: '/Dashboard', skip: (c) => c.plants < 3,
    },
    {
        key: 'photos', title: '📸 Watch your plants grow',
        body: "Add a progress photo on a plant's Photos tab. In a few months you'll love looking back.",
        screen: '/Dashboard', skip: (c) => c.hasPhotos,
    },
    {
        key: 'care_schedule', title: '🗓️ Feeding and repotting reminders',
        body: 'Set up a care schedule on any plant and Happy Plants will remind you to feed, mist, turn and repot it, only when it needs it.',
        screen: '/Dashboard', skip: (c) => !c.plus || c.hasCare,
    },
    {
        key: 'widget', title: '📱 Water from your home screen',
        body: "Add the Happy Plants widget to your home screen to see what's due and water it with one tap.",
        screen: '/Dashboard', skip: (c) => !c.plus,
    },
];
const TIP_HOURS = [12, 13]; // local time
const REPEAT_AFTER_DAYS = 90;

async function sendPush(email: string, tip: typeof TIPS[number], day: string) {
    const screen = typeof tip.screen === 'function' ? tip.screen(day) : tip.screen;
    const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
    const rest = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !rest) return { id: null, detail: 'no onesignal' };
    const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: osAuth(rest) },
        body: JSON.stringify({
            app_id: appId,
            include_aliases: { external_id: [email] },
            target_channel: 'push',
            headings: { en: tip.title },
            contents: { en: tip.body },
            data: { type: 'tip', tip: tip.key, screen },
            ttl: 6 * 60 * 60,
        }),
    });
    const j = await res.json().catch(() => ({}));
    return { id: j?.id || null, detail: j };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const key = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
        if (!key || body.key !== key) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const db = base44.asServiceRole.entities;

        // Testing: one tip to one account, now
        if (body.test_email) {
            const tip = TIPS.find((t) => t.key === body.tip) || TIPS[0];
            const r = await sendPush(String(body.test_email), tip, new Date().toISOString().slice(0, 10));
            return Response.json({ success: true, tip: tip.key, push: r.id, detail: r.id ? undefined : r.detail });
        }

        const now = Date.now();
        const users = (await db.User.list('-created_date', 1000)) || [];
        const subs = (await db.Subscription.filter({ active: true }, '-updated_date', 1000).catch(() => [])) || [];
        const plusIds = new Set(subs.filter((s: any) => !s.expires_at || Date.parse(s.expires_at) > now).map((s: any) => s.user_id));
        const trips = (await db.VacationDay.list('-created_date', 1000).catch(() => [])) || [];
        const stats: Record<string, number> = {};
        const bump = (k: string) => { stats[k] = (stats[k] || 0) + 1; };
        const plan: any[] = [];

        for (const u of users) {
            if (!u?.email) continue;
            if (u.notifications_enabled === false || u.notifications_tips === false) { bump('off'); continue; }
            if (u.created_date && now - Date.parse(u.created_date) < 3 * 86400000) { bump('new_user'); continue; }
            const tz = validTz(u.timezone);
            const { day, hour, weekday } = localParts(tz);
            // two fixed weekdays per person, three days apart, so a whole user base isn't pinged at once
            const d1 = hash(u.id || u.email) % 7, d2 = (d1 + 3) % 7;
            if (!body.any_time) {
                if (weekday !== d1 && weekday !== d2) { bump('not_their_day'); continue; }
                if (!TIP_HOURS.includes(hour)) continue;
            }
            if (u.tip_push_day === day) { bump('already_today'); continue; }
            // another push already went out today
            if (u.care_push_day === day || u.frost_push_day === day) { bump('other_push'); continue; }
            const dwr = (await db.DailyWateringReminder.filter({ user_email: u.email, reminder_date: day }).catch(() => [])) || [];
            if (dwr.some((r: any) => (r.scheduled_notification_ids || []).length)) { bump('other_push'); continue; }
            // away
            const mine = trips.filter((v: any) => v.created_by === u.email);
            if (mine.some((v: any) => day >= String(v.start_date).slice(0, 10) && day <= String(v.end_date).slice(0, 10))) { bump('away'); continue; }

            const plants = (await db.Plant.filter({ created_by: u.email }, '-created_date', 500).catch(() => [])) || [];
            if (!plants.length) { bump('no_plants'); continue; }
            const since = addDays(day, -14);
            const usage = (await db.AiUsage.filter({ user_id: u.id }, '-day', 60).catch(() => [])) || [];
            const recent = usage.filter((r: any) => String(r.day) >= since);
            const photos = (await db.PlantProgressPhoto.filter({ created_by: u.email }, '-created_date', 1).catch(() => [])) || [];
            const ctx: Ctx = {
                plants: plants.length,
                plus: plusIds.has(u.id),
                usedChat: recent.some((r: any) => r.kind === 'chat'),
                usedHealth: recent.some((r: any) => r.kind === 'health'),
                hasTrip: mine.some((v: any) => String(v.end_date).slice(0, 10) >= day),
                hasCare: plants.some((p: any) => p.care_schedule && Object.values(p.care_schedule).some((t: any) => t?.on)),
                hasPhotos: photos.length > 0,
                foundGame: !!u.plantdoku_found,
                ageDays: u.created_date ? (now - Date.parse(u.created_date)) / 86400000 : 999,
            };
            const log = (u.tip_log && typeof u.tip_log === 'object') ? u.tip_log : {};
            const fresh = (k: string) => !log[k] || String(log[k]) <= addDays(day, -REPEAT_AFTER_DAYS);
            const options = TIPS.filter((t) => !t.skip(ctx) && fresh(t.key));
            if (!options.length) { bump('nothing_new'); continue; }
            // the one sent longest ago (never sent first), in list order
            options.sort((a, b) => String(log[a.key] || '').localeCompare(String(log[b.key] || '')));
            const tip = options[0];
            if (body.dry) { plan.push({ email: u.email, tip: tip.key, day }); continue; }

            await db.User.update(u.id, { tip_push_day: day, tip_log: { ...log, [tip.key]: day } }); // claim first: never twice
            const r = await sendPush(u.email, tip, day);
            bump(r.id ? 'sent' : 'failed');
            if (!r.id) console.warn('tip push failed', u.email, JSON.stringify(r.detail).slice(0, 200));
        }
        return Response.json({ success: true, stats, ...(body.dry ? { plan } : {}) });
    } catch (error) {
        console.error('feature tips error', (error as Error)?.message);
        return Response.json({ error: (error as Error)?.message || 'Unknown error' }, { status: 500 });
    }
});
