import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req, { serviceRole: true });
        
        const body = await req.json();
        const { event, data } = body;
        
        if (!event || event.type !== 'create' || !data) {
            return Response.json({ success: false, error: 'Invalid event' }, { status: 400 });
        }
        
        const message = data;
        
        await base44.asServiceRole.functions.invoke('sendNotification', {
            toUserEmail: message.receiver_email,
            title: `💬 New Message`,
            body: `${message.sender_name}: ${message.content.substring(0, 50)}...`,
            screen: '/Messages'
        });
        
        return Response.json({ success: true, message: 'DM notification sent' });
    } catch (err) {
        console.error('Error sending DM notification:', err);
        return Response.json({ success: false, error: err.message }, { status: 500 });
    }
});