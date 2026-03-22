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

      // Login — supports email or phone
      login: async (email, password, phone) => {
        set({ isLoading: true });
        try {
          const loginPayload = phone
            ? { phone, password }
            : { email, password };
          const response = await authAPI.login(loginPayload);
          // Axios response shape: { data: { success, message, data: { user, accessToken, refreshToken } } }
          const outer = response?.data || response;  // { success, message, data: {...} }
          const payload = outer?.data || outer;       // { user, accessToken, refreshToken }
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
          const msg = error.message || 'فشل تسجيل الدخول';
          return { success: false, message: msg };
        }
      },

      // Register — supports email or phone
      register: async (data) => {
        set({ isLoading: true });
        try {
          const response = await authAPI.register(data);
          const outer = response?.data || response;
          const payload = outer?.data || outer;
          const { user, accessToken, refreshToken, verify_required, _sandbox_otp } = payload;

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

          return { success: true, verify_required, _sandbox_otp };
        } catch (error) {
          set({ isLoading: false });
          const msg = error?.response?.data?.message || error.message || 'فشل إنشاء الحساب';
          return { success: false, message: msg };
        }
      },

      // Demo Login — instant sandbox access
      demoLogin: async () => {
        set({ isLoading: true });
        try {
          const response = await authAPI.demo();
          const outer = response?.data || response;
          const payload = outer?.data || outer;
          const { user, accessToken, refreshToken } = payload;

          if (!accessToken) throw new Error('فشل الحصول على رمز تجريبي');

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
          return { success: false, message: error.message || 'فشل الدخول التجريبي' };
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
