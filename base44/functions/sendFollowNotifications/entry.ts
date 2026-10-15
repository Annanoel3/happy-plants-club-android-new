import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Internal-call token: only our own backend functions can call push senders.
// Derived from an existing secret, so there's nothing extra to configure.
async function internalToken(): Promise<string> {
    const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}


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
        
        const followRequests = await base44.entities.FollowRequest.filter({ status: 'pending' });
        const recentRequests = followRequests.filter(fr => fr.created_date > fiveMinutesAgo);

        let requestsSent = 0;
        let requestsSkipped = 0;
        
        for (const request of recentRequests) {
            try {
                const targetUsers = await base44.entities.User.filter({ email: request.target_email });
                if (targetUsers.length === 0 || targetUsers[0].notifications_follows === false) {
                    requestsSkipped++;
                    continue;
                }
                
                await base44.asServiceRole.functions.invoke('sendNotification', { _internal: await internalToken(),
                    toUserEmail: request.target_email,
                    title: `👤 New Follow Request`,
                    body: `${request.requester_name || request.requester_email} wants to follow you`,
                    screen: '/FollowRequests'
                });
                requestsSent++;
            } catch (err) {
                console.error('Error sending follow request notification:', err);
                requestsSkipped++;
            }
        }
        
        const allFollows = await base44.entities.Follow.filter({});
        const recentFollows = allFollows.filter(f => f.created_date > fiveMinutesAgo);

        let followersSent = 0;
        let followersSkipped = 0;
        
        for (const follow of recentFollows) {
            try {
                const followingUsers = await base44.entities.User.filter({ email: follow.following_email });
                if (followingUsers.length === 0 || followingUsers[0].notifications_follows === false) {
                    followersSkipped++;
                    continue;
                }
                
                const followerUsers = await base44.entities.User.filter({ email: follow.follower_email });
                await base44.asServiceRole.functions.invoke('sendNotification', { _internal: await internalToken(),
                    toUserEmail: follow.following_email,
                    title: `👥 New Follower`,
                    body: `${followerUsers[0]?.full_name || follow.follower_email} started following you`,
                    screen: '/Feed'
                });
                followersSent++;
            } catch (err) {
                console.error('Error sending follow notification:', err);
                followersSkipped++;
            }
        }
        
        return Response.json({ 
            success: true,
            follow_requests: {
                total: recentRequests.length,
                sent: requestsSent,
                skipped: requestsSkipped
            },
            new_followers: {
                total: recentFollows.length,
                sent: followersSent,
                skipped: followersSkipped
            },
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