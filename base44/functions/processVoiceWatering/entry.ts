import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.20.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { transcript } = await req.json();

        const plantsResult = await base44.entities.Plant.list();
        const plants = Array.isArray(plantsResult) ? plantsResult : [];
        const plantsListStr = plants.map(p => `${p.name} (ID: ${p.id})`).join(', ');

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Parse watering logs and reminders from the transcript.
                    Available plants: ${plantsListStr}
                    Current time: ${new Date().toISOString()}
                    
                    Watering examples:
                    - "I watered everything except the Monstera" -> water all but Monstera
                    - "I watered the Snake Plant and Pothos" -> water only those two
                    - "Watered all plants" -> water all
                    - "Just watered my ferns" -> water matching plants
                    
                    Reminder examples (parse natural language):
                    - "Remind me to trim the bonsai tomorrow at 2pm" -> tomorrow at 14:00
                    - "Remind me to fertilize in an hour" -> current time + 1 hour
                    - "Bring plants inside at 5pm" -> today at 17:00
                    - "Water the cactus next week" -> 7 days from today
                    - "Check on the monstera on Friday" -> next Friday date
                    
                    IMPORTANT for reminders:
                    - Always parse the exact time (if mentioned) or set a reasonable default time (9am)
                    - Use America/Chicago timezone (UTC-5 or UTC-6 depending on DST)
                    - Return due_date as "YYYY-MM-DD" and due_time as "HH:MM" in 24-hour format
                    - If plant mentioned in reminder, match against available plants
                    - Otherwise set plant_id to null and plant_name to "General"
                    
                    Return JSON:
                    {
                        "watered_plant_ids": ["id1", "id2"],
                        "reminders": [
                            {
                                "plant_id": "id or null",
                                "plant_name": "exact plant name or 'General'",
                                "title": "brief action title",
                                "description": "full reminder details",
                                "due_date": "YYYY-MM-DD",
                                "due_time": "HH:MM"
                            }
                        ],
                        "notes": "summary message"
                    }`
                },
                {
                    role: "user",
                    content: transcript
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        const today = new Date().toISOString().split('T')[0];
        
        const wateredIds = Array.isArray(result.watered_plant_ids) ? result.watered_plant_ids : [];
        
        // Handle watering
        for (const plantId of wateredIds) {
            const plant = plants.find(p => p.id === plantId);
            if (plant) {
                await base44.asServiceRole.entities.WateringLog.create({
                    plant_id: plantId,
                    plant_name: plant.name,
                    watered_date: today,
                    method: 'voice',
                    notes: result.notes
                });

                const nextWatering = new Date();
                nextWatering.setDate(nextWatering.getDate() + (plant.water_frequency_days || 7));
                
                await base44.asServiceRole.entities.Plant.update(plantId, {
                    last_watered: today,
                    next_watering_due: nextWatering.toISOString().split('T')[0]
                });
            }
        }

        // Handle reminders
        const reminders = result.reminders || [];
        for (const reminder of reminders) {
            await base44.asServiceRole.entities.Reminder.create({
                plant_id: reminder.plant_id || null,
                plant_name: reminder.plant_name || 'General',
                title: reminder.title,
                description: reminder.description || '',
                due_date: reminder.due_date,
                completed: false
            });
        }

        let summary = result.notes || '';
        if (wateredIds.length > 0 && reminders.length > 0) {
            summary = `Logged watering for ${wateredIds.length} plant${wateredIds.length > 1 ? 's' : ''} and created ${reminders.length} reminder${reminders.length > 1 ? 's' : ''}!`;
        } else if (wateredIds.length > 0) {
            summary = `Logged watering for ${wateredIds.length} plant${wateredIds.length > 1 ? 's' : ''}!`;
        } else if (reminders.length > 0) {
            summary = `Created ${reminders.length} reminder${reminders.length > 1 ? 's' : ''}!`;
        }

        return Response.json({ 
            success: true, 
            watered_count: wateredIds.length,
            reminder_count: reminders.length,
            notes: summary
        });
    } catch (error) {
        console.error('Error in processVoiceWatering:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});