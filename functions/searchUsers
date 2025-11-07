import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { query } = await req.json();

        if (!query || query.trim().length === 0) {
            return Response.json({ users: [] });
        }

        const cleanQuery = query.replace('@', '').toLowerCase();

        // Use service role to search all users
        const allUsers = await base44.asServiceRole.entities.User.list();
        
        const results = allUsers
            .filter(u => {
                const handleMatch = u.handle?.toLowerCase().includes(cleanQuery);
                const nameMatch = u.full_name?.toLowerCase().includes(cleanQuery);
                return (handleMatch || nameMatch) && u.email !== user.email; // Don't show current user
            })
            .slice(0, 20)
            .map(u => ({
                id: u.id,
                email: u.email,
                full_name: u.full_name,
                handle: u.handle,
                profile_picture: u.profile_picture,
                profile_private: u.profile_private
            }));

        return Response.json({ users: results });
    } catch (error) {
        console.error('Error searching users:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});