import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Manage your public "share my garden" link.
// body.action:
//   'get'        → current link status (doesn't create anything)
//   'enable'     → turn the link on (creates it the first time; keeps the same link after)
//   'disable'    → turn the link off (the link stops working)
//   'regenerate' → new link; the old one stops working
//   'update'     → change public_name / public_description
const SITE = 'https://happyplants.club';

function newToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 22);
}

const view = (s: any) => s ? ({
    enabled: !!s.is_active,
    share_url: `${SITE}/SharedGardenView/${s.share_token}`,
    share_token: s.share_token,
    public_name: s.public_name || '',
    public_description: s.public_description || '',
}) : { enabled: false, share_url: null, share_token: null, public_name: '', public_description: '' };

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const action = body.action || 'enable';
        const db = base44.asServiceRole.entities;
        const existing = (await db.SharedGarden.filter({ owner_email: user.email }))?.[0] || null;
        const firstName = (user.full_name || '').trim().split(/\s+/)[0] || 'My';
        const clean = (v: any, max: number) => String(v ?? '').trim().slice(0, max);

        if (action === 'get') return Response.json({ success: true, ...view(existing) });

        if (action === 'disable') {
            if (existing) await db.SharedGarden.update(existing.id, { is_active: false });
            return Response.json({ success: true, ...view(existing ? { ...existing, is_active: false } : null) });
        }

        if (!existing) {
            const created = await db.SharedGarden.create({
                owner_email: user.email,
                owner_name: user.full_name || '',
                share_token: newToken(),
                public_name: clean(body.public_name, 60) || `${firstName}'s Garden`,
                public_description: clean(body.public_description, 280),
                is_active: true,
            });
            return Response.json({ success: true, ...view(created) });
        }

        const patch: any = {};
        if (action === 'enable') {
            patch.is_active = true;
            // Old/odd tokens get replaced so the link always matches what the public page accepts
            if (!/^[a-z0-9]{8,40}$/i.test(existing.share_token || '')) patch.share_token = newToken();
        }
        if (action === 'regenerate') { patch.share_token = newToken(); patch.is_active = true; }
        if (action === 'update' || body.public_name !== undefined) {
            if (body.public_name !== undefined) patch.public_name = clean(body.public_name, 60) || `${firstName}'s Garden`;
            if (body.public_description !== undefined) patch.public_description = clean(body.public_description, 280);
        }
        if (Object.keys(patch).length) await db.SharedGarden.update(existing.id, patch);
        return Response.json({ success: true, ...view({ ...existing, ...patch }) });
    } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 500 });
    }
});
