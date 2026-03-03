/**
 * API Client - Axios Configuration
 * ==================================
 * Centralized HTTP client with interceptors and typed API methods
 */

import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ar' },
});

// Request interceptor — attach JWT
api.interceptors.request.use(
  (config) => {
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
        const refreshToken = localStorage.getItem('lifeflow_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        const newToken = data.data?.accessToken || data.accessToken;
        if (newToken) {
          localStorage.setItem('lifeflow_token', newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch (_e) {
        localStorage.removeItem('lifeflow_token');
        localStorage.removeItem('lifeflow_refresh_token');
        if (typeof window !== 'undefined') window.location.href = '/login';
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
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  refresh: (token) => api.post('/auth/refresh', { refreshToken: token }),
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  changePassword: (data) => api.put('/users/password', data),
};

// ─── Task API ─────────────────────────────────────────────────────────────────
export const taskAPI = {
  getTasks: (params = {}) => api.get('/tasks', { params }),
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
  getTodaySummary: () => api.get('/habits/today'),
  createHabit: (data) => api.post('/habits', data),
  updateHabit: (id, data) => api.put(`/habits/${id}`, data),
  deleteHabit: (id) => api.delete(`/habits/${id}`),
  checkIn: (id, data) => api.post(`/habits/${id}/checkin`, data),
  getStats: (id) => api.get(`/habits/${id}/stats`),
};

// ─── Mood API ─────────────────────────────────────────────────────────────────
export const moodAPI = {
  getTodayMood: () => api.get('/mood/today'),
  logMood: (data) => api.post('/mood', data),
  getMoodStats: (days = 30) => api.get(`/mood/stats?days=${days}`),
  getMoodLog: (days = 14) => api.get(`/mood?days=${days}`),
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
  startTrial: () => api.post('/subscription/trial/start'),
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
