import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all incomplete reminders
        const reminders = await base44.asServiceRole.entities.Reminder.filter({
            completed: false
        });
        
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        for (const reminder of reminders) {
            // Check if reminder is due today and hasn't been sent yet
            if (reminder.due_date === today) {
                const reminderCreator = reminder.created_by_id;
                const user = await base44.asServiceRole.entities.User.filter({ id: reminderCreator });
                
                if (user && user.length > 0) {
                    const userEmail = user[0].email;
                    console.log('Sending reminder notification for:', reminder.title, 'to:', userEmail);
                    
                    // Send notification via OneSignal
                    await base44.asServiceRole.functions.invoke('sendNotification', {
                        user_email: userEmail,
                        title: 'Plant Reminder',
                        message: reminder.title,
                        notification_type: 'reminder'
                    });
                }
            }
        }
        
        return Response.json({ success: true, checked_reminders: reminders.length });
    } catch (error) {
        console.error('sendReminderNotifications error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});