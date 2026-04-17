import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    console.log('💬 chatWithExpert function called');
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message, conversation_id } = await req.json();
        console.log('💭 User message:', message);
        console.log('📝 Conversation ID:', conversation_id);

        // Get or create conversation
        let conversationHistory = [];
        let convId = conversation_id;

        if (conversation_id) {
            const convs = await base44.entities.PlantConversation.filter({ id: conversation_id });
            if (convs && convs.length > 0) {
                conversationHistory = convs[0].messages || [];
                console.log('📚 Loaded', conversationHistory.length, 'previous messages');
            }
        } else {
            // Create new conversation
            const newConv = await base44.asServiceRole.entities.PlantConversation.create({
                user_email: user.email,
                plant_id: null, // null = general expert chat
                messages: []
            });
            convId = newConv.id;
            console.log('✨ Created new conversation:', convId);
        }

        const plantsResult = await base44.entities.Plant.list();
        const plants = Array.isArray(plantsResult) ? plantsResult : [];
        
        const plantsContext = plants.map(p => 
            `${p.name} (${p.scientific_name || 'unknown'}) - Environment: ${p.environment || 'not specified'}, Location: ${p.location || 'not specified'}`
        ).join('\n');

        const contextMessage = `User location: ${user.location || 'not specified'}

${plantsContext ? `User's plants:\n${plantsContext}\n\n` : ''}`;

        const systemPrompt = `You are a friendly botanist and plant care expert. Help users with plant identification, care tips, troubleshooting problems, and general plant advice. 

Consider the user's location/climate when giving advice. If a plant would be happier in a different environment (e.g., outdoor vs indoor), mention this kindly but still provide helpful advice for keeping it in its current location.

Be helpful, detailed, and encouraging.

${contextMessage}`;

        // Build full conversation
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: message }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages
        });

        console.log('✅ Response generated');
        const reply = response.choices[0].message.content;

        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: reply }
        );

        await base44.asServiceRole.entities.PlantConversation.update(convId, {
            messages: conversationHistory
        });

        console.log('💾 Conversation saved');

        return Response.json({ 
            message: reply,
            conversation_id: convId
        });
    } catch (error) {
        console.error('❌ Error in chatWithExpert:', error);
        return Response.json({ 
            message: `Sorry, I encountered an error: ${error.message}. Please try again.`
        });
    }
});