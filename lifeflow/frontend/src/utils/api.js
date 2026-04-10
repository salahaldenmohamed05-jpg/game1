/**
 * API Client - Axios Configuration
 * ==================================
 * Centralized HTTP client with interceptors and typed API methods
 */

import axios from 'axios';

// ─── Text Sanitizer — clean garbled AI output on the client side ──────────────
/**
 * sanitizeText(str) removes:
 *   - Unicode replacement chars (U+FFFD)
 *   - CJK characters (model hallucination)
 *   - Orphan "??" replacing dropped Arabic letters
 *   - Non-printable control characters
 *   - Zero-width characters that break Arabic rendering
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    // Remove Unicode replacement character
    .replace(/\uFFFD/g, '')
    // Remove ALL CJK characters (Chinese/Japanese/Korean — model hallucination)
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u2E80-\u2EFF\u3000-\u303F\u31C0-\u31EF\uF900-\uFAFF]/g, '')
    .replace(/[\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF]/g, '') // Hiragana, Katakana, halfwidth
    // Remove orphan "??" replacing dropped Arabic characters
    .replace(/(?<=[\u0600-\u06FF\u0750-\u077F])\?{2,}(?=[\u0600-\u06FF\u0750-\u077F]|\s|$)/g, '')
    .replace(/(?<=^|\s)\?{2,}(?=[\u0600-\u06FF\u0750-\u077F])/g, '')
    .replace(/(?<!\w)\?{2,}(?!\w)/g, '')
    // Remove non-printable control chars (keep newlines, tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove zero-width characters that break Arabic rendering
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Remove orphan combining marks without a base character
    .replace(/(^|[\s\n])([\u0300-\u036F\u0610-\u061A\u064B-\u065F\u0670]+)/g, '$1')
    // Remove broken surrogate pairs
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    // Collapse excessive whitespace/newlines
    .replace(/ {3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function deepSanitize(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepSanitize(value);
    }
    return result;
  }
  return obj;
}

export { sanitizeText, deepSanitize };

// Dynamic URL detection: supports sandbox environments, localhost, and production
// PRIORITY: runtime detection > env var (env vars get stale in sandbox environments)
function getBaseUrl() {
  // Browser-side: detect sandbox URL from current hostname at runtime
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // E2B sandbox pattern: portNumber-sandboxId.e2b.dev
    if (hostname.includes('.e2b.dev')) {
      const backendHost = hostname.replace(/^\d+-/, '5000-');
      return `https://${backendHost}/api/v1`;
    }
    // Novita sandbox pattern: 3000-XXXX.sandbox.novita.ai → 5000-XXXX.sandbox.novita.ai
    if (hostname.includes('.sandbox.novita.ai')) {
      const backendHost = hostname.replace(/^\d+-/, '5000-');
      return `https://${backendHost}/api/v1`;
    }
    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000/api/v1';
    }
  }
  // Env var fallback (for fixed production deployments only)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // SSR / default fallback
  return 'http://localhost:5000/api/v1';
}

function getSocketUrl() {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.includes('.e2b.dev')) {
      return `https://${hostname.replace(/^\d+-/, '5000-')}`;
    }
    if (hostname.includes('.sandbox.novita.ai')) {
      return `https://${hostname.replace(/^\d+-/, '5000-')}`;
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
  }
  return process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
}

// Create axios instance with runtime-detected base URL
const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ar' },
});

/**
 * Health check utility — test backend connectivity
 * Returns { ok, status, latency, error }
 */
export async function checkBackendHealth() {
  const baseUrl = getBaseUrl();
  const healthUrl = baseUrl.replace('/api/v1', '/health');
  const start = Date.now();
  try {
    const res = await axios.get(healthUrl, { timeout: 8000 });
    return { ok: true, status: res.data?.status, latency: Date.now() - start, baseUrl };
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start, baseUrl };
  }
}

