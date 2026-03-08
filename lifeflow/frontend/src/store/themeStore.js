/**
 * Theme Store - Zustand
 * ======================
 * إدارة الثيم (مظلم / نهاري)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useThemeStore = create(
  persist(
    (set, get) => ({
      isDark: true, // default dark

      toggleTheme: () => {
        const newIsDark = !get().isDark;
        set({ isDark: newIsDark });
        // Apply to document
        if (typeof document !== 'undefined') {
          if (newIsDark) {
            document.documentElement.classList.remove('light');
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
          }
        }
      },

      setTheme: (isDark) => {
        set({ isDark });
        if (typeof document !== 'undefined') {
          if (isDark) {
            document.documentElement.classList.remove('light');
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
          }
        }
      },
    }),
    {
      name: 'lifeflow-theme',
      partialize: (state) => ({ isDark: state.isDark }),
    }
  )
);

export default useThemeStore;
