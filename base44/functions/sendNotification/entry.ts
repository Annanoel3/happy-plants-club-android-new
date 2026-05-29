import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ 
                success: false, 
                error: 'Unauthorized' 
            }, { status: 401 });
        }

        const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
        const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            return Response.json({ 
                success: false,
                error: 'OneSignal credentials not configured' 
            }, { status: 500 });
        }
        
        const body = await req.json();
        const { toUserEmail, title, body: message, screen } = body;

        if (!toUserEmail || !title || !message) {
            return Response.json({ 
                success: false,
                error: 'Missing required fields: toUserEmail, title, body' 
            }, { status: 400 });
        }

        console.log('[sendNotification] Sending to:', toUserEmail);

        const payload = {
            app_id: ONESIGNAL_APP_ID.trim(),
            include_aliases: {
                external_id: [toUserEmail]
            },
            headings: { en: title },
            contents: { en: message },
            data: { screen: screen || '/Dashboard' }
        };

        console.log('[sendNotification] Sending payload:', JSON.stringify(payload, null, 2));

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY.trim()}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || result.errors) {
            console.error('[sendNotification] OneSignal error:', result);
            return Response.json({ 
                success: false,
                error: result.errors?.[0] || 'Failed to send notification',
                details: result
            }, { status: 500 });
        }

        console.log('[sendNotification] ✅ SUCCESS notification_id:', result.id || 'unknown');
        return Response.json({ success: true, recipients: result.recipients || 0, notification_id: result.id });
    } catch (error) {
        console.error('[sendNotification] Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});