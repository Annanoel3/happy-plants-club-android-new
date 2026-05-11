import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const CRON_SECRET = Deno.env.get('CRON_SECRET');
        
        const url = new URL(req.url);
        const providedSecret = url.searchParams.get('secret') || '';
        
        if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const comments = await base44.entities.Comment.filter({});
        const recentComments = comments.filter(c => c.created_date > fiveMinutesAgo);

        let sent = 0;
        let skipped = 0;
        
        for (const comment of recentComments) {
            try {
                const posts = await base44.entities.Post.filter({ id: comment.post_id });
                if (posts.length === 0 || posts[0].author_email === comment.author_email) {
                    skipped++;
                    continue;
                }
                
                const post = posts[0];
                await base44.asServiceRole.functions.invoke('sendNotification', {
                    toUserEmail: post.author_email,
                    title: `💬 New Comment`,
                    body: `${comment.author_name} commented: ${comment.content.substring(0, 50)}...`,
                    screen: '/Feed'
                });
                sent++;
            } catch (err) {
                console.error('Error sending comment notification:', err);
                skipped++;
            }
        }
        
        return Response.json({ 
            success: true,
            comments_count: recentComments.length,
            sent: sent,
            skipped: skipped,
            at: new Date().toISOString()
        });
    } catch (err) {
        return Response.json({ 
            success: false, 
            error: String(err),
            message: err.message
        }, { status: 500 });
    }
});