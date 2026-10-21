import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Google Play's account-deletion policy requires deleting the account AND the
// data tied to it. This removes every record that belongs to the signed-in user,
// unlinks their phone from push notifications, then deletes (or, failing that,
// scrubs) the user.
//
// Not deleted, on purpose:
//  - CareSheet, PlantPhotoRef, WeatherCache: shared caches with no user data in them.
//  - Reports other people made about this user (moderation records); reports this
//    user made are deleted.
//  - Uploaded photo files: the Base44 SDK has no way to delete a stored file, so
//    only the records pointing to them are removed.

function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}

type Who = 'email' | 'id';
const CREATED: Array<[string, Who]> = [['created_by', 'email'], ['created_by_id', 'id']];

// entity -> the fields that tie a record to a user, and whether they hold the email or the id
const OWNERSHIP: Record<string, Array<[string, Who]>> = {
    Plant: CREATED,
    WateringLog: CREATED,
    PlantProgressPhoto: CREATED,
    HealthCheck: CREATED,
    VacationDay: CREATED,
    Reminder: CREATED,
    UserPlantCategory: CREATED,
    ChatMessage: CREATED,
    GameEvent: CREATED,
    PlantConversation: [...CREATED, ['user_email', 'email']],
    DailyWateringReminder: [...CREATED, ['user_email', 'email']],
    // Newer notifications store who sent them by id (from_user_id), not email
    Notification: [['user_email', 'email'], ['from_user_email', 'email'], ['from_user_id', 'id']],
    DirectMessage: [['sender_email', 'email'], ['receiver_email', 'email']],
    FollowRequest: [['requester_email', 'email'], ['target_email', 'email']],
    Follow: [['follower_email', 'email'], ['following_email', 'email']],
    Block: [['blocker_email', 'email'], ['blocked_email', 'email']],
    SharedGarden: [...CREATED, ['owner_email', 'email']],
    Post: [...CREATED, ['author_email', 'email']],
    Comment: [...CREATED, ['author_email', 'email']],
    Like: [...CREATED, ['user_email', 'email']],
    AiUsage: [['user_email', 'email'], ['user_id', 'id']],
    PlantdokuRun: [['user_email', 'email'], ['user_id', 'id']],
    Subscription: [['user_email', 'email'], ['user_id', 'id']],
    Report: [['reporter_email', 'email']],
    // May not exist yet; a missing entity just finds nothing
    PlantIdCharge: [...CREATED, ['user_email', 'email'], ['user_id', 'id']],
};

// Records hanging off the user's plants (some older ones were saved by the server
// under another owner), and other people's comments/likes on the user's posts.
const BY_PLANT = ['WateringLog', 'PlantProgressPhoto', 'Reminder', 'HealthCheck', 'PlantConversation'];
const BY_POST = ['Comment', 'Like'];

const PAGE = 500;
const MAX_ROWS = 50000;

// Reads every page (the default page size would silently skip the rest).
async function findAll(ent: any, query: Record<string, unknown>): Promise<any[]> {
    const out: any[] = [];
    for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
        const rows = await ent.filter(query, 'created_date', PAGE, skip);
        if (!Array.isArray(rows) || rows.length === 0) break;
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

function chunks<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        const email = typeof user?.email === 'string' ? user.email.trim() : '';
        const userId = typeof user?.id === 'string' ? user.id.trim() : '';
        // Both must be real values: an empty filter would match EVERYONE's records.
        if (!email || !userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const valueFor = (who: Who) => (who === 'email' ? email : userId);

        const sr = base44.asServiceRole.entities as any;
        const deleted: Record<string, number> = {};
        const failed: Record<string, number> = {};
        const toDelete: Record<string, Set<string>> = {};
        const mark = (entity: string, id: string) => {
            if (!id) return;
            (toDelete[entity] ||= new Set()).add(id);
        };

        // 1. Records with an owner field, re-checked row by row before marking
        for (const [entity, fields] of Object.entries(OWNERSHIP)) {
            const ent = sr[entity];
            if (!ent?.filter) continue;
            for (const [field, who] of fields) {
                const value = valueFor(who);
                try {
                    const rows = await findAll(ent, { [field]: value });
                    for (const r of rows) if (r?.[field] === value) mark(entity, r.id);
                } catch (e) {
                    // Unknown entity/field: nothing of theirs there
                    console.warn('lookup skipped', entity, field, (e as Error)?.message || e);
                }
            }
        }

        // 2. Records tied to their plants and posts
        const plantIds = [...(toDelete.Plant || [])];
        const plantSet = new Set(plantIds);
        const postIds = [...(toDelete.Post || [])];
        const postSet = new Set(postIds);
        for (const entity of BY_PLANT) {
            for (const group of chunks(plantIds, 100)) {
                try {
                    const rows = await findAll(sr[entity], { plant_id: { $in: group } });
                    for (const r of rows) if (plantSet.has(r?.plant_id)) mark(entity, r.id);
                } catch (e) { console.warn('plant lookup failed', entity, (e as Error)?.message || e); }
            }
        }
        for (const entity of BY_POST) {
            for (const group of chunks(postIds, 100)) {
                try {
                    const rows = await findAll(sr[entity], { post_id: { $in: group } });
                    for (const r of rows) if (postSet.has(r?.post_id)) mark(entity, r.id);
                } catch (e) { console.warn('post lookup failed', entity, (e as Error)?.message || e); }
            }
        }

        // 3. Delete, 10 at a time, one retry each
        for (const [entity, ids] of Object.entries(toDelete)) {
            let ok = 0, bad = 0;
            for (const group of chunks([...ids], 10)) {
                const results = await Promise.all(group.map(async (id) => {
                    for (let attempt = 0; attempt < 2; attempt++) {
                        try { await sr[entity].delete(id); return true; } catch (e) {
                            if (attempt === 1) console.warn('delete failed', entity, id, (e as Error)?.message || e);
                        }
                    }
                    return false;
                }));
                for (const r of results) r ? ok++ : bad++;
            }
            deleted[entity] = ok;
            if (bad) failed[entity] = bad;
        }

        // 4. Unlink their phone(s) from push notifications.
        const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
        const rest = Deno.env.get('ONESIGNAL_REST_API_KEY');
        if (appId && rest) {
            await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(email)}`, {
                method: 'DELETE',
                headers: { Authorization: osAuth(rest) },
            }).catch(() => {});
        }

        // 5. Delete the account itself; if the platform refuses, wipe everything personal from it.
        let accountDeleted = false;
        try {
            await sr.User.delete(userId);
            accountDeleted = true;
        } catch (e) {
            console.warn('User delete refused, scrubbing instead:', (e as Error)?.message || e);
            await sr.User.update(userId, {
                full_name: 'Deleted user', location: null, timezone: null, profile_picture: null,
                location_lat: null, location_lon: null, location_label: null, location_geocoded_for: null,
                weather_today: null,
                handle: null, bio: null, onesignal_player_ids: [], account_deleted: true,
                account_deleted_at: new Date().toISOString(),
            }).catch(() => {});
        }

        if (Object.keys(failed).length) console.error('Account delete left records behind', userId, JSON.stringify(failed));
        console.log('Account deleted', userId, JSON.stringify(deleted), 'accountDeleted:', accountDeleted);
        return Response.json({ success: true, deleted, failed, account_deleted: accountDeleted });
    } catch (error) {
        console.error('deleteMyAccount error:', (error as Error)?.message || error);
        return Response.json({ success: false, error: 'delete_failed' }, { status: 500 });
    }
});
