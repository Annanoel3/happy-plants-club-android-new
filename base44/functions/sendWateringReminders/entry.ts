import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OneSignal auth: new keys (os_v2_...) use "Key", legacy keys use "Basic".
function osAuth(key: string | undefined | null): string {
    const k = (key || '').trim();
    return k.startsWith('os_v2') ? `Key ${k}` : `Basic ${k}`;
}


function getTodayInTimezone(timezone) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

function localHour(timezone) {
    return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()), 10);
}

// Runs every hour. Each user gets the digest during their own 8 AM hour (local),
// with catch-up until 11 AM if a run was missed. Sending at that moment (not
// pre-scheduling hours ahead) means the count is current: plants watered at 7:30
// aren't counted, and far-west timezones no longer get it the night before.
const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 11;

function onVacation(p: any, today: string): boolean {
    if (!p.vacation_mode_enabled) return false;
    const start = p.vacation_start_date ? String(p.vacation_start_date).slice(0, 10) : null;
    const end = p.vacation_end_date ? String(p.vacation_end_date).slice(0, 10) : null;
    if (start && today < start) return false;
    if (end && today > end) return false;
    return true;
}

function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
// Garden-wide vacation (Schedule > Vacations): the trip that covers `today`. An unconfirmed
// sitter plan also covers the 2 days after the trip, so the first morning home doesn't say
// "16 plants need water" before the app has asked "did your sitter water as planned?".
// Same rule in wateringReminder and src/lib/vacation.js: keep in sync.
function tripCovering(trips: any[] | undefined, today: string): any | null {
    for (const v of trips || []) {
        const s = String(v.start_date || '').slice(0, 10), e = String(v.end_date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) continue;
        const pending = v.sitter_plan?.visits?.length && (!v.status || v.status === 'planned');
        if (today >= s && today <= (pending ? addDays(e, 2) : e)) return v;
    }
    return null;
}

