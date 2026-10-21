import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Happy Plants Plus status for the signed-in user.
//   { action: 'status' }  → plan + today's AI usage and limits (asks RevenueCat only when a
//                           saved store subscription is at or past its end date: see shouldRecheck)
//   { action: 'refresh' } → ask RevenueCat (source of truth) and save the result.
//                           Called right after a purchase/restore, since webhooks can lag.
//   { action: 'reserve_ids', plant_ids } → before naming new photos: approves as many as the
//                           photo IDs left allow (charged now, once per plant); the rest wait.
//   { action: 'reward_ids' } → after a finished reward video: +5 photo IDs today (3 a day max).
// RevenueCat app user id = Base44 user id (not the email).

// Photo IDs aren't counted here (see ID_RULES below). rename = typing a plant's name.
// Same numbers as functions/identifyPlantWithExpert.
const AI_LIMITS: Record<string, { free: number; plus: number }> = {
    rename: { free: 30, plus: 100 },
    health: { free: 3, plus: 25 },
    chat: { free: 20, plus: 200 },
};

// ---- Photo IDs (always on) -----------------------------------------------------
// Same block as functions/identifyPlantWithExpert — keep them in step.
const ID_RULES = { intro: 15, introHours: 24, daily: 5, perAd: 5, maxAds: 3, plus: 200 };
function dayIn(tz: string | undefined, when: Date): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(when)) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}
async function idStatus(db: any, user: any, plus: boolean) {
    const now = new Date();
    const day = dayIn(user.timezone, now);
    const created = Date.parse(user.created_date || '') || 0;
    const introEnds = created ? created + ID_RULES.introHours * 3600e3 : 0;
    const intro = !plus && now.getTime() < introEnds;
    const rows = (await db.AiUsage.filter({ user_id: user.id, day })) || [];
    const row = rows.find((r: any) => r.kind === 'identify') || null;
    const bonusRow = rows.find((r: any) => r.kind === 'identify_bonus') || null;
    const ads = bonusRow?.count || 0;
    let used = row?.count || 0;
    if (intro) {
        const yday = dayIn(user.timezone, new Date(now.getTime() - 86400e3));
        if (dayIn(user.timezone, new Date(created)) <= yday) {
            used += (await db.AiUsage.filter({ user_id: user.id, day: yday, kind: 'identify' }))?.[0]?.count || 0;
        }
    }
    const limit = plus ? ID_RULES.plus : intro ? ID_RULES.intro : ID_RULES.daily + Math.min(ads, ID_RULES.maxAds) * ID_RULES.perAd;
    return {
        day, plus, intro, intro_ends_at: intro ? new Date(introEnds).toISOString() : null,
        limit, used, left: Math.max(0, limit - used),
        ads_today: ads, max_ads: ID_RULES.maxAds, per_ad: ID_RULES.perAd, daily: ID_RULES.daily, intro_total: ID_RULES.intro,
        can_reward: !plus && !intro && ads < ID_RULES.maxAds,
        _row: row, _bonus: bonusRow,
    };
}
function publicIds(st: any) { const { _row, _bonus, ...rest } = st; return rest; }

function localDay(tz?: string): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}

async function fetchRevenueCat(appUserId: string) {
    const key = (Deno.env.get('REVENUECAT_SECRET_KEY') || '').trim();
    if (!key) return { configured: false as const };
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000), // a slow RevenueCat mustn't hang the app's status check
    });
    if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const sub = j?.subscriber || {};
    const now = Date.now();
    let best: any = null;
    for (const [id, e] of Object.entries<any>(sub.entitlements || {})) {
        const exp = e?.expires_date ? Date.parse(e.expires_date) : null;
        const grace = e?.grace_period_expires_date ? Date.parse(e.grace_period_expires_date) : null;
        const active = exp === null || exp > now || (grace !== null && grace > now);
        if (active && (!best || (exp ?? Infinity) > (best.exp ?? Infinity))) best = { id, exp, grace, product: e.product_identifier };
    }
    const s = best ? (sub.subscriptions || {})[best.product] || {} : {};
    return {
        configured: true as const,
        active: !!best,
        entitlement: best?.id || null,
        product_id: best?.product || null,
        expires_at: best ? (best.exp === null ? null : new Date(Math.max(best.exp, best.grace ?? 0)).toISOString()) : null,
        will_renew: best ? !s.unsubscribe_detected_at && !s.billing_issues_detected_at : false,
        store: s.store || null,
        sandbox: !!s.is_sandbox,
    };
}

async function saveSubscription(db: any, userId: string, email: string | null, info: any, event: string) {
    const existing = (await db.Subscription.filter({ user_id: userId }))?.[0];
    // A free Plus we gave by hand (store "promotional") isn't known to RevenueCat; don't let
    // a "not subscribed" answer switch it off before it expires.
    if (existing?.store === 'promotional' && existing.active && !info.active
        && (!existing.expires_at || Date.parse(existing.expires_at) > Date.now())) {
        return existing;
    }
    const row = {
        user_id: userId,
        user_email: email || existing?.user_email || null,
        active: !!info.active,
        entitlement: info.entitlement,
        product_id: info.product_id,
        expires_at: info.expires_at,
        will_renew: !!info.will_renew,
        store: info.store,
        sandbox: !!info.sandbox,
        last_synced_at: new Date().toISOString(),
        last_event: event,
    };
    if (existing) await db.Subscription.update(existing.id, row);
    else await db.Subscription.create(row);
    return row;
}

