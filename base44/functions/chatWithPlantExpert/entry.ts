// Retired (Oct 2026). Nothing in the app calls this any more, and the old code could
// still spend OpenAI / Base44 credits if someone called it directly, so it now does nothing.
Deno.serve(() => Response.json({ error: 'This feature was removed. Please update the app.' }, { status: 410 }));
