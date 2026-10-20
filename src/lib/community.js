// Client side of the `community` backend function. Every post, comment, like, message,
// report and block goes through it, so moderation and blocking can't be skipped.
import { base44 } from '@/api/base44Client';

export class CommunityError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export async function community(action, args = {}) {
  try {
    const { data } = await base44.functions.invoke('community', { action, ...args });
    if (data?.error) throw new CommunityError(data.message || 'Something went wrong.', data.error);
    return data;
  } catch (err) {
    if (err instanceof CommunityError) throw err;
    const d = err?.response?.data || err?.data;
    throw new CommunityError(d?.message || 'Something went wrong. Please try again.', d?.error || 'network');
  }
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
