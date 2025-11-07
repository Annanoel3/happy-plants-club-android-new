import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

Deno.serve(async (req) => {
    try {
        // This function is invoked by other backend functions via base44.functions.invoke()
        // The SDK handles authentication automatically
        const base44 = createClientFromRequest(req);
        
        const body = await req.json();
        const { toUserEmail, title, body: message, screen } = body;

        if (!toUserEmail || !title || !message) {
            return Response.json({ 
                success: false,
                error: 'Missing required fields: toUserEmail, title, body' 
            }, { status: 400 });
        }

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            return Response.json({ 
                success: false,
                error: 'OneSignal credentials not configured' 
            }, { status: 500 });
        }

        console.log('[sendNotification] Sending to:', toUserEmail);

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                include_aliases: {
                    external_id: [toUserEmail]  // CRITICAL: Must be email, not user.id
                },
                target_channel: 'push',
                headings: { en: title },
                contents: { en: message },
                data: { screen: screen || '/Dashboard' },
                url: screen ? `${screen}` : undefined
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('OneSignal error:', result);
            return Response.json({ 
                success: false,
                error: 'Failed to send notification',
                details: result
            }, { status: 500 });
        }

        console.log('[sendNotification] ✅ Sent successfully');
        return Response.json({ success: true, result });
    } catch (error) {
        console.error('Error in sendNotification:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});