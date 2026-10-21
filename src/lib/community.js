// Client side of the `community` backend function. Every post, comment, like, follow, report,
// block and profile edit goes through it, so moderation and blocking can't be skipped. People
// are addressed by user id; the server never sends anyone else's email to the phone.
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export class CommunityError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export async function community(action, args = {}) {
  let failure;
  try {
    const { data } = await base44.functions.invoke('community', { action, ...args });
    if (!data?.error) return data;
    failure = new CommunityError(data.message || 'Something went wrong.', data.error);
  } catch (err) {
    const d = err?.response?.data || err?.data;
    failure = new CommunityError(d?.message || 'Something went wrong. Please try again.', d?.error || 'network');
  }
  // The server says the community rules haven't been agreed yet: show them again
  if (failure.code === 'terms') {
    try { window.dispatchEvent(new Event('hp-community-terms-needed')); } catch { /* ignore */ }
  }
  throw failure;
}

/** Shows a community error. "Agree to the rules first" gets a button to the rules (on the Feed). */
export function communityToast(e, navigate) {
  const message = e?.message || 'Something went wrong. Please try again.';
  if (e?.code === 'terms' && navigate) {
    toast.error(message, { action: { label: 'See the rules', onClick: () => navigate('/Feed') } });
  } else {
    toast.error(message);
  }
}

/** Link to someone's profile (by user id, never by email) */
export const profilePath = (id) => (id ? `/Profile?id=${encodeURIComponent(id)}` : null);

/** "Name" for display: name, else @handle, else a friendly fallback (never "@undefined") */
export const displayName = (p) => p?.name || (p?.handle ? `@${p.handle}` : 'Plant friend');

/** created_date comes from the server in UTC without a "Z"; without it phones read it as local time */
export function parseServerDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  const s = String(d);
  const t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(t) ? null : new Date(t);
}

export const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or ads' },
  { key: 'harassment', label: 'Bullying or harassment' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'sexual', label: 'Sexual content' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'self_harm', label: 'Self-harm' },
  { key: 'other', label: 'Something else' },
];
