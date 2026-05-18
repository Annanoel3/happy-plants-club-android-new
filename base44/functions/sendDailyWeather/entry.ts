import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const allUsers = await base44.asServiceRole.entities.User.list();
        const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
        const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

        let sent = 0;
        let skipped = 0;

        for (const user of allUsers) {
            try {
                // Check if weather notifications are enabled (default: true)
                if (user.notifications_weather === false) {
                    skipped++;
                    continue;
                }

                if (!user.location) {
                    skipped++;
                    continue;
                }

                // Check if this user has a custom weather time set — if so, check if it's their hour
                // The automation runs at 9am CT by default; individual time overrides are handled here
                const now = new Date();
                const userHour = now.getUTCHours(); // compare against their preferred UTC hour if set

                if (user.weather_notification_hour !== undefined && user.weather_notification_hour !== null) {
                    // user.weather_notification_hour is stored in UTC
                    if (userHour !== user.weather_notification_hour) {
                        skipped++;
                        continue;
                    }
                }

                // Get player IDs for this user
                const playerIds = user.onesignal_player_ids;
                if (!playerIds || playerIds.length === 0) {
                    skipped++;
                    continue;
                }

                // Get the weather for this user
                let weatherData;
                try {
                    weatherData = await base44.asServiceRole.functions.invoke('getDailyPlantWeather', {
                        location: user.location,
                        userEmail: user.email
                    });
                } catch (err) {
                    console.error('Error getting weather for user:', user.email, err);
                    skipped++;
                    continue;
                }

                if (!weatherData?.message) {
                    skipped++;
                    continue;
                }

                // Clean the message
                const cleanMessage = weatherData.message
                    .replace(/\[?\(?https?:\/\/[^\s\)]+\)?[\]\)]?/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                // Send push notification via OneSignal
                const payload = {
                    app_id: ONESIGNAL_APP_ID,
                    include_player_ids: playerIds,
                    headings: { en: "🌿 Today's Plant Weather" },
                    contents: { en: cleanMessage },
                    url: `${Deno.env.get('APP_URL') || 'https://happyplants.base44.app'}/?weather=1`,
                    data: { weather: true }
                };

                const response = await fetch('https://onesignal.com/api/v1/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                if (result.errors) {
                    console.error('OneSignal error for user', user.email, result.errors);
                    skipped++;
                } else {
                    sent++;
                }
            } catch (err) {
                console.error('Error processing user:', user.email, err);
                skipped++;
            }
        }

        return Response.json({ success: true, sent, skipped });
    } catch (err) {
        return Response.json({ success: false, error: String(err) }, { status: 500 });
    }
});