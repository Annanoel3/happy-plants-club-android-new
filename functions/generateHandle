import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // If user already has a handle, return it
        if (user.handle) {
            return Response.json({ handle: user.handle });
        }

        const prefixes = [
            'plantlover', 'greenthumb', 'iloveplants', 'plantparent', 'gardenlover',
            'botanist', 'plantwhisperer', 'gardenmaster', 'plantfanatic', 'greenguru',
            'plantaddict', 'leaflover', 'bloombuddy', 'gardengeek', 'plantpro'
        ];

        // Generate a unique handle
        let handle = '';
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const number = Math.floor(Math.random() * 1000);
            handle = `${prefix}${number}`;

            // Check if handle already exists
            const existing = await base44.asServiceRole.entities.User.filter({ handle });
            if (existing.length === 0) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            // Fallback to timestamp
            handle = `plantlover${Date.now()}`;
        }

        // Update user with the handle
        await base44.auth.updateMe({ handle });

        return Response.json({ handle });
    } catch (error) {
        console.error('Error generating handle:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});