import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Reminder engine. One place decides when every custom reminder fires.
//
// How it works:
//  - Each Reminder gets a `next_fire_at` (UTC). It comes from `schedule_time` when the
//    user gave a time, otherwise 9:00 AM in the user's own timezone on `due_date`.
//  - When the fire time is less than HORIZON away, we hand OneSignal an exact
//    `send_after`, so the push lands on the minute even though this runs every 15 min.
//  - After the fire time passes, recurring reminders roll forward to the next
//    occurrence (in local wall-clock time, so DST doesn't shift them).
//  - Completing/deleting a reminder cancels the queued push.
//  - Everything is idempotent: running twice never sends twice.
//
// Called by:
//  - the "Send Custom Reminders Every 15 Minutes" workflow (no user → full sweep)
//  - the app, with { action, reminder_id } right after a reminder is created/changed.

const HORIZON_MS = 26 * 60 * 60 * 1000;   // queue pushes up to 26h ahead
const GRACE_MS = 75 * 60 * 1000;          // a never-queued reminder up to 75 min late still sends (the sweep is hourly)
const DEFAULT_TZ = 'America/Chicago';
const DEFAULT_HOUR = 9;                   // date-only reminders fire at 9 AM local

function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}

// ---------- timezone helpers ----------
const pad = (n: number) => String(n).padStart(2, '0');

function validTz(tz?: string | null): string {
    if (!tz) return DEFAULT_TZ;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

function tzParts(ms: number, tz: string) {
    const f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const o: Record<string, string> = {};
    for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}

function tzOffsetMs(ms: number, tz: string): number {
    const p = tzParts(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

// Local wall-clock time in `tz` → UTC ms (DST-safe)
function localToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let t = guess - tzOffsetMs(guess, tz);
    t = guess - tzOffsetMs(t, tz);
    return t;
}

function localDate(ms: number, tz: string): string {
    const p = tzParts(ms, tz);
    return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

function iso(ms: number): string { return new Date(ms).toISOString(); }

// When should this reminder first fire?
function initialFire(r: any, tz: string): number | null {
    const st = r.schedule_time;
    if (st) {
        if (/[zZ]$|[+-]\d\d:?\d\d$/.test(st)) {
            const t = Date.parse(st);
            if (!isNaN(t)) return t;
        }
        // No zone on it → it was written as the user's local time
        const m = String(st).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
        if (m) return localToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
    }
    const dm = String(r.due_date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dm) return null;
    return localToUtc(+dm[1], +dm[2], +dm[3], DEFAULT_HOUR, 0, tz);
}

function advance(ms: number, type: string, tz: string): number {
    if (type === 'every_two_hours') return ms + 2 * 60 * 60 * 1000;
    const p = tzParts(ms, tz);
    let { y, mo, d } = p;
    if (type === 'daily') d += 1;
    else if (type === 'weekly') d += 7;
    else if (type === 'biweekly') d += 14;
    else if (type === 'monthly') {
        mo += 1;
        if (mo > 12) { mo = 1; y += 1; }
        const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        d = Math.min(d, dim);
    } else return ms + 24 * 60 * 60 * 1000;
    // Date.UTC normalises day overflow (e.g. Oct 35 → Nov 4)
    const n = new Date(Date.UTC(y, mo - 1, d));
    return localToUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), p.h, p.mi, tz);
}

const basisOf = (r: any) => `${r.due_date || ''}|${r.schedule_time || ''}|${r.recurrence_type || ''}|${r.is_recurring ? 1 : 0}`;

// ---------- OneSignal ----------
async function osSend(email: string, r: any, sendAfterMs: number | null): Promise<{ id: string | null; detail: any }> {
    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
    const payload: any = {
        app_id: appId,
        include_aliases: { external_id: [email] },
        target_channel: 'push',
        headings: { en: `⏰ ${r.title || 'Plant reminder'}` },
        contents: { en: (r.description && r.description !== r.title) ? r.description
            : (r.plant_name && r.plant_name !== 'General' ? `For ${r.plant_name} 🌱` : 'Tap to see your reminders 🌱') },
        data: { type: 'custom_reminder', reminder_id: r.id, screen: '/Schedule' },
        priority: 10, // high priority so Android doesn't hold it back in battery-saver (Doze)
        ttl: 6 * 60 * 60, // if the phone is off, still deliver within 6h, then drop it
    };
    if (sendAfterMs && sendAfterMs - Date.now() > 60 * 1000) payload.send_after = iso(sendAfterMs);
    const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: osAuth(key) },
        body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    // OneSignal returns an id AND errors.invalid_aliases when some of the user's old
    // devices are unsubscribed. The id means it was accepted — that's success.
    return { id: j?.id || null, detail: j };
}

