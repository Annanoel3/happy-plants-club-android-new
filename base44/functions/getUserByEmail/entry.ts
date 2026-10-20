import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public profile lookup for the Profile page. Returns only what a profile shows (it used to
// return the person's whole account record), and nothing at all if that person blocked you.
const PUBLIC = ['id', 'email', 'full_name', 'handle', 'profile_picture', 'bio', 'profile_private', 'garden_public',
  'current_tier', 'lifetime_waterings', 'total_plant_growths', 'location_public'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { email } = await req.json().catch(() => ({}));
    if (!email) return Response.json({ error: 'Email required' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const target = (await db.User.filter({ email }))?.[0];
    if (!target) return Response.json({ user: null });

    if (target.email !== user.email) {
      const theyBlocked = await db.Block.filter({ blocker_email: target.email, blocked_email: user.email });
      if (theyBlocked?.length) return Response.json({ user: null, unavailable: true });
    }

    const out: Record<string, unknown> = {};
    for (const k of PUBLIC) if (target[k] !== undefined) out[k] = target[k];
    if (target.location_public !== false && target.location) out.location = target.location;
    return Response.json({ user: out });
  } catch (error) {
    console.error('Error getting user by email:', (error as Error)?.message);
    return Response.json({ error: (error as Error)?.message }, { status: 500 });
  }
});
