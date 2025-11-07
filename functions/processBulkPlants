import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    console.log('=== PROCESS BULK PLANTS FUNCTION CALLED ===');
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        console.log('User authenticated:', user?.email);

        if (!user) {
            console.error('No user found');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { plant_names } = await req.json();
        console.log('Plant names received:', plant_names);

        if (!plant_names || !Array.isArray(plant_names) || plant_names.length === 0) {
            return Response.json({ error: 'No plant names provided' }, { status: 400 });
        }

        console.log('Calling OpenAI to identify plants...');
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a botanist. Given a list of plant names, identify each plant and provide care information.

Return a JSON array with this structure:
[
    {
        "name": "common name",
        "scientific_name": "scientific name",
        "care_instructions": {
            "watering": "detailed watering instructions",
            "sunlight": "sunlight requirements",
            "soil": "soil preferences",
            "humidity": "humidity needs",
            "temperature": "temperature range",
            "fertilizing": "fertilizing schedule",
            "tips": "care tips"
        },
        "water_frequency_days": number
    }
]

If you can't identify a plant, skip it.`
                },
                {
                    role: "user",
                    content: `Please identify and provide care instructions for these plants: ${plant_names.join(', ')}`
                }
            ],
            response_format: { type: "json_object" }
        });

        console.log('OpenAI response received');
        const result = JSON.parse(response.choices[0].message.content);
        console.log('Parsed result:', result);

        // The result might be wrapped in a "plants" key or be the array directly
        const plantsData = Array.isArray(result) ? result : (result.plants || []);
        console.log('Plants data:', plantsData);

        if (!Array.isArray(plantsData) || plantsData.length === 0) {
            console.error('No plants data in result');
            return Response.json({ 
                success: false, 
                error: 'Could not identify any plants' 
            }, { status: 400 });
        }

        // Add each plant to the database
        const today = new Date().toISOString().split('T')[0];
        const addedPlants = [];

        for (const plantData of plantsData) {
            const nextWatering = new Date();
            nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

            console.log('Creating plant:', plantData.name);
            const newPlant = await base44.asServiceRole.entities.Plant.create({
                ...plantData,
                last_watered: today,
                next_watering_due: nextWatering.toISOString().split('T')[0]
            });

            addedPlants.push(newPlant);
            console.log('Plant created:', newPlant.id);
        }

        console.log('✅ All plants added successfully');
        return Response.json({ 
            success: true, 
            count: addedPlants.length,
            plants: addedPlants
        });
    } catch (error) {
        console.error('=== ERROR IN PROCESS BULK PLANTS ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});