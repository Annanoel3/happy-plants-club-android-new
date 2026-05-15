import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const url = new URL(req.url);
        const daysInactive = parseInt(url.searchParams.get('days_inactive') || '7');
        
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const rest = Deno.env.get("ONESIGNAL_REST_API_KEY");
        
        if (!appId || !rest) {
            return Response.json({ error: 'Missing OneSignal credentials' }, { status: 500 });
        }
        
        const allUsers = await base44.asServiceRole.entities.User.list();
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - daysInactive * 24 * 60 * 60 * 1000);
        
        let sentCount = 0;
        
        for (const user of allUsers) {
            if (!user.onesignal_player_ids?.length) continue;
            
            const lastOpen = user.last_app_open ? new Date(user.last_app_open) : null;
            if (!lastOpen || lastOpen > cutoffDate) continue;
            
            const messages = {
                7: "Your garden misses you! 🌱",
                14: "Did you know Happy Plants has AI plant care advice?"
            };
            
            const message = messages[daysInactive] || `We haven't seen you in ${daysInactive} days!`;
            
            try {
                const osPayload = {
                    app_id: appId.trim(),
                    include_player_ids: user.onesignal_player_ids,
                    headings: { en: '👋 Welcome Back' },
                    contents: { en: message },
                    data: { type: 'inactivity', days: daysInactive }
                };
                
                await fetch("https://onesignal.com/api/v1/notifications", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Basic ${rest.trim()}`
                    },
                    body: JSON.stringify(osPayload)
                });
                
                sentCount++;
            } catch (err) {
                console.error(`Error sending inactivity notification to ${user.email}:`, err);
            }
        }
        
        return Response.json({
            success: true,
            days_inactive: daysInactive,
            notifications_sent: sentCount,
            time: now.toISOString()
        });
    } catch (error) {
        console.error('Inactivity notification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});