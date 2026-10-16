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
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { plant_id, message, conversation_id } = await req.json();
        const aiQuota = await useAiQuota(base44, user, 'chat');
        if (!aiQuota.allowed) return aiLimitResponse('chat', aiQuota);

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
            const newConv = await base44.entities.PlantConversation.create({
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
            model: "gpt-6-luna",
            messages: messages,
        });

        const aiResponse = response.choices[0].message.content;

        // Update conversation
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: aiResponse }
        );

        await base44.entities.PlantConversation.update(convId, {
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