// /functions/sendPushNotification (plant app)
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const CRON_SECRET = Deno.env.get('CRON_SECRET'); // set in Base44 Environment (Server/Functions)
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID'); // set in Base44 Environment (Server/Functions)
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY'); // set in Base44 Environment (Server/Functions)

Deno.serve(async (req) => {
  try {
    // 1) Shared-secret auth (server-to-server)
    const url = new URL(req.url);
    const providedSecret =
      req.headers.get('X-Secret') || url.searchParams.get('secret') || '';

    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2) Service-role client (do NOT use auth.me() here)
    const base44 = createClientFromRequest(req, { serviceRole: true });

    // 3) Parse payload
    const { target_email, title, message, url: deeplink } = await req.json();

    if (!target_email || !title || !message) {
      return Response.json(
        { success: false, error: 'target_email, title, and message are required' },
        { status: 400 }
      );
    }

    // 4) Check env
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return Response.json(
        { success: false, error: 'OneSignal env vars not configured' },
        { status: 500 }
      );
    }

    // 5) Send via OneSignal using external_id
    const osRes = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // IMPORTANT: OneSignal v1 uses REST API Key in Basic header (no "Bearer")
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: [target_email] },
        target_channel: 'push',
        headings: { en: title },
        contents: { en: message },
        url: deeplink || undefined, // optional
      }),
    });

    const osJson = await osRes.json().catch(() => ({}));

    if (!osRes.ok) {
      // Pass through OneSignal error details
      return Response.json(
        { success: false, error: 'OneSignal error', details: osJson },
        { status: 502 }
      );
    }

    return Response.json({ success: true, onesignal: osJson });
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});