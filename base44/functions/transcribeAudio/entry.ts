import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url } = await req.json();

    // Download audio from file storage
    const audioResponse = await fetch(file_url);
    if (!audioResponse.ok) {
        return Response.json({ error: 'Failed to download audio' }, { status: 500 });
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioFile = new File([audioBuffer], 'audio.aac', { type: 'audio/aac' });

    // Send to Whisper
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
    });

    return Response.json({ transcript: transcription.text });
});