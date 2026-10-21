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
        signal: AbortSignal.timeout(15000),
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

Deno.serve(async (req) => {
    // Base44 only lets "Bearer ..." Authorization headers through, so in RevenueCat set the
    // header to: Bearer <REVENUECAT_WEBHOOK_AUTH>. (?key=<same value> on the URL also works.)
    const expected = (Deno.env.get('REVENUECAT_WEBHOOK_AUTH') || '').trim();
    const got = (req.headers.get('authorization') || '').trim();
    const qkey = new URL(req.url).searchParams.get('key') || '';
    if (!expected || (got !== expected && got !== `Bearer ${expected}` && qkey !== expected)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const body = await req.json();
        const ev = body?.event || {};
        const list = (v: any) => (Array.isArray(v) ? v : []);
        // TRANSFER events have no app_user_id: the purchase moved from transferred_from to
        // transferred_to (e.g. the same Google account signed in to a different Happy Plants
        // account and tapped Restore). Both sides are re-read below, so the old account loses Plus.
        const transferredFrom = new Set(list(ev.transferred_from).filter((x: any) => typeof x === 'string'));
        const ids: string[] = [ev.app_user_id, ev.original_app_user_id, ...list(ev.aliases), ...transferredFrom, ...list(ev.transferred_to)]
            .filter((x: any) => typeof x === 'string' && x && !x.startsWith('$RCAnonymousID'));
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;

        // Our app user ids are Base44 user ids; update every one of them that exists
        const users: any[] = [];
        for (const id of [...new Set(ids)].slice(0, 10)) {
            if (!/^[a-f0-9]{24}$/i.test(id)) continue; // Base44 ids only
            let u: any = null;
            try { u = (await db.User.filter({ id }))?.[0]; } catch { u = null; }
            if (u) users.push(u);
        }
        if (!users.length) {
            console.warn('revenuecatWebhook: no matching user for', ids, ev.type);
            return Response.json({ ok: true, ignored: 'no_user' }); // 200 so RevenueCat doesn't retry forever
        }

        for (const user of users) {
            await syncUser(db, user, ev, transferredFrom.has(user.id));
        }
        return Response.json({ ok: true, users: users.length });
    } catch (e) {
        console.error('revenuecatWebhook', e);
        return Response.json({ error: (e as Error).message }, { status: 500 }); // RevenueCat retries
    }
});

// Re-read one person from RevenueCat and save it. RevenueCat's answer is the truth, so this
// is the same for every event type, including both sides of a TRANSFER.
async function syncUser(db: any, user: any, ev: any, transferredAway: boolean) {
    const event = String(ev.type || 'webhook');
    const info = await fetchRevenueCat(user.id);
    if (info.configured) {
        await saveSubscription(db, user.id, user.email, info, event);
    } else if (ev.type === 'TRANSFER') {
        // No secret key: the event doesn't say what moved, so only switch the old account off
        if (transferredAway) {
            await saveSubscription(db, user.id, user.email, {
                active: false, entitlement: null, product_id: null, expires_at: null,
                will_renew: false, store: null, sandbox: false,
            }, event);
        }
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
        }, event);
    }
}