// Request interceptor — attach JWT + ensure dynamic baseURL
api.interceptors.request.use(
  (config) => {
    // Always re-resolve base URL (sandbox URLs can change mid-session)
    if (typeof window !== 'undefined') {
      config.baseURL = getBaseUrl();
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('lifeflow_token') : null;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — sanitize AI text + refresh token on 401
api.interceptors.response.use(
  (response) => {
    // Sanitize all string data in API responses to remove garbled characters
    if (response.data) {
      response.data = deepSanitize(response.data);
    }
    return response;
  },
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = typeof window !== 'undefined'
          ? localStorage.getItem('lifeflow_refresh_token') : null;
        if (!refreshToken) throw new Error('No refresh token');
        const dynamicBase = getBaseUrl();
        const { data } = await axios.post(`${dynamicBase}/auth/refresh`, { refreshToken });
        const newToken = data.data?.accessToken || data.accessToken;
        if (newToken) {
          if (typeof window !== 'undefined') localStorage.setItem('lifeflow_token', newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch (_e) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('lifeflow_token');
          localStorage.removeItem('lifeflow_refresh_token');
          window.location.href = '/login';
        }
      }
    }
    const message = error.response?.data?.message || error.message || 'حدث خطأ، يرجى المحاولة مرة أخرى';
    error.message = message;
    return Promise.reject(error);
  }
);

export default api;
export { getSocketUrl };

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authAPI = {
  login:               (data)              => api.post('/auth/login', data),
  register:            (data)              => api.post('/auth/register', data),
  demo:                ()                  => api.post('/auth/demo'),              // instant demo
  logout:              ()                  => api.post('/auth/logout'),
  refresh:             (token)             => api.post('/auth/refresh', { refreshToken: token }),
  getProfile:          ()                  => api.get('/users/me'),
  updateProfile:       (data)              => api.put('/users/profile', data),
  changePassword:      (data)              => api.put('/users/password', data),
  // ── New auth flows ──────────────────────────────────────────────────────────
  forgotPassword:      (email)             => api.post('/auth/forgot-password', { email }),
  resetPassword:       (email, otp, new_password) => api.post('/auth/reset-password', { email, otp, new_password }),
  verifyEmail:         (email, otp)        => api.post('/auth/verify-email', { email, otp }),
  resendVerification:  (email)             => api.post('/auth/resend-verification', { email }),
};

// ─── Task API ─────────────────────────────────────────────────────────────────
export const taskAPI = {
  getTasks: (params = {}) => api.get('/tasks', { params }),
  getAllTasks: () => api.get('/tasks/all'),   // Phase 13.1: overdue→today→upcoming
  getGroupedTasks: (params = {}) => api.get('/tasks', { params: { ...params, grouped: true } }),
  getSmartView: () => api.get('/tasks/smart-view'),
  logSmartEvent: (event, taskId, score) => api.post('/tasks/smart-view/log', { event, taskId, score }),
  createTask: (data) => api.post('/tasks', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  completeTask: (id) => api.patch(`/tasks/${id}/complete`),
  aiBreakdown: (data) => api.post('/tasks/ai-breakdown', data),
  aiPrioritize: () => api.post('/tasks/ai-prioritize'),
  reschedule: (id, data) => api.patch(`/tasks/${id}/reschedule`, data),
  // Phase 13.1: Subtask API
  getSubtasks: (taskId) => api.get(`/tasks/${taskId}/subtasks`),
  createSubtask: (taskId, data) => api.post(`/tasks/${taskId}/subtasks`, data),
  updateSubtask: (taskId, subtaskId, data) => api.put(`/tasks/${taskId}/subtasks/${subtaskId}`, data),
  completeSubtask: (taskId, subtaskId) => api.patch(`/tasks/${taskId}/subtasks/${subtaskId}/complete`),
  deleteSubtask: (taskId, subtaskId) => api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`),
};

// ─── Habit API ────────────────────────────────────────────────────────────────
export const habitAPI = {
  getHabits: () => api.get('/habits'),
  getTodaySummary: () => api.get('/habits/today-summary'),
  getSuggestions: () => api.get('/habits/suggestions'),
  createHabit: (data) => api.post('/habits', data),
  updateHabit: (id, data) => api.put(`/habits/${id}`, data),
  deleteHabit: (id) => api.delete(`/habits/${id}`),
  checkIn: (id, data) => api.post(`/habits/${id}/check-in`, data),
  logValue: (id, data) => api.post(`/habits/${id}/log`, data),
  getStats: (id) => api.get(`/habits/${id}/stats`),
};

// ─── Goals API ───────────────────────────────────────────────────────────────
export const goalsAPI = {
  getGoals:    ()          => api.get('/goals'),
  createGoal:  (data)      => api.post('/goals', data),
  updateGoal:  (id, data)  => api.put(`/goals/${id}`, data),
  deleteGoal:  (id)        => api.delete(`/goals/${id}`),
  getGoal:     (id)        => api.get(`/goals/${id}`),
  updateProgress: (id, data) => api.patch(`/goals/${id}/progress`, data),
};

// ─── Mood API ─────────────────────────────────────────────────────────────────
export const moodAPI = {
  getTodayMood: () => api.get('/mood/today'),
  logMood: (data) => api.post('/mood/check-in', data),
  getMoodStats: (days = 30) => api.get('/mood/analytics'),
  getMoodLog: (days = 14) => api.get(`/mood/history?days=${days}`),
};

// ─── Dashboard API ────────────────────────────────────────────────────────────
export const dashboardAPI = {
  getDashboard: () => api.get('/dashboard'),
  getQuickStats: () => api.get('/dashboard/stats'),
  // Unified today-flow: nextAction + lifeFeed + burnout in ONE call
  getTodayFlow: () => api.get('/dashboard/today-flow'),
};

// ─── Performance API (Premium) ────────────────────────────────────────────────
export const performanceAPI = {
  getToday: () => api.get('/performance/today'),
  getDashboard: () => api.get('/performance/dashboard'),
  getHistory: (days = 30) => api.get(`/performance/history?days=${days}`),
  getWeeklyAudit: () => api.get('/performance/weekly-audit'),
  getAuditHistory: () => api.get('/performance/weekly-audit/history'),
  getProcrastinationFlags: () => api.get('/performance/procrastination-flags'),
  resolveFlag: (id) => api.patch(`/performance/procrastination-flags/${id}/resolve`),
  getEnergyProfile: () => api.get('/performance/energy-profile'),
  getCoaching: () => api.get('/performance/coaching'),
  computeScore: () => api.post('/performance/compute'),
};

// ─── Subscription API ─────────────────────────────────────────────────────────
export const subscriptionAPI = {
  getStatus: () => api.get('/subscription/status'),
  getPlans: () => api.get('/subscription/plans'),
  startTrial: () => api.post('/subscription/trial'),
  checkout: (data) => api.post('/subscription/checkout', data),
  cancel: () => api.post('/subscription/cancel'),
  getHistory: () => api.get('/subscription/history'),
  getFeaturePreview: (feature) => api.get(`/subscription/preview/${feature}`),
};

// ─── AI / Insights API ────────────────────────────────────────────────────────
export const aiAPI = {
  getInsights: () => api.get('/insights'),
  generateInsight: (data) => api.post('/insights/generate', data),
  chat: (data) => api.post('/ai/chat', data),
  getVoiceAnalysis: () => api.get('/voice/analyze'),
  // Phase 15: new insight endpoints
  getMetrics:     () => api.get('/insights/metrics'),
  getLearning:    () => api.get('/insights/learning'),
  getDailyPlan:   () => api.get('/insights/plan'),
  getWeeklyPlan:  () => api.get('/insights/plan/weekly'),
  explainDecision: (data) => api.post('/insights/explain', data),
};

// ─── Notification API ─────────────────────────────────────────────────────────
export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  updatePreferences: (data) => api.put('/notifications/preferences', data),
  registerFCM: (token) => api.post('/notifications/fcm-token', { fcm_token: token }),
};

// ─── Calendar API ─────────────────────────────────────────────────────────────
export const calendarAPI = {
  getEvents: (params) => api.get('/calendar', { params }),
  createEvent: (data) => api.post('/calendar', data),
  getGoogleAuth: () => api.get('/calendar/google/auth'),
  syncGoogle: () => api.post('/calendar/google/sync'),
};

// ─── Intelligence API (Phase 8 — Life Score, Timeline, Predictions) ───────────
export const intelligenceAPI = {
  getLifeScore: (days = 7) => api.get(`/intelligence/life-score?days=${days}`),
  getLifeScoreHistory: (days = 30) => api.get(`/intelligence/life-score/history?days=${days}`),
  getTimeline: (days = 30, types = null) =>
    api.get(`/intelligence/timeline?days=${days}${types ? '&types=' + types : ''}`),
  predictTask: (taskId) => api.get(`/intelligence/predict/task/${taskId}`),
  predictHabit: (habitId, days = 7) => api.get(`/intelligence/predict/habit/${habitId}?days=${days}`),
  forecastMood: (days = 7) => api.get(`/intelligence/predict/mood?days=${days}`),
  getBurnoutRisk: () => api.get('/intelligence/burnout-risk'),
  getTrajectory: () => api.get('/intelligence/trajectory'),
  // Phase 9 additions
  getEnergyScore: () => api.get('/intelligence/energy'),
  getFocusWindows: () => api.get('/intelligence/focus-windows'),
  getCoachInsights: () => api.get('/intelligence/coach'),
  planDay: (date = null) => api.post('/intelligence/plan-day', date ? { date } : {}),
};

// ─── Analytics API (Phase O — Single Source of Truth) ────────────────────────
export const analyticsAPI = {
  getSummary:  () => api.get('/analytics/summary'),
  getOverview: () => api.get('/analytics/overview'),
  getUnified:  () => api.get('/analytics/unified'),
  getSnapshot: () => api.get('/analytics/snapshot'),
};

// ─── Execution Engine API v2 — Optimized Execution Loop ─────────────────────
export const engineAPI = {
  getToday:      () => api.get('/engine/today'),
  start:         (data) => api.post('/engine/start', data),
  pulse:         (data) => api.post('/engine/pulse', data),
  pause:         () => api.post('/engine/pause'),
  resume:        () => api.post('/engine/resume'),
  complete:      (data) => api.post('/engine/complete', data),
  skip:          (data) => api.post('/engine/skip', data),
  delay:         (data) => api.post('/engine/delay', data),
  abandon:       (data) => api.post('/engine/abandon', data),
  nudge:         (data) => api.post('/engine/nudge', data),
  switchAction:  (data) => api.post('/engine/switch', data),
  getSession:    () => api.get('/engine/session'),
  // Behavior Engine
  onboarding:    (data) => api.post('/engine/onboarding', data),
  getGoals:      () => api.get('/goals'),
  adaptBehavior: (data) => api.post('/engine/adapt-behavior', data),
};

// ─── Decision API (Phase K — Core Brain) ────────────────────────────────────
export const decisionAPI = {
  getNext: (params = {}) => api.get('/decision/next', { params }),
  getSignals: (params = {}) => api.get('/decision/signals', { params }),
  getDebug: () => api.get('/decision/debug'),
  sendFeedback: (data) => api.post('/decision/feedback', data),
};

// ─── Brain API (Phase 12.5 — Self-Adjusting Cognitive Brain) ────────────────
export const brainAPI = {
  getState:     () => api.get('/brain/state'),
  recompute:    (triggerEvent) => api.post('/brain/recompute', { triggerEvent }),
  reject:       (data) => api.post('/brain/reject', data),
  activity:     () => api.post('/brain/activity'),
  getMemory:    () => api.get('/brain/memory'),
  getSignals:   () => api.get('/brain/signals'),
  getEventLog:  (limit = 20) => api.get('/brain/eventlog', { params: { limit } }),
};

// ─── UserModel API (Phase P — Persistent Per-User Intelligence) ─────────────
export const userModelAPI = {
  getProfile:   () => api.get('/user-model/profile'),
  getModifiers: () => api.get('/user-model/modifiers'),
  rebuild:      () => api.post('/user-model/rebuild'),
  validate:     () => api.get('/user-model/validate'),
  simulate:     () => api.post('/user-model/simulate'),
};

// ─── intelligenceAPIv2 — alias for intelligence widgets (Phase 11) ────────────
export const intelligenceAPIv2 = {
  getEnergyScore:   () => intelligenceAPI.getEnergyScore(),
  getFocusWindows:  () => intelligenceAPI.getFocusWindows(),
  getCoachInsights: () => intelligenceAPI.getCoachInsights(),
  planDay:          (date) => intelligenceAPI.planDay(date),
};

// ─── Adaptive API (Phases 10-14) ─────────────────────────────────────────────
export const adaptiveAPI = {
  // Phase 10 — Adaptive Life Model
  getBehaviorProfile: (days = 30) => api.get(`/adaptive/behavior-profile?days=${days}`),
  getPatterns: (days = 60) => api.get(`/adaptive/patterns?days=${days}`),
  simulateLife: (params = {}) => api.get('/adaptive/simulate-life', { params }),
  getRecommendations: () => api.get('/adaptive/recommendations'),

  // Phase 11 — AI Life Copilot
  getAICoach: () => api.get('/adaptive/ai-coach'),
  sendMessage: (message) => api.post('/adaptive/conversation', { message }),
  getDailyPlan: () => api.get('/adaptive/daily-plan'),
  getConversationHistory: () => api.get('/adaptive/copilot/history'),

  // Phase 12 — Life Optimization
  getGoals: () => api.get('/goals'),
  createGoal: (data) => api.post('/goals', data),
  getLifeOptimizer: () => api.get('/adaptive/life-optimizer'),
  getScheduleAdjust: () => api.get('/adaptive/schedule-adjustment'),

  // Phase 13 — Global Intelligence
  getGlobalInsights: () => api.get('/adaptive/global-insights'),
  getBenchmark: () => api.get('/adaptive/benchmark'),
  getMyBenchmark: () => api.get('/adaptive/my-benchmark'),
  getGlobalTrends: () => api.get('/adaptive/global-trends'),

  // Phase 14 — Life OS Integration
  getIntegrationStatus: () => api.get('/adaptive/integrations/status'),
  getAvailableIntegrations: () => api.get('/adaptive/integrations/available'),
  connectIntegration: (type, name) =>
    api.post('/adaptive/integrations/connect', { integration_type: type, display_name: name }),
  disconnectIntegration: (type) => api.delete(`/adaptive/integrations/disconnect/${type}`),
  syncIntegration: (type) => api.post('/adaptive/integrations/sync', { integration_type: type }),
  getTodayContext: () => api.get('/adaptive/context/today'),
};

// ─── Personal Assistant API (Unified) ─────────────────────────────────────────
export const assistantAPI = {
  // Command endpoint (full action + conversational reply)
  sendCommand: (message, pendingAction = null, sessionId = null) =>
    api.post('/assistant/command', { message, pending_action: pendingAction, session_id: sessionId }),
  // Orchestrated chat endpoint → { reply, mode, actions, suggestions }
  chat: (message, timezone = null) => api.post('/assistant/chat', { message, timezone }),
  // Context / autonomous
  getContext: () => api.get('/assistant/context'),
  getAutonomous: () => api.get('/assistant/autonomous'),
  // Proactive monitor alerts
  getMonitorAlerts: () => api.get('/assistant/monitor'),
  // Execute suggestion
  executeSuggestion: (suggestion) => api.post('/assistant/execute-suggestion', { suggestion }),
  // History management
  getHistory: () => api.get('/assistant/history'),
  clearHistory: () => api.post('/assistant/clear'),
  // Adaptive behavior: record interaction with suggestion
  recordInteraction: (suggestionType, action = 'accepted') =>
    api.post('/assistant/interaction', { suggestion_type: suggestionType, action }),
  // Personalization profile
  getProfile: () => api.get('/assistant/profile'),
  // Decision engine
  getDecisions: () => api.get('/assistant/decisions'),
  decide: (action, payload, forceExecute = false, energy = 60, mood = 5) =>
    api.post('/assistant/decide', { action, payload, force_execute: forceExecute, energy, mood }),
  // Auto-reschedule overdue tasks
  proposeAutoReschedule: () => api.post('/assistant/auto-reschedule'),
  // Phase 15: Learning, Planning, Explainability, Metrics
  getLearningProfile: () => api.get('/assistant/learning'),
  getDailyPlan: () => api.get('/assistant/plan'),
  getWeeklyPlan: () => api.get('/assistant/plan/weekly'),
  explainDecision: (action, energy, mood, priority, risk) =>
    api.post('/assistant/explain', { action, energy, mood, priority, risk }),
  getMetrics: () => api.get('/assistant/metrics'),
  // Phase 16: Smart Scheduling + Daily Timeline
  getSmartDailyPlan: () => api.get('/assistant/daily-plan'),
  // Smart Timeline (enriched with overdue, free slots, suggestions)
  getSmartTimeline: () => api.get('/assistant/timeline/smart'),
  // Interactive timeline actions
  completeTimelineTask: (task_id) => api.post('/assistant/timeline/smart/complete', { task_id }),
  acceptSuggestion: (suggestion_id, action) => api.post('/assistant/timeline/smart/accept-suggestion', { suggestion_id, action }),
  // Phase 16: Next Best Action
  getNextAction: () => api.get('/assistant/next-action'),
  // Phase 16: Life Feed
  getLifeFeed: () => api.get('/assistant/life-feed'),
  // Phase 16: Burnout / Energy status
  getBurnoutStatus: () => api.get('/assistant/burnout-status'),
  // Phase 16: Task Decomposition
  decomposeTask: (task, options = {}) => api.post('/assistant/decompose', { task, ...options }),
  // Phase 16: AI Mode
  getAIMode: () => api.get('/assistant/ai-mode'),
  setAIMode: (mode) => api.put('/assistant/ai-mode', { mode }),
  // Phase 16: Smart Notification
  smartNotify: (type, item_id, item_title, reminder_before = 30) =>
    api.post('/assistant/smart-notify', { type, item_id, item_title, reminder_before }),
};

// ─── Chat Session API (Phase 16) ──────────────────────────────────────────────
export const chatAPI = {
  // Create new session
  createSession: (title = null) => api.post('/chat/session', title ? { title } : {}),
  // List all sessions
  getSessions: () => api.get('/chat/sessions'),
  // Get single session with messages
  getSession: (id) => api.get(`/chat/session/${id}`),
  // GET messages for session (CRUD endpoint)
  getMessages: (id, params = {}) => api.get(`/chat/session/${id}/messages`, { params }),
  // Send message in session
  sendMessage: (session_id, message) => api.post('/chat/message', { session_id, message }),
  // Rename session
  renameSession: (id, title) => api.put(`/chat/session/${id}`, { title }),
  // Pin/unpin
  pinSession: (id, is_pinned) => api.put(`/chat/session/${id}/pin`, { is_pinned }),
  // Delete session
  deleteSession: (id) => api.delete(`/chat/session/${id}`),
};

// ─── Logs API ──────────────────────────────────────────────────────────────────
export const logsAPI = {
  getRecentLogs:     (limit = 100) => api.get('/logs/recent', { params: { limit } }),
  getClientErrors:   ()            => api.get('/logs/client-errors'),
  getLogsHealth:     ()            => api.get('/logs/health'),
  reportClientError: (data)        => api.post('/logs/client-error', data),
};

// ─── Profile API (Personalization Hub) ────────────────────────────────────────
export const profileAPI = {
  getProfile:         ()     => api.get('/profile-settings/profile'),
  updateProfile:      (data) => api.put('/profile-settings/profile', data),
  getAISnapshot:      ()     => api.get('/profile-settings/profile/ai-snapshot'),
  getOnboardingStatus:()     => api.get('/profile-settings/onboarding-status'),
  completeOnboarding: (data) => api.post('/profile-settings/complete-onboarding', data || {}),
};

// ─── Settings API (Control Center) ────────────────────────────────────────────
export const settingsAPI = {
  getSettings:    ()     => api.get('/profile-settings/settings'),
  updateSettings: (data) => api.put('/profile-settings/settings', data),
  changePassword: (data) => api.put('/profile-settings/settings/password', data),
  deleteAccount:  ()     => api.post('/profile-settings/settings/delete-account'),
  exportData:     ()     => api.post('/profile-settings/settings/export-data'),
};

// ─── VA API (Full Adaptive Virtual Assistant) ──────────────────────────────────

// ─── Search API (Global Search) ──────────────────────────────────────────────
export const searchAPI = {
  search: (q, type = 'all', limit = 20) => api.get('/search', { params: { q, type, limit } }),
};

// ─── Export API (Data Export) ────────────────────────────────────────────────
export const exportAPI = {
  exportCSV:     (type = 'all', period = 'month') => api.post('/export/csv', { type, period }, { responseType: 'blob' }),
  exportJSON:    (type = 'all', period = 'month') => api.post('/export/json', { type, period }, { responseType: 'blob' }),
  exportSummary: (period = 'month') => api.post('/export/summary', { period }),
};

// ─── Daily Flow API (Phase 4: Daily Execution Flow) ─────────────────────────
export const dailyFlowAPI = {
  getStatus:      ()     => api.get('/daily-flow/status'),
  startDay:       ()     => api.post('/daily-flow/start-day'),
  getPlan:        ()     => api.get('/daily-flow/plan'),
  completeBlock:  (data) => api.post('/daily-flow/complete-block', data),
  skipBlock:      (data) => api.post('/daily-flow/skip-block', data),
  checkHabit:     (data) => api.post('/daily-flow/check-habit', data),
  endDay:         (data) => api.post('/daily-flow/end-day', data),
  getNarrative:   ()     => api.get('/daily-flow/narrative'),
  resetDay:       ()     => api.post('/daily-flow/reset-day'),
};

export const vaAPI = {
  // Phase 1: VA Presence Layer
  getPresence:       ()     => api.get('/va/presence'),

  // Phase 2: Follow-up Intelligence
  escalate:          (data) => api.post('/va/escalate', data),
  getFailurePatterns:()     => api.get('/va/failure-patterns'),
  getTimingAdapt:    ()     => api.get('/va/timing-adapt'),

  // Phase 3: Communication Engine
  sendMessage:       (data) => api.post('/va/comm/send', data),
  getCommStats:      ()     => api.get('/va/comm/stats'),
  getPendingMessages:()     => api.get('/va/comm/pending'),
  ackMessage:        (data) => api.post('/va/comm/ack', data),

  // Phase 4: WhatsApp
  sendWhatsApp:      (data) => api.post('/va/whatsapp/send', data),

  // Phase 5: Email Reports
  getDailySummary:   ()     => api.get('/va/email/daily'),
  getWeeklyReport:   ()     => api.get('/va/email/weekly'),
  sendDailyEmail:    ()     => api.post('/va/email/send-daily'),
  sendWeeklyEmail:   ()     => api.post('/va/email/send-weekly'),

  // Phase 6: Settings
  getSettings:       ()     => api.get('/va/settings'),
  updateSettings:    (data) => api.put('/va/settings', data),

  // Phase 7: Testing
  testScenarios:     ()     => api.get('/va/test-scenarios'),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6: External Execution Layer API
// ═══════════════════════════════════════════════════════════════════════════════
export const phase6API = {
  // Adaptive Intelligence V2
  getAdaptiveState:     ()     => api.get('/phase6/adaptive-state'),
  reportBlockEvent:     (data) => api.post('/phase6/block-event', data),
  getReorderedPlan:     ()     => api.get('/phase6/reorder-plan'),

  // Cross-Day Intelligence
  getWeeklyNarrative:   ()     => api.get('/phase6/weekly-narrative'),
  getStreakWarnings:    ()     => api.get('/phase6/streak-warnings'),
  checkPerfectDay:      ()     => api.get('/phase6/perfect-day'),
  getComebackStatus:    ()     => api.get('/phase6/comeback-status'),

  // Smart Notification Engine
  triggerNotifications: ()     => api.post('/phase6/trigger-notifications'),
  getNotifSchedule:     ()     => api.get('/phase6/notification-schedule'),

  // Instant Action Layer
  getWidgetData:        ()     => api.get('/phase6/widget-data'),
  quickAction:          (data) => api.post('/phase6/quick-action', data),

  // Monetization
  getSubscriptionGate:  ()     => api.get('/phase6/subscription-gate'),
};
