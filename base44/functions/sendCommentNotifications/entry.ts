import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const body = await req.json();
        const { event, data } = body;
        
        if (!event || event.type !== 'create' || !data) {
            return Response.json({ success: false, error: 'Invalid event' }, { status: 400 });
        }
        
        const comment = data;

        try {
            const posts = await base44.entities.Post.filter({ id: comment.post_id });
            if (posts.length === 0 || posts[0].author_email === comment.author_email) {
                return Response.json({ success: true, message: 'Skipped: own comment or post not found' });
            }
            
            const post = posts[0];
            await base44.asServiceRole.functions.invoke('sendNotification', {
                toUserEmail: post.author_email,
                title: `💬 New Comment`,
                body: `${comment.author_name} commented: ${comment.content.substring(0, 50)}...`,
                screen: '/Feed'
            });
            
            return Response.json({ success: true, message: 'Notification sent' });
        } catch (err) {
            console.error('Error sending comment notification:', err);
            return Response.json({ success: false, error: err.message }, { status: 500 });
        }
    } catch (err) {
        return Response.json({ 
            success: false, 
            error: String(err),
            message: err.message
        }, { status: 500 });
    }
});