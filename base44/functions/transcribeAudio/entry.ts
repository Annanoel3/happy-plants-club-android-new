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

    // AAC from Android is not a valid container for Whisper — treat as webm
    const mimeToExt = {
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/mp4': 'm4a',
        'audio/aac': 'webm',
    };
    const ext = mimeToExt[mime_type] || 'webm';
    const type = mime_type === 'audio/aac' ? 'audio/webm' : (mime_type || 'audio/webm');

    const audioFile = new File([bytes], `audio.${ext}`, { type });
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
    });

    return Response.json({ transcript: transcription.text });
});