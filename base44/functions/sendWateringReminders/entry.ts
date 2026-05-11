import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        // Verify cron secret
        const url = new URL(req.url);
        const secret = url.searchParams.get('secret');
        
        if (secret !== Deno.env.get('CRON_SECRET')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        // Get all users who have plants
        const allPlants = await base44.entities.Plant.list();
        const userEmails = [...new Set(allPlants.map(p => p.created_by))];
        
        let scheduledCount = 0;
        
        for (const userEmail of userEmails) {
            // Get user's plants that need watering today
            const userPlants = allPlants.filter(p => 
                p.created_by === userEmail && 
                p.next_watering_due === today
            );
            
            if (userPlants.length === 0) continue;
            
            // Check if there's an existing reminder for today
            const existingReminders = await base44.entities.DailyWateringReminder.filter({
                user_email: userEmail,
                reminder_date: today
            });
            
            const reminder = existingReminders[0];
            
            // If dismissed, skip
            if (reminder?.dismissed) {
                continue;
            }
            
            // If already has scheduled notifications for today, skip (already scheduled)
            if (reminder?.scheduled_notification_ids && reminder.scheduled_notification_ids.length > 0) {
                continue;
            }
            
            const plantIds = userPlants.map(p => p.id);
            const plantCount = userPlants.length;
            const plantText = plantCount === 1 ? '1 plant needs' : `${plantCount} plants need`;
            
            // Schedule notifications every 2 hours from 8 AM to 8 PM
            const notificationIds = [];
            const scheduleHours = [8, 10, 12, 14, 16, 18, 20];
            
            for (const hour of scheduleHours) {
                const sendTime = new Date(today);
                sendTime.setHours(hour, 0, 0, 0);
                const sendAfterSeconds = Math.floor((sendTime - now) / 1000);
                
                // Only schedule if it's in the future
                if (sendAfterSeconds > 0) {
                    try {
                        const notifResult = await base44.asServiceRole.functions.invoke('oneSignalPush', {
                            user_email: userEmail,
                            title: '💧 Watering Reminder',
                            message: `Have you finished watering everyone today? ${plantText} water!`,
                            data: {
                                type: 'watering_reminder',
                                plant_count: plantCount,
                                date: today
                            },
                            send_after_seconds: sendAfterSeconds
                        });
                        
                        if (notifResult?.data?.notification_id) {
                            notificationIds.push(notifResult.data.notification_id);
                        }
                    } catch (error) {
                        console.error(`Failed to schedule notification at ${hour}:00:`, error);
                    }
                }
            }
            
            // Create or update reminder with scheduled notification IDs
            if (reminder) {
                await base44.entities.DailyWateringReminder.update(reminder.id, {
                    plants_needing_water: plantIds,
                    scheduled_notification_ids: notificationIds
                });
            } else {
                await base44.entities.DailyWateringReminder.create({
                    user_email: userEmail,
                    reminder_date: today,
                    dismissed: false,
                    plants_needing_water: plantIds,
                    scheduled_notification_ids: notificationIds
                });
            }
            
            if (notificationIds.length > 0) {
                scheduledCount++;
            }
        }
        
        return Response.json({ 
            success: true, 
            users_with_scheduled_reminders: scheduledCount,
            time: now.toISOString()
        });
        
    } catch (error) {
        console.error('Watering reminder error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});