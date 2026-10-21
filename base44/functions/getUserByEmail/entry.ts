import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Old profile lookup by email. The app now opens profiles by user id through the community
// function ('profile'), which never sends anyone's email to the phone. Looking someone up by
// email would let anyone check which emails have an account, so this only answers for your
// own email (or for admins), and never returns the email itself.
const PUBLIC = ['id', 'full_name', 'handle', 'profile_picture', 'bio', 'profile_private', 'garden_public',
  'current_tier', 'lifetime_waterings', 'total_plant_growths', 'location_public'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'unauthorized', message: 'Please sign in.' }, { status: 401 });

    const { email } = await req.json().catch(() => ({}));
    const wanted = String(email || '').trim().toLowerCase();
    if (!wanted) return Response.json({ user: null });
    if (wanted !== String(user.email).toLowerCase() && user.role !== 'admin') return Response.json({ user: null, unavailable: true });

    const target = (await base44.asServiceRole.entities.User.filter({ email: wanted }))?.[0];
    if (!target) return Response.json({ user: null });
    const out: Record<string, unknown> = {};
    for (const k of PUBLIC) if (target[k] !== undefined) out[k] = target[k];
    if (target.location_public === true && target.location) out.location = target.location;
    return Response.json({ user: out });
  } catch (error) {
    console.error('[getUserByEmail] error:', (error as Error)?.message);
    return Response.json({ error: 'server', message: 'Something went wrong. Please try again.' }, { status: 500 });
  }
});
