import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

// Speech to text on Anna's own OpenAI key, for every voice button in the app.
// Caps so nobody can run up the OpenAI bill: VOICE_LIMITS recordings a day (counted in
// AiUsage, kind 'voice', only after a transcript comes back), and recordings over MAX_BYTES
// are refused. Plus = an active Subscription (store or a free one we gave), admins count as Plus.
const VOICE_LIMITS = { free: 30, plus: 100 };
const MAX_BYTES = 6 * 1024 * 1024;
const TOO_BIG = 'That recording is too long. Try a shorter one (about 2 minutes or less).';

function localDay(tz?: string): string {
    let zone = tz || 'America/Chicago';
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/Chicago'; }
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}`;
}
// The app shows `detail` (the SDK uses it as the error message when the status isn't 2xx)
function refuse(text: string, status: number, extra: Record<string, unknown> = {}) {
    return Response.json({ error: text, detail: text, details: text, ...extra }, { status });
}

Deno.serve(async (req) => {
    try {
        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) {
            console.error('❌ OPENAI_API_KEY is not set!');
            return Response.json({ 
                error: 'OpenAI API key not configured' 
            }, { status: 500 });
        }

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Today's allowance (checked now, counted only once a transcript comes back)
        const db = base44.asServiceRole.entities;
        const day = localDay(user.timezone);
        let plus = user?.role === 'admin';
        let used = 0;
        try {
            const [subs, rows] = await Promise.all([
                plus ? Promise.resolve([]) : db.Subscription.filter({ user_id: user.id }),
                db.AiUsage.filter({ user_id: user.id, day, kind: 'voice' }),
            ]);
            const sub = subs?.[0];
            plus = plus || !!(sub && sub.active && (!sub.expires_at || Date.parse(sub.expires_at) > Date.now()));
            used = Number(rows?.[0]?.count) || 0;
        } catch (e) {
            console.warn('voice count check failed, allowing:', (e as Error).message);
        }
        const limit = plus ? VOICE_LIMITS.plus : VOICE_LIMITS.free;
        if (used >= limit) {
            return refuse(plus
                ? `That's all ${limit} voice notes for today. Voice is back tomorrow, and typing always works.`
                : `That's your ${limit} free voice notes for today. Voice is back tomorrow, and typing always works.`, 429, { limit_reached: true, kind: 'voice', limit, plus });
        }

        // The recording comes either inline ({ audio_base64, mime }: no file upload, so no Base44
        // integration credit) or as an uploaded file ({ file_url }, older app versions).
        const body = await req.json().catch(() => ({}));
        const fileUrl = body.file_url;
        const mime = typeof body.mime === 'string' && /^audio\/[\w.+-]+(;.*)?$/.test(body.mime) ? body.mime.split(';')[0] : 'audio/webm';
        const ext = mime.includes('wav') ? 'wav' : (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : 'webm';

        let audioBlob: Blob;
        if (typeof body.audio_base64 === 'string' && body.audio_base64.length) {
            // base64 is 4/3 the size of the audio
            if (body.audio_base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 64) return refuse(TOO_BIG, 413);
            const bin = atob(body.audio_base64.replace(/^data:[^,]*,/, ''));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            audioBlob = new Blob([bytes], { type: mime });
        } else if (typeof fileUrl === 'string' && /^https:\/\//.test(fileUrl)) {
            const audioResponse = await fetch(fileUrl);
            if (!audioResponse.ok) throw new Error('Failed to download audio file');
            // Refuse before downloading it all when the size is known
            if (Number(audioResponse.headers.get('content-length')) > MAX_BYTES) {
                await audioResponse.body?.cancel().catch(() => {});
                return refuse(TOO_BIG, 413);
            }
            audioBlob = await audioResponse.blob();
        } else {
            return refuse('No recording came through. Please try again.', 400);
        }
        if (audioBlob.size > MAX_BYTES) return refuse(TOO_BIG, 413);
        if (audioBlob.size === 0) return refuse('No recording came through. Please try again.', 400);
        console.log('📁 Audio:', audioBlob.size, 'bytes', mime);

        const openai = new OpenAI({ apiKey });

        // Convert blob to File for OpenAI
        const file = new File([audioBlob], `recording.${ext}`, { type: mime });

        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "gpt-transcribe",
        });

        // A transcript came back: now it counts as one of today's voice notes
        try {
            const row = (await db.AiUsage.filter({ user_id: user.id, day, kind: 'voice' }))?.[0];
            if (row) await db.AiUsage.update(row.id, { count: (Number(row.count) || 0) + 1 });
            else await db.AiUsage.create({ user_id: user.id, user_email: user.email, day, kind: 'voice', count: 1 });
        } catch (e) {
            console.warn('voice count failed:', (e as Error).message);
        }

        return Response.json({ 
            transcript: transcription.text,
            success: true 
        });
    } catch (error) {
        console.error('❌ ERROR in transcribeVoice:', (error as Error)?.name, (error as Error)?.message);
        
        return Response.json({ 
            error: 'Transcription failed',
            details: (error as Error)?.message
        }, { status: 500 });
    }
});
