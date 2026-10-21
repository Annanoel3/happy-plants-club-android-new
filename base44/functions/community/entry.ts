import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Everything in Community goes through here, so nothing can skip the checks. Posts, comments,
// likes, follows, blocks and notifications can only be read or written by this function (the
// database only lets admins touch them directly).
//  - People are addressed by user id. Other people's emails never leave this function.
//  - Posts, comments and profile text/photos are checked by moderateContent before they're saved
//  - Block works both ways: blocked people can't see, follow, comment on or like each other
//  - Private profiles: following needs the owner's approval (follow requests)
//  - Gardens: shown only when the owner's "Public Garden" switch is on, and for a private
//    profile only to approved followers (matches Settings: "Let others see your plants" and
//    "Require approval for followers")
//  - Report posts, comments and profiles; 3 reports hide a post or comment until an admin looks
//  - Bans live in CommunityBan (admins only), so a banned person can't lift their own ban
//  - Like/comment/follow pushes are sent from here (not by entity automations, which cost credits)
//
// Actions: feed, profile, people, request_count, blocks, post, comment, like, delete_post,
//          delete_comment, follow, unfollow, approve, decline, block, unblock, report,
//          save_profile, message/conversation (off: DMS_OPEN), admin_reports, admin_resolve,
//          admin_ban, admin_clear_profile

const TERMS_VERSION = 1; // keep the same as TERMS_VERSION in src/components/community/CommunityTerms.jsx
const DMS_OPEN = false; // direct messages are off for now (no inbox in the app yet)

const LIMITS = { post: 2000, comment: 1000, message: 2000, details: 500, bio: 300 };
const PER_HOUR = { post: 10, comment: 60, message: 120, report: 30, like: 120, follow: 60 };
const LIKE_TOGGLES_PER_POST_HOUR = 20; // like/unlike/like on one post
const HIDE_AFTER_REPORTS = 3;
const HOUR = 3600_000;
const REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'other'];
const RESERVED_HANDLES = new Set(['admin', 'administrator', 'happyplants', 'happyplantsclub', 'support', 'moderator', 'mod', 'staff', 'official', 'help', 'team']);
const HANDLE_PREFIXES = ['plantlover', 'greenthumb', 'iloveplants', 'plantparent', 'gardenlover', 'botanist', 'plantwhisperer',
  'gardenmaster', 'plantfanatic', 'greenguru', 'plantaddict', 'leaflover', 'bloombuddy', 'gardengeek', 'plantpro'];

async function internalToken(): Promise<string> {
  const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const err = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, message, ...extra }, { status });

// created_date has no time zone; it's UTC
const ms = (d: any) => {
  if (!d) return 0;
  const s = String(d);
  return Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) || 0;
};
const authorOf = (r: any) => r?.author_email || r?.created_by || '';
const recent = (rows: any[], within = HOUR) => (rows || []).filter((r) => Date.now() - ms(r?.created_date) < within).length;
const cleanId = (v: any) => {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : '';
};

