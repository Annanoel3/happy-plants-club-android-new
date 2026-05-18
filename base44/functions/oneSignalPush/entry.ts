import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const { user_email, userEmail, title, message, data, send_after_seconds } = body;
        const targetEmail = user_email || userEmail;

        if (!targetEmail || !title || !message) {
            return Response.json({ success: false, error: 'Missing required fields: user_email, title, message' }, { status: 400 });
        }

        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const rest = Deno.env.get("ONESIGNAL_REST_API_KEY");

        if (!appId || !rest) {
            return Response.json({ success: false, error: "Missing OneSignal credentials" }, { status: 500 });
        }

        const payload = {
            app_id: appId.trim(),
            include_aliases: { external_id: [targetEmail] },
            target_channel: 'push',
            headings: { en: title },
            contents: { en: message },
            data: data || {}
        };

        if (send_after_seconds && send_after_seconds > 0) {
            const sendAt = new Date(Date.now() + send_after_seconds * 1000);
            payload.send_after = sendAt.toUTCString();
        }

        console.log('Sending push via external_id to:', targetEmail);

        const response = await fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${rest.trim()}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('OneSignal response:', JSON.stringify(result));

        if (!response.ok || result.errors) {
            return Response.json({
                success: false,
                error: "Failed to send notification",
                details: result
            });
        }

        return Response.json({ 
            success: true,
            recipients: result.recipients || 0,
            notification_id: result.id || null,
            data: result
        });

    } catch (error) {
        console.error('[OneSignal] Send error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});