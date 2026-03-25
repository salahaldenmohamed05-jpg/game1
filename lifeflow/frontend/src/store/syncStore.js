/**
 * Sync Store - Zustand (Phase 1+2)
 * ==================================
 * Single source of truth for real-time state sync.
 * Invalidates React Query caches on every mutation.
 * All data flows from DB -> API -> this store -> UI.
 */

import { create } from 'zustand';

const useSyncStore = create((set, get) => ({
  // Sync version counter — incremented on any mutation
  syncVersion: 0,

  // Last action for next-action dedup (Phase 8)
  lastActions: [],  // [{type, id, ts}]

  // Bump sync version — triggers re-renders everywhere
  bump: () => set(s => ({ syncVersion: s.syncVersion + 1 })),

  // Record an action to prevent redundant suggestions
  recordAction: (type, id = null) => {
    set(s => ({
      lastActions: [
        { type, id, ts: Date.now() },
        ...s.lastActions,
      ].slice(0, 20),
    }));
  },

  // Check if action was done recently (within minutes)
  wasRecentlyDone: (type, withinMinutes = 30) => {
    const cutoff = Date.now() - withinMinutes * 60 * 1000;
    return get().lastActions.some(a => a.type === type && a.ts > cutoff);
  },

  // Invalidate all queries helper — called from components
  // This is a reference to queryClient that gets set in _app.js
  _queryClient: null,
  setQueryClient: (qc) => set({ _queryClient: qc }),

  invalidateAll: () => {
    const qc = get()._queryClient;
    if (!qc) return;
    // Tasks — both old and smart-view keys
    qc.invalidateQueries({ queryKey: ['tasks-view'] });
    qc.invalidateQueries({ queryKey: ['tasks-smart-view'] });
    // Habits
    qc.invalidateQueries({ queryKey: ['habits-today'] });
    qc.invalidateQueries({ queryKey: ['habits-all'] });
    // Dashboard & widgets
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['next-action-dash'] });
    qc.invalidateQueries({ queryKey: ['next-action-assist'] });
    qc.invalidateQueries({ queryKey: ['daily-plan-dash'] });
    qc.invalidateQueries({ queryKey: ['timeline-assist'] });
    qc.invalidateQueries({ queryKey: ['life-feed-dash'] });
    qc.invalidateQueries({ queryKey: ['burnout-dash'] });
    // Notifications
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['header-notifications'] });
    // Mood
    qc.invalidateQueries({ queryKey: ['mood-today'] });
    qc.invalidateQueries({ queryKey: ['mood-stats'] });
    qc.invalidateQueries({ queryKey: ['mood-log'] });
    // Chat sessions
    qc.invalidateQueries({ queryKey: ['chat-sessions'] });
    get().bump();
  },
}));

export default useSyncStore;
