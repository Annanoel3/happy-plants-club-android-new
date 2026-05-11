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
        
        const today = new Date();
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(today.getDate() - 3);
        const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];
        
        const plants = await base44.entities.Plant.filter({});
        
        let wiltedCount = 0;
        
        for (const plant of plants) {
            if (!plant.next_watering_due) continue;
            
            if (plant.next_watering_due < threeDaysAgoStr && plant.status !== 'wilted') {
                await base44.asServiceRole.entities.Plant.update(plant.id, { status: 'wilted' });
                wiltedCount++;
                
                try {
                    await base44.asServiceRole.functions.invoke('sendNotification', {
                        toUserEmail: plant.created_by,
                        title: `⚠️ Plant Alert: ${plant.name}`,
                        body: `${plant.name} hasn't been watered in 3+ days and may be wilting`,
                        screen: '/PlantDetail'
                    });
                } catch (err) {
                    console.error('Error notifying about wilted plant:', err);
                }
            }
        }

        return Response.json({ 
            success: true,
            plants_count: plants.length,
            wilted_plants: wiltedCount,
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