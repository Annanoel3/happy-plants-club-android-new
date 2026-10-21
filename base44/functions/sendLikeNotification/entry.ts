// "Notify on Post Like" automation (Like created).
// Oct 20, 2026: the community function now sends the like push itself, once per person per
// post (unlike + like again doesn't push again), and only when the post's owner has
// "Community Engagement" (notifications_enabled) on. Likes can only be created by the
// community function, so there is nothing left for this automation to do. It answers without
// doing anything (so nothing is sent twice); turn the automation off to stop paying for its runs.
Deno.serve(() => Response.json({ success: true, message: 'Skipped: the community function sends like pushes now' }));
