import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Community rules people agree to the first time they open Community, before they see or
// post anything (Google Play requires agreement before posting or viewing posts).
// Saved on the account (community_terms_at), so it doesn't come back on a new phone.
const TERMS_VERSION = 1;
const LOCAL_KEY = `hp_community_terms_v${TERMS_VERSION}`;

const RULES = [
  ['💚', 'Be kind.', 'No bullying, harassment, hate or threats.'],
  ['🌿', 'Keep it family friendly.', 'No sexual or violent posts, comments or photos.'],
  ['🚫', 'No spam.', 'No selling, ads or sketchy links.'],
  ['📸', 'Only post your own photos', "or ones you have permission to share."],
  ['🔒', 'Keep private info private.', "Don't share addresses, phone numbers or anyone's personal details."],
  ['🚩', 'See something wrong?', 'Tap ⋯ on any post or comment, or the flag on a profile, to report it or block someone. Blocked people can’t see your posts or message you.'],
  ['🧹', 'We can remove posts and comments', 'that break these rules, and suspend accounts that keep breaking them.'],
];

export function useCommunityTerms() {
  const [state, setState] = useState(() => {
    try { return localStorage.getItem(LOCAL_KEY) ? 'agreed' : 'checking'; } catch { return 'checking'; }
  });
  useEffect(() => {
    if (state !== 'checking') return;
    base44.auth.me()
      .then((u) => setState(Number(u?.community_terms_version) >= TERMS_VERSION ? 'agreed' : 'needed'))
      .catch(() => setState('needed'));
  }, [state]);
  const agree = async () => {
    try { localStorage.setItem(LOCAL_KEY, '1'); } catch { /* ignore */ }
    setState('agreed');
    try { await base44.auth.updateMe({ community_terms_at: new Date().toISOString(), community_terms_version: TERMS_VERSION }); } catch { /* saved on this phone anyway */ }
  };
  return { state, agree };
}

export default function CommunityTerms({ onAgree, dark }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const text = dark ? 'text-white' : 'text-gray-900';
  const sub = dark ? 'text-white/75' : 'text-gray-600';
  return (
    <div className="min-h-screen theme-bg p-4 pb-28 flex items-center justify-center">
      <div className={`w-full max-w-md rounded-3xl border p-6 shadow-xl ${dark ? 'bg-neutral-900 border-white/15' : 'bg-white border-gray-200'}`}>
        <p className="text-4xl" aria-hidden>🌱</p>
        <h1 className={`text-2xl font-bold mt-2 ${text}`}>Before you join the Community</h1>
        <p className={`text-sm mt-1 ${sub}`}>A few simple rules so it stays a happy place for plant people.</p>
        <ul className="mt-4 space-y-3">
          {RULES.map(([icon, bold, rest]) => (
            <li key={bold} className="flex gap-3">
              <span className="text-xl leading-6 shrink-0" aria-hidden>{icon}</span>
              <p className={`text-sm ${sub}`}><b className={text}>{bold}</b> {rest}</p>
            </li>
          ))}
        </ul>
        <p className={`text-xs mt-4 ${sub}`}>
          By tapping I agree, you accept these rules and our{' '}
          <button onClick={() => navigate('/TermsAndConditions')} className="underline font-semibold text-green-600">Terms</button>.
        </p>
        <button
          onClick={async () => { setBusy(true); await onAgree(); setBusy(false); }}
          disabled={busy}
          className="mt-4 w-full rounded-2xl py-3.5 font-bold bg-green-600 text-white active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} I agree
        </button>
        <button onClick={() => navigate('/Dashboard')} className={`mt-2 w-full py-2 text-sm font-semibold ${sub}`}>Not now</button>
      </div>
    </div>
  );
}
