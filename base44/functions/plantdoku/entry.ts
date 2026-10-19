import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Plantdoku daily puzzle: the server keeps the time and the leaderboard.
// Everyone gets the same puzzle for a date (the player's local date). The clock runs only
// while the puzzle is on screen: the app calls "start" when it shows and "pause" when the
// app goes to the background. Hints add 30 seconds. Finishing checks the answer here.
//   { action: 'start', date }            → state (starts or resumes the clock; nothing if done)
//   { action: 'pause', date }
//   { action: 'hint', date, plants }     → one hint (counted, +30 s)
//   { action: 'finish', date, plants }   → time, rank, top 5, stats
//   { action: 'board', date }            → top 5 + your place
//   { action: 'new_name' }               → a new leaderboard name (names are made up, never typed)
//
// The engine below is a copy of src/lib/plantdoku/engine.js (exports removed). If you change
// the engine, regenerate this file the same way, or the server and app will disagree.

const HINT_SECONDS = 30;
const MAX_STRETCH_MS = 2 * 60 * 60 * 1000; // a stretch with a lost "pause" counts at most 2 h

// @@ENGINE@@

function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function okDate(date: any): string | null {
    const d = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const utc = new Date().toISOString().slice(0, 10);
    // Any time zone's "today" is within a day of UTC's
    return [addDays(utc, -1), utc, addDays(utc, 1)].includes(d) ? d : null;
}
function h32(s: string): number {
    let x = 0;
    for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return x;
}
const ADJ = ['Mossy', 'Sunny', 'Leafy', 'Dewy', 'Sprouty', 'Breezy', 'Misty', 'Rooty', 'Petal', 'Fuzzy', 'Spiky', 'Bloomy', 'Cozy', 'Happy', 'Sleepy', 'Zippy'];
const NOUN = ['Fern', 'Cactus', 'Pothos', 'Monstera', 'Violet', 'Aloe', 'Ivy', 'Orchid', 'Basil', 'Tulip', 'Daisy', 'Pilea', 'Hoya', 'Sprout', 'Bonsai', 'Clover'];
function makeName(seed: string): string {
    const x = h32('name:' + seed);
    return `${ADJ[x % 16]} ${NOUN[(x >>> 4) % 16]} ${10 + ((x >>> 8) % 90)}`;
}
function nameOf(user: any): string {
    return user?.plantdoku_name || makeName(String(user?.id || user?.email));
}
function cleanPlants(size: number, plants: any): [number, number][] {
    if (!Array.isArray(plants)) return [];
    const out: [number, number][] = [];
    const seen = new Set<number>();
    for (const p of plants.slice(0, 20)) {
        const r = Number(p?.[0]), c = Number(p?.[1]);
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= size || c >= size) continue;
        if (seen.has(r * size + c)) continue;
        seen.add(r * size + c);
        out.push([r, c]);
    }
    return out;
}
const activeMs = (run: any, now: number) =>
    (Number(run.active_ms) || 0) + (run.running_since ? Math.min(MAX_STRETCH_MS, Math.max(0, now - Date.parse(run.running_since))) : 0);

async function boardFor(db: any, date: string, userId: string) {
    const rows = ((await db.PlantdokuRun.filter({ date }, 'seconds', 5000)) || [])
        .filter((r: any) => typeof r.seconds === 'number' && r.finished_at);
    rows.sort((a: any, b: any) => a.seconds - b.seconds || String(a.finished_at).localeCompare(String(b.finished_at)));
    const total = rows.length;
    const idx = rows.findIndex((r: any) => r.user_id === userId);
    const row = (r: any, i: number) => ({ rank: i + 1, name: r.board_name || makeName(r.user_id), seconds: r.seconds, hints: r.hints || 0, me: r.user_id === userId });
    const sorted = rows.map((r: any) => r.seconds);
    const median = total ? sorted[Math.floor((total - 1) / 2)] : null;
    let faster_than = null;
    if (idx >= 0 && total > 1) {
        const slower = rows.filter((r: any) => r.seconds > rows[idx].seconds).length;
        faster_than = Math.round((100 * slower) / (total - 1));
    }
    return {
        total,
        median,
        top: rows.slice(0, 5).map(row),
        me: idx >= 0 ? row(rows[idx], idx) : null,
        faster_than,
    };
}

