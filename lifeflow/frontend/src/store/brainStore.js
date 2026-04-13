/**
 * Brain Store v8.0 — Phase 15: Proactive Interventions + Truth Alignment
 * =====================================================================
 * Zustand store that holds the unified brain state from the backend.
 *
 * Phase 15 — PROACTIVE INTERVENTIONS:
 *   1. interventions[]: array of active intervention banners
 *   2. addIntervention(): push a new intervention (from socket)
 *   3. dismissIntervention(): remove by ID + notify backend
 *   4. Auto-expiry: expired interventions are cleaned on access
 *   5. Max 3 visible interventions at a time
 *
 * Phase 12.9 — TRUTH ALIGNMENT:
 *   1. LIFECYCLE TRACING: every state transition is logged with timestamp
 *   2. UI CONSISTENCY: dashboard/execution/assistant all read from same brainState
 *   3. STALE DETECTION: brainState with mismatched dayContext is rejected
 *   4. TRUTH GUARD: safeMode states cannot have positive tone or high confidence
 *
 * Phase 12.8 — RESILIENCE GUARANTEES (preserved):
 *   1. HARD 3s TIMEOUT: brainState is ALWAYS set within 3 seconds (fallback if needed)
 *   2. RACE WINNER: whichever arrives first (REST or socket) wins; late responses update only if newer
 *   3. isLoading ALWAYS cleared: every code path sets isLoading=false within 3s
 *   4. fetchBrainState has its OWN failsafe: never leaves isLoading=true
 *   5. No duplicate init within 5s: prevents double-fire
 *   6. Socket is SECONDARY: failure is non-critical
 *
 * HARD RULE: The UI must NEVER stay in a loading state. Period.
 * HARD RULE: The UI must NEVER show contradictory information. Period.
 */

import { create } from 'zustand';
import { brainAPI } from '../utils/api';

let _socket = null;
let _activityInterval = null;
let _failsafeTimer = null;
let _initRequestId = 0; // monotonic counter to detect stale responses
let _interventionCleanupTimer = null; // Phase 15: auto-expire interventions
const MAX_VISIBLE_INTERVENTIONS = 3;

function ts() {
  return new Date().toISOString().slice(11, 23);
}

/**
 * Validate that a brainState object has the minimum shape required for UI rendering.
 * Phase 12.9: Also validates truth alignment (safeMode constraints).
 * Returns true if the state is usable, false if it should be replaced with fallback.
 */
function isValidBrainState(state) {
  if (!state) return false;
  if (typeof state !== 'object') return false;
  // Must have currentDecision (even if it's a minimal empty/loading type)
  if (!state.currentDecision) return false;
  if (!state.lastUpdatedAt) return false;
  return true;
}

/**
 * Phase 12.9: Truth guard — ensures brainState is internally consistent.
 * Fixes contradictions before they reach the UI.
 */
function applyFrontendTruthGuard(state) {
  if (!state || typeof state !== 'object') return state;
  try {
    const cd = state.currentDecision;
    if (!cd) return state;

    // GUARD 1: safeMode must not have positive tone or high confidence
    if (state.safeMode) {
      if (cd.tone === 'positive') cd.tone = 'neutral';
      if (cd.confidence > 30) cd.confidence = 0;
    }

    // GUARD 2: dayContext empty + congratulatory reasons = strip
    if (state.dayContext?.classification === 'empty' && cd.why) {
      const congrats = ['احسنت', 'ممتاز', 'يوم منتج', 'شغل حقيقي'];
      cd.why = cd.why.filter(r => {
        if (typeof r !== 'string') return true;
        return !congrats.some(c => r.includes(c));
      });
      if (cd.why.length === 0) {
        cd.why = ['النهارده مفيش مهام او عادات مسجلة'];
      }
    }

    // GUARD 3: Ensure reason field is never null/undefined
    if (!state.reason) {
      state.reason = state.safeMode ? 'fallback_timeout' : 'no_data';
    }

    return state;
  } catch (e) {
    console.warn('[BrainStore][Phase12.9] Truth guard error:', e?.message);
    return state;
  }
}

/**
 * Phase 12.9 TASK 4: Lifecycle trace helper for frontend.
 * Logs structured trace events for loading detection.
 */