// A name that's just the start of someone's email would give the email away: show the handle instead
const nameOf = (u: any) => {
  const n = String(u?.full_name || '').trim();
  const local = String(u?.email || '').split('@')[0].toLowerCase();
  if (n && n.toLowerCase() !== local) return n;
  return u?.handle || 'Plant friend';
};
const pub = (u: any) => (u ? { id: u.id || null, name: nameOf(u), handle: u.handle || null, photo: u.profile_picture || null } : null);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    // Owner tool (PLUS_SWEEP_KEY): delete test records, e.g. after checking Community works
    if (action === 'owner_cleanup') {
      const sweepKey = (Deno.env.get('PLUS_SWEEP_KEY') || '').trim();
      if (!sweepKey || body?.key !== sweepKey) return err(401, 'unauthorized', 'Unauthorized');
      const allowed: Record<string, any> = { Block: db.Block, Notification: db.Notification, Report: db.Report, Comment: db.Comment, DirectMessage: db.DirectMessage, Like: db.Like };
      const ent = allowed[String(body?.entity || '')];
      if (!ent) return err(400, 'bad_request', 'Unknown entity');
      const ids = (Array.isArray(body?.ids) ? body.ids : []).map(String).slice(0, 100);
      const res = await Promise.allSettled(ids.map((id: string) => ent.delete(id)));
      return Response.json({ ok: true, removed: res.filter((r) => r.status === 'fulfilled').length });
    }

    const me = await base44.auth.me();
    if (!me) return err(401, 'unauthorized', 'Please sign in.');
    const isAdmin = me.role === 'admin';

    // ---------- helpers ----------
    const userByEmail = async (email: string) => (email ? (await db.User.filter({ email }))?.[0] || null : null);
    const userById = async (id: any) => {
      const clean = cleanId(id);
      return clean ? (await db.User.filter({ id: clean }))?.[0] || null : null;
    };
    let allUsersCache: any[] | null = null;
    const allUsers = async () => (allUsersCache ||= (await db.User.list('-created_date', 5000)) || []);

    let banCache: boolean | null = null;
    const isBanned = async () => {
      if (banCache === null) {
        const rows = await db.CommunityBan.filter({ user_email: me.email }).catch(() => []);
        banCache = (rows || []).some((b: any) => !b.lifted_at);
      }
      return banCache;
    };
    const termsOk = () => Number(me.community_terms_version) >= TERMS_VERSION;
    // Posting, commenting, liking and following need the current rules agreed and no ban
    const writeGate = async () => {
      if (await isBanned()) return err(403, 'banned', 'Your Community access has been turned off.');
      if (!termsOk()) return err(403, 'terms', 'Please agree to the community rules first.');
      return null;
    };

    const blockSets = async () => {
      const [mine, theirs] = await Promise.all([
        db.Block.filter({ blocker_email: me.email }),
        db.Block.filter({ blocked_email: me.email }),
      ]);
      const blocked = new Set<string>((mine || []).map((b: any) => b.blocked_email));
      const blockedBy = new Set<string>((theirs || []).map((b: any) => b.blocker_email));
      return { blocked, blockedBy, hidden: new Set<string>([...blocked, ...blockedBy]) };
    };
    const blockState = async (other: string) => {
      if (!other || other === me.email) return { iBlocked: false, theyBlocked: false };
      const [a, b] = await Promise.all([
        db.Block.filter({ blocker_email: me.email, blocked_email: other }),
        db.Block.filter({ blocker_email: other, blocked_email: me.email }),
      ]);
      return { iBlocked: (a?.length || 0) > 0, theyBlocked: (b?.length || 0) > 0 };
    };
    const isBlockedBetween = async (other: string) => {
      const s = await blockState(other);
      return s.iBlocked || s.theyBlocked;
    };

    const checkText = async (content: string, imageUrl?: string | null) => {
      try {
        const r = await base44.functions.invoke('moderateContent', { content, image_url: imageUrl || undefined });
        if (r?.data && typeof r.data.appropriate === 'boolean') return r.data;
      } catch (_) { /* treated as "try again" below */ }
      return { appropriate: false, retry: true, reason: 'We couldn’t check this right now. Please try again in a minute.' };
    };
    const autoFlag = async (type: string, content: string, reason: string, imageUrl?: string | null) => {
      try {
        await db.Report.create({
          target_type: type, target_email: me.email, target_name: nameOf(me), target_preview: content.slice(0, 500),
          target_image: imageUrl || undefined, reason: 'auto_blocked', details: reason, reporter_email: 'auto', source: 'auto', status: 'dismissed',
        });
      } catch (_) { /* the post is refused either way */ }
    };
    const push = async (toEmail: string, title: string, text: string, screen: string) => {
      try {
        await base44.asServiceRole.functions.invoke('sendNotification', { _internal: await internalToken(), toUserEmail: toEmail, title, body: text, screen });
      } catch (_) { /* a missed push shouldn't fail the action */ }
    };
    const notifyAdmins = async (title: string, text: string) => {
      const admins = await db.User.filter({ role: 'admin' }).catch(() => []);
      await Promise.all((admins || []).map((a: any) => push(a.email, title, text, '/CommunityReports')));
    };
    // In-app notice (the menu badge and the follow-approved pop-up read these). No emails stored.
    const notice = async (toEmail: string, type: string, message: string, extra: Record<string, unknown> = {}) => {
      try {
        await db.Notification.create({ user_email: toEmail, type, message, from_user_id: me.id, from_user_name: nameOf(me), from_user_handle: me.handle || '', read: false, dismissed: false, ...extra });
      } catch (_) { /* best effort */ }
    };
    // Settings: "Community Engagement" (notifications_enabled) covers likes and comments,
    // "Comments" (notifications_comments) and "Follows" (notifications_follows) narrow it down
    const wants = (u: any, kind: 'like' | 'comment' | 'follow') => {
      if (!u || u.notifications_enabled === false) return false;
      if (kind === 'comment') return u.notifications_comments !== false;
      if (kind === 'follow') return u.notifications_follows !== false;
      return true;
    };

    // Gives people without a handle one (two older accounts showed "@undefined")
    const ensureHandle = async (u: any) => {
      if (!u || u.handle) return u?.handle || null;
      for (let i = 0; i < 8; i++) {
        const h = `${HANDLE_PREFIXES[Math.floor(Math.random() * HANDLE_PREFIXES.length)]}${Math.floor(100 + Math.random() * 9900)}`;
        const taken = await db.User.filter({ handle: h }).catch(() => [{}]);
        if (taken?.length) continue;
        try {
          if (u.id === me.id) await base44.auth.updateMe({ handle: h });
          else await db.User.update(u.id, { handle: h });
          u.handle = h;
          return h;
        } catch (_) { return null; }
      }
      return null;
    };

    // What a profile's garden shows to other people: names and photos only (no notes, care
    // history or where the plants are kept)
    const gardenOf = async (email: string) => {
      const plants = await db.Plant.filter({ created_by: email }, '-created_date', 500);
      return (plants || [])
        .filter((p: any) => p.add_status !== 'identifying' && p.add_status !== 'failed' && (p.name || p.nickname))
        .map((p: any) => ({
          id: p.id,
          name: p.name || null,
          nickname: p.nickname || null,
          scientific_name: p.scientific_name || null,
          type: p.plant_type || null,
          photo: p.thumbnail_url || p.image_url || null,
        }));
    };

    // ---------- read ----------
    if (action === 'feed') {
      await ensureHandle(me);
      const { blocked, hidden } = await blockSets();
      const [posts, comments, likes, users, follows] = await Promise.all([
        db.Post.list('-created_date', 100),
        db.Comment.list('-created_date', 2000),
        db.Like.list('-created_date', 10000),
        allUsers(),
        db.Follow.filter({ follower_email: me.email }),
      ]);
      const people: Record<string, any> = {};
      for (const u of users) people[u.email] = u;
      const following = new Set<string>((follows || []).map((f: any) => f.following_email));
      const who = (email: string, storedName?: string) => pub(people[email]) || { id: null, name: nameOf({ full_name: storedName, email }), handle: null, photo: null };

      const visible = (posts || []).filter((p: any) => (!p.hidden || isAdmin) && !hidden.has(authorOf(p)));
      const ids = new Set(visible.map((p: any) => p.id));
      const owners: Record<string, string> = {};
      for (const p of visible) owners[p.id] = authorOf(p);

      const likeCount: Record<string, number> = {};
      const liked = new Set<string>();
      for (const l of likes || []) {
        if (l.active === false || !ids.has(l.post_id) || hidden.has(l.user_email)) continue;
        if (l.user_email === me.email) {
          if (liked.has(l.post_id)) continue; // an old duplicate
          liked.add(l.post_id);
        }
        likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1;
      }

      const byPost: Record<string, any[]> = {};
      for (const c of (comments || []).slice().reverse()) {
        if (!ids.has(c.post_id) || (c.hidden && !isAdmin) || hidden.has(authorOf(c))) continue;
        const a = authorOf(c);
        const mine = a === me.email;
        (byPost[c.post_id] ||= []).push({
          id: c.id, post_id: c.post_id, content: c.content || '', created_date: c.created_date,
          author: who(a, c.author_name), mine,
          // your own comments, and anything on your own post
          can_delete: mine || owners[c.post_id] === me.email || isAdmin,
          ...(isAdmin ? { hidden: !!c.hidden, hidden_reason: c.hidden_reason || '' } : {}),
        });
      }

      return Response.json({
        posts: visible.map((p: any) => {
          const a = authorOf(p);
          return {
            id: p.id, content: String(p.content || '').trim(), image_url: p.image_url || null, plant_name: p.plant_name || null,
            created_date: p.created_date, likes_count: likeCount[p.id] || 0,
            author: who(a, p.author_name), mine: a === me.email, followed: following.has(a),
            ...(isAdmin ? { hidden: !!p.hidden, hidden_reason: p.hidden_reason || '' } : {}),
          };
        }),
        comments: byPost,
        liked: [...liked],
        blocked_count: blocked.size,
        me: { id: me.id, banned: await isBanned(), admin: isAdmin, terms: termsOk() },
      });
    }

    if (action === 'profile') {
      // ?email= links still work for your own profile only; other people are looked up by id
      let target: any = null;
      if (body?.user_id) target = await userById(body.user_id);
      else if (body?.email) target = String(body.email).trim().toLowerCase() === String(me.email).toLowerCase() ? me : null;
      else target = me;
      if (!target) return Response.json({ unavailable: true });
      const isMe = target.email === me.email;
      const { iBlocked, theyBlocked } = await blockState(target.email);
      if (theyBlocked && !isAdmin) return Response.json({ unavailable: true });
      if (isMe || !target.handle) await ensureHandle(target);

      const [followers, followingRows, myReq] = await Promise.all([
        db.Follow.filter({ following_email: target.email }),
        db.Follow.filter({ follower_email: target.email }),
        isMe ? Promise.resolve([]) : db.FollowRequest.filter({ requester_email: me.email, target_email: target.email, status: 'pending' }),
      ]);
      const iFollow = !isMe && (followers || []).some((f: any) => f.follower_email === me.email);
      const isPrivate = target.profile_private === true;
      const gardenOn = target.garden_public !== false;
      const canSee = isMe || (!iBlocked && gardenOn && (!isPrivate || iFollow));
      const plants = canSee ? await gardenOf(target.email) : [];
      return Response.json({
        person: {
          ...pub(target),
          bio: target.bio || '',
          private: isPrivate,
          location: target.location_public === true && target.location ? target.location : null,
          ...(canSee ? { tier: target.current_tier || null, waterings: target.lifetime_waterings || 0, growths: target.total_plant_growths || 0 } : {}),
        },
        is_me: isMe,
        i_follow: iFollow,
        requested: (myReq || []).length > 0,
        i_blocked: iBlocked,
        counts: { followers: (followers || []).length, following: (followingRows || []).length, plants: canSee ? plants.length : null },
        can_see_garden: canSee,
        // why the garden is hidden: 'hidden' (their Public Garden switch is off), 'follow' (private profile)
        garden_note: canSee || iBlocked ? null : !gardenOn ? 'hidden' : 'follow',
        plants,
      });
    }

    if (action === 'people' || action === 'request_count') {
      const { hidden } = await blockSets();
      if (action === 'request_count' || body?.list === 'requests') {
        const reqs = (await db.FollowRequest.filter({ target_email: me.email, status: 'pending' }, '-created_date', 200)) || [];
        const seen = new Set<string>();
        const live = reqs.filter((r: any) => !hidden.has(r.requester_email) && !seen.has(r.requester_email) && seen.add(r.requester_email));
        if (action === 'request_count') return Response.json({ count: live.length });
        const users = await allUsers();
        const byEmail: Record<string, any> = {};
        for (const u of users) byEmail[u.email] = u;
        return Response.json({
          people: live.filter((r: any) => byEmail[r.requester_email]).map((r: any) => ({ request_id: r.id, ...pub(byEmail[r.requester_email]) })),
        });
      }
      const list = body?.list === 'following' ? 'following' : 'followers';
      const [rows, mine, users] = await Promise.all([
        list === 'followers' ? db.Follow.filter({ following_email: me.email }) : db.Follow.filter({ follower_email: me.email }),
        db.Follow.filter({ follower_email: me.email }),
        allUsers(),
      ]);
      const byEmail: Record<string, any> = {};
      for (const u of users) byEmail[u.email] = u;
      const iFollow = new Set((mine || []).map((f: any) => f.following_email));
      const emails = [...new Set((rows || []).map((f: any) => (list === 'followers' ? f.follower_email : f.following_email)))]
        .filter((e) => e && !hidden.has(e) && byEmail[e]);
      return Response.json({ people: emails.map((e) => ({ ...pub(byEmail[e]), i_follow: iFollow.has(e) })) });
    }

    if (action === 'blocks') {
      const rows = (await db.Block.filter({ blocker_email: me.email }, '-created_date', 500)) || [];
      const users = await allUsers();
      const byEmail: Record<string, any> = {};
      for (const u of users) byEmail[u.email] = u;
      const seen = new Set<string>();
      const people = rows.filter((b: any) => byEmail[b.blocked_email] && !seen.has(b.blocked_email) && seen.add(b.blocked_email))
        .map((b: any) => pub(byEmail[b.blocked_email]));
      return Response.json({ people });
    }

    if (action === 'conversation' || action === 'message') {
      if (!DMS_OPEN) return err(403, 'dms_off', 'Messages aren’t available yet.');
      const other = await userById(body?.user_id);
      if (!other || other.email === me.email) return err(404, 'not_found', 'That person isn’t available.');
      const { iBlocked, theyBlocked } = await blockState(other.email);
      if (action === 'conversation') {
        const [sent, got] = await Promise.all([
          db.DirectMessage.filter({ sender_email: me.email, receiver_email: other.email }),
          iBlocked || theyBlocked ? Promise.resolve([]) : db.DirectMessage.filter({ sender_email: other.email, receiver_email: me.email }),
        ]);
        const messages = [...(sent || []), ...(got || [])].filter((m: any) => !m.hidden)
          .sort((x: any, y: any) => ms(x.created_date) - ms(y.created_date))
          .map((m: any) => ({ id: m.id, content: m.content, created_date: m.created_date, mine: m.sender_email === me.email }));
        return Response.json({ messages, person: theyBlocked ? null : pub(other), iBlocked, theyBlocked, banned: await isBanned() });
      }
      const gate = await writeGate();
      if (gate) return gate;
      const content = String(body?.content || '').trim();
      if (!content) return err(400, 'empty', 'Write a message first.');
      if (content.length > LIMITS.message) return err(400, 'too_long', `Messages can be up to ${LIMITS.message} characters.`);
      if (iBlocked || theyBlocked) return err(403, 'blocked', 'You can’t message this person.');
      const sent = await db.DirectMessage.filter({ sender_email: me.email }, '-created_date', PER_HOUR.message + 5);
      if (recent(sent) >= PER_HOUR.message) return err(429, 'slow_down', 'You’ve sent a lot of messages in the last hour. Try again a little later.');
      const mod = await checkText(content);
      if (!mod.appropriate) {
        if (!mod.retry) await autoFlag('message', content, mod.reason || '');
        return err(422, mod.retry ? 'retry' : 'moderation', mod.reason || 'This breaks the community rules, so it wasn’t sent.');
      }
      const m = await db.DirectMessage.create({ sender_email: me.email, sender_name: nameOf(me), receiver_email: other.email, receiver_name: nameOf(other), content, read: false });
      return Response.json({ ok: true, message: { id: m.id, content: m.content, created_date: m.created_date, mine: true } });
    }

    // ---------- write ----------
    if (action === 'post') {
      const gate = await writeGate();
      if (gate) return gate;
      const content = String(body?.content || '').trim();
      const image = typeof body?.image_url === 'string' && body.image_url.startsWith('https://') ? body.image_url : null;
      if (!content && !image) return err(400, 'empty', 'Write something or add a photo.');
      if (content.length > LIMITS.post) return err(400, 'too_long', `Posts can be up to ${LIMITS.post} characters.`);
      const mine = await db.Post.filter({ author_email: me.email }, '-created_date', PER_HOUR.post + 5);
      if (recent(mine) >= PER_HOUR.post) return err(429, 'slow_down', 'You’ve posted a lot in the last hour. Try again a little later.');
      const mod = await checkText(content, image);
      if (!mod.appropriate) {
        if (!mod.retry) await autoFlag('post', content, mod.reason || '', image);
        return err(422, mod.retry ? 'retry' : 'moderation', mod.reason || 'This breaks the community rules, so it wasn’t shared.');
      }
      let plant_id = null, plant_name = null;
      if (body?.plant_id) {
        const plant = (await db.Plant.filter({ id: String(body.plant_id) }))?.[0];
        if (plant && plant.created_by === me.email) { plant_id = plant.id; plant_name = plant.nickname || plant.name || null; }
      }
      // A photo-only post saves empty text (Post.content isn't required)
      const post = await db.Post.create({ content, image_url: image || undefined, author_email: me.email, author_name: nameOf(me), plant_id, plant_name, likes_count: 0, hidden: false });
      return Response.json({ ok: true, post: { id: post.id } });
    }

    if (action === 'comment') {
      const gate = await writeGate();
      if (gate) return gate;
      const content = String(body?.content || '').trim();
      if (!content) return err(400, 'empty', 'Write a comment first.');
      if (content.length > LIMITS.comment) return err(400, 'too_long', `Comments can be up to ${LIMITS.comment} characters.`);
      const post = (await db.Post.filter({ id: cleanId(body?.post_id) }))?.[0];
      if (!post || post.hidden) return err(404, 'not_found', 'That post isn’t available anymore.');
      const owner = authorOf(post);
      if (await isBlockedBetween(owner)) return err(403, 'blocked', 'You can’t comment on this post.');
      const mine = await db.Comment.filter({ author_email: me.email }, '-created_date', PER_HOUR.comment + 5);
      if (recent(mine) >= PER_HOUR.comment) return err(429, 'slow_down', 'You’ve commented a lot in the last hour. Try again a little later.');
      const mod = await checkText(content);
      if (!mod.appropriate) {
        if (!mod.retry) await autoFlag('comment', content, mod.reason || '');
        return err(422, mod.retry ? 'retry' : 'moderation', mod.reason || 'This breaks the community rules, so it wasn’t shared.');
      }
      const comment = await db.Comment.create({ post_id: post.id, content, author_email: me.email, author_name: nameOf(me), hidden: false });
      if (owner && owner !== me.email) {
        const o = await userByEmail(owner);
        if (wants(o, 'comment')) {
          await Promise.all([
            notice(owner, 'comment', `${nameOf(me)} commented on your post`, { post_id: post.id, comment_id: comment.id }),
            push(owner, '💬 New comment', `${nameOf(me)} commented: ${content.length > 60 ? `${content.slice(0, 60)}…` : content}`, '/Feed'),
          ]);
        }
      }
      return Response.json({ ok: true, comment: { id: comment.id } });
    }

    if (action === 'like') {
      const gate = await writeGate();
      if (gate) return gate;
      const post = (await db.Post.filter({ id: cleanId(body?.post_id) }))?.[0];
      if (!post || post.hidden) return err(404, 'not_found', 'That post isn’t available anymore.');
      const owner = authorOf(post);
      if (await isBlockedBetween(owner)) return err(403, 'blocked', 'You can’t like this post.');
      // Unliking keeps the row (active: false) so liking again doesn't push the owner again
      const rows = (await db.Like.filter({ post_id: post.id, user_email: me.email })) || [];
      const row = rows[0];
      const now = Date.now();
      let liked: boolean;
      let firstLike = false;
      if (row) {
        const fresh = now - ms(row.toggles_since) < HOUR;
        const toggles = fresh ? Number(row.toggles || 0) : 0;
        if (toggles >= LIKE_TOGGLES_PER_POST_HOUR) return err(429, 'slow_down', 'Give that heart a little rest and try again later.');
        liked = row.active === false;
        await db.Like.update(row.id, { active: liked, toggles: toggles + 1, toggles_since: fresh ? row.toggles_since : new Date(now).toISOString() });
        for (const extra of rows.slice(1)) if (extra.active !== false) await db.Like.update(extra.id, { active: false });
      } else {
        const mine = await db.Like.filter({ user_email: me.email }, '-created_date', PER_HOUR.like + 5);
        if (recent(mine) >= PER_HOUR.like) return err(429, 'slow_down', 'You’ve liked a lot of posts in the last hour. Try again a little later.');
        await db.Like.create({ post_id: post.id, user_email: me.email, active: true, notified: true, toggles: 0, toggles_since: new Date(now).toISOString() });
        liked = true;
        firstLike = true;
      }
      // The owner hears about a like once per person per post
      if (liked && owner && owner !== me.email && (firstLike || !row?.notified)) {
        if (row && !row.notified) await db.Like.update(row.id, { notified: true });
        const o = await userByEmail(owner);
        if (wants(o, 'like')) {
          await Promise.all([
            notice(owner, 'like', `${nameOf(me)} liked your post`, { post_id: post.id }),
            push(owner, '❤️ Post liked', `${nameOf(me)} liked your post`, '/Feed'),
          ]);
        }
      }
      const count = ((await db.Like.filter({ post_id: post.id })) || []).filter((l: any) => l.active !== false).length;
      await db.Post.update(post.id, { likes_count: count });
      return Response.json({ ok: true, liked, count });
    }

    if (action === 'delete_post') {
      const post = (await db.Post.filter({ id: cleanId(body?.post_id) }))?.[0];
      if (!post) return Response.json({ ok: true });
      if (authorOf(post) !== me.email && !isAdmin) return err(403, 'forbidden', 'You can only delete your own posts.');
      // Its comments, likes and notices go with it
      const [comments, likes, notices] = await Promise.all([
        db.Comment.filter({ post_id: post.id }),
        db.Like.filter({ post_id: post.id }),
        db.Notification.filter({ post_id: post.id }),
      ]);
      await Promise.allSettled([
        ...(comments || []).map((c: any) => db.Comment.delete(c.id)),
        ...(likes || []).map((l: any) => db.Like.delete(l.id)),
        ...(notices || []).map((n: any) => db.Notification.delete(n.id)),
      ]);
      await db.Post.delete(post.id);
      return Response.json({ ok: true });
    }

    if (action === 'delete_comment') {
      const comment = (await db.Comment.filter({ id: cleanId(body?.comment_id) }))?.[0];
      if (!comment) return Response.json({ ok: true });
      const post = (await db.Post.filter({ id: comment.post_id }))?.[0];
      // Your own comments, any comment on your own post, or an admin
      const allowed = authorOf(comment) === me.email || (post && authorOf(post) === me.email) || isAdmin;
      if (!allowed) return err(403, 'forbidden', 'You can’t delete this comment.');
      const notices = await db.Notification.filter({ comment_id: comment.id });
      await Promise.allSettled((notices || []).map((n: any) => db.Notification.delete(n.id)));
      await db.Comment.delete(comment.id);
      return Response.json({ ok: true });
    }

    if (action === 'follow') {
      const gate = await writeGate();
      if (gate) return gate;
      const target = await userById(body?.user_id);
      if (!target || target.email === me.email) return err(404, 'not_found', 'That person isn’t available.');
      if (await isBlockedBetween(target.email)) return err(403, 'blocked', 'You can’t follow this person.');
      const [existing, myRecentFollows, myRequests] = await Promise.all([
        db.Follow.filter({ follower_email: me.email, following_email: target.email }),
        db.Follow.filter({ follower_email: me.email }, '-created_date', PER_HOUR.follow + 5),
        db.FollowRequest.filter({ requester_email: me.email }, '-created_date', PER_HOUR.follow + 5),
      ]);
      if (existing?.length) return Response.json({ ok: true, state: 'following' });
      if (recent(myRecentFollows) + recent(myRequests) >= PER_HOUR.follow) return err(429, 'slow_down', 'You’ve followed a lot of people in the last hour. Try again a little later.');

      if (target.profile_private === true) {
        const toThem = (await db.FollowRequest.filter({ requester_email: me.email, target_email: target.email })) || [];
        if (toThem.some((r: any) => r.status === 'pending')) return Response.json({ ok: true, state: 'requested' });
        await db.FollowRequest.create({ requester_email: me.email, requester_name: nameOf(me), requester_handle: me.handle || '', target_email: target.email, status: 'pending' });
        // One push a day at most for the same person asking again
        const askedToday = toThem.some((r: any) => Date.now() - ms(r.created_date) < 24 * HOUR);
        if (!askedToday && wants(target, 'follow')) await push(target.email, '👤 New follow request', `${nameOf(me)} wants to follow you`, '/FollowRequests');
        return Response.json({ ok: true, state: 'requested' });
      }

      await db.Follow.create({ follower_email: me.email, following_email: target.email });
      // "X started following you" once per person (not again after unfollow + follow)
      const before = await db.Notification.filter({ user_email: target.email, type: 'new_follower', from_user_id: me.id }).catch(() => []);
      if (!before?.length && wants(target, 'follow')) {
        await Promise.all([
          notice(target.email, 'new_follower', `${nameOf(me)} started following you`),
          push(target.email, '👥 New follower', `${nameOf(me)} started following you`, `/Profile?id=${me.id}`),
        ]);
      }
      return Response.json({ ok: true, state: 'following' });
    }

    if (action === 'unfollow') {
      // Also cancels a pending follow request
      const target = await userById(body?.user_id);
      if (!target) return Response.json({ ok: true, state: 'none' });
      const [follows, reqs] = await Promise.all([
        db.Follow.filter({ follower_email: me.email, following_email: target.email }),
        db.FollowRequest.filter({ requester_email: me.email, target_email: target.email, status: 'pending' }),
      ]);
      await Promise.allSettled([
        ...(follows || []).map((f: any) => db.Follow.delete(f.id)),
        ...(reqs || []).map((r: any) => db.FollowRequest.delete(r.id)),
      ]);
      return Response.json({ ok: true, state: 'none' });
    }

    if (action === 'approve' || action === 'decline') {
      const request = (await db.FollowRequest.filter({ id: cleanId(body?.request_id) }))?.[0];
      if (!request || request.target_email !== me.email) return err(404, 'not_found', 'That request isn’t there anymore.');
      const requester = await userByEmail(request.requester_email);
      const same = (await db.FollowRequest.filter({ requester_email: request.requester_email, target_email: me.email, status: 'pending' })) || [];
      const approve = action === 'approve' && !!requester && !(await isBlockedBetween(request.requester_email));
      for (const r of same.length ? same : [request]) await db.FollowRequest.update(r.id, { status: approve ? 'approved' : 'denied' });
      if (!approve) return Response.json({ ok: true, state: action === 'approve' ? 'unavailable' : 'declined' });
      const existing = await db.Follow.filter({ follower_email: request.requester_email, following_email: me.email });
      if (!existing?.length) await db.Follow.create({ follower_email: request.requester_email, following_email: me.email });
      // Tell the person who asked. (No "started following you" for the person who approved.)
      if (wants(requester, 'follow')) {
        await Promise.all([
          notice(requester.email, 'follow_approved', `${nameOf(me)} approved your follow request`),
          push(requester.email, '✅ Follow request approved', `${nameOf(me)} approved your follow request`, `/Profile?id=${me.id}`),
        ]);
      }
      return Response.json({ ok: true, state: 'approved' });
    }

    if (action === 'block' || action === 'unblock') {
      const other = await userById(body?.user_id);
      if (!other || other.email === me.email) return err(400, 'bad_request', 'Pick someone.');
      const existing = await db.Block.filter({ blocker_email: me.email, blocked_email: other.email });
      if (action === 'unblock') {
        await Promise.allSettled((existing || []).map((b: any) => db.Block.delete(b.id)));
        return Response.json({ ok: true, blocked: false });
      }
      if (!existing?.length) await db.Block.create({ blocker_email: me.email, blocked_email: other.email });
      // Blocking also ends follows and pending follow requests in both directions
      const [f1, f2, r1, r2] = await Promise.all([
        db.Follow.filter({ follower_email: me.email, following_email: other.email }),
        db.Follow.filter({ follower_email: other.email, following_email: me.email }),
        db.FollowRequest.filter({ requester_email: me.email, target_email: other.email }),
        db.FollowRequest.filter({ requester_email: other.email, target_email: me.email }),
      ]);
      await Promise.allSettled([
        ...[...(f1 || []), ...(f2 || [])].map((f: any) => db.Follow.delete(f.id)),
        ...[...(r1 || []), ...(r2 || [])].map((r: any) => db.FollowRequest.delete(r.id)),
      ]);
      return Response.json({ ok: true, blocked: true });
    }

    if (action === 'report') {
      const type = String(body?.target_type || '');
      const reason = String(body?.reason || '');
      const details = String(body?.details || '').slice(0, LIMITS.details);
      if (!['post', 'comment', 'user', 'message'].includes(type)) return err(400, 'bad_request', 'Unknown report type.');
      if (!REASONS.includes(reason)) return err(400, 'bad_request', 'Pick a reason.');
      let target: any = null, targetEmail = '', preview = '', image = '';
      if (type === 'post') { target = (await db.Post.filter({ id: cleanId(body?.target_id) }))?.[0]; targetEmail = authorOf(target); preview = target?.content || ''; image = target?.image_url || ''; }
      if (type === 'comment') { target = (await db.Comment.filter({ id: cleanId(body?.target_id) }))?.[0]; targetEmail = authorOf(target); preview = target?.content || ''; }
      if (type === 'message') {
        target = (await db.DirectMessage.filter({ id: cleanId(body?.target_id) }))?.[0];
        if (target && target.receiver_email !== me.email) target = null; // you can only report messages sent to you
        targetEmail = target?.sender_email || ''; preview = target?.content || '';
      }
      if (type === 'user') {
        target = await userById(body?.user_id);
        targetEmail = target?.email || '';
        preview = [target?.handle ? `@${target.handle}` : '', target?.bio || ''].filter(Boolean).join('\n');
        image = target?.profile_picture || '';
      }
      if (!target) return err(404, 'not_found', 'That isn’t available anymore.');
      if (targetEmail === me.email) return err(400, 'bad_request', 'You can’t report yourself.');
      const reports = await db.Report.filter({ reporter_email: me.email }, '-created_date', 200);
      if (recent(reports || []) >= PER_HOUR.report) return err(429, 'slow_down', 'You’ve sent a lot of reports. Try again a little later.');
      const targetId = type === 'user' ? '' : target.id;
      const dupe = (reports || []).find((r: any) => r.target_type === type && (r.target_id || '') === targetId && r.target_email === targetEmail && r.status === 'open');
      if (!dupe) {
        const person = type === 'user' ? target : await userByEmail(targetEmail);
        await db.Report.create({ target_type: type, target_id: targetId || undefined, target_email: targetEmail, target_name: person ? nameOf(person) : '', target_preview: preview.slice(0, 1000), target_image: image || undefined, reason, details, reporter_email: me.email, source: 'user', status: 'open' });
        // Several different people reporting the same post or comment hides it until it's reviewed
        if (type === 'post' || type === 'comment') {
          const all = await db.Report.filter({ target_type: type, target_id: targetId, status: 'open' });
          const people = new Set((all || []).map((r: any) => r.reporter_email));
          if (people.size >= HIDE_AFTER_REPORTS) {
            if (type === 'post') await db.Post.update(targetId, { hidden: true, hidden_reason: 'reports' });
            else await db.Comment.update(targetId, { hidden: true, hidden_reason: 'reports' });
          }
        }
        await notifyAdmins('🚩 New Community report', `${type === 'user' ? 'Profile' : `${type[0].toUpperCase()}${type.slice(1)}`} reported for ${reason.replace('_', ' ')}`);
      }
      return Response.json({ ok: true });
    }

    if (action === 'save_profile') {
      // Profile setup and Edit Profile. Handle, bio and photo are checked like posts are.
      const patch: Record<string, unknown> = {};
      const checks: string[] = [];
      let photoToCheck: string | null = null;
      if (body?.handle !== undefined) {
        const handle = String(body.handle || '').trim().toLowerCase().replace(/^@/, '');
        if (!/^[a-z0-9]{3,30}$/.test(handle)) return err(400, 'bad_handle', 'Handles are 3 to 30 letters or numbers.');
        if (handle !== me.handle) {
          if (RESERVED_HANDLES.has(handle)) return err(409, 'handle_taken', 'That handle is taken. Try another one.');
          const taken = ((await db.User.filter({ handle })) || []).some((u: any) => u.id !== me.id);
          if (taken) return err(409, 'handle_taken', 'That handle is taken. Try another one.');
          checks.push(handle);
          patch.handle = handle;
        }
      }
      if (body?.bio !== undefined) {
        const bio = String(body.bio || '').trim();
        if (bio.length > LIMITS.bio) return err(400, 'too_long', `Bios can be up to ${LIMITS.bio} characters.`);
        if (bio !== (me.bio || '')) { if (bio) checks.push(bio); patch.bio = bio; }
      }
      if (body?.photo !== undefined) {
        const photo = String(body.photo || '').trim();
        if (photo && !photo.startsWith('https://')) return err(400, 'bad_photo', 'That photo didn’t upload right. Please try again.');
        if (photo !== (me.profile_picture || '')) { if (photo) photoToCheck = photo; patch.profile_picture = photo; }
      }
      if (typeof body?.private === 'boolean') patch.profile_private = body.private;
      if (body?.finish === true) patch.profile_setup_complete = true;
      if (checks.length || photoToCheck) {
        if (await isBanned()) return err(403, 'banned', 'Your Community access has been turned off, so your profile can’t be changed right now.');
        const mod = await checkText(checks.join('\n'), photoToCheck);
        if (!mod.appropriate) {
          if (!mod.retry) await autoFlag('user', checks.join('\n'), mod.reason || '', photoToCheck);
          return err(422, mod.retry ? 'retry' : 'moderation', mod.reason || 'That breaks the community rules, so it wasn’t saved.');
        }
      }
      if (Object.keys(patch).length) await base44.auth.updateMe(patch);
      const saved = { ...me, ...patch };
      return Response.json({ ok: true, profile: { handle: saved.handle || null, bio: saved.bio || '', photo: saved.profile_picture || '', private: saved.profile_private === true } });
    }

    // ---------- admin ----------
    if (action.startsWith('admin_')) {
      if (!isAdmin) return err(403, 'forbidden', 'Admins only.');
      const activeBans = async () => ((await db.CommunityBan.list('-created_date', 1000)) || []).filter((b: any) => !b.lifted_at);

      if (action === 'admin_reports') {
        const status = ['open', 'removed', 'dismissed'].includes(body?.status) ? body.status : 'open';
        const rows = await db.Report.filter({ status }, '-created_date', status === 'open' ? 200 : 100);
        const autos = await db.Report.filter({ source: 'auto' }, '-created_date', 50);
        // One-time move of old bans (the user-editable community_banned flag) into CommunityBan
        let bans = await activeBans();
        const legacy = (await allUsers()).filter((u: any) => u.community_banned === true && !bans.some((b: any) => b.user_email === u.email));
        for (const u of legacy) {
          await db.CommunityBan.create({ user_email: u.email, user_id: u.id, reason: 'moved from the old ban flag', banned_at: new Date().toISOString(), banned_by: me.email });
        }
        if (legacy.length) bans = await activeBans();
        return Response.json({ reports: rows || [], auto: autos || [], banned: [...new Set(bans.map((b: any) => b.user_email))] });
      }

      if (action === 'admin_resolve') {
        const report = (await db.Report.filter({ id: cleanId(body?.report_id) }))?.[0];
        if (!report) return err(404, 'not_found', 'Report not found.');
        const remove = body?.decision === 'remove';
        if (remove && report.target_id) {
          if (report.target_type === 'post') await db.Post.update(report.target_id, { hidden: true, hidden_reason: 'removed by admin' });
          if (report.target_type === 'comment') await db.Comment.update(report.target_id, { hidden: true, hidden_reason: 'removed by admin' });
          if (report.target_type === 'message') { try { await db.DirectMessage.delete(report.target_id); } catch (_) { /* already gone */ } }
        }
        if (!remove && report.target_id && (report.target_type === 'post' || report.target_type === 'comment')) {
          // Dismissing un-hides something that was hidden only because of reports
          const ent = report.target_type === 'post' ? db.Post : db.Comment;
          const t = (await ent.filter({ id: report.target_id }))?.[0];
          if (t?.hidden && t.hidden_reason === 'reports') await ent.update(t.id, { hidden: false, hidden_reason: '' });
        }
        // Close every open report about the same thing
        const same = await db.Report.filter({ target_type: report.target_type, target_email: report.target_email, status: 'open' });
        const now = new Date().toISOString();
        for (const r of same || []) {
          if ((r.target_id || '') !== (report.target_id || '')) continue;
          await db.Report.update(r.id, { status: remove ? 'removed' : 'dismissed', resolved_at: now, resolved_by: me.email, resolved_note: String(body?.note || '').slice(0, 300) });
        }
        return Response.json({ ok: true });
      }

      if (action === 'admin_ban') {
        const person = await userByEmail(String(body?.email || ''));
        if (!person) return err(404, 'not_found', 'Person not found.');
        if (person.role === 'admin') return err(400, 'bad_request', 'Admins can’t be banned.');
        const ban = body?.banned !== false;
        const current = ((await db.CommunityBan.filter({ user_email: person.email })) || []).filter((b: any) => !b.lifted_at);
        const now = new Date().toISOString();
        if (ban && !current.length) {
          await db.CommunityBan.create({ user_email: person.email, user_id: person.id, reason: String(body?.reason || 'reports').slice(0, 300), banned_at: now, banned_by: me.email });
        }
        if (!ban) for (const b of current) await db.CommunityBan.update(b.id, { lifted_at: now, lifted_by: me.email });
        return Response.json({ ok: true, banned: ban });
      }

      if (action === 'admin_clear_profile') {
        const person = await userByEmail(String(body?.email || ''));
        if (!person) return err(404, 'not_found', 'Person not found.');
        await db.User.update(person.id, { bio: '', profile_picture: '' });
        return Response.json({ ok: true });
      }
    }

    return err(400, 'bad_request', 'Unknown action.');
  } catch (e) {
    console.error('[community] error:', (e as Error)?.message);
    return err(500, 'server', 'Something went wrong. Please try again.');
  }
});
