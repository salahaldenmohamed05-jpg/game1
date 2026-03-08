/**
 * LifeFlow Mobile - Auth Store (Zustand)
 * =======================================
 * إدارة حالة المصادقة مع التخزين المحلي الآمن
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { settingsDB } from '../database/database';

const AUTH_TOKEN_KEY = 'lifeflow_token';
const REFRESH_TOKEN_KEY = 'lifeflow_refresh_token';
const USER_KEY = 'lifeflow_user';

const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,

  // Hydrate from secure store on app start
  hydrate: async () => {
    try {
      const [token, refreshToken, userStr] = await Promise.all([
        SecureStore.getItemAsync(AUTH_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          isHydrated: true,
        });
      } else {
        set({ isHydrated: true });
      }
    } catch (e) {
      console.error('[Auth] Hydration error:', e);
      set({ isHydrated: true });
    }
  },

  // Set authentication data after successful login/register
  setAuth: async ({ user, accessToken, refreshToken }) => {
    try {
      await Promise.all([
        SecureStore.setItemAsync(AUTH_TOKEN_KEY, accessToken),
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
        refreshToken ? SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken) : Promise.resolve(),
      ]);

      set({
        user,
        token: accessToken,
        refreshToken: refreshToken || null,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (e) {
      console.error('[Auth] setAuth error:', e);
    }
  },

  // Logout - clear all stored data
  logout: async () => {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(AUTH_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
      ]);
    } catch (e) {}
    
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  // Update user data
  updateUser: async (userData) => {
    const currentUser = get().user;
    const updatedUser = { ...currentUser, ...userData };
    set({ user: updatedUser });
    try {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser));
    } catch (e) {}
  },

  setLoading: (isLoading) => set({ isLoading }),
}));

export default useAuthStore;
