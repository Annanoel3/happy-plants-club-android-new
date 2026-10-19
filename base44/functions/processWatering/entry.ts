import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OneSignal auth: new keys (os_v2_...) use "Key", legacy keys use "Basic".
function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}


// "Today" in the USER's calendar, not the server's (UTC). The app sends localDate
// (YYYY-MM-DD) with every request; without it, fall back to the UTC date.
const __DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function todayFor(body: any): string {
    const d = body?.localDate;
    return (typeof d === 'string' && __DATE_RE.test(d)) ? d : new Date().toISOString().split('T')[0];
}


// Wrapped as a proper backend function (it previously used a frontend-only import,
// which stopped every backend function in this app from deploying).
Deno.serve(async (req) => {
    try {
        const body = await req.json();
        const __body = body;
        const result = await processWatering(req, body || {});
        return Response.json(result);
    } catch (error) {
        return Response.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
    }
});

async function processWatering(req, { plant_id, notes, watering_date }) {
    console.log('🚰 processWatering called with:', { plant_id, notes, watering_date });
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            throw new Error('User not authenticated');
        }

        console.log('✅ User authenticated:', user.email);
        
        if (!plant_id) {
            throw new Error('plant_id is required');
        }

        console.log('🌱 Fetching plant with ID:', plant_id);
        
        const allPlants = await base44.entities.Plant.list('-created_date', 1000);
        const plantData = allPlants.find(p => p.id === plant_id);
        
        if (!plantData) {
            throw new Error('Plant not found');
        }

        console.log('🌿 Plant found:', plantData.name);
        
        const waterDate = watering_date || todayFor(__body);
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

        const nextWatering = new Date(waterDate + 'T12:00:00Z');
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

        // Cancel scheduled watering notifications for this plant
        const today = todayFor(__body);
        const dailyReminders = await base44.entities.DailyWateringReminder.filter({
            user_email: user.email,
            reminder_date: today
        });
        
        if (dailyReminders.length > 0) {
            const reminder = dailyReminders[0];
            
            // Cancel all scheduled OneSignal notifications
            if (reminder.scheduled_notification_ids && reminder.scheduled_notification_ids.length > 0) {
                const onesignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
                const onesignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
                
                for (const notifId of reminder.scheduled_notification_ids) {
                    try {
                        await fetch(`https://api.onesignal.com/notifications/${notifId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': osAuth(onesignalApiKey),
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        });
                    } catch (error) {
                        console.error(`Failed to cancel notification ${notifId}:`, error);
                    }
                }
                
                // Clear scheduled notification IDs from reminder
                await base44.entities.DailyWateringReminder.update(reminder.id, {
                    scheduled_notification_ids: [],
                    plants_needing_water: reminder.plants_needing_water.filter(id => id !== plant_id)
                });
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