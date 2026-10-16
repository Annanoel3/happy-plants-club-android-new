import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Recomputes your stats, tier and achievements from your real history
// (watering logs, plants, progress photos) instead of +1 counters.
//
// Why: the old counters were only bumped by the single-plant "Water" button on a
// plant's page. Bulk watering, Today/Yesterday/date picks, voice and chat logs
// never touched them, so someone who'd watered 50 plants could show "2".
// Recomputing from the logs can't drift, and fixes everyone's history at once.

const TIERS: [number, string][] = [
    [200, 'Legendary Botanist'],
    [100, 'Plant Whisperer'],
    [50, 'Master Gardener'],
    [25, 'Gold Thumb'],
    [10, 'Green Thumb'],
    [0, 'New Sprout'],
];
const tierFor = (n: number) => TIERS.find(([min]) => n >= min)![1];

// Growth stages by how many separate days a plant has been watered
const STAGES: [number, string][] = [[20, 'mature'], [15, 'large'], [10, 'medium'], [5, 'small'], [0, 'seedling']];
const stageFor = (n: number) => STAGES.find(([min]) => n >= min)![1];
const stageRank: Record<string, number> = { seedling: 0, small: 1, medium: 2, large: 3, mature: 4 };

type Def = { id: string; group: string; icon: string; name: string; desc: string; goal: number; metric: string };
// No daily streaks on purpose: rewarding watering every day teaches people to overwater.
const ACHIEVEMENTS: Def[] = [
    { id: 'water_1', group: 'Watering', icon: '💧', name: 'First Sip', desc: 'Log your first watering', goal: 1, metric: 'waterings' },
    { id: 'water_10', group: 'Watering', icon: '🚿', name: 'Getting the Hang of It', desc: 'Water plants 10 times', goal: 10, metric: 'waterings' },
    { id: 'water_50', group: 'Watering', icon: '🪣', name: 'Hydration Station', desc: 'Water plants 50 times', goal: 50, metric: 'waterings' },
    { id: 'water_100', group: 'Watering', icon: '🌧️', name: 'Rainmaker', desc: 'Water plants 100 times', goal: 100, metric: 'waterings' },
    { id: 'water_250', group: 'Watering', icon: '🌊', name: 'Monsoon Season', desc: 'Water plants 250 times', goal: 250, metric: 'waterings' },
    { id: 'water_500', group: 'Watering', icon: '🏞️', name: 'River Keeper', desc: 'Water plants 500 times', goal: 500, metric: 'waterings' },
    { id: 'water_1000', group: 'Watering', icon: '🌎', name: 'Water Cycle', desc: 'Water plants 1,000 times', goal: 1000, metric: 'waterings' },

    { id: 'plants_1', group: 'Collection', icon: '🌱', name: 'Plant Parent', desc: 'Add your first plant', goal: 1, metric: 'plants' },
    { id: 'plants_5', group: 'Collection', icon: '🪴', name: 'Little Family', desc: 'Have 5 plants', goal: 5, metric: 'plants' },
    { id: 'plants_10', group: 'Collection', icon: '🌿', name: 'Green Corner', desc: 'Have 10 plants', goal: 10, metric: 'plants' },
    { id: 'plants_25', group: 'Collection', icon: '🌳', name: 'Urban Jungle', desc: 'Have 25 plants', goal: 25, metric: 'plants' },
    { id: 'plants_50', group: 'Collection', icon: '🏡', name: 'Greenhouse', desc: 'Have 50 plants', goal: 50, metric: 'plants' },
    { id: 'plants_100', group: 'Collection', icon: '🌴', name: 'Botanical Garden', desc: 'Have 100 plants', goal: 100, metric: 'plants' },

    { id: 'species_5', group: 'Variety', icon: '🔍', name: 'Curious Collector', desc: 'Grow 5 different species', goal: 5, metric: 'species' },
    { id: 'species_15', group: 'Variety', icon: '📚', name: 'Plant Nerd', desc: 'Grow 15 different species', goal: 15, metric: 'species' },
    { id: 'species_30', group: 'Variety', icon: '🧬', name: 'Living Library', desc: 'Grow 30 different species', goal: 30, metric: 'species' },
    { id: 'spots_3', group: 'Variety', icon: '🏠', name: 'Room by Room', desc: 'Keep plants in 3 different spots', goal: 3, metric: 'spots' },
    { id: 'spots_6', group: 'Variety', icon: '🗺️', name: 'Whole House', desc: 'Keep plants in 6 different spots', goal: 6, metric: 'spots' },

    { id: 'grow_1', group: 'Growth', icon: '📈', name: 'Growth Spurt', desc: 'A plant grows to its next stage', goal: 1, metric: 'growths' },
    { id: 'grow_10', group: 'Growth', icon: '🌾', name: 'Green Thumb Rising', desc: '10 growth stages reached', goal: 10, metric: 'growths' },
    { id: 'mature_1', group: 'Growth', icon: '🌲', name: 'All Grown Up', desc: 'A plant reaches Mature', goal: 1, metric: 'mature' },
    { id: 'mature_5', group: 'Growth', icon: '🏆', name: 'Old Friends', desc: '5 plants reach Mature', goal: 5, metric: 'mature' },

    { id: 'photo_1', group: 'Memories', icon: '📸', name: 'Say Cheese', desc: 'Add a progress photo', goal: 1, metric: 'photos' },
    { id: 'photo_10', group: 'Memories', icon: '🖼️', name: 'Photo Journal', desc: 'Add 10 progress photos', goal: 10, metric: 'photos' },
    { id: 'photo_plants_5', group: 'Memories', icon: '🎞️', name: 'Glow-Up Tracker', desc: 'Progress photos for 5 different plants', goal: 5, metric: 'photo_plants' },

    { id: 'loyal_30', group: 'Dedication', icon: '📅', name: 'One Month In', desc: 'Care for plants for 30 days', goal: 30, metric: 'days_caring' },
    { id: 'loyal_180', group: 'Dedication', icon: '🗓️', name: 'Half a Year', desc: 'Care for plants for 6 months', goal: 180, metric: 'days_caring' },
    { id: 'loyal_365', group: 'Dedication', icon: '🎂', name: 'Plantiversary', desc: 'Care for plants for a full year', goal: 365, metric: 'days_caring' },
    { id: 'big_day_10', group: 'Dedication', icon: '⚡', name: 'Watering Day', desc: 'Water 10 plants in one day', goal: 10, metric: 'best_day' },
];

