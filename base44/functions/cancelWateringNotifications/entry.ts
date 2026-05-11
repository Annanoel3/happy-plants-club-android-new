import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const body = await req.json();
        const { user_email, plant_id } = body;
        
        if (!user_email || !plant_id) {
            return Response.json({ error: 'Missing user_email or plant_id' }, { status: 400 });
        }

        const today = new Date().toISOString().split('T')[0];
        const dailyReminders = await base44.entities.DailyWateringReminder.filter({
            user_email: user_email,
            reminder_date: today
        });
        
        if (dailyReminders.length === 0) {
            return Response.json({ success: true, cancelled: 0 });
        }

        const reminder = dailyReminders[0];
        
        // Cancel all scheduled OneSignal notifications
        let cancelledCount = 0;
        if (reminder.scheduled_notification_ids && reminder.scheduled_notification_ids.length > 0) {
            const onesignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
            
            for (const notifId of reminder.scheduled_notification_ids) {
                try {
                    await fetch(`https://onesignal.com/api/v1/notifications/${notifId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Basic ${onesignalApiKey}`,
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    });
                    cancelledCount++;
                } catch (error) {
                    console.error(`Failed to cancel notification ${notifId}:`, error);
                }
            }
        }
        
        // Update reminder to clear notification IDs and remove plant from list
        const remainingPlants = reminder.plants_needing_water ? reminder.plants_needing_water.filter(id => id !== plant_id) : [];
        
        await base44.entities.DailyWateringReminder.update(reminder.id, {
            scheduled_notification_ids: [],
            plants_needing_water: remainingPlants
        });
        
        return Response.json({ success: true, cancelled: cancelledCount });
    } catch (error) {
        console.error('Error canceling notifications:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});