// Renewals normally reach us through the RevenueCat webhook. If one is missed, the saved end
// date passes while the person is still paying, so from a few hours before that date we ask
// RevenueCat again (same path as Restore) before deciding. Free Plus we gave by hand
// (store "promotional") is left alone.
const RECHECK_WITHIN_MS = 3 * 3600e3; // starting 3 hours before the saved end date
const RECHECK_EVERY_MS = 15 * 60e3;   // at most every 15 minutes per person
function shouldRecheck(sub: any): boolean {
    if (!sub || sub.store === 'promotional' || !sub.expires_at) return false;
    const exp = Date.parse(sub.expires_at);
    if (!Number.isFinite(exp) || exp - Date.now() > RECHECK_WITHIN_MS) return false;
    const last = Date.parse(sub.last_synced_at || '') || 0;
    return Date.now() - last > RECHECK_EVERY_MS;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const db = base44.asServiceRole.entities;

        let sub = (await db.Subscription.filter({ user_id: user.id }))?.[0] || null;
        let refreshed = false;
        let rcConfigured = !!(Deno.env.get('REVENUECAT_SECRET_KEY') || '').trim();

        // Ask RevenueCat and save what it says (Restore / after a purchase, and the renewal re-check)
        const syncFromRevenueCat = async (event: string) => {
            const info = await fetchRevenueCat(user.id);
            if (info.configured) {
                sub = await saveSubscription(db, user.id, user.email, info, event);
                refreshed = true;
            } else rcConfigured = false;
        };

        if (body.action === 'refresh') {
            await syncFromRevenueCat('app_refresh');
        } else if (rcConfigured && shouldRecheck(sub)) {
            // If RevenueCat can't be reached, fall back to what's saved rather than failing
            try { await syncFromRevenueCat('renewal_check'); } catch (e) { console.warn('premium renewal check', (e as Error).message); }
        }

        const plus = !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
        const idPlus = plus || user.role === 'admin';

        if (body.action === 'reward_ids') {
            const st = await idStatus(db, user, idPlus);
            if (!st.can_reward) return Response.json({ success: false, reason: st.plus ? 'plus' : st.intro ? 'intro' : 'max_ads', ids: publicIds(st) });
            if (st._bonus) await db.AiUsage.update(st._bonus.id, { count: st.ads_today + 1 });
            else await db.AiUsage.create({ user_id: user.id, user_email: user.email, day: st.day, kind: 'identify_bonus', count: 1 });
            return Response.json({ success: true, ids: publicIds(await idStatus(db, user, idPlus)) });
        }

        if (body.action === 'reserve_ids') {
            const ids = [...new Set((Array.isArray(body.plant_ids) ? body.plant_ids : []).map(String))].slice(0, 60);
            const plants = (await Promise.all(ids.map((id) => db.Plant.filter({ id }).then((r: any) => r?.[0]).catch(() => null))))
                .filter((p: any) => p && p.created_by === user.email);
            const st = await idStatus(db, user, idPlus);
            let left = st.left;
            const approved: string[] = [];
            const waiting: string[] = [];
            const nowIso = new Date().toISOString();
            const writes: Promise<any>[] = [];
            let charged = 0;
            for (const p of plants) {
                const info = p.add_info || {};
                if (p.add_status === 'review' || p.add_status === 'done') continue; // already named
                if (info.id_paid) { approved.push(p.id); continue; }
                if (left > 0) {
                    left--; charged++;
                    approved.push(p.id);
                    const { error, waiting: _w, ...rest } = info;
                    writes.push(db.Plant.update(p.id, { add_status: 'identifying', add_info: { ...rest, id_paid: st.day, started_at: nowIso } }));
                } else {
                    waiting.push(p.id);
                    writes.push(db.Plant.update(p.id, { add_status: 'failed', add_info: { ...info, error: 'limit_reached' } }));
                }
            }
            if (charged) {
                if (st._row) await db.AiUsage.update(st._row.id, { count: (st._row.count || 0) + charged });
                else await db.AiUsage.create({ user_id: user.id, user_email: user.email, day: st.day, kind: 'identify', count: charged });
            }
            await Promise.allSettled(writes);
            return Response.json({ success: true, approved, waiting, ids: { ...publicIds(st), used: st.used + charged, left } });
        }

        const day = localDay(user.timezone);
        const usageRows = await db.AiUsage.filter({ user_id: user.id, day });
        const usage: Record<string, any> = {};
        for (const k of Object.keys(AI_LIMITS)) {
            usage[k] = { used: usageRows.find((r: any) => r.kind === k)?.count || 0, limit: AI_LIMITS[k][idPlus ? 'plus' : 'free'] };
        }
        return Response.json({
            success: true,
            plus,
            refreshed,
            rc_configured: rcConfigured,
            limits_on: (Deno.env.get('AI_LIMITS_ON') || '').trim().toLowerCase() === 'true',
            subscription: sub ? {
                product_id: sub.product_id, expires_at: sub.expires_at, will_renew: sub.will_renew,
                store: sub.store, sandbox: sub.sandbox,
            } : null,
            usage,
            // identify: only for app pages loaded before this change, which read limits.identify
            limits: { ...AI_LIMITS, identify: { free: ID_RULES.daily, plus: ID_RULES.plus } },
            // Photo ID rules, so the Plus page never hard-codes them
            id_rules: {
                intro: ID_RULES.intro, intro_hours: ID_RULES.introHours, daily: ID_RULES.daily,
                per_ad: ID_RULES.perAd, max_ads: ID_RULES.maxAds, plus: ID_RULES.plus,
            },
            ids: publicIds(await idStatus(db, user, idPlus)),
        });
    } catch (error) {
        console.error('premium', error);
        return Response.json({ error: (error as Error).message }, { status: 500 });
    }
});
