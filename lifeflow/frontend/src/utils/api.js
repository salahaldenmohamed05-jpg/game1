/**
 * API Client - Axios Configuration
 * ==================================
 * عميل API مع إعداد التوثيق التلقائي
 */

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Language': 'ar',
  },
});

// Request interceptor - add JWT token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('lifeflow_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('lifeflow_refresh_token');
        if (!refreshToken) {
          window.location.href = '/login';
          return Promise.reject(error);
        }

        const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { accessToken } = response.data.data;
        localStorage.setItem('lifeflow_token', accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

// ===============================
// API Methods
// ===============================

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
};

export const dashboardAPI = {
  getDashboard: () => api.get('/dashboard'),
};

export const taskAPI = {
  getTasks: (params) => api.get('/tasks', { params }),
  getTodayTasks: () => api.get('/tasks/today'),
  createTask: (data) => api.post('/tasks', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  completeTask: (id, data) => api.patch(`/tasks/${id}/complete`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  aiBreakdown: (data) => api.post('/tasks/ai-breakdown', data),
};

export const habitAPI = {
  getHabits: (params) => api.get('/habits', { params }),
  getTodaySummary: () => api.get('/habits/today-summary'),
  createHabit: (data) => api.post('/habits', data),
  checkIn: (id, data) => api.post(`/habits/${id}/check-in`, data),
  getStats: (id) => api.get(`/habits/${id}/stats`),
};

export const moodAPI = {
  checkIn: (data) => api.post('/mood/check-in', data),
  getToday: () => api.get('/mood/today'),
  getHistory: (params) => api.get('/mood/history', { params }),
  getAnalytics: () => api.get('/mood/analytics'),
};

export const insightAPI = {
  getInsights: (params) => api.get('/insights', { params }),
  getDailySummary: () => api.get('/insights/daily'),
  getWeeklyReport: () => api.get('/insights/weekly'),
  getBehaviorAnalysis: () => api.get('/insights/behavior'),
  getProductivityTips: () => api.get('/insights/productivity-tips'),
};

export const notificationAPI = {
  getNotifications: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const aiAPI = {
  chat: (message) => api.post('/ai/chat', { message }),
  goalBreakdown: (data) => api.post('/ai/goal-breakdown', data),
  processVoiceCommand: (text) => api.post('/voice/command', { text }),
};

export const userAPI = {
  updateProfile: (data) => api.put('/users/profile', data),
  changePassword: (data) => api.put('/users/change-password', data),
  updateFCMToken: (token) => api.patch('/users/fcm-token', { token }),
};

export default api;
