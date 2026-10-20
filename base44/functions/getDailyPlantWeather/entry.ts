import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Retired (Oct 2026). The weather card now asks functions/plus { action: 'weather_note' },
// which writes the note from real forecast numbers (MET Norway) on our own OpenAI key.
// This function used Base44's InvokeLLM with internet search, which spent Base44
// integration credits every time it ran, so it no longer calls any AI.
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: 'Moved: use plus { action: "weather_note" }', moved: true }, { status: 410 });
});
