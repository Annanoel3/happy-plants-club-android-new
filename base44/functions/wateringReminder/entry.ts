import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Backend for the phone's own watering pop-up (the alarm-scheduled notification
// with "Done" and "Later today"). The phone calls this directly, with the
// signed-in user's token, even when the app is closed.
//   { action: 'due',   tz }                 → plants that need water today or earlier
//   { action: 'water', tz, plant_ids: [...] } → log a watering for each (skips any
//                                              already logged today, so a double
//                                              tap never double-counts)

function localDay(tz?: string): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}

function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function onVacation(p: any, today: string): boolean {
    if (!p.vacation_mode_enabled) return false;
    const start = p.vacation_start_date ? String(p.vacation_start_date).slice(0, 10) : null;
    const end = p.vacation_end_date ? String(p.vacation_end_date).slice(0, 10) : null;
    if (start && today < start) return false;
    if (end && today > end) return false;
    return true;
}

// Plus: how much to water, in US fl oz. Same formula as src/lib/waterAmount.js:
// ~10% of the pot's volume (RHS rule of thumb); volume ≈ 0.545 × width³ in³; 1 in³ = 0.554 fl oz.
// No pot width = no amount. We never guess from plant size (a guess can be way off).
// Garden-wide vacation (Schedule > Vacations): the trip that covers `today`. An unconfirmed
// sitter plan also covers the 2 days after the trip, so the first morning home doesn't say
// "16 plants need water" before the app has asked "did your sitter water as planned?".
// Same rule in sendWateringReminders and src/lib/vacation.js: keep in sync.
function tripCovering(trips: any[], today: string): any | null {
    for (const v of trips || []) {
        const s = String(v.start_date || '').slice(0, 10), e = String(v.end_date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) continue;
        const pending = v.sitter_plan?.visits?.length && (!v.status || v.status === 'planned');
        if (today >= s && today <= (pending ? addDays(e, 2) : e)) return v;
    }
    return null;
}

// How it's watered (same rule as src/lib/waterAmount.js waterMethod)
const METHODS = ['pour', 'reservoir', 'soak', 'mist', 'bottom', 'in_water'];
const METHOD_SHORT: Record<string, string> = {
    reservoir: 'fill reservoir', soak: 'soak 20 min', mist: 'mist', bottom: 'from below, 30 min', in_water: 'fresh water',
};
function waterMethod(p: any): string {
    const set = METHODS.includes(p.water_method) ? p.water_method : null;
    if (set && p.care_profile?.user_method) return set;
    if (p.pot_type === 'Self-watering') return 'reservoir';
    return set || 'pour';
}
function amountText(p: any): string | null {
    const m = waterMethod(p);
    if (m !== 'pour') return METHOD_SHORT[m];
    const d = p.pot_diameter_in;
    if (d === 0) return 'deep soak';
    const w = Number(d) > 0 ? Number(d) : null;
    if (!w) return null;
    const raw = 0.545 * w * w * w * 0.10 * 0.554;
    const oz = raw < 1 ? 1 : raw < 16 ? Math.round(raw) : raw < 64 ? Math.round(raw / 2) * 2 : Math.round(raw / 8) * 8;
    return `${oz} oz`;
}
function detailFor(p: any, today: string, plus: boolean): string | null {
    if (!plus) return null;
    const bits: string[] = [];
    const a = amountText(p);
    if (a) bits.push(a);
    const h = p.weather_hint && p.weather_hint.day === today ? p.weather_hint : null;
    if (h?.kind === 'heat') bits.push('hot day');
    if (h?.kind === 'rain_missed') bits.push('no rain came');
    return bits.length ? bits.join(' · ') : null;
}
async function isPlus(base44: any, userId: string): Promise<boolean> {
    try {
        const s = (await base44.asServiceRole.entities.Subscription.filter({ user_id: userId }))?.[0];
        return !!(s && s.active && (!s.expires_at || Date.parse(s.expires_at) > Date.now()));
    } catch { return false; }
}

