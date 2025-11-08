import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('✅ User authenticated:', user.email);

        const body = await req.json();
        console.log('📦 Request body:', body);
        
        const { plant_id, notes, watering_date } = body;

        if (!plant_id) {
            console.error('❌ No plant_id provided');
            return Response.json({ error: 'plant_id is required' }, { status: 400 });
        }

        console.log('🌱 Fetching plant with ID:', plant_id);
        
        // Try to get all plants first to debug
        const allPlants = await base44.asServiceRole.entities.Plant.list();
        console.log('📊 Total plants in database:', allPlants.length);
        console.log('🔍 Looking for plant_id:', plant_id);
        
        // Find the plant manually
        const plantData = allPlants.find(p => p.id === plant_id);
        
        if (!plantData) {
            console.error('❌ Plant not found. Available plant IDs:', allPlants.map(p => p.id));
            return Response.json({ 
                error: 'Plant not found',
                plant_id: plant_id,
                available_ids: allPlants.map(p => p.id)
            }, { status: 404 });
        }

        console.log('🌿 Plant found:', plantData.name);
        
        const waterDate = watering_date || new Date().toISOString().split('T')[0];
        const newTotalWaterings = (plantData.total_waterings || 0) + 1;

        let newGrowthStage = plantData.growth_stage || 'seedling';
        let grewThisWatering = false;

        if (newTotalWaterings >= 20 && newGrowthStage !== 'mature') {
            newGrowthStage = 'mature';
            grewThisWatering = true;
        } else if (newTotalWaterings >= 15 && newGrowthStage !== 'large' && newGrowthStage !== 'mature') {
            newGrowthStage = 'large';
            grewThisWatering = true;
        } else if (newTotalWaterings >= 10 && newGrowthStage !== 'medium' && newGrowthStage !== 'large' && newGrowthStage !== 'mature') {
            newGrowthStage = 'medium';
            grewThisWatering = true;
        } else if (newTotalWaterings >= 5 && newGrowthStage !== 'small' && newGrowthStage !== 'medium' && newGrowthStage !== 'large' && newGrowthStage !== 'mature') {
            newGrowthStage = 'small';
            grewThisWatering = true;
        }

        // Calculate next watering FROM THE ACTUAL WATERING DATE, not from today
        const nextWatering = new Date(waterDate);
        nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

        console.log('💧 Updating plant with:', {
            last_watered: waterDate,
            next_watering_due: nextWatering.toISOString().split('T')[0],
            total_waterings: newTotalWaterings,
            growth_stage: newGrowthStage,
            status: 'healthy',
        });

        await base44.asServiceRole.entities.Plant.update(plant_id, {
            last_watered: waterDate,
            next_watering_due: nextWatering.toISOString().split('T')[0],
            total_waterings: newTotalWaterings,
            growth_stage: newGrowthStage,
            status: 'healthy',
        });

        console.log('✅ Plant updated successfully');

        console.log('📝 Creating watering log...');
        await base44.asServiceRole.entities.WateringLog.create({
            plant_id: plant_id,
            plant_name: plantData.name,
            watered_date: waterDate,
            method: 'manual',
            notes: notes || null,
        });

        console.log('✅ Watering log created');

        const newLifetimeWaterings = (user.lifetime_waterings || 0) + 1;
        let newTotalPlantGrowths = (user.total_plant_growths || 0);

        if (grewThisWatering) {
            newTotalPlantGrowths++;
        }

        let tier = 'New Sprout';

        if (newLifetimeWaterings >= 200) {
            tier = 'Legendary Botanist';
        } else if (newLifetimeWaterings >= 100) {
            tier = 'Plant Whisperer';
        } else if (newLifetimeWaterings >= 50) {
            tier = 'Master Gardener';
        } else if (newLifetimeWaterings >= 25) {
            tier = 'Gold Thumb';
        } else if (newLifetimeWaterings >= 10) {
            tier = 'Green Thumb';
        }

        console.log('👤 Updating user stats...');
        await base44.auth.updateMe({
            lifetime_waterings: newLifetimeWaterings,
            current_tier: tier,
            total_plant_growths: newTotalPlantGrowths,
        });

        console.log('✅ User stats updated');

        // Handle game events
        const events = await base44.asServiceRole.entities.GameEvent.filter({
            resolved: false,
        });

        const plantEvents = events.filter(e =>
            e.affected_plant_ids && e.affected_plant_ids.includes(plant_id)
        );

        if (plantEvents.length > 0) {
            console.log('🎮 Resolving game events...');
            for (const event of plantEvents) {
                const remainingPlants = event.affected_plant_ids.filter(id => id !== plant_id);
                if (remainingPlants.length === 0) {
                    await base44.asServiceRole.entities.GameEvent.update(event.id, {
                        resolved: true,
                    });
                } else {
                    await base44.asServiceRole.entities.GameEvent.update(event.id, {
                        affected_plant_ids: remainingPlants,
                    });
                }
            }
            console.log('✅ Game events resolved');
        }

        console.log('🎉 Watering complete!');
        return Response.json({
            success: true,
            grew: grewThisWatering,
            growth_stage: newGrowthStage,
            new_tier: tier,
            tier_changed: tier !== user.current_tier,
            total_waterings: newLifetimeWaterings,
            total_plant_growths: newTotalPlantGrowths,
        });
    } catch (error) {
        console.error('💥 Error in processWatering:', error);
        console.error('Stack:', error.stack);
        return Response.json({ 
            error: error.message,
            stack: error.stack,
            details: String(error)
        }, { status: 500 });
    }
});