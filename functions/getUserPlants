import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        console.log('🌱 Fetching plants for email:', email);

        // Use service role to get plants by user email
        const plants = await base44.asServiceRole.entities.Plant.filter({ created_by: email });
        
        console.log('📦 Total plants found:', plants.length);
        if (plants.length > 0) {
            console.log('🌿 First plant:', plants[0]);
        }

        // Also try listing all plants to see what's there
        const allPlants = await base44.asServiceRole.entities.Plant.list('-created_date', 10);
        console.log('🔍 Sample of all plants in DB:', allPlants.length);
        if (allPlants.length > 0) {
            console.log('📝 First plant created_by:', allPlants[0].created_by);
        }
        
        return Response.json({ plants: plants || [] });
    } catch (error) {
        console.error('❌ Error getting user plants:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});