const STAGES: [number, string][] = [[20, 'mature'], [15, 'large'], [10, 'medium'], [5, 'small'], [0, 'seedling']];
const rank: Record<string, number> = { seedling: 0, small: 1, medium: 2, large: 3, mature: 4 };

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // An expired/missing session must come back as 401 so the phone can say
        // "open Happy Plants to sign back in" instead of "no connection".
        let user: any = null;
        try { user = await base44.auth.me(); } catch { user = null; }
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const tz = body.tz || user.timezone;
        const today = localDay(tz);

        // Log waterings. Safe to send twice (a retry after a lost connection, the app's
        // outbox, a double tap): one watering per plant per day, the second is skipped.
        //   { action: 'water', plant_ids: [...] }                       (phone pop-up, widget)
        //   { action: 'water', items: [{ plant_id, date?, notes?, method? }] }  (the app)
        if (body.action === 'water') {
            const DATE = /^\d{4}-\d{2}-\d{2}$/;
            const oldest = addDays(today, -60);
            const raw: any[] = Array.isArray(body.items) ? body.items
                : Array.isArray(body.plant_ids) ? body.plant_ids.map((id: any) => ({ plant_id: id })) : [];
            const items = raw
                .filter((x: any) => x && typeof x.plant_id === 'string')
                .slice(0, 200)
                .map((x: any) => ({
                    plant_id: x.plant_id,
                    // a day that's been queued on the phone keeps its own date; never the future
                    date: typeof x.date === 'string' && DATE.test(x.date) && x.date <= today && x.date >= oldest ? x.date : today,
                    notes: typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim().slice(0, 1000) : null,
                    method: typeof x.method === 'string' ? x.method.slice(0, 20) : (Array.isArray(body.items) ? 'quick' : 'reminder'),
                }));
            if (!items.length) return Response.json({ success: true, watered: 0, skipped: 0, results: [] });
            // User-scoped reads: RLS only returns this user's own plants
            const ids = [...new Set(items.map((x) => x.plant_id))];
            const plants = (await base44.entities.Plant.filter({ id: { $in: ids } })) || [];
            const byId = new Map(plants.map((p: any) => [p.id, p]));
            const dates = [...new Set(items.map((x) => x.date))];
            const logs = (await base44.entities.WateringLog.filter({ plant_id: { $in: ids }, watered_date: { $in: dates } }, '-created_date', 1000)) || [];
            const logged = new Map<string, any>();
            for (const l of logs) logged.set(`${l.plant_id}|${String(l.watered_date).slice(0, 10)}`, l);
            let watered = 0, skipped = 0;
            const results: any[] = [];
            for (const it of items) {
                const p: any = byId.get(it.plant_id);
                if (!p) { results.push({ plant_id: it.plant_id, status: 'not_found' }); continue; }
                const key = `${p.id}|${it.date}`;
                const prior = logged.get(key);
                if (prior) {
                    skipped++;
                    if (it.notes && !String(prior.notes || '').includes(it.notes)) {
                        await base44.entities.WateringLog.update(prior.id, { notes: prior.notes ? `${prior.notes}\n${it.notes}` : it.notes }).catch(() => {});
                    }
                    results.push({ plant_id: p.id, status: 'already', date: it.date, log_id: prior.id, last_watered: p.last_watered, next_watering_due: p.next_watering_due, stage: p.growth_stage });
                    continue;
                }
                const total = (p.total_waterings || 0) + 1;
                const computed = STAGES.find(([min]) => total >= min)![1];
                const stage = (rank[p.growth_stage] ?? 0) > rank[computed] ? p.growth_stage : computed;
                // Logging an older day than the latest watering keeps the log but doesn't
                // move the schedule backwards
                const isNewest = !p.last_watered || it.date >= String(p.last_watered).slice(0, 10);
                const patch: any = {
                    total_waterings: total,
                    growth_stage: stage,
                    status: p.status === 'wilted' ? 'healthy' : (p.status || 'healthy'),
                    ...(isNewest ? { last_watered: it.date, next_watering_due: addDays(it.date, p.water_frequency_days || 7) } : {}),
                };
                const [log] = await Promise.all([
                    base44.entities.WateringLog.create({
                        plant_id: p.id,
                        plant_name: p.nickname || p.name,
                        watered_date: it.date,
                        method: it.method,
                        ...(it.notes ? { notes: it.notes } : {}),
                    }),
                    base44.entities.Plant.update(p.id, patch),
                ]);
                logged.set(key, log);
                byId.set(p.id, { ...p, ...patch });
                watered++;
                results.push({
                    plant_id: p.id, status: 'watered', date: it.date, log_id: log?.id || null,
                    grew: stage !== (p.growth_stage || 'seedling'), stage,
                    last_watered: patch.last_watered ?? p.last_watered, next_watering_due: patch.next_watering_due ?? p.next_watering_due,
                });
            }
            return Response.json({ success: true, watered, skipped, today, results });
        }

        // Take back one watering (Undo): { action: 'unwater', plant_id, date, log_id?, before? }
        if (body.action === 'unwater') {
            const pid = String(body.plant_id || '');
            const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? String(body.date) : today;
            let p: any = null;
            try { p = (await base44.entities.Plant.filter({ id: pid }))?.[0]; } catch { p = null; }
            if (!p) return Response.json({ error: 'Not found' }, { status: 404 });
            const logs = (await base44.entities.WateringLog.filter({ plant_id: pid, watered_date: date })) || [];
            const log = (body.log_id && logs.find((l: any) => l.id === body.log_id)) || logs[0];
            if (!log) return Response.json({ success: true, status: 'nothing_to_undo' });
            await base44.entities.WateringLog.delete(log.id);
            const patch: any = { total_waterings: Math.max(0, (p.total_waterings || 1) - 1) };
            if (String(p.last_watered || '').slice(0, 10) === date) {
                const b = body.before && typeof body.before === 'object' ? body.before : null;
                if (b && 'last_watered' in b) {
                    patch.last_watered = b.last_watered ?? null;
                    patch.next_watering_due = b.next_watering_due ?? null;
                    if (b.growth_stage) patch.growth_stage = b.growth_stage;
                } else {
                    const prev = ((await base44.entities.WateringLog.filter({ plant_id: pid }, '-watered_date', 1)) || [])[0];
                    const last = prev ? String(prev.watered_date).slice(0, 10) : null;
                    patch.last_watered = last;
                    patch.next_watering_due = last ? addDays(last, p.water_frequency_days || 7) : null;
                }
            }
            await base44.entities.Plant.update(pid, patch);
            return Response.json({ success: true, status: 'undone', ...patch });
        }

        // 'due' (default)
        // The phone's own pop-up just checked in (8 AM or "later today"), so it really is
        // working on this phone: note that, and the 8 AM push skips this person for the
        // next 36 hours. Widget refreshes don't count (source 'widget'); older builds send
        // no source and only call this from the pop-up. At most one write every 6 hours.
        if (body.source !== 'widget') {
            const last = user.watering_popups_native_at ? Date.parse(user.watering_popups_native_at) : 0;
            if (!last || Date.now() - last > 6 * 3600 * 1000) {
                try { await base44.auth.updateMe({ watering_popups_native_at: new Date().toISOString() }); } catch { /* not worth failing the pop-up over */ }
            }
        }
        const [plants, plus, trips] = await Promise.all([
            base44.entities.Plant.filter({ created_by: user.email }, '-created_date', 500).then((r: any) => r || []),
            isPlus(base44, user.id),
            base44.entities.VacationDay.filter({ created_by: user.email }, '-start_date', 100).then((r: any) => r || []).catch(() => []),
        ]);
        // Away (or just back with the sitter's waterings not logged yet): no pop-up, and the
        // widget shows nothing due
        const trip = tripCovering(trips, today);
        if (trip) {
            return Response.json({ success: true, today, enabled: false, vacation: true, vacation_end: String(trip.end_date).slice(0, 10), plus, plants: [] });
        }
        const due = plants
            .filter((p: any) => p.next_watering_due && String(p.next_watering_due).slice(0, 10) <= today)
            .filter((p: any) => !onVacation(p, today))
            .filter((p: any) => String(p.last_watered || '').slice(0, 10) !== today)
            .sort((a: any, b: any) => String(a.next_watering_due).localeCompare(String(b.next_watering_due)))
            .map((p: any) => ({
                id: p.id,
                name: p.nickname || p.name || 'Plant',
                next_due: String(p.next_watering_due).slice(0, 10),
                detail: detailFor(p, today, plus),
            }));
        return Response.json({
            success: true,
            today,
            enabled: user.notifications_watering !== false,
            plus,
            plants: due,
        });
    } catch (error) {
        console.error('wateringReminder', error);
        return Response.json({ error: (error as Error).message }, { status: 500 });
    }
});