// Plus: ounces to give (same formula as src/lib/waterAmount.js). No pot width = no amount; never guessed.
// How it's watered (same rule as src/lib/waterAmount.js waterMethod)
const METHODS = ['pour', 'reservoir', 'soak', 'mist', 'bottom', 'in_water'];
function waterMethod(p: any): string {
    const set = METHODS.includes(p.water_method) ? p.water_method : null;
    if (set && p.care_profile?.user_method) return set;
    if (p.pot_type === 'Self-watering') return 'reservoir';
    return set || 'pour';
}
// One plant due: "Staghorn fern needs a soak (about 20 min)" instead of "needs water"
const METHOD_PHRASE: Record<string, string> = {
    reservoir: 'needs its reservoir filled', soak: 'needs a soak (about 20 min)', mist: 'needs misting',
    bottom: 'needs water from below (about 30 min)', in_water: 'needs fresh water',
};
function ozText(p: any): string | null {
    if (waterMethod(p) !== 'pour' || p.pot_diameter_in === 0) return null;
    const w = Number(p.pot_diameter_in) > 0 ? Number(p.pot_diameter_in) : null;
    if (!w) return null;
    const raw = 0.545 * w * w * w * 0.10 * 0.554;
    const oz = raw < 1 ? 1 : raw < 16 ? Math.round(raw) : raw < 64 ? Math.round(raw / 2) * 2 : Math.round(raw / 8) * 8;
    return `about ${oz} oz`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const now = new Date();
        
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const rest = Deno.env.get("ONESIGNAL_REST_API_KEY");
        
        if (!appId || !rest) {
            return Response.json({ error: 'Missing OneSignal credentials' }, { status: 500 });
        }
        
        // Page through every plant (a bare list() stops at the first page, which
        // silently left some people's plants out of the digest)
        const allPlants: any[] = [];
        for (let skip = 0; skip < 20000; skip += 500) {
            const page = await base44.asServiceRole.entities.Plant.list('-created_date', 500, skip);
            allPlants.push(...(page || []));
            if (!page || page.length < 500) break;
        }
        const userEmails = [...new Set(allPlants.map(p => p.created_by).filter(Boolean))];
        const activeSubs = (await base44.asServiceRole.entities.Subscription.filter({ active: true }).catch(() => [])) || [];
        const plusIds = new Set(activeSubs
            .filter((s: any) => !s.expires_at || Date.parse(s.expires_at) > Date.now())
            .map((s: any) => s.user_id));
        // Trips, by owner (only ones that haven't long ended)
        const tripsBy = new Map<string, any[]>();
        const cutoff = addDays(new Date().toISOString().slice(0, 10), -4);
        for (let skip = 0; skip < 5000; skip += 500) {
            const page = (await base44.asServiceRole.entities.VacationDay.list('-created_date', 500, skip).catch(() => [])) || [];
            for (const v of page) {
                if (!v.created_by || String(v.end_date || '').slice(0, 10) < cutoff) continue;
                if (!tripsBy.has(v.created_by)) tripsBy.set(v.created_by, []);
                tripsBy.get(v.created_by)!.push(v);
            }
            if (page.length < 500) break;
        }
        
        let scheduledCount = 0;
        
        for (const userEmail of userEmails) {
            const targetUsers = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            const targetUser = targetUsers[0];
            
            if (!targetUser) continue;
            
            if (targetUser.notifications_watering === false) continue;
            // Phones on the new build show their own watering pop-up (Done / Later today)
            // at 8 AM; skip the push for them so nobody gets both. The stamp is refreshed
            // each time that pop-up checks in with the server (and when the app opens with
            // reminders on and notifications allowed). If it goes quiet for 36 hours
            // (uninstalled, signed out, battery saver killed it) the push takes over again.
            const nativeAt = targetUser.watering_popups_native_at ? Date.parse(targetUser.watering_popups_native_at) : 0;
            if (nativeAt && Date.now() - nativeAt < 36 * 3600 * 1000) continue;
            let userTimezone = targetUser.timezone || 'America/Chicago';
            try { new Intl.DateTimeFormat('en-US', { timeZone: userTimezone }); } catch { userTimezone = 'America/Chicago'; }
            const hourNow = localHour(userTimezone);
            if (hourNow < SEND_FROM_HOUR || hourNow > SEND_UNTIL_HOUR) continue;
            const today = getTodayInTimezone(userTimezone);
            if (tripCovering(tripsBy.get(userEmail), today)) continue; // away: garden-wide pause
            
            // Fetch plants needing water
            // Due today or earlier, not on vacation, not already watered today
            const userPlants = allPlants.filter(p => 
                p.created_by === userEmail && 
                p.next_watering_due && 
                String(p.next_watering_due).slice(0, 10) <= today &&
                !onVacation(p, today) &&
                String(p.last_watered || '').slice(0, 10) !== today
            );
            const plus = plusIds.has(targetUser.id);
            const wt = targetUser.weather_day === today ? targetUser.weather_today : null;
            const rainCovered = plus ? (wt?.counts?.rain_credit || 0) : 0;
            
            // Custom reminders push on their own at their own time (sendCustomReminders),
            // so the digest is plants only — no double notifications.
            const userReminders: any[] = [];
            
            const totalTasks = userPlants.length;
            if (totalTasks === 0) continue;
            
            const existingReminders = await base44.asServiceRole.entities.DailyWateringReminder.filter({
                user_email: userEmail,
                reminder_date: today
            });
            
            let reminder = existingReminders[0];
            
            if (reminder?.dismissed) continue;
            if (reminder?.scheduled_notification_ids?.length > 0) continue;
            
            
            const plantCount = userPlants.length;
            const reminderCount = userReminders.length;
            const plantIds = userPlants.map(p => p.id);
            
            // Create/update the DailyWateringReminder record BEFORE sending the notification.
            // This acts as a lock so concurrent runs don't send duplicate notifications.
            if (reminder) {
                await base44.asServiceRole.entities.DailyWateringReminder.update(reminder.id, {
                    plants_needing_water: plantIds,
                    scheduled_notification_ids: ['pending']
                });
            } else {
                reminder = await base44.asServiceRole.entities.DailyWateringReminder.create({
                    user_email: userEmail,
                    reminder_date: today,
                    dismissed: false,
                    plants_needing_water: plantIds,
                    scheduled_notification_ids: ['pending']
                });
            }
            
            let notificationText;
            if (plantCount > 0 && reminderCount > 0) {
                notificationText = `${plantCount} plant${plantCount === 1 ? '' : 's'} + ${reminderCount} reminder${reminderCount === 1 ? '' : 's'}`;
            } else if (plantCount === 1 && METHOD_PHRASE[waterMethod(userPlants[0])]) {
                notificationText = `${userPlants[0].nickname || userPlants[0].name || 'A plant'} ${METHOD_PHRASE[waterMethod(userPlants[0])]}`;
            } else if (plantCount === 1 && plus && ozText(userPlants[0])) {
                notificationText = `${userPlants[0].nickname || userPlants[0].name || 'A plant'} needs water (${ozText(userPlants[0])})`;
            } else if (plantCount > 0) {
                notificationText = `${plantCount} plant${plantCount === 1 ? ' needs' : 's need'} water`;
            } else {
                notificationText = `${reminderCount} reminder${reminderCount === 1 ? ' awaits' : 's await'}`;
            }
            
            const notificationIds = [];
            
            // Send now — this run is already inside the user's 8 AM hour
            const osPayload = {
                app_id: appId.trim(),
                include_aliases: { external_id: [userEmail] }, target_channel: 'push',
                headings: { en: '💧 Plant Care Reminder' },
                contents: { en: `${notificationText} today! 🌱${rainCovered ? ` Rain took care of ${rainCovered} outdoor plant${rainCovered === 1 ? '' : 's'}.` : ''}` },
                data: { type: 'care_reminder', plant_count: plantCount, reminder_count: reminderCount, date: today },
                priority: 10,
                ttl: 8 * 60 * 60,
            };
            
            let osResult: any = {};
            try {
            const osResponse = await fetch("https://api.onesignal.com/notifications", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": osAuth(rest.trim())
                },
                body: JSON.stringify(osPayload)
            });
            
            osResult = await osResponse.json();
            } catch (sendErr) {
                console.error('OneSignal send failed for', targetUser.id, (sendErr as Error)?.message || sendErr);
            }
            // No email or OneSignal error body here: those can list the person's email
            console.log(`Sent morning digest for ${targetUser.id}: id=${osResult.id}, errors=${osResult.errors ? 'yes' : 'no'}`);
            
            if (osResult.id) {
                notificationIds.push(osResult.id);
            }
            
            // Update with the real notification ID (or clear placeholder on failure)
            await base44.asServiceRole.entities.DailyWateringReminder.update(reminder.id, {
                plants_needing_water: plantIds,
                scheduled_notification_ids: notificationIds
            });
            
            if (notificationIds.length > 0) scheduledCount++;
        }
        
        return Response.json({ 
            success: true, 
            users_with_scheduled_reminders: scheduledCount,
            time: now.toISOString()
        });
        
    } catch (error) {
        console.error('Watering reminder error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});