import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Internal-call token: only our own backend functions can call push senders.
// Derived from an existing secret, so there's nothing extra to configure.
async function internalToken(): Promise<string> {
    const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}


Deno.serve(async (req) => {
    try {
        const CRON_SECRET = Deno.env.get('CRON_SECRET');
        
        const url = new URL(req.url);
        const providedSecret = url.searchParams.get('secret') || '';
        
        if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        
        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const today = new Date().toISOString().split('T')[0];
        const reminders = await base44.entities.Reminder.filter({ 
            due_date: today,
            completed: false
        });
        
        let sent = 0;
        let skipped = 0;

        for (const reminder of reminders) {
            try {
                const users = await base44.entities.User.filter({ 
                    email: reminder.created_by 
                });
                
                if (users.length === 0 || users[0].notifications_reminders === false) {
                    skipped++;
                    continue;
                }
                
                const owner = users[0];

                const result = await base44.asServiceRole.functions.invoke('sendNotification', { _internal: await internalToken(),
                    toUserEmail: owner.email,
                    title: `⏰ Reminder: ${reminder.title}`,
                    body: reminder.description || `Don't forget about ${reminder.plant_name}`,
                    screen: '/Schedule'
                });

                if (result?.data?.success) {
                    sent++;
                }

                // If recurring, extend to next occurrence
                if (reminder.is_recurring && reminder.recurrence_type) {
                    const nextDate = new Date(reminder.due_date);
                    if (reminder.recurrence_type === 'daily') {
                        nextDate.setDate(nextDate.getDate() + 1);
                    } else if (reminder.recurrence_type === 'weekly') {
                        nextDate.setDate(nextDate.getDate() + 7);
                    } else if (reminder.recurrence_type === 'biweekly') {
                        nextDate.setDate(nextDate.getDate() + 14);
                    } else if (reminder.recurrence_type === 'monthly') {
                        nextDate.setMonth(nextDate.getMonth() + 1);
                    }
                    
                    await base44.asServiceRole.entities.Reminder.update(reminder.id, {
                        due_date: nextDate.toISOString().split('T')[0]
                    });
                }
            } catch (err) {
                console.error('Error sending custom reminder:', err);
                skipped++;
            }
        }

        return Response.json({ 
            success: true, 
            reminders_count: reminders.length,
            sent: sent,
            skipped: skipped,
            at: new Date().toISOString()
        });
    } catch (err) {
        return Response.json({ 
            success: false, 
            error: String(err),
            message: err.message
        }, { status: 500 });
    }
});