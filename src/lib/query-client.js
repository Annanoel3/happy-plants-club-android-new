import { QueryClient } from '@tanstack/react-query';

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
