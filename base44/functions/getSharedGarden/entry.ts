import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public, no login needed: what someone sees when they open a shared garden link.
// Returns only display info — never emails, notes, chat, or care history.
Deno.serve(async (req) => {
    try {
        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const token = String(body.token || '').trim();
        if (!/^[a-z0-9]{8,40}$/i.test(token)) return Response.json({ found: false });

        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const share = (await db.SharedGarden.filter({ share_token: token, is_active: true }))?.[0];
        if (!share) return Response.json({ found: false });

        const plants = await db.Plant.filter({ created_by: share.owner_email }, '-created_date', 500);
        const owner = (await db.User.filter({ email: share.owner_email }))?.[0];

        return Response.json({
            found: true,
            garden: {
                name: share.public_name || 'A Happy Plants garden',
                description: share.public_description || '',
                avatar: owner?.profile_picture || null,
                handle: owner?.handle || null,
                tier: owner?.current_tier || null,
            },
            plants: plants.map((p: any) => ({
                id: p.id,
                name: p.nickname || p.name || 'Plant',
                species: p.nickname ? p.name : null,
                scientific_name: p.scientific_name || null,
                type: p.plant_type || null,
                spot: p.location || null,
                photo: p.thumbnail_url || p.image_url || null,
                water_every_days: p.water_frequency_days || null,
            })),
        }, { headers: { 'Cache-Control': 'public, max-age=60' } });
    } catch (error) {
        console.error('getSharedGarden', error);
        return Response.json({ found: false, error: 'unavailable' }, { status: 500 });
    }
});
