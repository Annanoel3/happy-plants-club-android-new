import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    console.log('[sendNotification] ========== FUNCTION START ==========');
    
    try {
        const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
        const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            console.error('[sendNotification] Missing credentials');
            return Response.json({ 
                success: false,
                error: 'OneSignal credentials not configured' 
            }, { status: 500 });
        }
        
        const body = await req.json();
        const { toUserEmail, title, body: message, screen } = body;

        if (!toUserEmail || !title || !message) {
            console.error('[sendNotification] Missing required fields');
            return Response.json({ 
                success: false,
                error: 'Missing required fields: toUserEmail, title, body' 
            }, { status: 400 });
        }

        console.log('[sendNotification] Sending to:', toUserEmail, 'title:', title);

        const payload = {
            app_id: ONESIGNAL_APP_ID.trim(),
            include_external_user_ids: [toUserEmail],
            headings: { en: title },
            contents: { en: message },
            channel_for_external_user_ids: 'push',
            data: { screen: screen || '/Dashboard' }
        };

        console.log('[sendNotification] Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY.trim()}`
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch {
            console.error('[sendNotification] Failed to parse response:', responseText);
            return Response.json({ 
                success: false,
                error: 'Invalid response from OneSignal',
                response_text: responseText
            }, { status: 500 });
        }

        console.log('[sendNotification] Response status:', response.status, 'body:', JSON.stringify(result));

        if (!response.ok || result.errors) {
            console.error('[sendNotification] OneSignal error:', result);
            return Response.json({ 
                success: false,
                error: result.errors?.[0] || 'Failed to send notification',
                details: result
            }, { status: 200 });
        }

        console.log('[sendNotification] ✅ SUCCESS notification_id:', result.id || 'unknown');
        return Response.json({ success: true, recipients: result.recipients || 0, notification_id: result.id });
    } catch (error) {
        console.error('[sendNotification] Caught error:', error.message, error.stack?.substring(0, 200));
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});