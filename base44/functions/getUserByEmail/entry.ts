import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        console.log('🔍 Looking up user:', email);
        
        // Use service role to get user by email
        const users = await base44.asServiceRole.entities.User.filter({ email });
        
        if (users.length === 0) {
            console.log('❌ User not found');
            return Response.json({ user: null });
        }

        console.log('✅ User found:', users[0].email);
        console.log('📸 Profile picture:', users[0].profile_picture);
        
        return Response.json({ user: users[0] });
    } catch (error) {
        console.error('Error getting user by email:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});