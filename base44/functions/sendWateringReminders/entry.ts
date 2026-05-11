import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        // Verify cron secret
        const url = new URL(req.url);
        const secret = url.searchParams.get('secret');
        
        if (secret !== Deno.env.get('CRON_SECRET')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        
        // Get current hour
        const now = new Date();
        const currentHour = now.getHours();
        
        // Only send notifications between 8 AM and 8 PM
        if (currentHour < 8 || currentHour > 20) {
            return Response.json({ message: 'Outside notification hours', skipped: true });
        }

        const today = now.toISOString().split('T')[0];
        
        // Get all users who have plants
        const allPlants = await base44.asServiceRole.entities.Plant.list();
        const userEmails = [...new Set(allPlants.map(p => p.created_by))];
        
        let notificationsSent = 0;
        
        for (const userEmail of userEmails) {
            // Get user's plants that need watering today
            const userPlants = allPlants.filter(p => 
                p.created_by === userEmail && 
                p.next_watering_due === today
            );
            
            if (userPlants.length === 0) continue;
            
            // Check if there's an existing reminder for today
            const existingReminders = await base44.asServiceRole.entities.DailyWateringReminder.filter({
                user_email: userEmail,
                reminder_date: today
            });
            
            const reminder = existingReminders[0];
            
            // If dismissed, skip
            if (reminder?.dismissed) {
                continue;
            }
            
            // Check if we sent a notification in the last 2 hours
            if (reminder?.last_notification_sent) {
                const lastSent = new Date(reminder.last_notification_sent);
                const hoursSinceLastSent = (now - lastSent) / (1000 * 60 * 60);
                
                if (hoursSinceLastSent < 2) {
                    continue; // Too soon, skip
                }
            }
            
            // Create or update reminder
            const plantIds = userPlants.map(p => p.id);
            
            if (reminder) {
                await base44.asServiceRole.entities.DailyWateringReminder.update(reminder.id, {
                    last_notification_sent: now.toISOString(),
                    plants_needing_water: plantIds
                });
            } else {
                await base44.asServiceRole.entities.DailyWateringReminder.create({
                    user_email: userEmail,
                    reminder_date: today,
                    last_notification_sent: now.toISOString(),
                    dismissed: false,
                    plants_needing_water: plantIds
                });
            }
            
            // Send push notification
            const plantCount = userPlants.length;
            const plantText = plantCount === 1 ? '1 plant needs' : `${plantCount} plants need`;
            
            try {
                await base44.asServiceRole.functions.invoke('oneSignalPush', {
                    user_email: userEmail,
                    title: '💧 Watering Reminder',
                    message: `Have you finished watering everyone today? ${plantText} water!`,
                    data: {
                        type: 'watering_reminder',
                        plant_count: plantCount,
                        date: today
                    }
                });
                
                notificationsSent++;
            } catch (error) {
                console.error(`Failed to send notification to ${userEmail}:`, error);
            }
        }
        
        return Response.json({ 
            success: true, 
            notifications_sent: notificationsSent,
            time: now.toISOString()
        });
        
    } catch (error) {
        console.error('Watering reminder error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});