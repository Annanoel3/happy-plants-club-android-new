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
const GUESS_BY_PLANT_SIZE: Record<string, number> = { Seedling: 3, Small: 4, Medium: 6, Large: 10, Mature: 12 };
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
    let w = Number(d) > 0 ? Number(d) : null;
    let guessed = false;
    if (!w) { w = GUESS_BY_PLANT_SIZE[p.plant_size] || null; guessed = true; }
    if (!w) return null;
    const raw = 0.545 * w * w * w * 0.10 * 0.554;
    const oz = raw < 1 ? 1 : raw < 16 ? Math.round(raw) : raw < 64 ? Math.round(raw / 2) * 2 : Math.round(raw / 8) * 8;
    return `${guessed ? '~' : ''}${oz} oz`;
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

        if (body.action === 'water') {
            const ids: string[] = Array.isArray(body.plant_ids) ? body.plant_ids.filter((x: any) => typeof x === 'string').slice(0, 200) : [];
            if (!ids.length) return Response.json({ success: true, watered: 0, skipped: 0 });
            // User-scoped reads: RLS only returns this user's own plants
            const plants = (await base44.entities.Plant.filter({ id: { $in: ids } })) || [];
            const already = new Set(
                ((await base44.entities.WateringLog.filter({ plant_id: { $in: plants.map((p: any) => p.id) }, watered_date: today })) || [])
                    .map((l: any) => l.plant_id),
            );
            let watered = 0, skipped = 0;
            for (const p of plants) {
                if (already.has(p.id)) { skipped++; continue; }
                const total = (p.total_waterings || 0) + 1;
                const computed = STAGES.find(([min]) => total >= min)![1];
                const stage = (rank[p.growth_stage] ?? 0) > rank[computed] ? p.growth_stage : computed;
                const isNewest = !p.last_watered || today >= String(p.last_watered).slice(0, 10);
                await Promise.all([
                    base44.entities.WateringLog.create({
                        plant_id: p.id,
                        plant_name: p.nickname || p.name,
                        watered_date: today,
                        method: 'reminder',
                    }),
                    base44.entities.Plant.update(p.id, {
                        total_waterings: total,
                        growth_stage: stage,
                        status: p.status === 'wilted' ? 'healthy' : (p.status || 'healthy'),
                        ...(isNewest ? { last_watered: today, next_watering_due: addDays(today, p.water_frequency_days || 7) } : {}),
                    }),
                ]);
                watered++;
            }
            return Response.json({ success: true, watered, skipped, today });
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
        const [plants, plus] = await Promise.all([
            base44.entities.Plant.filter({ created_by: user.email }, '-created_date', 500).then((r: any) => r || []),
            isPlus(base44, user.id),
        ]);
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
