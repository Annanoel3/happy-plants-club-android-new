import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    await createClientFromRequest(req);
    const { file_url } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url is required' }, { status: 400 });
    }

    // Fetch the audio file from the URL
    const audioResponse = await fetch(file_url);
    const audioBlob = await audioResponse.blob();

    // Send to OpenAI Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const err = await whisperResponse.text();
      return Response.json({ error: `Whisper error: ${err}` }, { status: 500 });
    }

    const result = await whisperResponse.json();
    return Response.json({ transcript: result.text });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});