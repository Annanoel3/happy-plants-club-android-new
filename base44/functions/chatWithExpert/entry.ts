import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// ---- Daily AI limits (Happy Plants Plus) ----------------------------------
// Usage is always counted (AiUsage). Limits are only enforced once the secret
// AI_LIMITS_ON is "true" — i.e. after people can actually buy Plus.
const AI_LIMITS: Record<string, { free: number; plus: number }> = {
    identify: { free: 25, plus: 200 }, // adding plants uses this; a whole shelf in one go must fit
    health: { free: 3, plus: 25 },
    chat: { free: 20, plus: 200 },
};
function aiLocalDay(tz?: string): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}
async function useAiQuota(base44: any, user: any, kind: string) {
    try {
        const db = base44.asServiceRole.entities;
        const day = aiLocalDay(user.timezone);
        const [subs, rows] = await Promise.all([
            db.Subscription.filter({ user_id: user.id }),
            db.AiUsage.filter({ user_id: user.id, day, kind }),
        ]);
        const sub = subs?.[0];
        const plus = !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
        const limit = (AI_LIMITS[kind] || AI_LIMITS.chat)[plus ? 'plus' : 'free'];
        const enforce = (Deno.env.get('AI_LIMITS_ON') || '').trim().toLowerCase() === 'true';
        const row = rows?.[0];
        const used = row?.count || 0;
        if (enforce && used >= limit) return { allowed: false, plus, limit, used };
        if (row) await db.AiUsage.update(row.id, { count: used + 1 });
        else await db.AiUsage.create({ user_id: user.id, user_email: user.email, day, kind, count: 1 });
        return { allowed: true, plus, limit, used: used + 1 };
    } catch (e) {
        console.warn('AI quota check failed, allowing:', (e as Error).message);
        return { allowed: true, plus: false, limit: 0, used: 0 };
    }
}
function aiLimitResponse(kind: string, q: any) {
    return Response.json({ error: 'limit_reached', limit_reached: true, kind, limit: q.limit, plus: q.plus }, { status: 429 });
}

Deno.serve(async (req) => {
    console.log('💬 chatWithExpert function called');
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message, conversation_id, image_url } = await req.json();
        const aiQuota = await useAiQuota(base44, user, 'chat');
        if (!aiQuota.allowed) return aiLimitResponse('chat', aiQuota);
        console.log('💭 User message:', message);
        console.log('📝 Conversation ID:', conversation_id);
        console.log('📸 Image URL:', image_url ? 'Present' : 'None');

        // Moderate user message
        console.log('🔍 Moderating message...');
        const moderated = await base44.functions.invoke('moderateContent', { content: message });
        if (!moderated.data.appropriate) {
            console.log('❌ Message flagged as inappropriate');
            return Response.json({ 
                error: 'Your message contains inappropriate content. Please keep the conversation respectful.',
                conversation_id: conversation_id
            }, { status: 400 });
        }

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
            const newConv = await base44.entities.PlantConversation.create({
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
        const userContent = image_url 
            ? [
                { type: 'text', text: message },
                { type: 'image_url', image_url: { url: image_url } }
              ]
            : message;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: userContent }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-6-luna",
            messages: messages
        });

        console.log('✅ Response generated');
        const reply = response.choices[0].message.content;

        // Update conversation history (store as text for consistency)
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: reply }
        );

        await base44.entities.PlantConversation.update(convId, {
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