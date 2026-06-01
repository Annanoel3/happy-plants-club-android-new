// /functions/sendPushNotification (plant app)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  console.log('[sendPushNotification] ========== FUNCTION START ==========');

  try {
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error('[sendPushNotification] Missing credentials');
      return Response.json({
        success: false,
        error: 'OneSignal credentials not configured'
      }, { status: 500 });
    }

    const body = await req.json();
    const { target_email, title, message, url: deeplink } = body;

    if (!target_email || !title || !message) {
      console.error('[sendPushNotification] Missing required fields');
      return Response.json({
        success: false,
        error: 'target_email, title, and message are required'
      }, { status: 400 });
    }

    console.log('[sendPushNotification] Sending to:', target_email, 'title:', title);

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: [String(target_email)],
      channel_for_external_user_ids: 'push',
      headings: { en: title },
      contents: { en: message },
      url: deeplink || undefined,
    };

    console.log('[sendPushNotification] Payload:', JSON.stringify(payload, null, 2));

    const osRes = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const osJson = await osRes.json().catch(() => ({}));

    console.log('[sendPushNotification] Response status:', osRes.status, 'body:', JSON.stringify(osJson));

    if (!osRes.ok) {
      return Response.json(
        { success: false, error: 'OneSignal error', details: osJson },
        { status: 502 }
      );
    }

    console.log('[sendPushNotification] SUCCESS notification_id:', osJson.id);

    return Response.json({ success: true, notification_id: osJson.id });
  } catch (err) {
    console.error('[sendPushNotification] Unexpected error:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});
