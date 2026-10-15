import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
        
        const body = await req.json();
        const { event, data } = body;
        
        if (!event || event.type !== 'create' || !data) {
            return Response.json({ success: false, error: 'Invalid event' }, { status: 400 });
        }
        
        const like = data;
        
        const posts = await base44.entities.Post.filter({ id: like.post_id });
        if (posts.length === 0 || posts[0].author_email === like.user_email) {
            return Response.json({ success: true, message: 'Skipped: own like or post not found' });
        }
        
        const post = posts[0];
        const users = await base44.entities.User.filter({ email: like.user_email });
        const userName = users[0]?.full_name || like.user_email;
        
        await base44.asServiceRole.functions.invoke('sendNotification', { _internal: await internalToken(),
            toUserEmail: post.author_email,
            title: `❤️ Post Liked`,
            body: `${userName} liked your post`,
            screen: '/Feed'
        });
        
        return Response.json({ success: true, message: 'Like notification sent' });
    } catch (err) {
        console.error('Error sending like notification:', err);
        return Response.json({ success: false, error: err.message }, { status: 500 });
    }
});