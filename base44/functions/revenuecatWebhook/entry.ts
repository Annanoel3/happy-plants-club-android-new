import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// RevenueCat → Happy Plants. RevenueCat calls this on every purchase, renewal,
// cancellation, expiration, refund, etc. We check the shared Authorization
// header, then re-read the customer from RevenueCat's API (their recommended
// pattern) so every event type is handled the same way and duplicates are harmless.
// Dashboard setup: Integrations → Webhooks → URL = this function's URL,
// Authorization header = the REVENUECAT_WEBHOOK_AUTH secret.

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
    const expected = (Deno.env.get('REVENUECAT_WEBHOOK_AUTH') || '').trim();
    const got = (req.headers.get('authorization') || '').trim();
    if (!expected || (got !== expected && got !== `Bearer ${expected}`)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const body = await req.json();
        const ev = body?.event || {};
        const ids: string[] = [ev.app_user_id, ev.original_app_user_id, ...(Array.isArray(ev.aliases) ? ev.aliases : [])]
            .filter((x: any) => typeof x === 'string' && x && !x.startsWith('$RCAnonymousID'));
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;

        // Our app user ids are Base44 user ids; find the one that exists
        let user: any = null;
        for (const id of [...new Set(ids)]) {
            user = (await db.User.filter({ id }))?.[0];
            if (user) break;
        }
        if (!user) {
            console.warn('revenuecatWebhook: no matching user for', ids, ev.type);
            return Response.json({ ok: true, ignored: 'no_user' }); // 200 so RevenueCat doesn't retry forever
        }

        const info = await fetchRevenueCat(user.id);
        if (info.configured) {
            await saveSubscription(db, user.id, user.email, info, String(ev.type || 'webhook'));
        } else {
            // No secret key yet: fall back to the event itself
            const exp = ev.expiration_at_ms ? Number(ev.expiration_at_ms) : null;
            const ended = ['EXPIRATION', 'REFUND'].includes(ev.type);
            await saveSubscription(db, user.id, user.email, {
                active: !ended && (exp === null || exp > Date.now()),
                entitlement: (ev.entitlement_ids || [])[0] || null,
                product_id: ev.product_id || null,
                expires_at: exp ? new Date(exp).toISOString() : null,
                will_renew: !['CANCELLATION', 'EXPIRATION', 'REFUND'].includes(ev.type),
                store: ev.store || null,
                sandbox: ev.environment === 'SANDBOX',
            }, String(ev.type || 'webhook'));
        }
        return Response.json({ ok: true });
    } catch (e) {
        console.error('revenuecatWebhook', e);
        return Response.json({ error: (e as Error).message }, { status: 500 }); // RevenueCat retries
    }
});
