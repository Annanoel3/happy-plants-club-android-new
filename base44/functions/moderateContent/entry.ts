import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

// Checks text (and an optional image) before it's posted, commented, messaged or sent to
// the plant expert. Returns { appropriate, reason, retry? }.
//
// 1. Swear-word filter. Whole words only, so "grass", "glass", "class" and "shiitake" are fine
//    (the old version matched "ass" inside any word, which blocked "my grass is dying").
//    Catches f*ck / sh1t / fuuuck style spellings too.
// 2. OpenAI's moderation model (free): hate, harassment, threats, sexual content, violence,
//    self-harm. Checks the photo too when there is one.
// 3. Spam: only when the text has a link, phone number, email or sales words, a quick AI check
//    decides whether it's an ad or scam (so normal posts cost nothing extra).
// If the checker itself is down, nothing gets through: the person is asked to try again.

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

const BAD_WORDS = new Set([
  'fuck', 'fucks', 'fucker', 'fuckers', 'fucking', 'fuckin', 'fucked', 'motherfucker', 'motherfuckers',
  'shit', 'shits', 'shitty', 'shitting', 'bullshit', 'horseshit', 'dipshit',
  'bitch', 'bitches', 'bitchy',
  'bastard', 'bastards',
  'ass', 'asses', 'asshole', 'assholes', 'dumbass', 'jackass', 'smartass',
  'damn', 'dammit', 'damnit', 'goddamn', 'goddammit',
  'cunt', 'cunts', 'whore', 'whores', 'slut', 'sluts', 'dickhead', 'dickheads',
  // masked spellings
  'f*ck', 'f**k', 'fu*k', 'f*cking', 'sh*t', 's**t', 'b*tch', 'b**ch', 'a**hole', 'c*nt',
]);
// Repeated letters squeezed out ("fuuuuck" → "fuck", "shiiit" → "shit")
const BAD_SQUEEZED = new Set(['fuck', 'fucking', 'shit', 'bitch', 'bastard', 'damn', 'cunt', 'whore', 'slut']);
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

export function hasBadWord(text: string): boolean {
  for (const raw of text.split(/\s+/)) {
    if (!/[a-z]/i.test(raw)) continue; // plain numbers stay numbers ("455 days")
    const t = raw.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] || c).replace(/[^a-z*]/g, '');
    if (!t) continue;
    if (BAD_WORDS.has(t)) return true;
    if (BAD_SQUEEZED.has(t.replace(/(.)\1+/g, '$1'))) return true;
    // stems that never show up inside ordinary words (shiitake/shitake excepted)
    if (/fuck/.test(t)) return true;
    if (/shit/.test(t) && !/^shi+ta?ke?/.test(t)) return true;
  }
  return false;
}

export const SPAMMY = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ly|io|co|shop|store|xyz)\b|@[a-z0-9-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d|\b(promo|discount|coupon|giveaway|buy now|for sale|dm me|message me on|whatsapp|telegram|crypto|bitcoin|forex|invest(ment)?|cash ?app|venmo|onlyfans|followers|earn \$|make money)\b)/i;

const FRIENDLY: Record<string, string> = {
  hate: 'Hateful language isn’t allowed here.',
  harassment: 'Please keep it kind. That reads as harassment.',
  sexual: 'Sexual content isn’t allowed here.',
  violence: 'Violent content isn’t allowed here.',
  'self-harm': 'This looks like it might be about self-harm, so it wasn’t shared. If you’re struggling, please reach out to someone you trust or call or text 988 (US).',
  illicit: 'This looks like it’s about something illegal, so it wasn’t shared.',
};

function reasonFor(categories: Record<string, boolean>): string {
  const hit = Object.keys(categories || {}).filter((k) => categories[k]);
  for (const k of ['self-harm', 'hate', 'harassment', 'sexual', 'violence', 'illicit']) {
    if (hit.some((h) => h === k || h.startsWith(k + '/'))) return FRIENDLY[k];
  }
  return 'This breaks the community rules, so it wasn’t shared.';
}

const RETRY = 'We couldn’t check this right now. Please try again in a minute.';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const content = String(body?.content || '').slice(0, 5000);
    const imageUrl = typeof body?.image_url === 'string' && /^https:\/\//.test(body.image_url) ? body.image_url : null;
    if (!content.trim() && !imageUrl) return Response.json({ appropriate: true });

    if (content && hasBadWord(content)) {
      return Response.json({ appropriate: false, reason: 'Please keep it family friendly. Swear words aren’t allowed.', category: 'profanity' });
    }

    // OpenAI moderation (text + photo)
    let mod;
    try {
      const input: any[] = [];
      if (content.trim()) input.push({ type: 'text', text: content });
      if (imageUrl) input.push({ type: 'image_url', image_url: { url: imageUrl } });
      mod = await openai.moderations.create({ model: 'omni-moderation-latest', input } as any);
    } catch (e) {
      console.error('[moderateContent] moderation API failed:', (e as Error)?.message);
      return Response.json({ appropriate: false, retry: true, reason: RETRY });
    }
    const result = mod?.results?.[0];
    if (result?.flagged) {
      const cats = Object.keys(result.categories || {}).filter((k) => (result.categories as any)[k]);
      return Response.json({ appropriate: false, reason: reasonFor(result.categories as any), category: cats.join(',') });
    }

    // Spam / ads, only when something in the text looks like it
    if (content && SPAMMY.test(content)) {
      try {
        const r = await openai.chat.completions.create({
          model: 'gpt-6-luna',
          messages: [
            { role: 'system', content: 'You check posts in a friendly plant-care app. Decide ONLY whether the text is spam, a scam, or commercial advertising (selling something, promoting a business or account, asking people to message off-app, money schemes). Sharing a helpful link about plant care, or mentioning where you bought a plant, is fine. Reply with JSON {"spam": true|false}.' },
            { role: 'user', content },
          ],
          response_format: { type: 'json_object' },
        });
        const spam = JSON.parse(r.choices?.[0]?.message?.content || '{}')?.spam === true;
        if (spam) return Response.json({ appropriate: false, reason: 'Ads, sales and spam aren’t allowed here.', category: 'spam' });
      } catch (e) {
        console.error('[moderateContent] spam check failed:', (e as Error)?.message);
        return Response.json({ appropriate: false, retry: true, reason: RETRY });
      }
    }

    return Response.json({ appropriate: true });
  } catch (error) {
    console.error('[moderateContent] error:', (error as Error)?.message);
    return Response.json({ appropriate: false, retry: true, reason: RETRY });
  }
});
