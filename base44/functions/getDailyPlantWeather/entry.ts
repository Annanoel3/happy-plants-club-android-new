import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Try to get from body first (when called from cron job)
        let location;
        let userEmail;
        
        try {
            const body = await req.json();
            location = body.location;
            userEmail = body.userEmail;
        } catch (e) {
            // If no body, try to get from authenticated user
            const user = await base44.auth.me();
            if (!user) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            location = user.location;
            userEmail = user.email;
        }

        if (!location) {
            return Response.json({ 
                error: 'No location provided' 
            }, { status: 400 });
        }

        // Get user's plants to determine if they have indoor/outdoor plants
        const plants = await base44.entities.Plant.filter({ created_by: userEmail });
        const hasOutdoorPlants = plants.some(p => 
            p.environment === 'Outdoor' || 
            p.environment === 'Balcony' || 
            p.environment === 'Patio'
        );
        const hasIndoorPlants = plants.some(p => 
            p.environment === 'Indoor' || 
            p.environment === 'Window Sill' || 
            p.environment === 'Office'
        );

        const plantContext = hasOutdoorPlants && hasIndoorPlants 
            ? "The user has both indoor and outdoor plants." 
            : hasOutdoorPlants 
                ? "The user has outdoor plants." 
                : "The user has indoor plants.";

        // Get weather and create plant-focused message
        const weatherMessage = await base44.integrations.Core.InvokeLLM({
            prompt: `You are a friendly plant care assistant. Get today's weather for ${location} and tell the user how their plants will feel today.

${plantContext}

IMPORTANT: 
- This message is shown in the MORNING (6 AM - 12 PM). Focus on TODAY'S weather during daylight hours.
- ${hasOutdoorPlants ? 'The user HAS outdoor plants, so mention exposure to weather elements.' : 'The user has ONLY indoor plants, so focus on how weather affects indoor conditions (humidity, light, temperature indoors).'}
- ${hasIndoorPlants && !hasOutdoorPlants ? 'Do NOT mention moving plants outside, storms affecting plants directly, or bringing plants inside. Instead, focus on how the weather might affect their home (humidity, light levels, indoor temperature).' : ''}

ONLY mention tonight/nighttime if:
1. Tonight will have actual hazards (frost below 35°F, freezing, storms, heavy rain, strong winds)
2. In that case, add a brief warning with action specific to their plant types

If tonight will be normal/mild, DO NOT mention nighttime at all.

Write a warm, encouraging message (2-3 sentences max) that:
- Describes today's weather in terms of how plants will experience it
- ONLY mentions tonight if it will be hazardous
- Gives practical daytime advice appropriate for their plant types
- Uses friendly, conversational language
- Includes relevant emoji

Return ONLY the message text, no extra formatting.`,
            add_context_from_internet: true
        });

        return Response.json({ 
            message: weatherMessage,
            location: location
        });
    } catch (error) {
        console.error('Error in getDailyPlantWeather:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});