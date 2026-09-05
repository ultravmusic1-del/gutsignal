import { create } from 'zustand';

import type { TimelineFilterKey } from '@/domain/logs/entry';

/**
 * The timeline's filter and search box.
 *
 * Exactly the ephemeral client state Zustand is for (CLAUDE.md §10, spec §337): it belongs to
 * this session's browsing, has no server representation, and should not be persisted. Keeping
 * it here rather than in the screen's own state means a filter survives navigating into an
 * entry and back — which is the whole point of filtering before you go looking at something.
 *
 * Deliberately not persisted to disk. A search term can name a food or a symptom, and writing
 * that to storage to save re-typing a word is a bad trade in a health app.
 */

type TimelineFiltersState = {
  filter: TimelineFilterKey;
  search: string;
  setFilter: (filter: TimelineFilterKey) => void;
  setSearch: (search: string) => void;
  reset: () => void;
};

export const useTimelineFilters = create<TimelineFiltersState>((set) => ({
  filter: 'all',
  search: '',
  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  reset: () => set({ filter: 'all', search: '' }),
}));
