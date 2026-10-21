import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@2.5.1';

// Vacation plan for the plant sitter.
//   { action: 'plan', vacation_id, visit_every }  → the plan (for the preview in the app)
//   { action: 'pdf',  vacation_id, visit_every }  → saves the plan, makes the PDF and returns it
//                                                   as base64 (the app shares or downloads it;
//                                                   no upload, so no Base44 credits)
//     + deliver: 'link'                            → older app builds that can't share a file:
//                                                   uploads it privately and returns a link that
//                                                   works for 15 minutes (2 Base44 credits)
//   { action: 'confirm', vacation_id }            → "the sitter followed the plan": log those waterings
//   { action: 'dismiss', vacation_id }            → don't ask again
// visit_every: 0 = come only on days a plant needs water; 2 / 3 = every 2 or 3 days;
// 3.5 = twice a week; 7 = once a week. With set visits, each plant is watered at the visit
// closest to its due day (a tie goes to the earlier visit). A later visit is only used if
// the plant can wait that long: never for plants marked "keep exact days" or watered every
// 1-3 days, up to half its usual gap for most plants, up to three quarters of it for
// drought-tolerant ones. Plants that still have to wait too long are listed as warnings in
// the app, and the sitter is asked to check them at every visit.
// Before the trip the owner is assumed to keep watering on schedule.
// All dates are plain YYYY-MM-DD in the owner's calendar (no time zones involved).

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function addDays(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function nice(day: string, long = false): string {
    const d = new Date(day + 'T12:00:00Z');
    const wd = WEEKDAY[d.getUTCDay()];
    return `${long ? wd : wd.slice(0, 3)}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function localDay(tz?: string): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}

// How it's watered (same rule as src/lib/waterAmount.js)
const METHODS = ['pour', 'reservoir', 'soak', 'mist', 'bottom', 'in_water'];
function waterMethod(p: any): string {
    const set = METHODS.includes(p.water_method) ? p.water_method : null;
    if (set && p.care_profile?.user_method) return set;
    if (p.pot_type === 'Self-watering') return 'reservoir';
    return set || 'pour';
}
const GUESS: Record<string, number> = { Seedling: 3, Small: 4, Medium: 6, Large: 10, Mature: 12 };
function howText(p: any, plus: boolean): string {
    const m = waterMethod(p);
    if (m === 'reservoir') return 'Refill the reservoir if it is empty';
    if (m === 'soak') return 'Soak in water about 20 min, then let it drain';
    if (m === 'mist') return 'Mist until water runs off';
    if (m === 'bottom') return 'Set the pot in a saucer of water about 30 min, then pour off the rest';
    if (m === 'in_water') return 'Top up / change the water';
    if (p.pot_diameter_in === 0) return 'Water slowly at the base until soaked';
    let oz = '';
    if (plus) {
        const w = Number(p.pot_diameter_in) > 0 ? Number(p.pot_diameter_in) : GUESS[p.plant_size] || 0;
        if (w) {
            const raw = 0.545 * w * w * w * 0.10 * 0.554;
            const n = raw < 1 ? 1 : raw < 16 ? Math.round(raw) : raw < 64 ? Math.round(raw / 2) * 2 : Math.round(raw / 8) * 8;
            oz = ` (about ${n} oz)`;
        }
    }
    return `Water until a little drains out the bottom${oz}`;
}

function toBase64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

function onPlantVacation(p: any, day: string): boolean {
    if (!p.vacation_mode_enabled) return false;
    const s = p.vacation_start_date ? String(p.vacation_start_date).slice(0, 10) : null;
    const e = p.vacation_end_date ? String(p.vacation_end_date).slice(0, 10) : null;
    if (s && day < s) return false;
    if (e && day > e) return false;
    return true;
}

function visitDays(start: string, end: string, every: number): string[] | null {
    if (!(every >= 2)) return null; // as needed
    const out: string[] = [];
    let d = start, k = 0;
    while (d <= end && out.length < 400) {
        out.push(d);
        const step = every === 3.5 ? (k % 2 === 0 ? 3 : 4) : Math.round(every);
        d = addDays(d, step);
        k++;
    }
    return out;
}

function makePlan(plants: any[], vac: any, every: number, plus: boolean, today: string) {
    const start = String(vac.start_date).slice(0, 10), end = String(vac.end_date).slice(0, 10);
    const notes = vac.plant_notes || {};
    const visits = visitDays(start, end, every);
    const byDay = new Map<string, any[]>();
    const warnings: any[] = [];
    const notNeeded: any[] = [];
    for (const p of plants) {
        const freq = Math.max(1, Number(p.water_frequency_days) || 7);
        const item = {
            id: p.id,
            name: p.nickname || p.name || 'Plant',
            sci: p.scientific_name || null,
            area: String(p.location || '').trim() || 'Other plants',
            how: howText(p, plus),
            note: notes[p.id] || null,
            strict: !!p.water_strict,
            every: freq,
        };
        if (onPlantVacation(p, start)) { notNeeded.push({ ...item, why: 'paused' }); continue; }
        const drought = !!p.care_profile?.drought_tolerant;
        // how many days late is still fine for this plant
        const okLate = item.strict || freq <= 3 ? 0 : drought ? Math.max(2, Math.floor(freq * 0.75)) : Math.max(1, Math.floor(freq / 2));
        let last = DATE.test(String(p.last_watered || '').slice(0, 10)) ? String(p.last_watered).slice(0, 10) : null;
        let due = DATE.test(String(p.next_watering_due || '').slice(0, 10)) ? String(p.next_watering_due).slice(0, 10) : (last ? addDays(last, freq) : start);
        // Until the trip starts the owner waters as usual
        for (let g = 0; g < 100 && due < start; g++) {
            const d = due < today ? today : due;
            if (d >= start) break;
            last = d;
            due = addDays(d, freq);
        }
        let count = 0, worstLate = 0;
        for (let guard = 0; guard < 200 && due <= end; guard++) {
            const target = due < start ? start : due;
            let day: string | null;
            if (!visits) {
                day = target;
            } else {
                const after = (v: string) => !last || v > last;
                const before = visits.filter((v) => v <= target && after(v));
                const early = before.length ? before[before.length - 1] : null;
                const later = visits.find((v) => v > target && after(v)) || null;
                if (!early || !later) day = early || later;
                else {
                    const e = daysBetween(early, target), l = daysBetween(target, later);
                    day = l <= okLate && l < e ? later : early;
                }
            }
            if (!day) break;
            const late = Math.max(0, daysBetween(target, day));
            worstLate = Math.max(worstLate, late);
            if (!byDay.has(day)) byDay.set(day, []);
            byDay.get(day)!.push({ ...item, late });
            count++;
            last = day;
            due = addDays(day, freq);
        }
        if (!count) notNeeded.push({ ...item, why: 'not_due' });
        if (worstLate > okLate) {
            warnings.push({ id: p.id, name: item.name, area: item.area, every: freq, late: worstLate });
        }
    }
    const days = [...byDay.keys()].sort();
    const visitsOut = days.map((date) => {
        const items = byDay.get(date)!;
        const areas = new Map<string, any[]>();
        for (const it of items) { if (!areas.has(it.area)) areas.set(it.area, []); areas.get(it.area)!.push(it); }
        return {
            date,
            count: items.length,
            areas: [...areas.entries()]
                // biggest area first; plants with no area last
                .sort((a, b) => (Number(a[0] === 'Other plants') - Number(b[0] === 'Other plants')) || b[1].length - a[1].length || a[0].localeCompare(b[0]))
                .map(([area, list]) => ({ area, plants: list.sort((a, b) => a.name.localeCompare(b.name)) })),
        };
    });
    return { start, end, every, visit_days: visits, visits: visitsOut, warnings, not_needed: notNeeded };
}

// The PDF's built-in font only has Latin-1 letters: emoji or other scripts in a plant's
// name would print as junk, so they're swapped for plain characters or dropped.
function clean(s: any): string {
    return String(s ?? '')
        .replace(/[‘’‚′]/g, "'")
        .replace(/[“”„″]/g, '"')
        .replace(/[–—−]/g, '-')
        .replace(/…/g, '...')
        .replace(/[•·]/g, '-')
        .normalize('NFC')
        .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function buildPdf(plan: any, vac: any) {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = 216, M = 16, maxY = 262;
    let y = 20;
    const page = () => { doc.addPage(); y = 18; };
    const need = (h: number) => { if (y + h > maxY) page(); };
    const green: [number, number, number] = [22, 128, 61];

    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...green);
    doc.text('Plant care while we\'re away', M, y); y += 9;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(70, 70, 70);
    doc.text(`${nice(plan.start, true)} to ${nice(plan.end, true)}`, M, y); y += 6;
    const visitLine = plan.every >= 2
        ? `Please come ${plan.every === 3.5 ? 'twice a week' : plan.every === 7 ? 'once a week' : `every ${plan.every} days`}: ${plan.visits.map((v: any) => nice(v.date)).join(', ') || 'no watering needed'}.`
        : `Please come on these days: ${plan.visits.map((v: any) => nice(v.date)).join(', ') || 'no watering needed'}.`;
    const vl = doc.splitTextToSize(visitLine, W - 2 * M);
    doc.text(vl, M, y); y += vl.length * 5 + 3;

    const block = (title: string, text: string) => {
        if (!text) return;
        const lines = doc.splitTextToSize(text, W - 2 * M);
        need(8 + lines.length * 5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
        doc.text(title, M, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
        doc.text(lines, M, y); y += lines.length * 4.6 + 3;
    };
    block('Notes', clean(vac.notes));
    block('Other instructions', clean(vac.custom_instructions));

    if (plan.warnings.length) {
        // Plants that would wait too long between visits: the sitter checks them every time
        const names = plan.warnings.map((w: any) => `${clean(w.name) || 'Plant'} (${clean(w.area)})`).join(', ');
        const wrapped = doc.splitTextToSize(`At every visit, touch the soil of these plants and water them if the top inch is dry: ${names}.`, W - 2 * M - 6);
        need(10 + wrapped.length * 4.6);
        doc.setFillColor(255, 243, 205); doc.setDrawColor(230, 190, 90);
        doc.roundedRect(M, y - 4, W - 2 * M, 8 + wrapped.length * 4.6, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(120, 80, 0);
        doc.text('Check these every visit', M + 3, y + 1); y += 5.5;
        doc.setFont('helvetica', 'normal');
        doc.text(wrapped, M + 3, y); y += wrapped.length * 4.6 + 5;
    }

    for (const v of plan.visits) {
        need(24);
        const dayHeader = (cont = false) => {
            doc.setFillColor(...green);
            doc.rect(M, y - 5, W - 2 * M, 9, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
            doc.text(`${nice(v.date, true)}${cont ? ' (continued)' : ''}`, M + 3, y + 1);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
            doc.text(`${v.count} plant${v.count === 1 ? '' : 's'}`, W - M - 3, y + 1, { align: 'right' });
            y += 9;
        };
        dayHeader();
        for (const a of v.areas) {
            need(14);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...green);
            doc.text(`${clean(a.area) || 'Other plants'} (${a.plants.length})`, M, y); y += 5.5;
            for (const p of a.plants) {
                const name = clean(p.name) || 'Plant', sci = clean(p.sci);
                const how = doc.splitTextToSize(p.how, W - 2 * M - 10);
                const note = clean(p.note) ? doc.splitTextToSize(`Note: ${clean(p.note)}`, W - 2 * M - 10) : [];
                const h = 5 + how.length * 4.2 + note.length * 4.2 + 2;
                if (y + h > maxY) { page(); dayHeader(true); }
                doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3);
                doc.rect(M, y - 3.2, 3.8, 3.8);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(20, 20, 20);
                doc.text(name, M + 6, y);
                if (sci && sci.toLowerCase() !== name.toLowerCase()) {
                    const nw = doc.getTextWidth(name);
                    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(110, 110, 110);
                    const room = W - M - (M + 8 + nw);
                    const fit = doc.splitTextToSize(sci, Math.max(20, room))[0];
                    doc.text(room > 20 ? fit : '', M + 8 + nw, y);
                }
                y += 4.6;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 60, 60);
                doc.text(how, M + 6, y); y += how.length * 4.2;
                if (note.length) { doc.setTextColor(22, 100, 50); doc.text(note, M + 6, y); y += note.length * 4.2; }
                y += 2;
            }
            y += 1.5;
        }
        y += 3;
    }

    if (plan.not_needed.length) {
        need(16);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(40, 40, 40);
        doc.text('No water needed during the trip', M, y); y += 5.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90, 90, 90);
        const byArea = new Map<string, string[]>();
        for (const p of plan.not_needed) { const a = clean(p.area) || 'Other plants'; if (!byArea.has(a)) byArea.set(a, []); byArea.get(a)!.push(clean(p.name) || 'Plant'); }
        for (const [area, names] of byArea) {
            const lines = doc.splitTextToSize(`${area}: ${names.sort().join(', ')}`, W - 2 * M);
            need(lines.length * 4.4 + 1);
            doc.text(lines, M, y); y += lines.length * 4.4 + 1;
        }
    }
    doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.text(`Happy Plants - page ${i} of ${pages}`, W / 2, 274, { align: 'center' }); }
    return doc.output('arraybuffer');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let user: any = null;
        try { user = await base44.auth.me(); } catch { user = null; }
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        const action = body.action || 'pdf';
        const vac = (await base44.entities.VacationDay.filter({ id: String(body.vacation_id || '') }).catch(() => []))?.[0];
        if (!vac || (vac.created_by && vac.created_by !== user.email && vac.created_by_id !== user.id)) {
            return Response.json({ error: 'Vacation not found' }, { status: 404 });
        }

        if (action === 'dismiss') {
            await base44.entities.VacationDay.update(vac.id, { status: 'dismissed' });
            return Response.json({ success: true });
        }

        if (action === 'confirm') {
            // Safe to send twice: each plant gets one watering per day, repeats are skipped.
            const visits = vac.sitter_plan?.visits || [];
            const today = localDay(body.tz || user.timezone);
            const end = String(vac.end_date || '').slice(0, 10);
            const lastDay = end && end < today ? end : today; // back early: later visits never happened
            const items: any[] = [];
            for (const v of visits) {
                if (v.date > lastDay) continue;
                for (const a of v.areas || []) for (const p of a.plants || []) items.push({ plant_id: p.id, date: v.date, method: 'sitter' });
            }
            items.sort((a, b) => a.date.localeCompare(b.date));
            let watered = 0;
            for (let i = 0; i < items.length; i += 150) {
                const { data } = await base44.functions.invoke('wateringReminder', { action: 'water', items: items.slice(i, i + 150), tz: body.tz || user.timezone });
                if (!data?.success) throw new Error('Could not log the waterings');
                watered += Number(data?.watered) || 0;
            }
            await base44.entities.VacationDay.update(vac.id, { status: 'confirmed', confirmed_at: new Date().toISOString() });
            return Response.json({ success: true, logged: watered, planned: items.length });
        }

        const every = [0, 2, 3, 3.5, 7].includes(Number(body.visit_every)) ? Number(body.visit_every) : Number(vac.visit_every) || 0;
        const plants = (await base44.entities.Plant.filter({ created_by: user.email }, '-created_date', 1000)) || [];
        const subs = (await base44.asServiceRole.entities.Subscription.filter({ user_id: user.id }).catch(() => [])) || [];
        const s = subs[0];
        const plus = !!(s && s.active && (!s.expires_at || Date.parse(s.expires_at) > Date.now()));
        const plan = makePlan(plants, vac, every, plus, localDay(body.tz || user.timezone));

        if (action === 'plan') return Response.json({ success: true, plan });

        // 'pdf': keep the plan we hand the sitter (for "did your sitter water as planned?")
        await base44.entities.VacationDay.update(vac.id, {
            visit_every: every,
            sitter_plan: { made_at: new Date().toISOString(), visits: plan.visits.map((v: any) => ({ date: v.date, areas: v.areas.map((a: any) => ({ area: a.area, plants: a.plants.map((p: any) => ({ id: p.id, name: p.name })) })) })) },
            ...(vac.status ? {} : { status: 'planned' }),
        });
        const bytes = new Uint8Array(buildPdf(plan, vac));
        const fileName = `plant-care-${plan.start}-to-${plan.end}.pdf`;
        if (body.deliver !== 'link') {
            // Straight back to the phone: nothing is stored anywhere (the PDF can hold alarm
            // codes and other house notes) and no Base44 credits are used
            return Response.json({ success: true, pdf_base64: toBase64(bytes), file_name: fileName, plan });
        }
        // Older builds only: a private file and a link that works for 15 minutes
        const file = new File([bytes], fileName, { type: 'application/pdf' });
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 900 });
        return Response.json({ success: true, url: signed_url, plan });
    } catch (error) {
        console.error('[vacation] error', (error as Error)?.message);
        return Response.json({ success: false, error: "Couldn't make the sitter plan" }, { status: 500 });
    }
});
