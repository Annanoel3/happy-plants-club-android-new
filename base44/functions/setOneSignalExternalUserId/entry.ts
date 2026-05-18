import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const playerId = body.playerId;
        const externalId = body.externalId || user.email;

        if (!playerId) {
            return Response.json({ success: false, error: 'No playerId provided' }, { status: 400 });
        }

        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

        if (!appId || !restApiKey) {
            return Response.json({ success: false, error: 'OneSignal credentials not configured' }, { status: 500 });
        }

        console.log(`Linking player ${playerId} → external_id: ${externalId}`);

        // Use the OneSignal Users API to set the alias on this subscription (player)
        const response = await fetch(`https://onesignal.com/api/v1/apps/${appId}/users/by/onesignal_id/${playerId}/identity`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${restApiKey}`
            },
            body: JSON.stringify({
                identity: {
                    external_id: externalId
                }
            })
        });

        const data = await response.json();
        console.log('OneSignal identity response:', JSON.stringify(data));

        if (!response.ok) {
            // Fallback: try the old players API with external_user_id
            console.log('Identity API failed, trying legacy players API...');
            const legacyResp = await fetch(`https://onesignal.com/api/v1/players/${playerId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${restApiKey}`
                },
                body: JSON.stringify({
                    app_id: appId,
                    external_user_id: externalId
                })
            });
            const legacyData = await legacyResp.json();
            console.log('Legacy players API response:', JSON.stringify(legacyData));
            return Response.json({ success: legacyResp.ok, data: legacyData });
        }

        return Response.json({ success: true, data });
    } catch (error) {
        console.error('Error linking external_id:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});