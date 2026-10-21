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
// AI answered (countAiUse), so a refused message, a crash or bad input never uses up a chat.
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
// A message the app shows as is. `detail` too: the SDK uses it as the thrown error's message
// when the status isn't 2xx (PlantChat shows error.message).
function refuse(text: string, status: number, extra: Record<string, unknown> = {}) {
    return Response.json({ error: text, detail: text, ...extra }, { status });
}

// Cost caps: only the last HISTORY_TURNS messages go to the model, and each message the
// person sends is cut to MAX_MESSAGE characters (they're told when it was cut).
const HISTORY_TURNS = 10;
const MAX_MESSAGE = 2000;
const CUT_NOTE = `(Your message was long, so I read the first ${MAX_MESSAGE.toLocaleString('en-US')} characters.)`;

// This is a private one-to-one chat, so the community swear-word list (functions/moderateContent)
// doesn't apply: "damn, my fern is dying" is fine here. OpenAI's moderation model (free) still
// stops truly harmful content.
const FRIENDLY: Record<string, string> = {
    hate: 'Hateful language isn’t allowed here.',
    harassment: 'Please keep it kind. That reads as harassment.',
    sexual: 'Sexual content isn’t allowed here.',
    violence: 'Violent content isn’t allowed here.',
    'self-harm': 'This looks like it might be about self-harm, so it wasn’t sent. If you’re struggling, please reach out to someone you trust or call or text 988 (US).',
    illicit: 'This looks like it’s about something illegal, so it wasn’t sent.',
};
async function harmful(text: string): Promise<{ ok: boolean; reason?: string; retry?: boolean }> {
    try {
        const mod: any = await openai.moderations.create({ model: 'omni-moderation-latest', input: [{ type: 'text', text }] } as any);
        const result = mod?.results?.[0];
        if (!result?.flagged) return { ok: true };
        const hit = Object.keys(result.categories || {}).filter((k) => result.categories[k]);
        for (const k of ['self-harm', 'hate', 'harassment', 'sexual', 'violence', 'illicit']) {
            if (hit.some((h) => h === k || h.startsWith(k + '/'))) return { ok: false, reason: FRIENDLY[k] };
        }
        return { ok: false, reason: 'This message can’t be sent to the Plant Expert.' };
    } catch (e) {
        // If the checker is down, nothing gets through (same rule as moderateContent)
        console.error('moderation failed:', (e as Error).message);
        return { ok: false, retry: true, reason: 'We couldn’t check this right now. Please try again in a minute.' };
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => null);
        const conversation_id = body?.conversation_id || null;
        const image_url = typeof body?.image_url === 'string' && body.image_url ? body.image_url : null;
        let message = typeof body?.message === 'string' ? body.message.trim() : '';
        if (!message && !image_url) return refuse('Type a question for the Plant Expert first.', 400, { conversation_id });
        const cut = message.length > MAX_MESSAGE;
        if (cut) message = message.slice(0, MAX_MESSAGE);

        const aiQuota = await checkAiQuota(base44, user, 'chat');
        if (!aiQuota.allowed) return aiLimitResponse('chat', aiQuota);

        if (message) {
            const mod = await harmful(message);
            if (!mod.ok) return refuse(mod.reason || 'This message can’t be sent.', mod.retry ? 503 : 400, { conversation_id, ...(mod.retry ? { retry: true } : {}) });
        }

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
                plant_id: null, // null = general expert chat
                messages: []
            });
            convId = newConv.id;
        }

        const plantsResult = await base44.entities.Plant.list('-created_date', 1000);
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
                { type: 'text', text: message || 'What can you tell me about this plant?' },
                { type: 'image_url', image_url: { url: image_url } }
              ]
            : message;

        // Only the recent turns (each cut to the same size) go to the model; the whole
        // conversation is still saved and shown in the app.
        const recent = conversationHistory.slice(-HISTORY_TURNS)
            .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
            .map((m: any) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, MAX_MESSAGE) : m.content }));
        const messages = [
            { role: 'system', content: systemPrompt },
            ...recent,
            { role: 'user', content: userContent }
        ];

        let reply = '';
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-6-luna",
                messages: messages as any,
            });
            reply = response.choices?.[0]?.message?.content || '';
        } catch (e) {
            console.error('Plant expert AI call failed:', (e as Error).message);
        }
        if (!reply) return refuse("The plant expert couldn't answer just now. Please try again.", 502, { conversation_id: convId });

        // The AI answered: now it counts as one of today's chats
        await countAiUse(base44, user, 'chat', aiQuota);

        // Update conversation history (store as text for consistency)
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: reply }
        );

        // The answer was paid for: show it even if saving it fails
        await base44.entities.PlantConversation.update(convId, {
            messages: conversationHistory
        }).catch((e: any) => console.error('saving the chat failed:', e?.message));

        return Response.json({ 
            message: cut ? `${CUT_NOTE}\n\n${reply}` : reply,
            conversation_id: convId,
            ...(cut ? { trimmed: true, notice: CUT_NOTE } : {}),
        });
    } catch (error) {
        console.error('❌ Error in chatWithExpert:', (error as Error).message);
        return refuse("The plant expert couldn't answer just now. Please try again.", 500);
    }
});
