import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// ---- Daily AI limits (Happy Plants Plus) ----------------------------------
// Usage is always counted (AiUsage). Limits are only enforced once the secret
// AI_LIMITS_ON is "true" — i.e. after people can actually buy Plus.
const AI_LIMITS: Record<string, { free: number; plus: number }> = {
    identify: { free: 5, plus: 50 },
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
    console.log('🏥 analyzePlantHealth function called');
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { image_url, plant_name } = await req.json();
        const aiQuota = await useAiQuota(base44, user, 'health');
        if (!aiQuota.allowed) return aiLimitResponse('health', aiQuota);
        
        if (!image_url) {
            console.error('❌ No image URL provided');
            return Response.json({ error: 'Image URL is required' }, { status: 400 });
        }

        console.log('📸 Analyzing health for:', plant_name);
        console.log('📸 Image URL:', image_url);

        const response = await openai.chat.completions.create({
            model: "gpt-6-luna",
            messages: [
                {
                    role: "system",
                    content: `You are a plant health expert. Analyze the plant image and provide a health assessment.

Focus on:
- Overall health status (healthy, needs attention, concerning)
- Watering issues (overwatered, underwatered, just right)
- Light issues (too much sun, not enough light, good lighting)
- Leaf condition (yellowing, browning, spots, pests)
- Any visible problems or diseases
- Specific recommendations for improvement

Be friendly and encouraging. If the plant looks healthy, celebrate that! If there are issues, provide clear, actionable advice.

Keep your response to 3-4 short paragraphs max.`
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
                            text: `Please analyze the health of this ${plant_name || 'plant'} and provide specific care recommendations.`
                        }
                    ]
                }
            ],
            max_completion_tokens: 500
        });

        console.log('✅ Health analysis complete');
        const analysis = response.choices[0].message.content;

        return Response.json({ 
            success: true, 
            analysis 
        });
    } catch (error) {
        console.error('❌ Error in analyzePlantHealth:', error);
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to analyze plant health'
        }, { status: 500 });
    }
});