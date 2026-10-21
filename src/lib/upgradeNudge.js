// Small "get Plus" popups for free users (shown by components/UpgradeNudge, mounted in Layout).
//   nudgeUpgrade('ads')                         after every 3rd full-screen ad
//   nudgeUpgrade('ids', { ids, saved })         out of photo IDs (ids = server status, for the video button)
//   nudgeUpgrade('health' | 'chat' | 'rename', { limit })   hit a daily AI limit
//   nudgeUpgrade('water' | 'care' | 'followup' | 'timelapse' | 'plan' | 'more')   tapped a Plus-only feature
// Returns false (and shows nothing) for Plus members, so callers can fall back to their old behavior.
import { isPlusCached } from '@/lib/premium';

export const NUDGE_EVENT = 'hp-upgrade-nudge';

export function nudgeUpgrade(reason, extra = {}) {
  if (isPlusCached()) return false;
  try {
    window.dispatchEvent(new CustomEvent(NUDGE_EVENT, { detail: { reason, ...extra } }));
    return true;
  } catch {
    return false;
  }
}

// Plus numbers shown in the popups. Keep in step with AI_LIMITS / ID_RULES in functions/premium.
const PLUS = { ids: 200, health: 25, chat: 200 };

export function nudgeCopy(reason, extra = {}) {
  const limit = extra.limit;
  switch (reason) {
    case 'ads':
      return { title: 'Tired of ads?', body: 'Happy Plants Plus has no ads, plus weather-smart watering, care schedules and more.' };
    case 'ids':
      return {
        title: "You're out of photo IDs for today",
        body: `${extra.saved ? 'Your photos are saved and get named tomorrow. ' : 'They come back tomorrow. '}Typing a plant's name doesn't use a photo ID. Plus gives you ${PLUS.ids} photo IDs a day.`,
      };
    case 'health':
      return { title: `That's today's ${limit || ''} free health checks`.replace('  ', ' '), body: `Plus gives you ${PLUS.health} a day, a step-by-step plan, and reminders to re-check.` };
    case 'chat':
      return { title: `That's today's ${limit || ''} free chat messages`.replace('  ', ' '), body: `Plus gives you ${PLUS.chat} a day. Or chat again tomorrow.` };
    case 'rename':
      // Typing a plant's name (new plant or a fix): its own daily limit, separate from photo IDs
      return { title: "That's all the typed plant names for today", body: 'You can type more tomorrow, and Plus gives you more.' };
    case 'water':
      return { title: 'How much to water is part of Plus', body: 'Plus tells you how many ounces each plant needs and adjusts for rain and heat outside.' };
    case 'care':
      return { title: 'Care schedules are part of Plus', body: 'Plus reminds you when to fertilize, mist, rotate and repot each plant.' };
    case 'followup':
    case 'plan':
      return { title: 'Plant doctor follow-ups are part of Plus', body: 'Plus turns a health check into a step-by-step plan, reminds you to re-check, and shows if it is getting better.' };
    case 'timelapse':
      return { title: 'Growth time-lapse is part of Plus', body: 'Plus lines up each photo with the last one and plays them as a time-lapse.' };
    default:
      return { title: 'That is part of Plus', body: 'Plus adds weather-smart watering, care schedules, follow-ups and no ads.' };
  }
}
