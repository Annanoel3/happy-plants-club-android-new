import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Find Friends search. Returns people by id, name, handle and photo (never emails), plus
// whether you already follow them or asked to. People who blocked you, or you blocked, are
// left out.

// Anna's test account (handle @admintestaccount) stays out of search results
// adhdone.space@gmail.com (@plantwhisperer239) is another of Anna's test accounts (it wrote "News feed test")
const HIDDEN_EMAILS = new Set(['mediocreatbestdev@outlook.com', 'adhdone.space@gmail.com']);
const HIDDEN_HANDLES = new Set(['admintestaccount']);

// A name that's just the start of someone's email would give the email away: show the handle instead
const nameOf = (u: any) => {
    const n = String(u?.full_name || '').trim();
    const local = String(u?.email || '').split('@')[0].toLowerCase();
    if (n && n.toLowerCase() !== local) return n;
    return u?.handle || 'Plant friend';
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'unauthorized', message: 'Please sign in.' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const q = String(body?.query || '').trim().replace(/^@/, '').toLowerCase();
        if (q.length < 2) return Response.json({ users: [] });

        const db = base44.asServiceRole.entities;
        const [allUsers, mine, theirs, follows, requests] = await Promise.all([
            db.User.list('-created_date', 5000),
            db.Block.filter({ blocker_email: user.email }),
            db.Block.filter({ blocked_email: user.email }),
            db.Follow.filter({ follower_email: user.email }),
            db.FollowRequest.filter({ requester_email: user.email, status: 'pending' }),
        ]);
        const hidden = new Set([...(mine || []).map((b: any) => b.blocked_email), ...(theirs || []).map((b: any) => b.blocker_email)]);
        const following = new Set((follows || []).map((f: any) => f.following_email));
        const asked = new Set((requests || []).map((r: any) => r.target_email));

        const results = (allUsers || [])
            .filter((u: any) => u.email !== user.email && !hidden.has(u.email)
                && !HIDDEN_EMAILS.has(String(u.email).toLowerCase()) && !HIDDEN_HANDLES.has(String(u.handle || '').toLowerCase()))
            .filter((u: any) => String(u.handle || '').toLowerCase().includes(q) || nameOf(u).toLowerCase().includes(q))
            .slice(0, 20)
            .map((u: any) => ({
                id: u.id,
                name: nameOf(u),
                handle: u.handle || null,
                photo: u.profile_picture || null,
                private: u.profile_private === true,
                i_follow: following.has(u.email),
                requested: asked.has(u.email),
            }));

        return Response.json({ users: results });
    } catch (error) {
        console.error('[searchUsers] error:', (error as Error)?.message);
        return Response.json({ error: 'server', message: 'Search isn’t working right now. Please try again.' }, { status: 500 });
    }
});
