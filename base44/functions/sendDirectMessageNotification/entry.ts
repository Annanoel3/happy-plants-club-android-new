import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// "Notify on Direct Message" automation (DirectMessage created): push the receiver.
// Oct 20, 2026: the old version trusted whatever was sent to it (receiver, name, text), so
// anyone could push any text to any email. Now it looks the message up by id, like the like
// and comment senders do, and skips blocked pairs and people with notifications off.

// Internal-call token: only our own backend functions can call push senders.
// Derived from an existing secret, so there's nothing extra to configure.
async function internalToken(): Promise<string> {
    const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req, { serviceRole: true });
        const db = base44.asServiceRole.entities;
        const body = await req.json().catch(() => ({}));
        const type = body?.event?.type || body?.event_type;
        const id = body?.data?.id || body?.event?.entity_id || body?.entity_id;
        if (type !== 'create' || !id) return Response.json({ success: false, error: 'Invalid event' }, { status: 400 });

        const msg = (await db.DirectMessage.filter({ id }))?.[0];
        if (!msg || msg.hidden) return Response.json({ success: true, message: 'Skipped: message not found' });
        const to = msg.receiver_email, from = msg.sender_email;
        if (!to || !from || to === from) return Response.json({ success: true, message: 'Skipped: bad message' });
        // Only push once per message (a repeat call with the same id does nothing)
        if (msg.push_sent) return Response.json({ success: true, message: 'Skipped: already sent' });
        const blocked = (await db.Block.filter({ blocker_email: to, blocked_email: from }).catch(() => []))?.length
            || (await db.Block.filter({ blocker_email: from, blocked_email: to }).catch(() => []))?.length;
        if (blocked) return Response.json({ success: true, message: 'Skipped: blocked' });
        const owner = (await db.User.filter({ email: to }))?.[0];
        if (!owner || owner.notifications_enabled === false) return Response.json({ success: true, message: 'Skipped: notifications off' });

        const sender = (await db.User.filter({ email: from }))?.[0];
        const text = String(msg.content || '');
        await db.DirectMessage.update(msg.id, { push_sent: true }).catch(() => {});
        await base44.asServiceRole.functions.invoke('sendNotification', {
            _internal: await internalToken(),
            toUserEmail: to,
            title: '💬 New message',
            body: `${sender?.full_name || 'Someone'}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`,
            screen: `/Messages?chat=${encodeURIComponent(from)}`,
        });
        return Response.json({ success: true, message: 'DM notification sent' });
    } catch (err) {
        console.error('Error sending DM notification:', (err as Error)?.message);
        return Response.json({ success: false, error: (err as Error)?.message }, { status: 500 });
    }
});
