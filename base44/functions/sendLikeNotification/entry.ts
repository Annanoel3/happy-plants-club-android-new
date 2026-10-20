import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// "Notify on Post Like" automation (Like created): push the post's author.
// Checks the like really exists (so a made-up request can't send pushes) and skips
// people who turned notifications off. The in-app notification is created by the app.

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

        const like = (await db.Like.filter({ id }))?.[0];
        if (!like) return Response.json({ success: true, message: 'Skipped: like not found' });
        const post = (await db.Post.filter({ id: like.post_id }))?.[0];
        const to = post?.author_email || post?.created_by;
        if (!post || !to || to === like.user_email) return Response.json({ success: true, message: 'Skipped: own like or post not found' });
        const owner = (await db.User.filter({ email: to }))?.[0];
        if (owner && owner.notifications_enabled === false) return Response.json({ success: true, message: 'Skipped: notifications off' });

        const liker = (await db.User.filter({ email: like.user_email }))?.[0];
        await base44.asServiceRole.functions.invoke('sendNotification', {
            _internal: await internalToken(),
            toUserEmail: to,
            title: '❤️ Post liked',
            body: `${liker?.full_name || 'Someone'} liked your post`,
            screen: '/Feed',
        });
        return Response.json({ success: true, message: 'Like notification sent' });
    } catch (err) {
        console.error('Error sending like notification:', (err as Error)?.message);
        return Response.json({ success: false, error: (err as Error)?.message }, { status: 500 });
    }
});
