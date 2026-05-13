import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TIMEZONE = 'America/Chicago';

function getTodayInCentral() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

function getScheduledSendTime(hour, today) {
    // Build a date string like "2026-05-13T08:00:00" and interpret as Central time
    const dateStr = `${today}T${String(hour).padStart(2, '0')}:00:00`;
    // Use a trick: create date as if UTC, then adjust for Central offset
    const utcDate = new Date(dateStr + 'Z');
    // Get the Central offset at that moment
    const centralFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        timeZoneName: 'shortOffset'
    });
    // Simpler: just get UTC ms for "noon Central" by formatting and reparsing
    // We'll use the offset approach
    const now = new Date();
    const centralNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const offsetMs = now - centralNow; // UTC offset in ms
    
    const centralTarget = new Date(`${today}T${String(hour).padStart(2, '0')}:00:00`);
    const utcTarget = new Date(centralTarget.getTime() + offsetMs);
    return utcTarget;
}

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const secret = url.searchParams.get('secret');
        
        if (secret !== Deno.env.get('CRON_SECRET')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const now = new Date();
        const today = getTodayInCentral();
        
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const rest = Deno.env.get("ONESIGNAL_REST_API_KEY");
        
        if (!appId || !rest) {
            return Response.json({ error: 'Missing OneSignal credentials' }, { status: 500 });
        }
        
        const allPlants = await base44.asServiceRole.entities.Plant.list();
        const userEmails = [...new Set(allPlants.map(p => p.created_by).filter(Boolean))];
        
        let scheduledCount = 0;
        
        for (const userEmail of userEmails) {
            const userPlants = allPlants.filter(p => 
                p.created_by === userEmail && 
                p.next_watering_due && 
                p.next_watering_due <= today
            );
            
            if (userPlants.length === 0) continue;
            
            const existingReminders = await base44.asServiceRole.entities.DailyWateringReminder.filter({
                user_email: userEmail,
                reminder_date: today
            });
            
            const reminder = existingReminders[0];
            
            if (reminder?.dismissed) continue;
            if (reminder?.scheduled_notification_ids?.length > 0) continue;
            
            // Get user's registered devices
            const targetUsers = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            const targetUser = targetUsers[0];
            
            if (!targetUser?.onesignal_player_ids?.length) {
                console.log('No player IDs for user:', userEmail);
                continue;
            }
            
            const plantCount = userPlants.length;
            const plantIds = userPlants.map(p => p.id);
            const plantText = plantCount === 1 ? '1 plant needs' : `${plantCount} plants need`;
            
            const notificationIds = [];
            const scheduleHours = [8, 10, 12, 14, 16, 18, 20];
            
            for (const hour of scheduleHours) {
                const sendTimeUTC = getScheduledSendTime(hour, today);
                const diffSeconds = Math.floor((sendTimeUTC - now) / 1000);
                
                // Only schedule future notifications (at least 2 min from now)
                if (diffSeconds < 120) continue;
                
                const osPayload = {
                    app_id: appId.trim(),
                    include_player_ids: targetUser.onesignal_player_ids,
                    headings: { en: '💧 Watering Reminder' },
                    contents: { en: `${plantText} water today! 🌱` },
                    data: { type: 'watering_reminder', plant_count: plantCount, date: today },
                    send_after: sendTimeUTC.toUTCString()
                };
                
                const osResponse = await fetch("https://onesignal.com/api/v1/notifications", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Basic ${rest.trim()}`
                    },
                    body: JSON.stringify(osPayload)
                });
                
                const osResult = await osResponse.json();
                console.log(`Scheduled ${hour}:00 CT for ${userEmail}: id=${osResult.id}, errors=${JSON.stringify(osResult.errors)}`);
                
                if (osResult.id) {
                    notificationIds.push(osResult.id);
                }
            }
            
            if (reminder) {
                await base44.asServiceRole.entities.DailyWateringReminder.update(reminder.id, {
                    plants_needing_water: plantIds,
                    scheduled_notification_ids: notificationIds
                });
            } else {
                await base44.asServiceRole.entities.DailyWateringReminder.create({
                    user_email: userEmail,
                    reminder_date: today,
                    dismissed: false,
                    plants_needing_water: plantIds,
                    scheduled_notification_ids: notificationIds
                });
            }
            
            if (notificationIds.length > 0) scheduledCount++;
        }
        
        return Response.json({ 
            success: true, 
            users_with_scheduled_reminders: scheduledCount,
            today,
            time: now.toISOString()
        });
        
    } catch (error) {
        console.error('Watering reminder error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});