import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

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

        const { plant_names } = await req.json();

        if (!plant_names || !Array.isArray(plant_names) || plant_names.length === 0) {
            return Response.json({ error: 'No plant names provided' }, { status: 400 });
        }

        // Join input (handles both natural language and comma-separated lists)
        const rawInput = plant_names.join(', ');

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a botanist. The user will describe their plants in natural language or list them by name. Extract each plant name and provide care information.

Return ONLY a JSON object with a "plants" array:
{
  "plants": [
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
}

Extract only actual plant names. Skip filler words like "I have a", "and", "also", etc.`
                },
                {
                    role: "user",
                    content: rawInput
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        const plantsData = result.plants || [];

        if (!Array.isArray(plantsData) || plantsData.length === 0) {
            return Response.json({ success: false, error: 'Could not identify any plants' }, { status: 400 });
        }

        const today = new Date().toISOString().split('T')[0];
        const addedPlants = [];

        for (const plantData of plantsData) {
            const nextWatering = new Date();
            nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

            const newPlant = await base44.entities.Plant.create({
                ...plantData,
                last_watered: today,
                next_watering_due: nextWatering.toISOString().split('T')[0]
            });

            addedPlants.push(newPlant);
        }

        return Response.json({ success: true, count: addedPlants.length, plants: addedPlants });
    } catch (error) {
        console.error('Error in processBulkPlants:', error.message);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});