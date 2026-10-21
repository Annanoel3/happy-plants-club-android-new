import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Internal-call token: only our own backend functions can call push senders.
// Derived from an existing secret, so there's nothing extra to configure.
async function internalToken(): Promise<string> {
    const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}


// OneSignal auth: new keys (os_v2_...) use "Key", legacy keys use "Basic".
function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}


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
        if (body?._internal !== await internalToken()) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        const { toUserEmail, title, body: message, screen } = body;

        if (!toUserEmail || !title || !message) {
            console.error('[sendNotification] Missing required fields');
            return Response.json({ 
                success: false,
                error: 'Missing required fields: toUserEmail, title, body' 
            }, { status: 400 });
        }

        const payload = {
            app_id: ONESIGNAL_APP_ID.trim(),
            include_aliases: { external_id: [toUserEmail] }, target_channel: 'push',
            headings: { en: title },
            contents: { en: message },
            data: { screen: screen || '/Dashboard' }
        };

        const response = await fetch('https://api.onesignal.com/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': osAuth(ONESIGNAL_REST_API_KEY.trim())
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch {
            console.error('[sendNotification] Failed to parse OneSignal response, status', response.status);
            return Response.json({ 
                success: false,
                error: 'Invalid response from OneSignal',
                response_text: responseText
            }, { status: 500 });
        }

        // Logs only the status: OneSignal's errors can echo back the recipient's email.
        console.log('[sendNotification] Response status:', response.status);

        if (!result?.id) { // an id means accepted, even if errors lists old unsubscribed devices
            console.error('[sendNotification] OneSignal rejected the push, status', response.status);
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