// "Notify on Comment" automation (Comment created).
// Oct 20, 2026: the community function now sends the comment push itself, right when the
// comment is saved, and only when the post's owner has both "Community Engagement"
// (notifications_enabled) and "Comments" (notifications_comments) on. Comments can only be
// created by the community function, so there is nothing left for this automation to do.
// It answers without doing anything (so nothing is sent twice); turn the automation off to
// stop paying for its runs.
Deno.serve(() => Response.json({ success: true, message: 'Skipped: the community function sends comment pushes now' }));
