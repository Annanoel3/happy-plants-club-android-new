import { QueryClient } from '@tanstack/react-query';

// Call after a backend function that writes plants/waterings/reminders on the
// server (those bypass the auto-invalidation in api/base44Client.js).
export function refreshPlantData() {
	for (const key of ['plants', 'plant', 'userPlants', 'wateringLogs', 'reminders', 'remindersWithNotifications', 'todayWateringReminder']) {
		queryClientInstance.invalidateQueries({ queryKey: [key] });
	}
}

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			// Data is reused for 30s when you move between screens, instead of every
			// screen re-downloading everything the moment it opens. Writes still refresh
			// the affected lists right away (see api/base44Client.js), and coming back
			// to the app after a while refetches what's on screen.
			staleTime: 30_000,
			refetchOnWindowFocus: true,
			retry: 1,
		},
	},
});
