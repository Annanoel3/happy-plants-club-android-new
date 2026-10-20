import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import jpeg from 'npm:jpeg-js@0.4.4';
// jpeg-js is pure JavaScript (no native binaries), which is what Base44's
// function bundler needs. ImageScript's deno.land build loaded as undefined
// here and its npm build ships .node binaries the bundler rejects.

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

type Raw = { width: number; height: number; data: Uint8Array }; // RGBA

// Area-average downscale (box filter). Plenty of quality for a 720px card image.
function downscale(src: Raw, w: number, h: number): Raw {
    const out = new Uint8Array(w * h * 4);
    const sx = src.width / w, sy = src.height / h;
    for (let y = 0; y < h; y++) {
        const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
        for (let x = 0; x < w; x++) {
            const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
            let r = 0, g = 0, b = 0, n = 0;
            for (let yy = y0; yy < y1; yy++) {
                let p = (yy * src.width + x0) * 4;
                for (let xx = x0; xx < x1; xx++, p += 4) { r += src.data[p]; g += src.data[p + 1]; b += src.data[p + 2]; n++; }
            }
            const o = (y * w + x) * 4;
            out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
        }
    }
    return { width: w, height: h, data: out };
}

// Rotate clockwise by 90, 180 or 270 degrees.
function rotateCW(src: Raw, deg: 90 | 180 | 270): Raw {
    const { width: w, height: h, data } = src;
    const swap = deg !== 180;
    const W = swap ? h : w, H = swap ? w : h;
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let nx: number, ny: number;
            if (deg === 90) { nx = h - 1 - y; ny = x; }
            else if (deg === 180) { nx = w - 1 - x; ny = h - 1 - y; }
            else { nx = y; ny = w - 1 - x; }
            const s = (y * w + x) * 4, d = (ny * W + nx) * 4;
            out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = 255;
        }
    }
    return { width: W, height: H, data: out };
}

async function makeThumb(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw new Error('not a JPEG');
    const orient = exifOrientation(bytes);
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 60 });
    let img: Raw = { width: decoded.width, height: decoded.height, data: decoded.data };
    const scale = MAX_SIDE / Math.max(img.width, img.height);
    if (scale < 1) img = downscale(img, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
    // EXIF orientation -> rotation (phones write 6 for portrait shots, which needs 90° clockwise).
    if (orient === 3) img = rotateCW(img, 180);
    else if (orient === 6) img = rotateCW(img, 90);
    else if (orient === 8) img = rotateCW(img, 270);
    const enc = jpeg.encode({ width: img.width, height: img.height, data: img.data }, QUALITY);
    return new Uint8Array(enc.data);
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        // Every thumbnail made costs a Base44 integration credit (UploadFile), so only an admin
        // can run it over everyone's plants; the in-app safety net only does your own.
        const onlyMine = body?.scope !== 'all' || user.role !== 'admin';

        // Service role so a single run can fix every user's garden; "mine" scope for the in-app safety net.
        const db = base44.asServiceRole.entities.Plant;
        const filter: Record<string, unknown> = onlyMine ? { created_by: user.email } : {};
        const plants = await db.filter(filter);
        // A photo that failed twice isn't tried again (it used to be retried on every garden load)
        const needs = (p: any) => p.image_url && !p.thumbnail_url && (Number(p.add_info?.thumb_tries) || 0) < 2;
        const todo = plants.filter(needs).slice(0, BATCH);
        const remaining = plants.filter(needs).length - todo.length;

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
                // Count it; after the second failure the card just uses the full photo
                const tries = (Number(p.add_info?.thumb_tries) || 0) + 1;
                await db.update(p.id, { add_info: { ...(p.add_info || {}), thumb_tries: tries }, ...(tries >= 2 ? { thumbnail_url: p.image_url } : {}) }).catch(() => {});
            }
        }
        return Response.json({ success: true, done, failed, remaining });
    } catch (error) {
        console.error('generateThumbnails error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});