async function statsFor(db: any, userId: string, today: string) {
    const runs = ((await db.PlantdokuRun.filter({ user_id: userId }, '-date', 400)) || []).filter((r: any) => r.finished_at);
    const days = new Set(runs.map((r: any) => String(r.date).slice(0, 10)));
    let streak = 0;
    let d = days.has(today) ? today : addDays(today, -1);
    while (days.has(d)) { streak++; d = addDays(d, -1); }
    let best = 0;
    let run = 0;
    const sortedDays = [...days].sort();
    for (let i = 0; i < sortedDays.length; i++) {
        run = i && addDays(sortedDays[i - 1], 1) === sortedDays[i] ? run + 1 : 1;
        best = Math.max(best, run);
    }
    const times = runs.map((r: any) => r.seconds).filter((s: any) => typeof s === 'number');
    return {
        solved: runs.length,
        streak,
        best_streak: best,
        best_time: times.length ? Math.min(...times) : null,
        avg_time: times.length ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length) : null,
    };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        const db = base44.asServiceRole.entities;
        const now = Date.now();

        if (body.action === 'new_name') {
            const n = (Number(user.plantdoku_name_n) || 0) + 1;
            const name = makeName(`${user.id}:${n}`);
            await db.User.update(user.id, { plantdoku_name: name, plantdoku_name_n: n });
            // Today's (and yesterday's) entries show the new name too
            const runs = (await db.PlantdokuRun.filter({ user_id: user.id }, '-date', 2)) || [];
            await Promise.allSettled(runs.map((r: any) => db.PlantdokuRun.update(r.id, { board_name: name })));
            return Response.json({ success: true, name });
        }

        const date = okDate(body.date);
        if (!date) return Response.json({ error: 'bad_date' }, { status: 400 });
        const size = dailySize(date);
        let run = ((await db.PlantdokuRun.filter({ user_id: user.id, date })) || [])[0] || null;

        if (body.action === 'board') {
            return Response.json({ success: true, date, board: await boardFor(db, date, user.id), name: nameOf(user) });
        }

        if (body.action === 'start') {
            if (!run) {
                run = await db.PlantdokuRun.create({
                    user_id: user.id, user_email: user.email, date, size,
                    started_at: new Date(now).toISOString(), active_ms: 0,
                    running_since: new Date(now).toISOString(), hints: 0, board_name: nameOf(user),
                });
            } else if (!run.finished_at && !run.running_since) {
                run = { ...run, running_since: new Date(now).toISOString() };
                await db.PlantdokuRun.update(run.id, { running_since: run.running_since });
            }
            const done = !!run.finished_at;
            return Response.json({
                success: true, date, size,
                elapsed_ms: done ? (run.raw_seconds || 0) * 1000 : activeMs(run, now),
                hints: run.hints || 0,
                finished: done,
                seconds: done ? run.seconds : null,
                name: nameOf(user),
                ...(done ? { board: await boardFor(db, date, user.id), stats: await statsFor(db, user.id, date) } : {}),
            });
        }

        if (!run) return Response.json({ error: 'not_started' }, { status: 400 });

        if (body.action === 'pause') {
            if (!run.finished_at && run.running_since) {
                await db.PlantdokuRun.update(run.id, { active_ms: activeMs(run, now), running_since: null });
            }
            return Response.json({ success: true });
        }

        if (body.action === 'hint') {
            if (run.finished_at) return Response.json({ error: 'finished' }, { status: 400 });
            const puzzle = makePuzzle(dailySeed(date), size);
            const hint = hintFor(size, puzzle.regions, puzzle.solution, cleanPlants(size, body.plants));
            if (!hint) return Response.json({ success: true, hint: null, hints: run.hints || 0 });
            const hints = (run.hints || 0) + 1;
            await db.PlantdokuRun.update(run.id, { hints });
            return Response.json({ success: true, hint, hints });
        }

        if (body.action === 'finish') {
            if (run.finished_at) {
                return Response.json({ success: true, already: true, seconds: run.seconds, raw_seconds: run.raw_seconds, hints: run.hints || 0, board: await boardFor(db, date, user.id), stats: await statsFor(db, user.id, date) });
            }
            const puzzle = makePuzzle(dailySeed(date), size);
            const plants = cleanPlants(size, body.plants);
            if (!isSolved(size, puzzle.regions, plants)) return Response.json({ error: 'not_solved' }, { status: 400 });
            const raw = Math.round(activeMs(run, now) / 1000);
            if (raw < 3) return Response.json({ error: 'too_fast' }, { status: 400 });
            const seconds = raw + HINT_SECONDS * (run.hints || 0);
            await db.PlantdokuRun.update(run.id, {
                finished_at: new Date(now).toISOString(), raw_seconds: raw, seconds,
                active_ms: activeMs(run, now), running_since: null, board_name: nameOf(user),
            });
            return Response.json({ success: true, seconds, raw_seconds: raw, hints: run.hints || 0, board: await boardFor(db, date, user.id), stats: await statsFor(db, user.id, date) });
        }

        return Response.json({ error: 'unknown_action' }, { status: 400 });
    } catch (error) {
        console.error('plantdoku', (error as Error)?.message);
        return Response.json({ error: (error as Error)?.message || 'error' }, { status: 500 });
    }
});
