import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as ImageScript from 'npm:imagescript@1.3.0';
// The npm build is CommonJS; cover both export shapes.
const Image = (ImageScript as any).Image ?? (ImageScript as any).default?.Image;

// Makes a small card-sized copy (thumbnail_url) of each plant photo that
// doesn't have one yet. The garden grid was decoding 27 full-size 3-4 MB
// camera photos just to draw 200px cards, which is what made scrolling lag.
// Idempotent: safe to call any time. Processes a few plants per call.

const MAX_SIDE = 720;
const QUALITY = 80;
const BATCH = 4;

// Read the EXIF orientation tag (1-8) out of a JPEG so the thumbnail isn't sideways.
function exifOrientation(bytes: Uint8Array): number {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
    let i = 2;
    while (i + 4 < bytes.length) {
        if (bytes[i] !== 0xFF) return 1;
        const marker = bytes[i + 1];
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (marker === 0xE1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78) { // "Ex"if
            const t = i + 10; // TIFF header
            const le = bytes[t] === 0x49;
            const u16 = (p: number) => le ? (bytes[p] | (bytes[p + 1] << 8)) : ((bytes[p] << 8) | bytes[p + 1]);
            const u32 = (p: number) => le ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
                                         : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
            const ifd = t + u32(t + 4);
            const n = u16(ifd);
            for (let k = 0; k < n; k++) {
                const e = ifd + 2 + k * 12;
                if (u16(e) === 0x0112) return u16(e + 8) || 1;
            }
            return 1;
        }
        if (marker === 0xDA) return 1; // start of scan, no EXIF
        i += 2 + len;
    }
    return 1;
}

async function makeThumb(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const orient = exifOrientation(bytes);
    let img = await Image.decode(bytes);
    const scale = MAX_SIDE / Math.max(img.width, img.height);
    if (scale < 1) img = img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
    // EXIF orientation -> rotation (phones write 6 for portrait shots).
    // ImageScript's rotate() turns counter-clockwise, so 6 (needs 90° clockwise) is rotate(270).
    if (orient === 3) img = img.rotate(180);
    else if (orient === 6) img = img.rotate(270);
    else if (orient === 8) img = img.rotate(90);
    return await img.encodeJPEG(QUALITY);
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const onlyMine = body?.scope !== 'all';

        // Service role so a single run can fix every user's garden; "mine" scope for the in-app safety net.
        const db = base44.asServiceRole.entities.Plant;
        const filter: Record<string, unknown> = onlyMine ? { created_by: user.email } : {};
        const plants = await db.filter(filter);
        const todo = plants.filter(p => p.image_url && !p.thumbnail_url).slice(0, BATCH);
        const remaining = plants.filter(p => p.image_url && !p.thumbnail_url).length - todo.length;

        const done: string[] = [];
        const failed: string[] = [];
        for (const p of todo) {
            try {
                const thumb = await makeThumb(p.image_url);
                const file = new File([thumb], `thumb_${p.id}.jpg`, { type: 'image/jpeg' });
                const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
                await db.update(p.id, { thumbnail_url: up.file_url });
                done.push(p.id);
                console.log('thumb ok', p.id, p.name, thumb.length, 'bytes');
            } catch (e) {
                failed.push(p.id);
                console.warn('thumb failed', p.id, p.name, e?.message || e);
            }
        }
        return Response.json({ success: true, done, failed, remaining });
    } catch (error) {
        console.error('generateThumbnails error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});
