import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// ---- Daily AI limits (Happy Plants Plus) ----------------------------------
// Usage is always counted (AiUsage). Limits are only enforced once the secret
// AI_LIMITS_ON is "true" — i.e. after people can actually buy Plus.
const AI_LIMITS: Record<string, { free: number; plus: number }> = {
    identify: { free: 10, plus: 200 }, // adding plants uses this; a whole shelf in one go must fit
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
// The limit is checked BEFORE the AI call (checkAiQuota), but a use is only counted AFTER the
// AI answered (countAiUse), so a crash or bad input never uses up a chat.
async function checkAiQuota(base44: any, user: any, kind: string) {
    try {
        const db = base44.asServiceRole.entities;
        const day = aiLocalDay(user.timezone);
        const [subs, rows] = await Promise.all([
            db.Subscription.filter({ user_id: user.id }),
            db.AiUsage.filter({ user_id: user.id, day, kind }),
        ]);
        const sub = subs?.[0];
        // Admins (you) get Plus limits, same as photo IDs, so testing never hits the free caps
        const plus = user?.role === 'admin' || !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
        const limit = (AI_LIMITS[kind] || AI_LIMITS.chat)[plus ? 'plus' : 'free'];
        const enforce = (Deno.env.get('AI_LIMITS_ON') || '').trim().toLowerCase() === 'true';
        const used = rows?.[0]?.count || 0;
        if (enforce && used >= limit) return { allowed: false, plus, limit, used, day };
        return { allowed: true, plus, limit, used, day };
    } catch (e) {
        console.warn('AI quota check failed, allowing:', (e as Error).message);
        return { allowed: true, plus: false, limit: 0, used: 0, day: null };
    }
}
async function countAiUse(base44: any, user: any, kind: string, q: any) {
    try {
        const db = base44.asServiceRole.entities;
        const day = q?.day || aiLocalDay(user.timezone);
        // Read again: the count may have moved while the AI was answering
        const row = (await db.AiUsage.filter({ user_id: user.id, day, kind }))?.[0];
        if (row) await db.AiUsage.update(row.id, { count: (row.count || 0) + 1 });
        else await db.AiUsage.create({ user_id: user.id, user_email: user.email, day, kind, count: 1 });
    } catch (e) {
        console.warn('AI use count failed:', (e as Error).message);
    }
}
function aiLimitResponse(kind: string, q: any) {
    return Response.json({ error: 'limit_reached', limit_reached: true, kind, limit: q.limit, plus: q.plus }, { status: 429 });
}

// Cost caps: only the last HISTORY_TURNS messages go to the model, and each message the
// person sends is cut to MAX_MESSAGE characters (they're told when it was cut).
const HISTORY_TURNS = 10;
const MAX_MESSAGE = 2000;
const CUT_NOTE = `(Your message was long, so I read the first ${MAX_MESSAGE.toLocaleString('en-US')} characters.)`;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => null);
        const plant_id = body?.plant_id;
        const conversation_id = body?.conversation_id || null;
        let message = typeof body?.message === 'string' ? body.message.trim() : '';
        if (!plant_id || !message) return Response.json({ error: 'Type a question first.', detail: 'Type a question first.' }, { status: 400 });
        const cut = message.length > MAX_MESSAGE;
        if (cut) message = message.slice(0, MAX_MESSAGE);

        const aiQuota = await checkAiQuota(base44, user, 'chat');
        if (!aiQuota.allowed) return aiLimitResponse('chat', aiQuota);

        // Get plant data
        const plants = await base44.entities.Plant.filter({ id: plant_id });
        if (!plants || plants.length === 0) {
            return Response.json({ error: 'Plant not found' }, { status: 404 });
        }
        const plant = plants[0];

        // Get or create conversation
        let conversationHistory: any[] = [];
        let convId = conversation_id;

        if (conversation_id) {
            const convs = await base44.entities.PlantConversation.filter({ id: conversation_id });
            if (convs && convs.length > 0) {
                conversationHistory = Array.isArray(convs[0].messages) ? convs[0].messages : [];
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

        // Empty fields read as "not set" (they used to reach the model as "undefined"); a new
        // plant has no watering logged yet on purpose
        const v = (x: any) => (x === undefined || x === null || x === '' ? 'not set' : x);
        const systemPrompt = `You are a plant care expert having an ongoing conversation about a specific plant.

Plant Details:
- Name: ${plant.name}
- Scientific: ${plant.scientific_name || 'unknown'}
- Environment: ${v(plant.environment)}
- Sun exposure: ${v(plant.sun_exposure)}
- Pot type: ${v(plant.pot_type)}
- Water frequency: ${plant.water_frequency_days ? `Every ${plant.water_frequency_days} days` : 'not set'}
- Last watered: ${plant.last_watered ? String(plant.last_watered).slice(0, 10) : 'not logged yet'}
- Growth stage: ${v(plant.growth_stage)}
- Status: ${v(plant.status)}

User location: ${v(user.location)}

Answer questions about this specific plant, provide care tips, troubleshoot problems, and help with any concerns. Be friendly, concise, and actionable.`;

        // Only the recent turns (each cut to the same size) go to the model; the whole
        // conversation is still saved and shown in the app.
        const recent = conversationHistory.slice(-HISTORY_TURNS)
            .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
            .map((m: any) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, MAX_MESSAGE) : m.content }));
        const messages = [
            { role: 'system', content: systemPrompt },
            ...recent,
            { role: 'user', content: message }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-6-luna",
            messages: messages as any,
        });

        const aiResponse = response.choices?.[0]?.message?.content || '';
        if (!aiResponse) throw new Error('empty answer');

        // The AI answered: now it counts as one of today's chats
        await countAiUse(base44, user, 'chat', aiQuota);

        // Update conversation
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: aiResponse }
        );

        // The answer was paid for: show it even if saving it fails
        await base44.entities.PlantConversation.update(convId, {
            messages: conversationHistory
        }).catch((e: any) => console.error('saving the chat failed:', e?.message));

        return Response.json({
            response: cut ? `${CUT_NOTE}\n\n${aiResponse}` : aiResponse,
            conversation_id: convId,
            ...(cut ? { trimmed: true, notice: CUT_NOTE } : {}),
        });

    } catch (error) {
        console.error('Error in chatWithPlant:', (error as Error).message);
        return Response.json({ 
            response: "Sorry, I encountered an error. Could you try again?",
            error: (error as Error).message 
        }, { status: 500 });
    }
});
