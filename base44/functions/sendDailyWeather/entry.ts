import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const plants = await base44.asServiceRole.entities.Plant.list();
        const userMap = {};
        
        // Pre-fetch all users to avoid repeated queries
        const allUsers = await base44.asServiceRole.entities.User.list();
        allUsers.forEach(u => {
            userMap[u.email] = u;
        });
        
        let sent = 0;
        let skipped = 0;

        for (const plant of plants) {
            try {
                const user = userMap[plant.created_by];
                
                if (!user || !user.location || user.daily_weather_notifications === false) {
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