import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { audio_base64, mime_type } = await req.json();

    const binaryStr = atob(audio_base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    // capacitor-voice-recorder returns audio/aac on iOS & Android.
    // AAC is natively contained in MP4/M4A — Whisper accepts audio/mp4 with .m4a extension.
    // For all other formats, map to the correct Whisper-supported extension/mime.
    const mimeToFile = {
        'audio/aac':  { ext: 'm4a', type: 'audio/mp4' },
        'audio/mp4':  { ext: 'm4a', type: 'audio/mp4' },
        'audio/webm': { ext: 'webm', type: 'audio/webm' },
        'audio/ogg':  { ext: 'ogg',  type: 'audio/ogg' },
        'audio/mpeg': { ext: 'mp3',  type: 'audio/mpeg' },
        'audio/wav':  { ext: 'wav',  type: 'audio/wav' },
    };
    const { ext, type } = mimeToFile[mime_type] || { ext: 'webm', type: 'audio/webm' };

    const audioFile = new File([bytes], `audio.${ext}`, { type });
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
    });

    return Response.json({ transcript: transcription.text });
});