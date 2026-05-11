import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const CRON_SECRET = Deno.env.get('CRON_SECRET');
        
        const url = new URL(req.url);
        const providedSecret = url.searchParams.get('secret') || '';
        
        if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const plants = await base44.entities.Plant.filter({});
        
        let sent = 0;
        let skipped = 0;

        for (const plant of plants) {
            try {
                const users = await base44.entities.User.filter({ 
                    email: plant.created_by 
                });
                
                if (users.length === 0) {
                    skipped++;
                    continue;
                }
                
                const user = users[0];
                
                if (!user.location || user.notifications_weather === false) {
                    skipped++;
                    continue;
                }
                
                try {
                    await base44.asServiceRole.functions.invoke('getDailyPlantWeather', {
                        plant_id: plant.id,
                        user_email: user.email,
                        location: user.location
                    });
                    sent++;
                } catch (err) {
                    console.error('Error getting weather for plant:', err);
                    skipped++;
                }
            } catch (err) {
                skipped++;
            }
        }

        return Response.json({
            success: true,
            plants_count: plants.length,
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