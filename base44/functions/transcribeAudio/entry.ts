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

        // Send to Whisper via raw API (OpenAI SDK has issues with Deno Blob)
        console.log('🎙️ Sending to Whisper...');
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: 'audio/aac' }), 'audio.aac');
        formData.append('model', 'whisper-1');

        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!whisperResponse.ok) {
            const errorText = await whisperResponse.text();
            console.error('❌ Whisper API error:', whisperResponse.status, errorText);
            return Response.json({ error: `Whisper API failed: ${errorText}` }, { status: 500 });
        }

        const transcription = await whisperResponse.json();
        
        console.log('✅ Transcription complete:', transcription.text.substring(0, 50));
        return Response.json({ transcript: transcription.text });
    } catch (error) {
        console.error('❌ Error in transcribeAudio:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});