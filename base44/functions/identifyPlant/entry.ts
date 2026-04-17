
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    console.log('🌱 identifyPlant function called');
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { image_url, user_location, environment, sun_exposure, pot_type, pot_size, substrate_type } = await req.json();
        console.log('📸 Image URL:', image_url);
        console.log('📍 User location:', user_location);
        console.log('🏡 Environment details:', { environment, sun_exposure, pot_type, pot_size, substrate_type });

        // Build detailed context for accurate watering recommendations
        let contextStr = '';
        if (user_location) {
            contextStr += `Location: ${user_location} - Consider this climate for watering frequency.\n`;
        }
        if (environment) {
            contextStr += `Environment: ${environment}\n`;
        }
        if (sun_exposure) {
            contextStr += `Sun exposure: ${sun_exposure} - More sun = faster soil drying = more frequent watering.\n`;
        }
        if (pot_type) {
            contextStr += `Pot type: ${pot_type} - `;
            if (pot_type.includes('Terracotta') || pot_type.includes('Clay')) {
                contextStr += 'Terracotta is porous and dries quickly, needs more frequent watering.\n';
            } else if (pot_type.includes('Plastic')) {
                contextStr += 'Plastic retains moisture longer, needs less frequent watering.\n';
            } else if (pot_type.includes('Self-watering')) {
                contextStr += 'Self-watering pot, adjust frequency accordingly.\n';
            } else {
                contextStr += '\n';
            }
        }
        if (pot_size) {
            contextStr += `Pot size relative to plant: ${pot_size} - `;
            if (pot_size.includes('smaller') || pot_size.includes('root-bound')) {
                contextStr += 'Smaller pot dries faster, needs more frequent watering.\n';
            } else if (pot_size.includes('large')) {
                contextStr += 'Larger pot retains more moisture, needs less frequent watering.\n';
            } else {
                contextStr += '\n';
            }
        }
        if (substrate_type) {
            contextStr += `Substrate: ${substrate_type} - `;
            if (substrate_type.includes('Cactus') || substrate_type.includes('succulent')) {
                contextStr += 'Fast-draining mix, may need adjusted watering.\n';
            } else if (substrate_type.includes('Peat')) {
                contextStr += 'Peat retains moisture well.\n';
            } else {
                contextStr += '\n';
            }
        }

        const systemPrompt = `You are a professional botanist with expertise in plant care across different climates and environments.

${contextStr}

CRITICAL: Calculate watering frequency considering ALL these factors:
- Climate/location (hot climates like Austin, TX need MORE frequent watering)
- Indoor vs outdoor (outdoor plants dry faster)
- Sun exposure (more sun = more water needed)
- Pot material (terracotta dries faster than plastic)
- Pot size (smaller pots dry faster)
- Substrate type (affects water retention)
- Plant species natural needs
- PLANT SIZE/MATURITY (larger/older plants need more water, seedlings need less)

For context: In hot climates like Austin, Texas (90-100°F summers), most indoor plants need watering every 5-7 days, outdoor plants every 3-5 days or even daily for full sun plants.

From the image, assess the plant's size/maturity level (Seedling, Small, Medium, Large, or Mature).

IMPORTANT: In the care_instructions.tips field, explain HOW you calculated the watering frequency based on ALL the environmental factors provided. Be specific about what factors increased or decreased the frequency.

Return ONLY valid JSON:
{
    "name": "common name",
    "scientific_name": "genus species",
    "hybrid_name": "cultivar/hybrid name or null",
    "is_hybrid_uncertain": boolean,
    "growth_habit": "climber" | "trailer" | "crawler" | "upright" | "bushy",
    "plant_size": "Seedling" | "Small" | "Medium" | "Large" | "Mature",
    "care_instructions": {
        "watering": "Detailed watering instructions considering ALL factors above",
        "sunlight": "Light requirements",
        "soil": "Soil preferences",
        "humidity": "Humidity needs",
        "temperature": "Temperature range",
        "fertilizing": "Fertilizing schedule",
        "tips": "MUST include: Climate-specific and environment-specific care tips. Explain how the location (${user_location}), pot type (${pot_type}), sun exposure (${sun_exposure}), substrate (${substrate_type}), and plant size affect the watering frequency you calculated.",
        "growth_optimization": "Growth tips if applicable"
    },
    "water_frequency_days": number (BE REALISTIC - consider hot climate, pot type, sun exposure, plant size. Austin summer outdoor medium plant in terracotta might need water every 3-4 days!)
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: image_url }
                        },
                        {
                            type: "text",
                            text: "Identify this plant, assess its size/maturity, and provide comprehensive, personalized care instructions in the exact JSON format."
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        });

        console.log('✅ OpenAI response received');
        const plantData = JSON.parse(response.choices[0].message.content);
        console.log('🌿 Plant identified:', plantData.name);
        console.log('📏 Plant size:', plantData.plant_size);
        console.log('💧 Watering frequency:', plantData.water_frequency_days, 'days');

        return Response.json({ success: true, plantData });
    } catch (error) {
        console.error('❌ Error in identifyPlant:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});
