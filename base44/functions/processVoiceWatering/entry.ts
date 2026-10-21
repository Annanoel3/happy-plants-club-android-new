// Retired (Oct 2026). Its only screen (VoiceLog) was never linked anywhere and was taken out of
// the app, and the old code could still spend OpenAI credits if someone called it directly,
// so it now does nothing.
Deno.serve(() => Response.json({ error: 'This feature was removed. Please update the app.' }, { status: 410 }));
