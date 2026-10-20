import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

Deno.serve(async (req) => {
    console.log('🎤 transcribeVoice function called');
    
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
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // The recording comes either inline ({ audio_base64, mime }: no file upload, so no Base44
        // integration credit) or as an uploaded file ({ file_url }, older app versions).
        const body = await req.json();
        const fileUrl = body.file_url;
        const mime = typeof body.mime === 'string' && /^audio\/[\w.+-]+(;.*)?$/.test(body.mime) ? body.mime.split(';')[0] : 'audio/webm';
        const ext = mime.includes('wav') ? 'wav' : (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : 'webm';

        let audioBlob: Blob;
        if (typeof body.audio_base64 === 'string' && body.audio_base64.length) {
            if (body.audio_base64.length > 8_000_000) return Response.json({ error: 'Recording too long' }, { status: 413 });
            const bin = atob(body.audio_base64.replace(/^data:[^,]*,/, ''));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            audioBlob = new Blob([bytes], { type: mime });
        } else if (fileUrl) {
            const audioResponse = await fetch(fileUrl);
            if (!audioResponse.ok) throw new Error('Failed to download audio file');
            audioBlob = await audioResponse.blob();
        } else {
            return Response.json({ error: 'No audio provided' }, { status: 400 });
        }
        console.log('📁 Audio:', audioBlob.size, 'bytes', mime);

        const openai = new OpenAI({ apiKey });

        // Convert blob to File for OpenAI
        const file = new File([audioBlob], `recording.${ext}`, { type: mime });

        console.log('🔄 Sending to OpenAI transcription API (gpt-transcribe)...');

        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "gpt-transcribe",
        });

        console.log('✅ Transcription complete:', transcription.text);

        return Response.json({ 
            transcript: transcription.text,
            success: true 
        });
    } catch (error) {
        console.error('❌ ERROR in transcribeVoice');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        return Response.json({ 
            error: 'Transcription failed',
            details: error.message
        }, { status: 500 });
    }
});