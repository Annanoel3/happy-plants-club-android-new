import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Follow pushes, run by two automations:
//   "Notify on Follow Request" (FollowRequest created) → "X wants to follow you"
//   "Notify on New Follower"   (Follow created)        → "X started following you"
// (This used to check every 5 minutes with a secret, but nothing ever ran it, so no
// follow notification was ever sent.) Checks the record really exists and skips people
// who turned notifications or follow notifications off.

// Internal-call token: only our own backend functions can call push senders.
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
        const data = body?.data || {};
        const id = data.id || body?.event?.entity_id || body?.entity_id;
        const entity = body?.event?.entity_name || body?.entity_name || (data.requester_email ? 'FollowRequest' : data.follower_email ? 'Follow' : '');
        if (type !== 'create' || !id) return Response.json({ success: false, error: 'Invalid event' }, { status: 400 });

        const wantsPush = async (email: string) => {
            const u = (await db.User.filter({ email }))?.[0];
            return !u || (u.notifications_enabled !== false && u.notifications_follows !== false);
        };
        const send = async (to: string, title: string, text: string, screen: string) =>
            base44.asServiceRole.functions.invoke('sendNotification', { _internal: await internalToken(), toUserEmail: to, title, body: text, screen });

        if (entity === 'FollowRequest') {
            const r = (await db.FollowRequest.filter({ id }))?.[0];
            if (!r || r.status !== 'pending' || !r.target_email) return Response.json({ success: true, message: 'Skipped: no pending request' });
            if (!(await wantsPush(r.target_email))) return Response.json({ success: true, message: 'Skipped: notifications off' });
            await send(r.target_email, '👤 New follow request', `${r.requester_name || 'Someone'} wants to follow you`, '/FollowRequests');
            return Response.json({ success: true, message: 'Follow request notification sent' });
        }
        if (entity === 'Follow') {
            const f = (await db.Follow.filter({ id }))?.[0];
            if (!f || !f.following_email || f.following_email === f.follower_email) return Response.json({ success: true, message: 'Skipped: no follow' });
            if (!(await wantsPush(f.following_email))) return Response.json({ success: true, message: 'Skipped: notifications off' });
            const follower = (await db.User.filter({ email: f.follower_email }))?.[0];
            await send(f.following_email, '👥 New follower', `${follower?.full_name || 'Someone'} started following you`, '/MyProfile');
            return Response.json({ success: true, message: 'New follower notification sent' });
        }
        return Response.json({ success: true, message: 'Skipped: unknown entity' });
    } catch (err) {
        console.error('follow notification error', (err as Error)?.message);
        return Response.json({ success: false, error: (err as Error)?.message }, { status: 500 });
    }
});
