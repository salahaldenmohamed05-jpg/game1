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
          const { user, accessToken, refreshToken } = response.data;

          localStorage.setItem('lifeflow_token', accessToken);
          localStorage.setItem('lifeflow_refresh_token', refreshToken);

          set({
            user,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message || 'فشل تسجيل الدخول' };
        }
      },

      // Register
      register: async (data) => {
        set({ isLoading: true });
        try {
          const response = await authAPI.register(data);
          const { user, accessToken, refreshToken } = response.data;

          localStorage.setItem('lifeflow_token', accessToken);
          localStorage.setItem('lifeflow_refresh_token', refreshToken);

          set({
            user,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: error.message || 'فشل إنشاء الحساب' };
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
