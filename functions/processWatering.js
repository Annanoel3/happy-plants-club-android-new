import { base44 } from '@/api/base44Client';

export async function processWatering({ plant_id, notes, watering_date }) {
    console.log('🚰 processWatering called with:', { plant_id, notes, watering_date });
    
    try {
        const user = await base44.auth.me();
        
        if (!user) {
            throw new Error('User not authenticated');
        }

        console.log('✅ User authenticated:', user.email);
        
        if (!plant_id) {
            throw new Error('plant_id is required');
        }

        console.log('🌱 Fetching plant with ID:', plant_id);
        
        const allPlants = await base44.entities.Plant.list();
        const plantData = allPlants.find(p => p.id === plant_id);
        
        if (!plantData) {
            throw new Error('Plant not found');
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

        const nextWatering = new Date(waterDate);
        nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

        console.log('💧 Updating plant...');

        await base44.entities.Plant.update(plant_id, {
            last_watered: waterDate,
            next_watering_due: nextWatering.toISOString().split('T')[0],
            total_waterings: newTotalWaterings,
            growth_stage: newGrowthStage,
            status: 'healthy',
        });

        console.log('✅ Plant updated');

        await base44.entities.WateringLog.create({
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

        await base44.auth.updateMe({
            lifetime_waterings: newLifetimeWaterings,
            current_tier: tier,
            total_plant_growths: newTotalPlantGrowths,
        });

        console.log('✅ User stats updated');

        const events = await base44.entities.GameEvent.filter({
            resolved: false,
        });

        const plantEvents = events.filter(e =>
            e.affected_plant_ids && e.affected_plant_ids.includes(plant_id)
        );

        if (plantEvents.length > 0) {
            for (const event of plantEvents) {
                const remainingPlants = event.affected_plant_ids.filter(id => id !== plant_id);
                if (remainingPlants.length === 0) {
                    await base44.entities.GameEvent.update(event.id, {
                        resolved: true,
                    });
                } else {
                    await base44.entities.GameEvent.update(event.id, {
                        affected_plant_ids: remainingPlants,
                    });
                }
            }
        }

        console.log('🎉 Watering complete!');
        
        return {
            success: true,
            grew: grewThisWatering,
            growth_stage: newGrowthStage,
            new_tier: tier,
            tier_changed: tier !== user.current_tier,
            total_waterings: newLifetimeWaterings,
            total_plant_growths: newTotalPlantGrowths,
        };
    } catch (error) {
        console.error('💥 Error in processWatering:', error);
        throw error;
    }
}