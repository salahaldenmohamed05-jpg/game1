/**
 * LifeFlow Mobile - API Service
 * ================================
 * خدمة API مع دعم الوضع الأوفلاين والمزامنة
 */

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://5000-i68cwp06jn6qrzglpd04d-3844e1b6.sandbox.novita.ai/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Language': 'ar',
  },
});

// Request interceptor - attach JWT
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('lifeflow_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - unwrap data + handle 401
api.interceptors.response.use(
  (response) => response.data, // unwrap: return JSON body directly
  async (error) => {
    const original = error.config;
    
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('lifeflow_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const newToken = response.data?.data?.accessToken;
        
        if (newToken) {
          await SecureStore.setItemAsync('lifeflow_token', newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch (_e) {
        await SecureStore.deleteItemAsync('lifeflow_token');
        await SecureStore.deleteItemAsync('lifeflow_refresh_token');
      }
    }
    
    const message = error.response?.data?.message || error.message || 'حدث خطأ، يرجى المحاولة مرة أخرى';
    error.message = message;
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth API ─────────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  refresh: (token) => api.post('/auth/refresh', { refreshToken: token }),
  getProfile: () => api.get('/users/profile'),
};

// ─── Task API ─────────────────────────────────────────────────────────────
export const taskAPI = {
  getTasks: (params = {}) => api.get('/tasks', { params }),
  createTask: (data) => api.post('/tasks', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
  completeTask: (id) => api.patch(`/tasks/${id}/complete`),
};

// ─── Habit API ────────────────────────────────────────────────────────────
export const habitAPI = {
  getTodaySummary: () => api.get('/habits/today-summary'),
  createHabit: (data) => api.post('/habits', data),
  checkIn: (id, data = {}) => api.post(`/habits/${id}/check-in`, data),
};

// ─── Mood API ─────────────────────────────────────────────────────────────
export const moodAPI = {
  getTodayMood: () => api.get('/mood/today'),
  logMood: (data) => api.post('/mood/check-in', data),
  getMoodStats: () => api.get('/mood/analytics'),
  getMoodHistory: (days = 14) => api.get(`/mood/history?days=${days}`),
};

// ─── Dashboard API ────────────────────────────────────────────────────────
export const dashboardAPI = {
  getDashboard: () => api.get('/dashboard'),
};

// ─── Notification API ─────────────────────────────────────────────────────
export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};
