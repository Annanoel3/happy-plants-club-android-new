import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
        
        await base44.asServiceRole.functions.invoke('sendNotification', {
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