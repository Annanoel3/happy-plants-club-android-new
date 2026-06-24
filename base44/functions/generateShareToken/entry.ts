import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { public_name, public_description } = await req.json();
    
    const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const existingShare = await base44.entities.SharedGarden.filter({ owner_email: user.email });
    let share;
    
    if (existingShare.length > 0) {
      share = await base44.entities.SharedGarden.update(existingShare[0].id, {
        share_token: shareToken,
        public_name: public_name || user.full_name + "'s Garden",
        public_description: public_description || ""
      });
    } else {
      share = await base44.entities.SharedGarden.create({
        owner_email: user.email,
        owner_name: user.full_name,
        share_token: shareToken,
        public_name: public_name || user.full_name + "'s Garden",
        public_description: public_description || "",
        is_active: true
      });
    }
    
    const shareUrl = `${new URL(req.url).origin}/SharedGardenView/${shareToken}`;
    return Response.json({ success: true, share_url: shareUrl, share_token: shareToken });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});