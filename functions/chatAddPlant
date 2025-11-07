import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
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

        const { message, image_url, conversation_id, user_location } = await req.json();

        // Get or create conversation history
        let conversationHistory = [];
        let conversationData = null;
        let savedImageUrl = null;

        if (conversation_id) {
            const existing = await base44.entities.PlantConversation.filter({ id: conversation_id });
            if (existing && existing.length > 0) {
                conversationData = existing[0];
                conversationHistory = conversationData.messages || [];
                savedImageUrl = conversationData.image_url || null;
            }
        }

        if (image_url) {
            savedImageUrl = image_url;
        }

        // Get user's plants for context
        const plants = await base44.entities.Plant.list();
        const plantsContext = plants.map(p => p.name).join(', ');

        // Build system prompt
        const systemPrompt = `You are a friendly plant care assistant helping users add plants to their garden.

User's location: ${user_location || 'not specified'}
User's existing plants: ${plantsContext || 'none yet'}

Your goal is to gather enough information to create a plant entry, but be efficient. Don't ask questions you already know the answer to.

ESSENTIAL INFORMATION NEEDED:
1. Plant name (common or scientific)
2. Where it's located (indoor/outdoor/balcony, etc.)
3. Sun exposure it gets
4. Pot type
5. Pot size relative to plant
6. What it's planted in (substrate)
7. Size/maturity of the plant (seedling, small, mature, etc.)

IF USER PROVIDES A PHOTO: Identify the plant from the image, estimate its size/maturity, and ask the necessary questions about its environment.

BE CONVERSATIONAL AND BRIEF. Ask 1-2 questions at a time maximum.

CRITICAL RULE: Once you have gathered ALL 7 pieces of information above, you MUST create the plant immediately. Do NOT say you will add it - actually add it by returning the JSON format below.

If the user says "skip" or wants to add it without all details, use reasonable defaults and create the plant.

WHEN CREATING THE PLANT:
- You MUST respond ONLY with valid JSON
- NO text before or after the JSON
- Calculate optimal watering schedule based on all environmental factors
- Provide detailed explanation of your calculation

JSON FORMAT (use this EXACT structure):
{
    "response": "Your [Plant Name] has been added to your garden! 🌿\\n\\n📍 [Environment] plant in [Location]\\n☀️ [Sun exposure]\\n🏺 [Pot type], [pot size]\\n🌱 [Substrate]\\n📏 [Plant size]\\n\\nI've calculated a watering schedule of once every [X] days. Here's my reasoning:\\n\\n💧 WATERING CALCULATION:\\n• [Factor 1 explanation]\\n• [Factor 2 explanation]\\n• [Factor 3 explanation]\\n• [etc]\\n\\nResult: Every [X] days is optimal because [summary]!\\n\\n🌟 CARE TIPS:\\n• [Tip 1]\\n• [Tip 2]\\n• [Tip 3]\\n\\nChat with me from your plant's page anytime for personalized advice! 🪴",
    "create_plant": true,
    "plant_data": {
        "name": "Common Name",
        "scientific_name": "Scientific Name",
        "hybrid_name": "Cultivar name or null",
        "environment": "Indoor/Outdoor/etc",
        "sun_exposure": "Full Sun (6+ hours)/Partial Sun/etc",
        "pot_type": "Plastic/Terracotta/etc",
        "pot_size": "Perfect fit/Room to grow/etc",
        "substrate_type": "Standard potting mix/Cactus mix/etc",
        "plant_size": "Seedling/Small/Medium/Large/Mature",
        "water_frequency_days": 7,
        "care_instructions": {
            "watering": "Detailed watering instructions",
            "sunlight": "Light requirements",
            "soil": "Soil preferences",
            "humidity": "Humidity needs",
            "temperature": "Temperature range",
            "fertilizing": "Fertilizing schedule",
            "tips": "Important care tips"
        }
    }
}

If you don't have all information yet, respond with plain text (NO JSON) asking for what's missing.`;

        // Build messages for OpenAI
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
        ];

        // Add current user message
        if (image_url) {
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: message },
                    { type: 'image_url', image_url: { url: image_url } }
                ]
            });
        } else {
            messages.push({ role: 'user', content: message });
        }

        // Get AI response
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
        });

        const aiResponse = response.choices[0].message.content.trim();
        
        // Try to parse as JSON to see if plant should be created
        let shouldCreatePlant = false;
        let plantData = null;
        let finalResponse = aiResponse;

        try {
            const parsed = JSON.parse(aiResponse);
            if (parsed.create_plant && parsed.plant_data) {
                shouldCreatePlant = true;
                plantData = parsed.plant_data;
                finalResponse = parsed.response;
            }
        } catch (e) {
            // Not JSON, just a regular response
        }

        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: finalResponse }
        );

        // Save conversation
        let savedConversationId = conversation_id;
        if (!conversationData) {
            const newConv = await base44.asServiceRole.entities.PlantConversation.create({
                user_email: user.email,
                messages: conversationHistory,
                plant_id: null,
                image_url: savedImageUrl
            });
            savedConversationId = newConv.id;
        } else {
            await base44.asServiceRole.entities.PlantConversation.update(conversation_id, {
                messages: conversationHistory,
                image_url: savedImageUrl
            });
        }

        // Create plant if ready
        let plantCreated = false;
        if (shouldCreatePlant && plantData) {
            const today = new Date().toISOString().split('T')[0];
            const nextWatering = new Date();
            nextWatering.setDate(nextWatering.getDate() + (plantData.water_frequency_days || 7));

            const newPlant = await base44.asServiceRole.entities.Plant.create({
                name: plantData.name,
                scientific_name: plantData.scientific_name || '',
                hybrid_name: plantData.hybrid_name || null,
                environment: plantData.environment,
                sun_exposure: plantData.sun_exposure,
                pot_type: plantData.pot_type,
                pot_size: plantData.pot_size,
                substrate_type: plantData.substrate_type,
                plant_size: plantData.plant_size || 'Medium',
                water_frequency_days: plantData.water_frequency_days || 7,
                care_instructions: plantData.care_instructions || {},
                last_watered: today,
                next_watering_due: nextWatering.toISOString().split('T')[0],
                growth_stage: 'seedling',
                total_waterings: 0,
                status: 'healthy',
                image_url: savedImageUrl || ''
            });

            await base44.asServiceRole.entities.PlantConversation.update(savedConversationId, {
                plant_id: newPlant.id
            });

            plantCreated = true;
        }

        return Response.json({
            response: finalResponse,
            conversation_id: savedConversationId,
            plant_created: plantCreated
        });

    } catch (error) {
        console.error('Error in chatAddPlant:', error);
        return Response.json({ 
            response: "Sorry, I encountered an error. Could you try that again?",
            error: error.message 
        }, { status: 500 });
    }
});