import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    console.log('[manageScheduledNotification] ========== FUNCTION START ==========');
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action, toUserEmail, title, body: messageBody, scheduleTime, recurrenceType, onesignalNotificationId } = await req.json();
        
        if (!action) {
            return Response.json({ error: 'action is required (create or cancel)' }, { status: 400 });
        }

        const appId = Deno.env.get("ONESIGNAL_APP_ID")?.trim();
        const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY")?.trim();

        if (!appId || !restApiKey) {
            return Response.json({ error: 'Missing OneSignal environment variables.' }, { status: 500 });
        }

        if (action === 'cancel') {
            // Cancel a scheduled notification
            if (!onesignalNotificationId) {
                return Response.json({ error: 'onesignalNotificationId is required to cancel' }, { status: 400 });
            }

            console.log('[manageScheduledNotification] Canceling notification:', onesignalNotificationId);

            const cancelResponse = await fetch(`https://onesignal.com/api/v1/notifications/${onesignalNotificationId}?app_id=${appId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${restApiKey}`
                }
            });

            const cancelResult = await cancelResponse.json().catch(() => ({}));

            if (!cancelResponse.ok) {
                console.error('[manageScheduledNotification] Cancel error:', cancelResult);
                return Response.json({
                    success: false,
                    error: 'Failed to cancel notification',
                    details: cancelResult
                }, { status: 200 });
            }

            console.log('[manageScheduledNotification] ========== CANCELLED ==========');
            return Response.json({ success: true, message: 'Notification cancelled' });
        }

        if (action === 'create') {
            // Create a scheduled/recurring notification
            if (!toUserEmail || !title || !messageBody || !scheduleTime) {
                return Response.json({ error: 'Missing required fields: toUserEmail, title, body, scheduleTime' }, { status: 400 });
            }

            const notificationPayload = {
                app_id: appId,
                include_external_user_ids: [toUserEmail],
                headings: { en: title },
                contents: { en: messageBody },
                channel_for_external_user_ids: 'push'
            };

            // Handle scheduling
            const scheduleDate = new Date(scheduleTime);
            notificationPayload.send_after = scheduleDate.toISOString();

            // Handle recurrence
            if (recurrenceType === 'every_two_hours') {
                notificationPayload.throttle_rate_per_minute = 1; // Respect rate limiting
                // Note: OneSignal doesn't have built-in recurring at this interval
                // Client should re-schedule if needed
                console.log('[manageScheduledNotification] Every 2 hours selected - client must re-schedule');
            } else if (recurrenceType === 'daily') {
                notificationPayload.throttle_rate_per_minute = 1;
            }

            console.log('[manageScheduledNotification] Creating scheduled notification:', JSON.stringify(notificationPayload, null, 2));

            const response = await fetch('https://onesignal.com/api/v1/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${restApiKey}`
                },
                body: JSON.stringify(notificationPayload)
            });

            const result = await response.json();

            if (!response.ok || result.errors) {
                console.error('[manageScheduledNotification] OneSignal error:', result);
                return Response.json({
                    success: false,
                    error: result.errors?.[0] || 'Failed to schedule notification',
                    details: result
                }, { status: 200 });
            }

            console.log('[manageScheduledNotification] ========== CREATED ==========', result.id);
            return Response.json({ 
                success: true, 
                notificationId: result.id,
                scheduledFor: scheduleDate.toISOString()
            });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        console.error('[manageScheduledNotification] Error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});