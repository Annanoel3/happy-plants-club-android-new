import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

Deno.serve(async (req) => {
    try {
        // Authenticate the user making the request
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { toUserEmail, title, body, minutesFromNow } = await req.json();

        if (!toUserEmail || !title || !body || minutesFromNow === undefined) {
            return Response.json({
                success: false,
                error: 'Missing required fields: toUserEmail, title, body, minutesFromNow'
            }, { status: 400 });
        }

        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            return Response.json({
                success: false,
                error: 'OneSignal credentials not configured'
            }, { status: 500 });
        }

        // Calculate send time
        const sendTime = new Date();
        sendTime.setMinutes(sendTime.getMinutes() + minutesFromNow);
        const sendAfter = sendTime.toISOString();

        console.log(`📅 Scheduling push for ${toUserEmail} at ${sendAfter}`);

        // Send scheduled notification via OneSignal
        const osRes = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                include_aliases: {
                    external_id: [toUserEmail]  // CRITICAL: Must be email, not user.id
                },
                target_channel: 'push',
                headings: { en: title },
                contents: { en: body },
                send_after: sendAfter
            }),
        });

        const osJson = await osRes.json().catch(() => ({}));

        if (!osRes.ok) {
            console.error('❌ OneSignal error:', osJson);
            return Response.json({
                success: false,
                error: 'OneSignal scheduling failed',
                details: osJson
            }, { status: 502 });
        }

        console.log('✅ Push scheduled successfully');

        return Response.json({
            success: true,
            scheduled_for: sendAfter,
            onesignal_response: osJson
        });
    } catch (err) {
        console.error('❌ Error in schedulePush:', err);
        return Response.json({
            success: false,
            error: String(err)
        }, { status: 500 });
    }
});