async function allRows(entity: any, query: any, max = 20000) {
    const out: any[] = [];
    for (let skip = 0; skip < max; skip += 500) {
        const page = await entity.filter(query, '-created_date', 500, skip);
        out.push(...page);
        if (page.length < 500) break;
    }
    return out;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const db = base44.asServiceRole.entities;

        const [plants, myLogs, photos] = await Promise.all([
            allRows(db.Plant, { created_by: user.email }),
            allRows(db.WateringLog, { created_by: user.email }),
            allRows(db.PlantProgressPhoto, { created_by: user.email }).catch(() => []),
        ]);

        // Older logs written by backend functions are owned by the service account;
        // pick those up too when they belong to one of your plants.
        const plantIds = new Set(plants.map((p: any) => p.id));
        let extraLogs: any[] = [];
        if (plantIds.size) {
            const ids = [...plantIds];
            for (let i = 0; i < ids.length; i += 100) {
                const chunk = await allRows(db.WateringLog, { plant_id: { $in: ids.slice(i, i + 100) } });
                extraLogs.push(...chunk.filter((l: any) => l.created_by !== user.email));
            }
        }
        const logs = [...myLogs, ...extraLogs];

        // One watering = one plant on one day (logging the same plant twice in a day counts once)
        const plantDays = new Set<string>();
        const perPlant = new Map<string, number>();
        const perDay = new Map<string, number>();
        let firstDay: string | null = null;
        for (const l of logs) {
            const day = String(l.watered_date || l.created_date || '').slice(0, 10);
            if (!day || !l.plant_id) continue;
            const key = `${l.plant_id}|${day}`;
            if (plantDays.has(key)) continue;
            plantDays.add(key);
            perPlant.set(l.plant_id, (perPlant.get(l.plant_id) || 0) + 1);
            perDay.set(day, (perDay.get(day) || 0) + 1);
            if (!firstDay || day < firstDay) firstDay = day;
        }
        for (const p of plants) {
            const d = String(p.created_date || '').slice(0, 10);
            if (d && (!firstDay || d < firstDay)) firstDay = d;
        }
        // Plants deleted/re-added over time still count: use when you joined, if you have plants
        const joined = String(user.created_date || '').slice(0, 10);
        if (plants.length && joined && (!firstDay || joined < firstDay)) firstDay = joined;

        const waterings = plantDays.size;

        // Per-plant growth: keep a plant's stage if it was already higher (never shrink a plant)
        let growths = 0;
        let mature = 0;
        const plantPatches: [string, any][] = [];
        for (const p of plants) {
            const n = perPlant.get(p.id) || 0;
            const computed = stageFor(n);
            const stage = (stageRank[p.growth_stage] ?? 0) > stageRank[computed] ? p.growth_stage : computed;
            growths += stageRank[stage] || 0;
            if (stage === 'mature') mature++;
            if (p.total_waterings !== n || p.growth_stage !== stage) {
                plantPatches.push([p.id, { total_waterings: n, growth_stage: stage }]);
            }
        }

        const norm = (s: any) => String(s || '').trim().toLowerCase();
        const species = new Set(plants.map((p: any) => norm(p.scientific_name) || norm(p.name)).filter(Boolean)).size;
        const spots = new Set(plants.map((p: any) => norm(p.location)).filter(Boolean)).size;
        const daysCaring = firstDay ? Math.floor((Date.now() - Date.parse(firstDay + 'T12:00:00Z')) / 86400000) : 0;

        const metrics: Record<string, number> = {
            waterings,
            plants: plants.length,
            species,
            spots,
            growths,
            mature,
            photos: photos.length,
            photo_plants: new Set(photos.map((p: any) => p.plant_id).filter(Boolean)).size,
            days_caring: Math.max(0, daysCaring),
            best_day: Math.max(0, ...perDay.values()),
        };

        // Achievements are kept once earned (deleting plants later doesn't take them away)
        const had: Record<string, string> = {};
        for (const a of Array.isArray(user.achievements) ? user.achievements : []) {
            if (a?.id) had[a.id] = a.at || new Date().toISOString();
        }
        const now = new Date().toISOString();
        const newlyUnlocked: Def[] = [];
        const unlocked: { id: string; at: string }[] = [];
        for (const def of ACHIEVEMENTS) {
            if (had[def.id]) unlocked.push({ id: def.id, at: had[def.id] });
            else if ((metrics[def.metric] || 0) >= def.goal) {
                unlocked.push({ id: def.id, at: now });
                newlyUnlocked.push(def);
            }
        }

        const tier = tierFor(waterings);
        const userPatch: any = {};
        if (user.lifetime_waterings !== waterings) userPatch.lifetime_waterings = waterings;
        if (user.total_plant_growths !== growths) userPatch.total_plant_growths = growths;
        if (user.current_tier !== tier) userPatch.current_tier = tier;
        if (newlyUnlocked.length || !Array.isArray(user.achievements)) userPatch.achievements = unlocked;

        await Promise.all([
            Object.keys(userPatch).length ? base44.auth.updateMe(userPatch) : null,
            ...plantPatches.map(([id, patch]) => db.Plant.update(id, patch)),
        ]);

        const nextTier = [...TIERS].reverse().find(([min]) => min > waterings);
        return Response.json({
            success: true,
            stats: { ...metrics, tier, next_tier: nextTier ? { name: nextTier[1], at: nextTier[0] } : null },
            tier_changed: !!user.current_tier && user.current_tier !== tier,
            newly_unlocked: newlyUnlocked.map(d => ({ id: d.id, icon: d.icon, name: d.name })),
            achievements: ACHIEVEMENTS.map(d => ({
                id: d.id, group: d.group, icon: d.icon, name: d.name, desc: d.desc, goal: d.goal,
                progress: Math.min(metrics[d.metric] || 0, d.goal),
                unlocked_at: unlocked.find(u => u.id === d.id)?.at || null,
            })),
        });
    } catch (error) {
        console.error('syncMyStats', error);
        return Response.json({ error: (error as Error).message }, { status: 500 });
    }
});
