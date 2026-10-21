// "Notify on Follow Request" (FollowRequest created) and "Notify on New Follower" (Follow
// created) automations.
// Oct 20, 2026: follows and follow requests can only be made by the community function, which
// now sends these pushes itself, respecting "Community Engagement" and "Follows":
//   - "X wants to follow you" when someone asks to follow a private profile (once a day at most
//     per person)
//   - "X started following you" when someone follows a public profile (once per person)
//   - "X approved your follow request" to the person who asked, when it's approved
// Approving a request creates a Follow, and this automation used to answer that by telling the
// person who approved it "X started following you". Doing nothing here fixes that too, and
// keeps pushes from going out twice. Turn both automations off to stop paying for their runs.
Deno.serve(() => Response.json({ success: true, message: 'Skipped: the community function sends follow pushes now' }));
