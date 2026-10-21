import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Feedback from Settings, and "Report this answer" on Plant Expert replies.
// Sent from the server (not the browser) because Base44's SendEmail only reaches
// registered app users and a browser call spends integration credits on every tap.
// The daily caps keep both the inbox and the credits in check.
//
// Body: { kind: 'feedback', message }
//    or { kind: 'ai_answer', question, answer, image_url?, message? (optional note) }

const TO = 'mediocreatbestdev@outlook.com'; // a registered app user, so SendEmail can reach it
const MAX_CHARS = 2000;
const DAILY: Record<string, number> = { feedback: 5, ai_answer: 10 };
// Counters live on the user record: { day, count } per kind
const FIELDS: Record<string, [string, string]> = {
    feedback: ['feedback_sent_day', 'feedback_sent_count'],
    ai_answer: ['ai_reports_day', 'ai_reports_count'],
};

function localDay(tz?: string): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}

const oneLine = (s: unknown, max = 120) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const text = (s: unknown, max: number) => String(s ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const fail = (status: number, error: string) => Response.json({ success: false, error }, { status });

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user?.email || !user?.id) return fail(401, 'Please sign in to send this.');

        const body = await req.json().catch(() => ({}));
        const kind = body?.kind === 'ai_answer' ? 'ai_answer' : 'feedback';
        const note = String(body?.message ?? '').trim();
        if (note.length > MAX_CHARS) return fail(400, 'Please keep it under 2,000 characters.');
        if (kind === 'feedback' && !note) return fail(400, 'Please write a little something first.');

        const question = text(body?.question, 2000);
        const answer = text(body?.answer, 6000);
        const imageUrl = typeof body?.image_url === 'string' && /^https:\/\//.test(body.image_url) ? body.image_url.slice(0, 1000) : '';
        if (kind === 'ai_answer' && !answer) return fail(400, 'There was no answer to report.');

        // Daily cap, claimed before sending so quick repeat taps can't slip past it
        const db = base44.asServiceRole.entities as any;
        const [dayField, countField] = FIELDS[kind];
        const today = localDay(user.timezone);
        const used = user[dayField] === today ? Number(user[countField]) || 0 : 0;
        if (used >= DAILY[kind]) {
            return fail(429, kind === 'feedback'
                ? "You've sent a lot of feedback today. Thank you! Please try again tomorrow."
                : "You've reported a lot of answers today. Thank you! Please try again tomorrow.");
        }
        await db.User.update(user.id, { [dayField]: today, [countField]: used + 1 });

        const name = oneLine(user.full_name || 'Someone', 80);
        const who = `From: ${name} (${user.email})\nUser id: ${user.id}\nSent: ${new Date().toISOString()}`;

        let stored = false;
        if (kind === 'ai_answer') {
            // Shows up with the Community reports for review. Needs 'ai_answer' in
            // Report.target_type; if the platform refuses it, the email below still goes.
            try {
                await db.Report.create({
                    target_type: 'ai_answer', reason: 'other', source: 'user', status: 'open',
                    reporter_email: user.email, target_name: 'Plant Expert',
                    target_preview: `Question: ${question || '(photo only)'}\n\nAnswer: ${answer}`.slice(0, 4000),
                    target_image: imageUrl || undefined,
                    details: note || undefined,
                });
                stored = true;
            } catch (e) {
                console.warn('AI report not stored as Report:', (e as Error)?.message || e);
            }
        }

        let emailed = false;
        try {
            const subject = kind === 'feedback'
                ? `Happy Plants feedback from ${name}`
                : `Plant Expert answer reported by ${name}`;
            const content = kind === 'feedback'
                ? `${who}\n\n${note}`
                : `${who}\n\nQuestion:\n${question || '(photo only)'}\n${imageUrl ? `\nPhoto: ${imageUrl}\n` : ''}\nAnswer:\n${answer}${note ? `\n\nTheir note:\n${note}` : ''}`;
            await base44.asServiceRole.integrations.Core.SendEmail({ to: TO, subject, body: content, from_name: 'Happy Plants' });
            emailed = true;
        } catch (e) {
            console.error('sendFeedback email failed:', (e as Error)?.message || e);
        }

        if (!stored && !emailed) {
            // Nothing went out: give the try back
            await db.User.update(user.id, { [dayField]: today, [countField]: used }).catch(() => {});
            return fail(502, "Couldn't send that right now. Please try again later.");
        }
        return Response.json({ success: true, stored, emailed });
    } catch (error) {
        console.error('sendFeedback error:', (error as Error)?.message || error);
        return fail(500, "Couldn't send that right now. Please try again later.");
    }
});
