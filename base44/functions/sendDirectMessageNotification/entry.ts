import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// "Notify on Direct Message" automation (DirectMessage created): push the receiver.
// Direct messages are off for now (DMS_OPEN in functions/community and pages/Messages.jsx:
// there's no inbox in the app yet, so the push led nowhere). While they're off this does
// nothing. Turn the automation off to stop paying for its runs.
// When DMs open again: it looks the message up by id, skips blocked pairs and people with
// notifications off, and only pushes once per message.
const DMS_OPEN = false;

async function internalToken(): Promise<string> {
    const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// A name that's just the start of someone's email would give the email away
const nameOf = (u: any) => {
    const n = String(u?.full_name || '').trim();
    const local = String(u?.email || '').split('@')[0].toLowerCase();
    if (n && n.toLowerCase() !== local) return n;
    return u?.handle || 'Someone';
};

Deno.serve(async (req) => {
    if (!DMS_OPEN) return Response.json({ success: true, message: 'Skipped: direct messages are off' });
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
            body: `${nameOf(sender)}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`,
            // by user id: an email in the link would land on the phone
            screen: sender?.id ? `/Messages?chat=${sender.id}` : '/Feed',
        });
        return Response.json({ success: true, message: 'DM notification sent' });
    } catch (err) {
        console.error('[sendDirectMessageNotification] error:', (err as Error)?.message);
        return Response.json({ success: false, error: 'server' }, { status: 500 });
    }
});