async function osCancel(id: string) {
    if (!id) return;
    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
    try {
        await fetch(`https://api.onesignal.com/notifications/${id}?app_id=${appId}`, {
            method: 'DELETE', headers: { Authorization: osAuth(key) },
        });
    } catch (e) { console.warn('cancel failed', id, (e as Error).message); }
}

// ---------- core ----------
async function processReminder(db: any, r: any, owner: any, now: number, log: string[]) {
    const email = owner?.email;
    const tz = validTz(owner?.timezone);
    const patch: any = {};
    let schedId: string | null = r.scheduled_notification_id || null;
    let schedFor: number | null = r.scheduled_for ? Date.parse(r.scheduled_for) : null;
    const clearQueued = async () => {
        if (schedId && schedFor && schedFor > now) await osCancel(schedId);
        if (r.scheduled_notification_id || r.scheduled_for) { patch.scheduled_notification_id = null; patch.scheduled_for = null; }
        schedId = null; schedFor = null;
    };

    if (r.completed) {
        if (r.scheduled_notification_id || r.scheduled_for) await clearQueued();
        if (Object.keys(patch).length) await db.Reminder.update(r.id, patch);
        return 'completed';
    }

    // (Re)compute the fire time if it's new or the user changed the date/time/recurrence
    let fire: number | null = r.next_fire_at ? Date.parse(r.next_fire_at) : null;
    const basis = basisOf(r);
    if (fire === null || r.fire_basis !== basis) {
        fire = initialFire(r, tz);
        if (fire === null) return 'no-date';
        if (r.next_fire_at && r.fire_basis && r.fire_basis !== basis) {
            await clearQueued();
            patch.last_fired_at = null;
        }
        patch.next_fire_at = iso(fire);
        patch.fire_basis = basis;
    }
    const lastFired = patch.last_fired_at === null ? 0 : (r.last_fired_at ? Date.parse(r.last_fired_at) : 0);
    const recurring = !!(r.is_recurring && r.recurrence_type);
    const allowed = !!email && owner?.notifications_reminders !== false;
    let result = 'waiting';

    // 1) Fire time has passed
    if (fire <= now) {
        if (lastFired < fire) {
            const wasQueued = !!(schedId && schedFor === fire);
            if (wasQueued) {
                patch.last_fired_at = iso(fire);
                result = 'delivered-by-schedule';
            } else if (now - fire <= GRACE_MS && allowed) {
                const s = await osSend(email, r, null);
                patch.last_fired_at = iso(now);
                result = s.id ? 'sent-now' : 'send-failed';
                if (!s.id) log.push(`send-now failed ${r.id}: ${JSON.stringify(s.detail).slice(0, 200)}`);
            } else {
                patch.last_fired_at = iso(fire);  // too late / muted: mark handled, don't spam later
                result = allowed ? 'missed' : 'muted';
            }
        }
        if (recurring) {
            let next = fire;
            let guard = 0;
            while (next <= now && guard++ < 5000) next = advance(next, r.recurrence_type, tz);
            fire = next;
            patch.next_fire_at = iso(fire);
            patch.due_date = localDate(fire, tz);
            if (r.schedule_time) patch.schedule_time = iso(fire);
            patch.scheduled_notification_id = null; patch.scheduled_for = null;
            schedId = null; schedFor = null;
            // keep the basis in sync with what we just wrote so it's not seen as a user edit
            patch.fire_basis = basisOf({ ...r, ...patch });
        } else {
            if (Object.keys(patch).length) await db.Reminder.update(r.id, patch);
            return result;
        }
    }

    // 2) Recurring series over?
    if (recurring && r.recurrence_end_date && localDate(fire, tz) > r.recurrence_end_date) {
        await clearQueued();
        if (Object.keys(patch).length) await db.Reminder.update(r.id, patch);
        return 'series-ended';
    }

    // 3) Queue the exact push when it's close enough
    if (allowed && fire - now <= HORIZON_MS && schedFor !== fire) {
        if (schedId) await clearQueued();
        const s = await osSend(email, r, fire);
        patch.scheduled_notification_id = s.id || '';
        patch.scheduled_for = iso(fire);
        result = s.id ? 'queued' : 'queue-failed';
        if (!s.id) log.push(`queue failed ${r.id}: ${JSON.stringify(s.detail).slice(0, 200)}`);
    } else if (!allowed && schedId) {
        await clearQueued();
        result = 'muted';
    }

    if (Object.keys(patch).length) await db.Reminder.update(r.id, patch);
    return result;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const action = body?.action || 'sweep';
        const db = base44.asServiceRole.entities;
        const now = Date.now();
        const log: string[] = [];

        let me: any = null;
        try { me = await base44.auth.me(); } catch { me = null; }

        // ---------- single-reminder actions from the app ----------
        if (body?.reminder_id) {
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const rows = await db.Reminder.filter({ id: body.reminder_id });
            const r = rows?.[0];
            if (!r) return Response.json({ success: true, result: 'not-found' });
            const owns = r.created_by === me.email || r.created_by_id === me.id;
            if (!owns) return Response.json({ error: 'Forbidden' }, { status: 403 });

            if (action === 'delete') {
                if (r.scheduled_notification_id) await osCancel(r.scheduled_notification_id);
                await db.Reminder.delete(r.id);
                return Response.json({ success: true, result: 'deleted' });
            }
            if (action === 'complete') {
                const recurring = !!(r.is_recurring && r.recurrence_type);
                if (recurring) {
                    // "Done" on a repeating reminder = done for this time; roll to the next one
                    const tz = validTz(me.timezone);
                    const cur = r.next_fire_at ? Date.parse(r.next_fire_at) : (initialFire(r, tz) ?? now);
                    let next = advance(cur, r.recurrence_type, tz);
                    let guard = 0;
                    while (next <= now && guard++ < 5000) next = advance(next, r.recurrence_type, tz);
                    if (r.scheduled_notification_id && r.scheduled_for && Date.parse(r.scheduled_for) > now) {
                        await osCancel(r.scheduled_notification_id);
                    }
                    const patch: any = {
                        next_fire_at: iso(next), due_date: localDate(next, tz),
                        scheduled_notification_id: null, scheduled_for: null, last_fired_at: null,
                    };
                    if (r.schedule_time) patch.schedule_time = iso(next);
                    patch.fire_basis = basisOf({ ...r, ...patch });
                    await db.Reminder.update(r.id, patch);
                    const fresh = { ...r, ...patch };
                    const result = await processReminder(db, fresh, me, now, log);
                    return Response.json({ success: true, result: 'advanced', next_due: patch.due_date, queue: result });
                }
                await db.Reminder.update(r.id, { completed: true });
                const result = await processReminder(db, { ...r, completed: true }, me, now, log);
                return Response.json({ success: true, result });
            }
            if (action === 'uncomplete') {
                await db.Reminder.update(r.id, { completed: false });
                const result = await processReminder(db, { ...r, completed: false }, me, now, log);
                return Response.json({ success: true, result });
            }
            // 'sync' (default): just make sure it's scheduled correctly
            const result = await processReminder(db, r, me, now, log);
            return Response.json({ success: true, result, log });
        }

        // ---------- sweep (workflow, every 15 min) ----------
        // Every user, a page at a time: one list() call only returns the newest 1,000, and
        // reminders of anyone older were skipped as "no-owner"
        const users: any[] = [];
        for (let skip = 0; skip < 100000; skip += 500) {
            const page = (await db.User.list('created_date', 500, skip)) || [];
            users.push(...page);
            if (page.length < 500) break;
        }
        const byEmail = new Map<string, any>();
        for (const u of users) if (u?.email) byEmail.set(u.email, u);

        const open = await db.Reminder.filter({ completed: false }, '-created_date', 1000);
        const recentlyDone = await db.Reminder.filter({ completed: true }, '-updated_date', 200);
        const stats: Record<string, number> = {};
        for (const r of [...open, ...recentlyDone.filter((x: any) => x.scheduled_notification_id)]) {
            const owner = byEmail.get(r.created_by);
            if (!owner) { stats['no-owner'] = (stats['no-owner'] || 0) + 1; continue; }
            try {
                const res = await processReminder(db, r, owner, now, log);
                stats[res] = (stats[res] || 0) + 1;
            } catch (e) {
                stats['error'] = (stats['error'] || 0) + 1;
                log.push(`error ${r.id}: ${(e as Error).message}`);
            }
        }
        return Response.json({ success: true, at: iso(now), checked: open.length, stats, log: log.slice(0, 20) });
    } catch (err) {
        console.error('sendCustomReminders error', err);
        return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
    }
});
