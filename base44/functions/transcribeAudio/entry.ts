import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
    try {
        console.log('🎤 transcribeAudio: Starting...');
        
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        console.log('✅ Auth passed for user:', user?.email);

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { file_url } = body;
        console.log('📁 file_url:', file_url);

        // Download audio from file storage
        console.log('⬇️ Downloading audio...');
        const audioResponse = await fetch(file_url);
        if (!audioResponse.ok) {
            console.error('❌ Download failed:', audioResponse.status);
            return Response.json({ error: 'Failed to download audio' }, { status: 500 });
        }
        
        const audioBuffer = await audioResponse.arrayBuffer();
        console.log('✅ Downloaded', audioBuffer.byteLength, 'bytes');
        
        const audioBlob = new Blob([audioBuffer], { type: 'audio/aac' });

        // Send to Whisper
        console.log('🎙️ Sending to Whisper...');
        const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
        const transcription = await openai.audio.transcriptions.create({
            file: audioBlob,
            model: "whisper-1",
        });
        
        console.log('✅ Transcription complete:', transcription.text.substring(0, 50));
        return Response.json({ transcript: transcription.text });
    } catch (error) {
        console.error('❌ Error in transcribeAudio:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});