// Temporary diagnostic: looks up a user in OneSignal by external_id (their email),
// reports their push subscriptions, and optionally sends a test push via include_aliases.
// Guarded by a one-off header so it can't be used to spam anyone.
const DIAG_TOKEN = 'hp-diag-5f3c9a1e7b';

Deno.serve(async (req) => {
    if (req.headers.get('x-diag') !== DIAG_TOKEN) {
        return Response.json({ error: 'nope' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '');
    const send = !!body.send;
    const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
    const rest = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    const out: Record<string, unknown> = { appIdSet: !!appId, keySet: !!rest, keyPrefix: rest.slice(0, 6), keyLen: rest.length };

    const auth = rest.startsWith('os_v2') ? `Key ${rest}` : `Basic ${rest}`;
    out.authStyle = auth.split(' ')[0];

    // 1) Who does OneSignal think this email is?
    const u = await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(email)}`, {
        headers: { Authorization: auth, accept: 'application/json' },
    });
    const uj = await u.json().catch(() => ({}));
    out.userLookup = { status: u.status, identity: uj.identity, subscriptions: (uj.subscriptions || []).map((s: any) => ({ id: s.id, type: s.type, enabled: s.enabled, notification_types: s.notification_types, device_model: s.device_model, app_version: s.app_version, last_active: s.last_active })) };

    // 2) Optionally send a test push the new way.
    if (send) {
        const r = await fetch('https://api.onesignal.com/notifications?c=push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify({
                app_id: appId,
                include_aliases: { external_id: [email] },
                target_channel: 'push',
                headings: { en: '🌱 Happy Plants test' },
                contents: { en: 'If you can see this, notifications are back.' },
            }),
        });
        out.send = { status: r.status, body: await r.json().catch(() => ({})) };
    }
    return Response.json(out);
});
