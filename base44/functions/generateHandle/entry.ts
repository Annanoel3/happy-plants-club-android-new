import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Gives the signed-in person a unique starter handle (like plantlover482) if they don't have
// one yet, and returns it. Uniqueness is checked against every account on the server (the
// phone can't see other accounts). The community function does the same for older accounts
// that never got one.
const PREFIXES = [
    'plantlover', 'greenthumb', 'iloveplants', 'plantparent', 'gardenlover',
    'botanist', 'plantwhisperer', 'gardenmaster', 'plantfanatic', 'greenguru',
    'plantaddict', 'leaflover', 'bloombuddy', 'gardengeek', 'plantpro',
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'unauthorized', message: 'Please sign in.' }, { status: 401 });
        if (user.handle) return Response.json({ handle: user.handle });

        const db = base44.asServiceRole.entities;
        let handle = '';
        for (let i = 0; i < 10 && !handle; i++) {
            const h = `${PREFIXES[Math.floor(Math.random() * PREFIXES.length)]}${Math.floor(100 + Math.random() * 9900)}`;
            const existing = await db.User.filter({ handle: h });
            if (!existing?.length) handle = h;
        }
        if (!handle) handle = `plantlover${Date.now().toString().slice(-8)}`;

        await base44.auth.updateMe({ handle });
        return Response.json({ handle });
    } catch (error) {
        console.error('[generateHandle] error:', (error as Error)?.message);
        return Response.json({ error: 'server', message: 'Couldn’t make a handle right now.' }, { status: 500 });
    }
});
