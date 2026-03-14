/**
 * LifeFlow Mobile - Theme Store (Zustand)
 * =========================================
 * إدارة الثيم (ليلي / نهاري) مع التخزين المحلي
 */

import { create } from 'zustand';
import { settingsDB } from '../database/database';

const useThemeStore = create((set, get) => ({
  isDark: true,
  isHydrated: false,

  // Load theme from database
  hydrate: async () => {
    try {
      const isDark = await settingsDB.get('theme_dark', true);
      set({ isDark: isDark !== false, isHydrated: true });
    } catch {
      set({ isDark: true, isHydrated: true });
    }
  },

  // Toggle between dark/light
  toggleTheme: async () => {
    const newIsDark = !get().isDark;
    set({ isDark: newIsDark });
    try {
      await settingsDB.set('theme_dark', newIsDark);
    } catch (e) {}
  },

  // Set explicit theme
  setTheme: async (isDark) => {
    set({ isDark });
    try {
      await settingsDB.set('theme_dark', isDark);
    } catch (e) {}
  },
}));

export default useThemeStore;