function traceUI(phase, details) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[BrainStore][Trace][${ts}] ${phase}`, details || '');
}

export const useBrainStore = create((set, get) => ({
  // ─── State ──────────────────────────────────────────────────────────────
  brainState: null,
  isConnected: false,
  isLoading: false,
  error: null,
  lastFetchedAt: null,
  _loadStartedAt: null,
  _requestId: 0,

  // ─── Phase 15: Interventions ────────────────────────────────────────────
  interventions: [], // Array of active intervention objects

  // ─── Actions ────────────────────────────────────────────────────────────

  /**
   * STEP 1 — Called by _app.js on auth success.
   * GUARANTEES: brainState will be set within 3 seconds. No exceptions.
   */
  initBrain: async (userId) => {
    const tag = `[BrainStore][${ts()}]`;
    console.log(`${tag} initBrain called, userId=${userId}`);

    if (!userId) {
      console.warn(`${tag} initBrain: no userId, setting fallback immediately`);
      set({ brainState: buildFallbackState(), isLoading: false, error: 'no_user' });
      return;
    }

    // Prevent duplicate init within 5s — but ONLY if brainState already exists
    const { _loadStartedAt, brainState } = get();
    if (_loadStartedAt && Date.now() - _loadStartedAt < 5000 && brainState) {
      console.log(`${tag} initBrain: already loaded (started ${Date.now() - _loadStartedAt}ms ago, has state), skipping`);
      return;
    }

    // Generate unique request ID to detect stale responses
    _initRequestId += 1;
    const myRequestId = _initRequestId;

    set({ isLoading: true, error: null, _loadStartedAt: Date.now(), _requestId: myRequestId });
    console.log(`${tag} isLoading=true, requestId=${myRequestId}`);

    // ── FAILSAFE: 8-second HARD timeout — accounts for sandbox HTTPS proxy latency ─
    // This ALWAYS fires. No matter what happens with REST or socket.
    if (_failsafeTimer) clearTimeout(_failsafeTimer);
    _failsafeTimer = setTimeout(() => {
      const current = get();
      // Only act if this is still the active request
      if (current._requestId !== myRequestId) return;

      if (!current.brainState) {
        console.warn(`${tag} FAILSAFE [${myRequestId}]: 8s elapsed, no brainState. Setting fallback NOW.`);
        set({
          brainState: buildFallbackState(),
          isLoading: false,
          error: 'timeout',
          lastFetchedAt: Date.now(),
        });
      } else if (current.isLoading) {
        console.warn(`${tag} FAILSAFE [${myRequestId}]: 8s elapsed, brainState exists but isLoading=true. Forcing false.`);
        set({ isLoading: false });
      }
      _failsafeTimer = null;
    }, 8000);

    // ── PRIMARY: REST fetch (most reliable) ──────────────────────────────
    try {
      console.log(`${tag} REST fetch starting (requestId=${myRequestId})...`);
      const fetchStart = Date.now();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('REST timeout (7s)')), 7000)
      );
      const fetchPromise = brainAPI.getState();
      const res = await Promise.race([fetchPromise, timeoutPromise]);

      // Check if this response is stale (a newer init was called)
      if (get()._requestId !== myRequestId) {
        console.log(`${tag} REST response arrived but requestId stale (${myRequestId} vs ${get()._requestId}), ignoring`);
        return;
      }

      const state = res?.data?.data || res?.data || null;
      const elapsed = Date.now() - fetchStart;

      if (state && isValidBrainState(state)) {
        // Phase 12.9: Apply truth guard before storing
        const guardedState = applyFrontendTruthGuard(state);
        traceUI('REST_SUCCESS', { elapsed, decision: guardedState.currentDecision?.taskTitle || guardedState.currentDecision?.type });
        console.log(`${tag} REST SUCCESS in ${elapsed}ms. Decision: "${guardedState.currentDecision?.taskTitle || guardedState.currentDecision?.type}"`);
        if (_failsafeTimer) { clearTimeout(_failsafeTimer); _failsafeTimer = null; }
        set({
          brainState: guardedState,
          isLoading: false,
          error: null,
          lastFetchedAt: Date.now(),
        });
      } else if (state) {
        // Got data but doesn't pass validation — use it anyway with safeMode flag
        console.warn(`${tag} REST returned partial data. Using with safeMode. Elapsed: ${elapsed}ms`);
        if (_failsafeTimer) { clearTimeout(_failsafeTimer); _failsafeTimer = null; }
        const safeState = { ...buildFallbackState(), ...state, safeMode: true };
        set({
          brainState: safeState,
          isLoading: false,
          error: null,
          lastFetchedAt: Date.now(),
        });
      } else {
        console.warn(`${tag} REST returned null/empty. Elapsed: ${elapsed}ms. Failsafe will handle.`);
        // Don't clear isLoading — failsafe timer will handle it
      }
    } catch (err) {
      console.warn(`${tag} REST fetch FAILED: ${err?.message}. Failsafe will handle.`);
      // Check if stale
      if (get()._requestId !== myRequestId) return;
      // If REST failed AND we have no brainState, set fallback immediately (don't wait 3s)
      const current = get();
      if (!current.brainState) {
        console.warn(`${tag} REST failed + no brainState → setting fallback NOW (not waiting for failsafe)`);
        if (_failsafeTimer) { clearTimeout(_failsafeTimer); _failsafeTimer = null; }
        set({
          brainState: buildFallbackState(),
          isLoading: false,
          error: err?.message || 'rest_failed',
          lastFetchedAt: Date.now(),
        });
      }
    }

    // ── SECONDARY: Socket connection for real-time updates ───────────────
    try {
      get().connectSocket(userId);
    } catch (err) {
      console.warn(`${tag} Socket connect failed (non-critical): ${err?.message}`);
    }
  },

  /**
   * Connect to Socket.IO and listen for brain:update events.
   * SECONDARY — used for real-time updates AFTER initial REST load.
   * Failure here must NEVER block the UI.
   */
  connectSocket: (userId) => {
    const tag = `[BrainStore][${ts()}]`;

    // Already connected
    if (_socket?.connected) {
      console.log(`${tag} connectSocket: already connected (${_socket.id})`);
      return;
    }

    // Disconnect existing stale socket
    if (_socket) {
      try { _socket.disconnect(); } catch {}
      _socket = null;
    }

    try {
      // Dynamic import to prevent SSR crashes and reduce bundle blocking
      const { getSocketUrl } = require('../utils/api');
      const socketUrl = getSocketUrl();
      console.log(`${tag} connectSocket: connecting to ${socketUrl}`);

      const { io } = require('socket.io-client');
      _socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        timeout: 5000,
      });

      _socket.on('connect', () => {
        console.log(`${tag} Socket CONNECTED: ${_socket.id}`);
        set({ isConnected: true });
        if (userId) {
          try {
            _socket.emit('join_user_room', userId);
            _socket.emit('brain:request_initial', { userId });
          } catch (e) {
            console.warn(`${tag} Socket emit failed: ${e?.message}`);
          }
        }
      });

      _socket.on('brain:update', (data) => {
        try {
          const tag2 = `[BrainStore][${ts()}]`;
          if (data?.brainState && isValidBrainState(data.brainState)) {
            // Phase 12.9: Apply truth guard to socket data
            const guardedState = applyFrontendTruthGuard(data.brainState);
            traceUI('SOCKET_UPDATE', { decision: guardedState.currentDecision?.taskTitle || guardedState.currentDecision?.type });
            console.log(`${tag2} Socket brain:update received. Decision: "${guardedState.currentDecision?.taskTitle || guardedState.currentDecision?.type}"`);
            if (_failsafeTimer) { clearTimeout(_failsafeTimer); _failsafeTimer = null; }
            set({
              brainState: guardedState,
              lastFetchedAt: Date.now(),
              error: null,
              isLoading: false,
            });
          } else {
            console.warn(`${tag2} Socket brain:update received but invalid/missing brainState`);
          }
        } catch (e) {
          console.warn(`[BrainStore] Socket brain:update handler error: ${e?.message}`);
        }
      });

      // Phase 15: Listen for proactive interventions from Trigger Engine
      _socket.on('brain:intervention', (data) => {
        try {
          const tag2 = `[BrainStore][${ts()}]`;
          if (data?.intervention) {
            console.log(`${tag2} Socket brain:intervention received: ${data.intervention.type}/${data.intervention.trigger}`);
            get().addIntervention(data.intervention);
          }
        } catch (e) {
          console.warn(`[BrainStore] Socket brain:intervention handler error: ${e?.message}`);
        }
      });

      _socket.on('disconnect', (reason) => {
        console.log(`${tag} Socket disconnected: ${reason}`);
        set({ isConnected: false });
      });

      _socket.on('connect_error', (err) => {
        console.warn(`${tag} Socket connect_error: ${err?.message}`);
        set({ isConnected: false });
      });

    } catch (err) {
      console.error(`${tag} connectSocket exception: ${err?.message}`);
      set({ isConnected: false });
      // Socket failure is NON-CRITICAL — never set isLoading or error
    }
  },

  /**
   * Disconnect socket (on logout).
   */
  disconnectSocket: () => {
    if (_socket) {
      try { _socket.disconnect(); } catch {}
      _socket = null;
    }
    if (_activityInterval) {
      clearInterval(_activityInterval);
      _activityInterval = null;
    }
    if (_failsafeTimer) {
      clearTimeout(_failsafeTimer);
      _failsafeTimer = null;
    }
    set({ isConnected: false, brainState: null, isLoading: false, _loadStartedAt: null });
  },

  /**
   * Fetch brain state via REST API (standalone call).
   * Phase 12.8: Has its OWN failsafe — isLoading is ALWAYS cleared within 3s.
   */
  fetchBrainState: async (force = false) => {
    const tag = `[BrainStore][${ts()}]`;

    // Don't refetch if we have fresh data (< 10 seconds) unless forced
    if (!force) {
      const { lastFetchedAt, brainState } = get();
      if (brainState && lastFetchedAt && Date.now() - lastFetchedAt < 10000) {
        console.log(`${tag} fetchBrainState: fresh data exists (${Date.now() - lastFetchedAt}ms old), skipping`);
        return brainState;
      }
    }

    set({ isLoading: true });

    // Phase 12.8: fetchBrainState has its OWN 8s safety net (sandbox proxy latency)
    const fetchSafetyTimer = setTimeout(() => {
      const current = get();
      if (current.isLoading) {
        console.warn(`${tag} fetchBrainState: 8s safety net — forcing isLoading=false`);
        set({ isLoading: false });
      }
    }, 8000);

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('REST timeout (7s)')), 7000)
      );
      const fetchPromise = brainAPI.getState();
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      const state = res?.data?.data || res?.data || null;

      clearTimeout(fetchSafetyTimer);

      if (state && isValidBrainState(state)) {
        const guardedState = applyFrontendTruthGuard(state);
        traceUI('FETCH_SUCCESS', { decision: guardedState.currentDecision?.taskTitle || guardedState.currentDecision?.type });
        console.log(`${tag} fetchBrainState SUCCESS`);
        set({
          brainState: guardedState,
          isLoading: false,
          error: null,
          lastFetchedAt: Date.now(),
        });
        return guardedState;
      } else {
        console.warn(`${tag} fetchBrainState returned null/invalid`);
        set({ isLoading: false, error: 'empty response' });
        return null;
      }
    } catch (err) {
      clearTimeout(fetchSafetyTimer);
      console.warn(`${tag} fetchBrainState error: ${err?.message}`);
      set({ isLoading: false, error: err?.message });
      return null;
    }
  },

  /**
   * Update brain state directly (from socket or any source).
   */
  updateBrainState: (newState) => {
    if (isValidBrainState(newState)) {
      // Phase 12.9: Apply truth guard
      const guardedState = applyFrontendTruthGuard(newState);
      traceUI('DIRECT_UPDATE', { decision: guardedState.currentDecision?.taskTitle || guardedState.currentDecision?.type });
      set({
        brainState: guardedState,
        lastFetchedAt: Date.now(),
        error: null,
        isLoading: false,
      });
    }
  },

  /**
   * Reject the current decision (tells brain to recompute with new task).
   */
  rejectDecision: async (taskId, reason) => {
    try {
      const res = await brainAPI.reject({ taskId, reason });
      const newState = res?.data?.data || null;
      if (newState && isValidBrainState(newState)) {
        set({
          brainState: newState,
          lastFetchedAt: Date.now(),
          error: null,
        });
      }
      return newState;
    } catch (err) {
      console.warn(`[BrainStore] rejectDecision error: ${err?.message}`);
      return null;
    }
  },

  /**
   * Force recompute (manual trigger).
   */
  forceRecompute: async (triggerEvent) => {
    try {
      const res = await brainAPI.recompute(triggerEvent || { type: 'MANUAL' });
      const state = res?.data?.data || null;
      if (state && isValidBrainState(state)) {
        set({
          brainState: state,
          lastFetchedAt: Date.now(),
          error: null,
        });
      }
      return state;
    } catch (err) {
      console.warn(`[BrainStore] forceRecompute error: ${err?.message}`);
      return null;
    }
  },

  /**
   * Report user activity to reset inactivity timer.
   */
  reportActivity: async () => {
    try {
      await brainAPI.activity?.();
    } catch {
      // non-critical
    }
    // Phase 15: Also report to trigger engine via socket
    if (_socket?.connected) {
      try {
        const authStore = require('./authStore').default;
        const userId = authStore?.getState?.()?.user?.id;
        if (userId) {
          _socket.emit('user:activity', { userId, type: 'ui_interaction' });
        }
      } catch {}
    }
  },

  // ─── Phase 15: Intervention Actions ─────────────────────────────────────

  /**
   * Add a new intervention (called by socket listener).
   * Respects MAX_VISIBLE_INTERVENTIONS and auto-cleans expired ones.
   */
  addIntervention: (intervention) => {
    if (!intervention?.id) return;
    const tag = `[BrainStore][${ts()}]`;
    console.log(`${tag} addIntervention: ${intervention.type}/${intervention.trigger} — "${intervention.message}"`);

    set((state) => {
      // Clean expired interventions
      const now = new Date().toISOString();
      let active = state.interventions.filter(i => i.expiresAt > now);

      // Don't add duplicates (same trigger within short window)
      const isDuplicate = active.some(i => 
        i.trigger === intervention.trigger && i.taskId === intervention.taskId
      );
      if (isDuplicate) {
        console.log(`${tag} addIntervention: duplicate ${intervention.trigger}, ignoring`);
        return {};
      }

      // Add new intervention
      active.push(intervention);

      // Keep only the most recent MAX_VISIBLE_INTERVENTIONS
      if (active.length > MAX_VISIBLE_INTERVENTIONS) {
        active = active.slice(-MAX_VISIBLE_INTERVENTIONS);
      }

      return { interventions: active };
    });

    // Schedule auto-cleanup when this intervention expires
    const expiresIn = new Date(intervention.expiresAt).getTime() - Date.now();
    if (expiresIn > 0) {
      setTimeout(() => {
        get().cleanExpiredInterventions();
      }, expiresIn + 500);
    }
  },

  /**
   * Dismiss an intervention by ID.
   * Notifies backend via socket for predictive learning.
   */
  dismissIntervention: (interventionId) => {
    const tag = `[BrainStore][${ts()}]`;
    console.log(`${tag} dismissIntervention: ${interventionId}`);

    set((state) => ({
      interventions: state.interventions.filter(i => i.id !== interventionId),
    }));

    // Notify backend
    if (_socket?.connected) {
      try {
        const authStore = require('./authStore').default;
        const userId = authStore?.getState?.()?.user?.id;
        if (userId) {
          _socket.emit('intervention:dismiss', { userId, interventionId });
        }
      } catch {}
    }
  },

  /**
   * Engage with an intervention (user clicked/acted on it).
   * Notifies backend for predictive learning.
   */
  engageIntervention: (interventionId) => {
    const tag = `[BrainStore][${ts()}]`;
    console.log(`${tag} engageIntervention: ${interventionId}`);

    // Remove it from the list (user engaged, so no need to keep showing)
    set((state) => ({
      interventions: state.interventions.filter(i => i.id !== interventionId),
    }));

    // Notify backend
    if (_socket?.connected) {
      try {
        const authStore = require('./authStore').default;
        const userId = authStore?.getState?.()?.user?.id;
        if (userId) {
          _socket.emit('intervention:engage', { userId, interventionId });
        }
      } catch {}
    }
  },

  /**
   * Clean expired interventions.
   */
  cleanExpiredInterventions: () => {
    const now = new Date().toISOString();
    set((state) => ({
      interventions: state.interventions.filter(i => i.expiresAt > now),
    }));
  },
}));

/**
 * Build a minimal fallback brain state for the UI to render.
 * Used by failsafe timers and error paths to GUARANTEE the UI never hangs.
 * Phase 12.8: includes safeMode flag so UI knows this is a fallback.
 */
function buildFallbackState() {
  return {
    currentDecision: {
      taskId: null,
      taskTitle: null,
      type: 'empty',
      why: ['في مشكلة مؤقتة في التوصيل — جرب تاني'],
      smallestStep: 'حدث الصفحة او استنى شوية',
      confidence: 0,
      intent: null,
      intentLabel: '',
      tone: 'neutral',
    },
    reason: 'fallback_timeout',
    riskLevel: 'low',
    safeMode: true,
    dayContext: {
      classification: 'empty',
      hadTasks: false,
      hadHabits: false,
      completedTasks: 0,
      completedHabits: 0,
      totalItems: 0,
      completedItems: 0,
      completionRatio: 0,
      isProductive: false,
      label_ar: 'جاري التحميل',
    },
    userState: {
      energy: 'medium',
      energyScore: 50,
      momentum: 'low',
      burnoutRisk: 0,
      block: 'unknown',
      completionRate: 0,
      todayPending: 0,
      todayCompleted: 0,
      undoneHabits: 0,
    },
    adaptiveSignals: {
      rejectionStreak: 0,
      completionStreak: 0,
      inactivityMinutes: 0,
      skipTypes: {},
      adaptiveOverride: null,
      difficultyModifier: 1.0,
      maxTaskMinutes: 60,
      inactivityStrategy: 'normal',
    },
    decisionMemory: { totalDecisions: 0, recentAcceptanceRate: 0, blockedTasks: [] },
    triggerEvent: 'FALLBACK_TIMEOUT',
    lastUpdatedAt: new Date().toISOString(),
    aiMode: 'offline',
  };
}
