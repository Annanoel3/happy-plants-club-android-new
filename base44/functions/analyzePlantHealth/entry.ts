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
async function useAiQuota(base44: any, user: any, kind: string) {
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

        const { image_url, plant_name, plant_id } = await req.json();
        const aiQuota = await useAiQuota(base44, user, 'health');
        if (!aiQuota.allowed) return aiLimitResponse('health', aiQuota);
        
        if (!image_url) {
            console.error('❌ No image URL provided');
            return Response.json({ error: 'Image URL is required' }, { status: 400 });
        }

        // Plant doctor follow-up: compare with this plant's last check, if any.
        // (User-scoped reads: only your own plant and your own checks come back.)
        let plant: any = null;
        let previous: any = null;
        if (plant_id) {
            try {
                plant = (await base44.entities.Plant.filter({ id: plant_id }))?.[0] || null;
                if (plant) previous = (await base44.entities.HealthCheck.filter({ plant_id }, '-created_date', 1))?.[0] || null;
            } catch (e) { console.warn('previous check lookup failed', (e as Error).message); }
        }
        const name = plant?.nickname || plant?.name || plant_name || 'plant';
        const prevText = previous ? `A previous check of this same plant on ${previous.checked_date} found: ${previous.status || 'unknown'} — ${previous.headline || ''}. Issues then: ${(previous.issues || []).join('; ') || 'none'}. Plan given: ${(previous.plan || []).map((p: any) => p?.text).filter(Boolean).join('; ') || 'none'}.` : '';

        console.log('📸 Analyzing health for:', name, previous ? '(follow-up)' : '');

        const response = await openai.chat.completions.create({
            model: "gpt-6-luna",
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: "system",
                    content: `You are a plant health expert. Analyze the plant photo.

Look at: overall health, watering (over/under/just right), light, leaf condition (yellowing, browning, spots, pests), visible disease.
Be friendly and encouraging. If it looks healthy, celebrate that. If there are problems, give clear, doable steps. Don't guess beyond what the photo shows; say so if the photo is unclear.

Return ONLY JSON:
{
  "status": "healthy" | "needs_attention" | "concerning",
  "headline": "what's going on, at most 8 words",
  "analysis": "2-4 short paragraphs for the owner, plain friendly language",
  "issues": ["short phrase", ...],          // 0-4, empty if healthy
  "plan": ["short imperative step", ...],     // 0-5 steps in order, empty if healthy
  "recheck_days": number | null,             // days until a new photo would show change (3-21); null if healthy
  "progress": "improving" | "same" | "worse" | null,   // ONLY when a previous check is given
  "progress_note": "one sentence comparing to last time" | null
}`
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
                            text: `Please check the health of this ${name}${plant?.scientific_name ? ` (${plant.scientific_name})` : ''}.${plant?.environment ? ` It lives: ${plant.environment}.` : ''}${prevText ? `\n\n${prevText} Compare this new photo with that and fill in progress.` : ''}`
                        }
                    ]
                }
            ],
            max_completion_tokens: 1200
        });

        console.log('✅ Health analysis complete');
        const raw = response.choices[0].message.content || '';
        let r: any = null;
        try {
            const m = raw.match(/\{[\s\S]*\}/);
            r = JSON.parse(m ? m[0] : raw);
        } catch { r = null; }
        const analysis = String(r?.analysis || raw || '').trim();
        const status = ['healthy', 'needs_attention', 'concerning'].includes(r?.status) ? r.status : null;
        const issues = Array.isArray(r?.issues) ? r.issues.filter((x: any) => typeof x === 'string').slice(0, 4).map((x: string) => x.slice(0, 120)) : [];
        const plan = status && status !== 'healthy' && Array.isArray(r?.plan)
            ? r.plan.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, 5).map((x: string) => ({ text: x.trim().slice(0, 200), done: false }))
            : [];
        const recheckDays = status && status !== 'healthy' && Number.isFinite(Number(r?.recheck_days))
            ? Math.min(21, Math.max(3, Math.round(Number(r.recheck_days)))) : null;
        const progress = previous ? (['improving', 'same', 'worse'].includes(r?.progress) ? r.progress : null) : 'first';

        // Save it to the plant's health history (needs a plant and a readable result)
        let check: any = null;
        if (plant && analysis) {
            const today = aiLocalDay(user.timezone);
            const recheckDate = recheckDays ? (() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + recheckDays); return d.toISOString().slice(0, 10); })() : null;
            try {
                check = await base44.entities.HealthCheck.create({
                    plant_id: plant.id,
                    plant_name: plant.nickname || plant.name,
                    image_url,
                    checked_date: today,
                    status: status || undefined,
                    headline: typeof r?.headline === 'string' ? r.headline.slice(0, 80) : null,
                    analysis,
                    issues,
                    plan,
                    recheck_date: recheckDate,
                    progress: progress || undefined,
                    progress_note: typeof r?.progress_note === 'string' ? r.progress_note.slice(0, 240) : null,
                    previous_id: previous?.id || null,
                    resolved: status === 'healthy',
                });
                // One open follow-up per plant: close the last one's reminder.
                if (previous?.reminder_id) {
                    await base44.entities.Reminder.update(previous.reminder_id, { completed: true }).catch(() => {});
                }
                if (previous && status === 'healthy' && !previous.resolved) {
                    await base44.entities.HealthCheck.update(previous.id, { resolved: true }).catch(() => {});
                }
                // Plus: remind them to re-check (the reminder engine pushes it at 9 AM their time).
                if (aiQuota.plus && recheckDate) {
                    const rem = await base44.entities.Reminder.create({
                        plant_id: plant.id,
                        plant_name: plant.nickname || plant.name,
                        title: `Re-check ${plant.nickname || plant.name}`,
                        description: 'Take a new health check photo to see if the treatment is working.',
                        due_date: recheckDate,
                        is_recurring: false,
                        completed: false,
                    });
                    await base44.entities.HealthCheck.update(check.id, { reminder_id: rem.id });
                    check.reminder_id = rem.id;
                }
            } catch (e) {
                console.warn('saving health check failed', (e as Error).message);
            }
        }

        return Response.json({ 
            success: true, 
            analysis,
            check,
            plus: !!aiQuota.plus,
        });
    } catch (error) {
        console.error('❌ Error in analyzePlantHealth:', error);
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to analyze plant health'
        }, { status: 500 });
    }
});