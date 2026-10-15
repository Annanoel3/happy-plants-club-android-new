import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Google Play's account-deletion policy requires deleting the account AND the
// data tied to it. The old in-app flow only deleted plants and logged out.
// This removes every record that belongs to the signed-in user, unlinks their
// phone from push notifications, then deletes (or, failing that, scrubs) the user.

function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}

// entity -> the fields that tie a record to a user (matched against their email)
const OWNERSHIP: Record<string, string[]> = {
    Plant: ['created_by'],
    WateringLog: ['created_by'],
    PlantProgressPhoto: ['created_by'],
    VacationDay: ['created_by'],
    PlantConversation: ['created_by', 'user_email'],
    Reminder: ['created_by'],
    UserPlantCategory: ['created_by'],
    ChatMessage: ['created_by'],
    DailyWateringReminder: ['user_email'],
    Notification: ['user_email', 'from_user_email'],
    DirectMessage: ['sender_email', 'receiver_email'],
    FollowRequest: ['requester_email', 'target_email'],
    Follow: ['follower_email', 'following_email'],
    Block: ['blocker_email', 'blocked_email'],
    SharedGarden: ['owner_email'],
    Post: ['author_email'],
    Comment: ['author_email'],
    Like: ['user_email'],
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const email = user.email;
        const sr = base44.asServiceRole.entities as any;
        const deleted: Record<string, number> = {};

        // Plant ids first, so watering logs/photos created under another owner id
        // (older voice logs were saved by the server) still get removed.
        const plants = await sr.Plant.filter({ created_by: email }).catch(() => []);
        const plantIds = new Set(plants.map((p: any) => p.id));

        for (const [entity, fields] of Object.entries(OWNERSHIP)) {
            const ids = new Set<string>();
            for (const field of fields) {
                const rows = await sr[entity]?.filter({ [field]: email }).catch(() => []) || [];
                rows.forEach((r: any) => ids.add(r.id));
            }
            if ((entity === 'WateringLog' || entity === 'PlantProgressPhoto' || entity === 'Reminder') && plantIds.size) {
                const rows = await sr[entity].filter({ plant_id: { $in: [...plantIds] } }).catch(() => []);
                rows.forEach((r: any) => ids.add(r.id));
            }
            let n = 0;
            for (const id of ids) {
                try { await sr[entity].delete(id); n++; } catch (e) { console.warn('delete failed', entity, id, e?.message || e); }
            }
            deleted[entity] = n;
        }

        // Unlink their phone(s) from push notifications.
        const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
        const rest = Deno.env.get('ONESIGNAL_REST_API_KEY');
        if (appId && rest) {
            await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(email)}`, {
                method: 'DELETE',
                headers: { Authorization: osAuth(rest) },
            }).catch(() => {});
        }

        // Delete the account itself; if the platform refuses, wipe everything personal from it.
        let accountDeleted = false;
        try {
            await sr.User.delete(user.id);
            accountDeleted = true;
        } catch (e) {
            console.warn('User delete refused, scrubbing instead:', e?.message || e);
            await sr.User.update(user.id, {
                full_name: 'Deleted user', location: null, timezone: null, profile_picture: null,
                handle: null, bio: null, onesignal_player_ids: [], account_deleted: true,
                account_deleted_at: new Date().toISOString(),
            }).catch(() => {});
        }

        console.log('Account deleted', email, JSON.stringify(deleted), 'accountDeleted:', accountDeleted);
        return Response.json({ success: true, deleted, account_deleted: accountDeleted });
    } catch (error) {
        console.error('deleteMyAccount error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});
