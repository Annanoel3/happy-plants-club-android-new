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
        
        if (Math.random() > 0.3) {
            return Response.json({ success: true, triggered: false });
        }

        const eventTypes = ['drought', 'heatwave', 'frost', 'hurricane', 'tornado', 'blizzard', 'flood'];
        const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        
        const plants = await base44.entities.Plant.filter({});
        
        const outdoorPlants = plants.filter(p => 
            p.environment === 'Outdoor' || 
            p.environment === 'Balcony' || 
            p.environment === 'Patio'
        );

        if (outdoorPlants.length === 0) {
            return Response.json({ success: true, triggered: false, reason: 'no_outdoor_plants' });
        }

        const affectedCount = Math.min(3, outdoorPlants.length);
        const affectedPlants = [];
        
        for (let i = 0; i < affectedCount; i++) {
            const plant = outdoorPlants[Math.floor(Math.random() * outdoorPlants.length)];
            if (!affectedPlants.includes(plant.id)) {
                affectedPlants.push(plant.id);
            }
        }

        return Response.json({ 
            success: true, 
            triggered: true,
            event_type: eventType,
            affected_plants: affectedPlants.length,
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