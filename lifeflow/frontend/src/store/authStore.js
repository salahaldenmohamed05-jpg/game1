/**
 * Auth Store - Zustand
 * =====================
 * إدارة حالة المصادقة والمستخدم
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../utils/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      // Login
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await authAPI.login({ email, password });
          // Backend returns: { success, message, data: { user, accessToken, refreshToken } }
          // Axios wraps it as: response.data = { success, message, data: {...} }
          const payload = response.data?.data || response.data;
          const { user, accessToken, refreshToken } = payload;

          if (!accessToken) throw new Error('لم يتم استلام رمز المصادقة');

          localStorage.setItem('lifeflow_token', accessToken);
          if (refreshToken) localStorage.setItem('lifeflow_refresh_token', refreshToken);

          set({
            user,
            token: accessToken,
            refreshToken: refreshToken || null,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          const msg = error.response?.data?.message || error.message || 'فشل تسجيل الدخول';
          return { success: false, message: msg };
        }
      },

      // Register
      register: async (data) => {
        set({ isLoading: true });
        try {
          const response = await authAPI.register(data);
          const payload = response.data?.data || response.data;
          const { user, accessToken, refreshToken } = payload;

          if (!accessToken) throw new Error('لم يتم استلام رمز المصادقة');

          localStorage.setItem('lifeflow_token', accessToken);
          if (refreshToken) localStorage.setItem('lifeflow_refresh_token', refreshToken);

          set({
            user,
            token: accessToken,
            refreshToken: refreshToken || null,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          const msg = error.response?.data?.message || error.message || 'فشل إنشاء الحساب';
          return { success: false, message: msg };
        }
      },

      // Logout
      logout: async () => {
        try {
          await authAPI.logout();
        } catch (e) {}
        localStorage.removeItem('lifeflow_token');
        localStorage.removeItem('lifeflow_refresh_token');
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
      },

      // Update user
      updateUser: (userData) => {
        set({ user: { ...get().user, ...userData } });
      },
    }),
    {
      name: 'lifeflow-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;
