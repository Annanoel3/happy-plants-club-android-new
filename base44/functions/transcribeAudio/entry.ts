// @ts-nocheck
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
  try {
    await createClientFromRequest(req);
    const { file_url, filename } = await req.json();

    if (!file_url) {
      console.error('No file_url provided');
      return Response.json({ error: 'file_url is required' }, { status: 400 });
    }

    console.log('Fetching audio, filename:', filename, 'url prefix:', file_url.substring(0, 60));
    const audioResponse = await fetch(file_url);
    const buf = await audioResponse.arrayBuffer();
    const bytes = new Uint8Array(buf);
    console.log('Fetched bytes:', bytes.length);

    const name = filename || 'audio.m4a';
    const ext = name.split('.').pop()?.toLowerCase() || 'm4a';
    const mimeMap = { webm: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/mp4' };
    const type = mimeMap[ext] || 'audio/mp4';
    const safeFilename = ext === 'aac' ? name.replace('.aac', '.m4a') : name;

    console.log('Sending to Whisper:', safeFilename, type, bytes.length, 'bytes');

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const audioFile = new File([bytes], safeFilename, { type });
    const transcription = await openai.audio.transcriptions.create({ file: audioFile, model: 'whisper-1' });

    console.log('Transcript result:', transcription.text);
    return Response.json({ transcript: transcription.text });
  } catch (error) {
    console.error('transcribeAudio error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});