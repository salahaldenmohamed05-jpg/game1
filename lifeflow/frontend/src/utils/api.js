/**
 * API Client - Axios Configuration
 * ==================================
 * Centralized HTTP client with interceptors and typed API methods
 */

import axios from 'axios';

// Dynamic URL detection: supports sandbox environments, localhost, and production
function getBaseUrl() {
  // If explicitly set via env var, use that (build-time injection)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Browser-side: detect sandbox URL from current hostname at runtime
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Sandbox pattern: 3000-XXXX.sandbox.novita.ai → 5000-XXXX.sandbox.novita.ai
    if (hostname.includes('.sandbox.novita.ai')) {
      const backendHost = hostname.replace(/^\d+-/, '5000-');
      return `https://${backendHost}/api/v1`;
    }
    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000/api/v1';
    }
  }
  // SSR fallback (server side rendering)
  return 'http://localhost:5000/api/v1';
}

// Use a placeholder initially; update dynamically via request interceptor
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ar' },
});

// Request interceptor — attach JWT + update baseURL dynamically for sandbox
api.interceptors.request.use(
  (config) => {
    // Dynamic base URL for sandbox/different environments
    if (typeof window !== 'undefined') {
      const dynamicUrl = getBaseUrl();
      if (dynamicUrl !== config.baseURL) {
        // Update the full URL if baseURL has changed
        config.baseURL = dynamicUrl;
      }
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('lifeflow_token') : null;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = typeof window !== 'undefined'
          ? localStorage.getItem('lifeflow_refresh_token') : null;
        if (!refreshToken) throw new Error('No refresh token');
        const dynamicBase = typeof window !== 'undefined' ? getBaseUrl() : BASE_URL;
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
};

// ─── Habit API ────────────────────────────────────────────────────────────────
export const habitAPI = {
  getHabits: () => api.get('/habits'),
  getTodaySummary: () => api.get('/habits/today-summary'),
  createHabit: (data) => api.post('/habits', data),
  updateHabit: (id, data) => api.put(`/habits/${id}`, data),
  deleteHabit: (id) => api.delete(`/habits/${id}`),
  checkIn: (id, data) => api.post(`/habits/${id}/check-in`, data),
  logValue: (id, data) => api.post(`/habits/${id}/log`, data),
  getStats: (id) => api.get(`/habits/${id}/stats`),
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
  getGoals: () => api.get('/adaptive/goals'),
  createGoal: (data) => api.post('/adaptive/goals', data),
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
