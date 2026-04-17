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

        const { plant_id, message, conversation_id } = await req.json();

        // Get plant data
        const plants = await base44.entities.Plant.filter({ id: plant_id });
        if (!plants || plants.length === 0) {
            return Response.json({ error: 'Plant not found' }, { status: 404 });
        }
        const plant = plants[0];

        // Get or create conversation
        let conversationHistory = [];
        let convId = conversation_id;

        if (conversation_id) {
            const convs = await base44.entities.PlantConversation.filter({ id: conversation_id });
            if (convs && convs.length > 0) {
                conversationHistory = convs[0].messages || [];
            }
        } else {
            // Create new conversation
            const newConv = await base44.asServiceRole.entities.PlantConversation.create({
                user_email: user.email,
                plant_id: plant_id,
                messages: []
            });
            convId = newConv.id;
        }

        const systemPrompt = `You are a plant care expert having an ongoing conversation about a specific plant.

Plant Details:
- Name: ${plant.name}
- Scientific: ${plant.scientific_name || 'unknown'}
- Environment: ${plant.environment}
- Sun exposure: ${plant.sun_exposure}
- Pot type: ${plant.pot_type}
- Water frequency: Every ${plant.water_frequency_days} days
- Last watered: ${plant.last_watered}
- Growth stage: ${plant.growth_stage}
- Status: ${plant.status}

User location: ${user.location}

Answer questions about this specific plant, provide care tips, troubleshoot problems, and help with any concerns. Be friendly, concise, and actionable.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: message }
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
        });

        const aiResponse = response.choices[0].message.content;

        // Update conversation
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: aiResponse }
        );

        await base44.asServiceRole.entities.PlantConversation.update(convId, {
            messages: conversationHistory
        });

        return Response.json({
            response: aiResponse,
            conversation_id: convId
        });

    } catch (error) {
        console.error('Error in chatWithPlant:', error);
        return Response.json({ 
            response: "Sorry, I encountered an error. Could you try again?",
            error: error.message 
        }, { status: 500 });
    }
});