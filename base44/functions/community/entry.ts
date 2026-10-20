import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Everything people write in Community goes through here, so nothing can skip the checks:
//  - posts, comments and direct messages are checked by moderateContent before they're saved
//    (the database itself only lets this function create them)
//  - Block works both ways: blocked people can't see, comment on, like or message each other
//  - Report on posts, comments, messages and profiles; 3 reports hide a post or comment until
//    an admin looks; admins get a push for every new report
//  - Admin actions: list reports, remove the content, dismiss, ban/unban someone from Community
//
// Actions: feed, post, comment, like, message, conversation, report, block, unblock, blocks,
//          admin_reports, admin_resolve, admin_ban

const LIMITS = { post: 2000, comment: 1000, message: 2000, details: 500 };
const PER_HOUR = { post: 10, comment: 60, message: 120, report: 30 };
const HIDE_AFTER_REPORTS = 3;
const REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'other'];

async function internalToken(): Promise<string> {
  const key = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|hp-internal-v1'));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const err = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, message, ...extra }, { status });

const authorOf = (r: any) => r?.author_email || r?.created_by || '';
const recent = (rows: any[], field: string, email: string, ms = 3600_000) =>
  rows.filter((r) => r?.[field] === email && Date.now() - new Date(r.created_date).getTime() < ms).length;

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

    // ---------- helpers that need the db ----------
    const blockSets = async () => {
      const [mine, theirs] = await Promise.all([
        db.Block.filter({ blocker_email: me.email }),
        db.Block.filter({ blocked_email: me.email }),
      ]);
      const blocked = new Set<string>((mine || []).map((b: any) => b.blocked_email));
      const blockedBy = new Set<string>((theirs || []).map((b: any) => b.blocker_email));
      return { blocked, blockedBy, hidden: new Set<string>([...blocked, ...blockedBy]) };
    };
    const isBlockedBetween = async (other: string) => {
      if (!other || other === me.email) return false;
      const [a, b] = await Promise.all([
        db.Block.filter({ blocker_email: me.email, blocked_email: other }),
        db.Block.filter({ blocker_email: other, blocked_email: me.email }),
      ]);
      return (a?.length || 0) + (b?.length || 0) > 0;
    };
    const checkText = async (content: string, imageUrl?: string | null) => {
      const r = await base44.functions.invoke('moderateContent', { content, image_url: imageUrl || undefined });
      return r?.data || { appropriate: false, retry: true, reason: 'We couldn’t check this right now. Please try again in a minute.' };
    };
    const autoFlag = async (type: string, content: string, reason: string, imageUrl?: string | null) => {
      try {
        await db.Report.create({
          target_type: type, target_email: me.email, target_name: me.full_name || '', target_preview: content.slice(0, 500),
          target_image: imageUrl || undefined, reason: 'auto_blocked', details: reason, reporter_email: 'auto', source: 'auto', status: 'dismissed',
        });
      } catch (e) { console.error('[community] autoFlag failed', (e as Error)?.message); }
    };
    const notifyAdmins = async (title: string, text: string) => {
      try {
        const admins = await db.User.filter({ role: 'admin' });
        const token = await internalToken();
        for (const a of admins || []) {
          await base44.asServiceRole.functions.invoke('sendNotification', { _internal: token, toUserEmail: a.email, title, body: text, screen: '/CommunityReports' });
        }
      } catch (e) { console.error('[community] notifyAdmins failed', (e as Error)?.message); }
    };
    const userByEmail = async (email: string) => (await db.User.filter({ email }))?.[0] || null;
    const banned = () => me.community_banned === true;

    // ---------- read ----------
    if (action === 'feed') {
      const { blocked, blockedBy, hidden } = await blockSets();
      const [posts, comments, likes, users] = await Promise.all([
        db.Post.list('-created_date', 100),
        db.Comment.list('-created_date', 2000),
        db.Like.list('-created_date', 10000),
        db.User.list('-created_date', 2000),
      ]);
      const people: Record<string, any> = {};
      for (const u of users || []) people[u.email] = { name: u.full_name, handle: u.handle, picture: u.profile_picture };
      const visible = (posts || []).filter((p: any) => (!p.hidden || isAdmin) && !hidden.has(authorOf(p)));
      const ids = new Set(visible.map((p: any) => p.id));
      const likeCount: Record<string, number> = {};
      const liked: string[] = [];
      for (const l of likes || []) {
        if (!ids.has(l.post_id) || hidden.has(l.user_email)) continue;
        likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1;
        if (l.user_email === me.email) liked.push(l.post_id);
      }
      const byPost: Record<string, any[]> = {};
      for (const c of (comments || []).slice().reverse()) {
        if (!ids.has(c.post_id) || (c.hidden && !isAdmin) || hidden.has(authorOf(c))) continue;
        const a = authorOf(c);
        (byPost[c.post_id] ||= []).push({ ...c, author_email: a, author_name: people[a]?.name || c.author_name, author_profile_picture: people[a]?.picture || null });
      }
      return Response.json({
        posts: visible.map((p: any) => {
          const a = authorOf(p);
          return { ...p, author_email: a, author_name: people[a]?.name || p.author_name, author_profile_picture: people[a]?.picture || null, likes_count: likeCount[p.id] || 0 };
        }),
        comments: byPost,
        liked,
        blocked: [...blocked],
        blockedBy: [...blockedBy],
        me: { banned: banned(), admin: isAdmin },
      });
    }

    if (action === 'blocks') {
      const { blocked, blockedBy } = await blockSets();
      return Response.json({ blocked: [...blocked], blockedBy: [...blockedBy] });
    }

    if (action === 'conversation') {
      const other = String(body?.with || '').trim();
      if (!other) return err(400, 'bad_request', 'Missing person.');
      const [sent, got, a, b] = await Promise.all([
        db.DirectMessage.filter({ sender_email: me.email, receiver_email: other }),
        db.DirectMessage.filter({ sender_email: other, receiver_email: me.email }),
        db.Block.filter({ blocker_email: me.email, blocked_email: other }),
        db.Block.filter({ blocker_email: other, blocked_email: me.email }),
      ]);
      const iBlocked = (a?.length || 0) > 0;
      const theyBlocked = (b?.length || 0) > 0;
      // A blocked person's messages disappear for the person who blocked them
      const messages = [...(sent || []), ...(theyBlocked ? [] : iBlocked ? [] : got || [])]
        .sort((x: any, y: any) => new Date(x.created_date).getTime() - new Date(y.created_date).getTime());
      const person = await userByEmail(other);
      return Response.json({
        messages,
        person: person && !theyBlocked ? { email: person.email, full_name: person.full_name, handle: person.handle, profile_picture: person.profile_picture } : null,
        iBlocked, theyBlocked, banned: banned(),
      });
    }

    // ---------- write ----------
    if (action === 'post') {
      if (banned()) return err(403, 'banned', 'Your Community access has been turned off.');
      const content = String(body?.content || '').trim();
      const image = typeof body?.image_url === 'string' && body.image_url.startsWith('https://') ? body.image_url : null;
      if (!content && !image) return err(400, 'empty', 'Write something or add a photo.');
      if (content.length > LIMITS.post) return err(400, 'too_long', `Posts can be up to ${LIMITS.post} characters.`);
      const mine = await db.Post.filter({ author_email: me.email });
      if (recent(mine || [], 'author_email', me.email) >= PER_HOUR.post) return err(429, 'slow_down', 'You’ve posted a lot in the last hour. Try again a little later.');
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
      const post = await db.Post.create({ content, image_url: image || undefined, author_email: me.email, author_name: me.full_name || '', plant_id, plant_name, likes_count: 0, hidden: false });
      return Response.json({ ok: true, post });
    }

    if (action === 'comment') {
      if (banned()) return err(403, 'banned', 'Your Community access has been turned off.');
      const content = String(body?.content || '').trim();
      if (!content) return err(400, 'empty', 'Write a comment first.');
      if (content.length > LIMITS.comment) return err(400, 'too_long', `Comments can be up to ${LIMITS.comment} characters.`);
      const post = (await db.Post.filter({ id: String(body?.post_id || '') }))?.[0];
      if (!post || post.hidden) return err(404, 'not_found', 'That post isn’t available anymore.');
      const owner = authorOf(post);
      if (await isBlockedBetween(owner)) return err(403, 'blocked', 'You can’t comment on this post.');
      const mine = await db.Comment.filter({ author_email: me.email });
      if (recent(mine || [], 'author_email', me.email) >= PER_HOUR.comment) return err(429, 'slow_down', 'You’ve commented a lot in the last hour. Try again a little later.');
      const mod = await checkText(content);
      if (!mod.appropriate) {
        if (!mod.retry) await autoFlag('comment', content, mod.reason || '');
        return err(422, mod.retry ? 'retry' : 'moderation', mod.reason || 'This breaks the community rules, so it wasn’t shared.');
      }
      const comment = await db.Comment.create({ post_id: post.id, content, author_email: me.email, author_name: me.full_name || '', hidden: false });
      if (owner && owner !== me.email) {
        const o = await userByEmail(owner);
        if (o?.notifications_enabled !== false) {
          await db.Notification.create({ user_email: owner, type: 'comment', message: `${me.full_name || 'Someone'} commented on your post`, from_user_email: me.email, from_user_name: me.full_name || '', from_user_handle: me.handle || '' });
        }
        // The push itself is sent by the "Notify on Comment" automation
      }
      return Response.json({ ok: true, comment });
    }

    if (action === 'like') {
      if (banned()) return err(403, 'banned', 'Your Community access has been turned off.');
      const post = (await db.Post.filter({ id: String(body?.post_id || '') }))?.[0];
      if (!post || post.hidden) return err(404, 'not_found', 'That post isn’t available anymore.');
      const owner = authorOf(post);
      if (await isBlockedBetween(owner)) return err(403, 'blocked', 'You can’t like this post.');
      const existing = await db.Like.filter({ post_id: post.id, user_email: me.email });
      let liked;
      if (existing?.length) {
        for (const l of existing) await db.Like.delete(l.id);
        liked = false;
      } else {
        await db.Like.create({ post_id: post.id, user_email: me.email });
        liked = true;
        if (owner && owner !== me.email) {
          const o = await userByEmail(owner);
          if (o?.notifications_enabled !== false) {
            await db.Notification.create({ user_email: owner, type: 'like', message: `${me.full_name || 'Someone'} liked your post`, from_user_email: me.email, from_user_name: me.full_name || '', from_user_handle: me.handle || '' });
          }
          // The push itself is sent by the "Notify on Post Like" automation
        }
      }
      const count = (await db.Like.filter({ post_id: post.id }))?.length || 0;
      await db.Post.update(post.id, { likes_count: count });
      return Response.json({ ok: true, liked, count });
    }

    if (action === 'message') {
      if (banned()) return err(403, 'banned', 'Your Community access has been turned off.');
      const to = String(body?.to_email || '').trim();
      const content = String(body?.content || '').trim();
      if (!to || to === me.email) return err(400, 'bad_request', 'Pick someone to message.');
      if (!content) return err(400, 'empty', 'Write a message first.');
      if (content.length > LIMITS.message) return err(400, 'too_long', `Messages can be up to ${LIMITS.message} characters.`);
      const person = await userByEmail(to);
      if (!person) return err(404, 'not_found', 'That person isn’t available.');
      if (await isBlockedBetween(to)) return err(403, 'blocked', 'You can’t message this person.');
      const sent = await db.DirectMessage.filter({ sender_email: me.email });
      if (recent(sent || [], 'sender_email', me.email) >= PER_HOUR.message) return err(429, 'slow_down', 'You’ve sent a lot of messages in the last hour. Try again a little later.');
      const mod = await checkText(content);
      if (!mod.appropriate) {
        if (!mod.retry) await autoFlag('message', content, mod.reason || '');
        return err(422, mod.retry ? 'retry' : 'moderation', mod.reason || 'This breaks the community rules, so it wasn’t sent.');
      }
      const message = await db.DirectMessage.create({ sender_email: me.email, sender_name: me.full_name || '', receiver_email: person.email, receiver_name: person.full_name || '', content, read: false });
      return Response.json({ ok: true, message });
    }

    if (action === 'report') {
      const type = String(body?.target_type || '');
      const reason = String(body?.reason || '');
      const details = String(body?.details || '').slice(0, LIMITS.details);
      if (!['post', 'comment', 'user', 'message'].includes(type)) return err(400, 'bad_request', 'Unknown report type.');
      if (!REASONS.includes(reason)) return err(400, 'bad_request', 'Pick a reason.');
      let target: any = null, targetEmail = '', preview = '', image = '';
      if (type === 'post') { target = (await db.Post.filter({ id: String(body?.target_id || '') }))?.[0]; targetEmail = authorOf(target); preview = target?.content || ''; image = target?.image_url || ''; }
      if (type === 'comment') { target = (await db.Comment.filter({ id: String(body?.target_id || '') }))?.[0]; targetEmail = authorOf(target); preview = target?.content || ''; }
      if (type === 'message') {
        target = (await db.DirectMessage.filter({ id: String(body?.target_id || '') }))?.[0];
        if (target && target.receiver_email !== me.email) target = null; // you can only report messages sent to you
        targetEmail = target?.sender_email || ''; preview = target?.content || '';
      }
      if (type === 'user') { targetEmail = String(body?.target_email || ''); target = targetEmail ? await userByEmail(targetEmail) : null; preview = target?.bio || ''; }
      if (!target) return err(404, 'not_found', 'That isn’t available anymore.');
      if (targetEmail === me.email) return err(400, 'bad_request', 'You can’t report yourself.');
      const reports = await db.Report.filter({ reporter_email: me.email });
      if (recent(reports || [], 'reporter_email', me.email) >= PER_HOUR.report) return err(429, 'slow_down', 'You’ve sent a lot of reports. Try again a little later.');
      const targetId = type === 'user' ? '' : target.id;
      const dupe = (reports || []).find((r: any) => r.target_type === type && (r.target_id || '') === targetId && r.target_email === targetEmail && r.status === 'open');
      if (!dupe) {
        const person = await userByEmail(targetEmail);
        await db.Report.create({ target_type: type, target_id: targetId || undefined, target_email: targetEmail, target_name: person?.full_name || '', target_preview: preview.slice(0, 1000), target_image: image || undefined, reason, details, reporter_email: me.email, source: 'user', status: 'open' });
        // Several different people reporting the same post or comment hides it until it's reviewed
        if (type === 'post' || type === 'comment') {
          const all = await db.Report.filter({ target_type: type, target_id: targetId, status: 'open' });
          const people = new Set((all || []).map((r: any) => r.reporter_email));
          if (people.size >= HIDE_AFTER_REPORTS) {
            if (type === 'post') await db.Post.update(targetId, { hidden: true, hidden_reason: 'reports' });
            else await db.Comment.update(targetId, { hidden: true, hidden_reason: 'reports' });
          }
        }
        await notifyAdmins('🚩 New Community report', `${type[0].toUpperCase()}${type.slice(1)} reported for ${reason.replace('_', ' ')}`);
      }
      return Response.json({ ok: true });
    }

    if (action === 'block' || action === 'unblock') {
      const other = String(body?.email || '').trim();
      if (!other || other === me.email) return err(400, 'bad_request', 'Pick someone.');
      const existing = await db.Block.filter({ blocker_email: me.email, blocked_email: other });
      if (action === 'unblock') {
        for (const b of existing || []) await db.Block.delete(b.id);
        return Response.json({ ok: true, blocked: false });
      }
      if (!existing?.length) await db.Block.create({ blocker_email: me.email, blocked_email: other });
      // Blocking also ends follows and pending follow requests in both directions
      const [f1, f2, r1, r2] = await Promise.all([
        db.Follow.filter({ follower_email: me.email, following_email: other }),
        db.Follow.filter({ follower_email: other, following_email: me.email }),
        db.FollowRequest.filter({ requester_email: me.email, target_email: other }),
        db.FollowRequest.filter({ requester_email: other, target_email: me.email }),
      ]);
      for (const f of [...(f1 || []), ...(f2 || [])]) await db.Follow.delete(f.id);
      for (const r of [...(r1 || []), ...(r2 || [])]) await db.FollowRequest.delete(r.id);
      return Response.json({ ok: true, blocked: true });
    }

    // ---------- admin ----------
    if (action.startsWith('admin_')) {
      if (!isAdmin) return err(403, 'forbidden', 'Admins only.');
      if (action === 'admin_reports') {
        const status = ['open', 'removed', 'dismissed'].includes(body?.status) ? body.status : 'open';
        const rows = status === 'open'
          ? await db.Report.filter({ status: 'open' }, '-created_date', 200)
          : await db.Report.filter({ status }, '-created_date', 100);
        const autos = await db.Report.filter({ source: 'auto' }, '-created_date', 50);
        const users = await db.User.list('-created_date', 2000);
        const bannedSet = new Set((users || []).filter((u: any) => u.community_banned === true).map((u: any) => u.email));
        return Response.json({ reports: rows || [], auto: autos || [], banned: [...bannedSet] });
      }
      if (action === 'admin_resolve') {
        const report = (await db.Report.filter({ id: String(body?.report_id || '') }))?.[0];
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
        const email = String(body?.email || '');
        const person = await userByEmail(email);
        if (!person) return err(404, 'not_found', 'Person not found.');
        if (person.role === 'admin') return err(400, 'bad_request', 'Admins can’t be banned.');
        await db.User.update(person.id, { community_banned: body?.banned !== false });
        return Response.json({ ok: true, banned: body?.banned !== false });
      }
    }

    return err(400, 'bad_request', 'Unknown action.');
  } catch (e) {
    console.error('[community] error:', (e as Error)?.message);
    return err(500, 'server', 'Something went wrong. Please try again.');
  }
});
