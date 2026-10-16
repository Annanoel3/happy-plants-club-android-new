import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Happy Plants Plus status for the signed-in user.
//   { action: 'status' }  → plan + today's AI usage and limits (no network to RevenueCat)
//   { action: 'refresh' } → ask RevenueCat (source of truth) and save the result.
//                           Called right after a purchase/restore, since webhooks can lag.
// RevenueCat app user id = Base44 user id (not the email).

const AI_LIMITS: Record<string, { free: number; plus: number }> = {
    identify: { free: 5, plus: 50 },
    health: { free: 3, plus: 25 },
    chat: { free: 20, plus: 200 },
};

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

        if (body.action === 'refresh') {
            const info = await fetchRevenueCat(user.id);
            if (info.configured) {
                sub = await saveSubscription(db, user.id, user.email, info, 'app_refresh');
                refreshed = true;
            } else rcConfigured = false;
        }

        const plus = !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
        const day = localDay(user.timezone);
        const usageRows = await db.AiUsage.filter({ user_id: user.id, day });
        const usage: Record<string, any> = {};
        for (const k of Object.keys(AI_LIMITS)) {
            usage[k] = { used: usageRows.find((r: any) => r.kind === k)?.count || 0, limit: AI_LIMITS[k][plus ? 'plus' : 'free'] };
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
            limits: AI_LIMITS,
        });
    } catch (error) {
        console.error('premium', error);
        return Response.json({ error: (error as Error).message }, { status: 500 });
    }
});
