/**
 * LifeFlow Mobile - Theme Configuration
 * =======================================
 * ألوان وستايلات التطبيق - دعم الثيم الليلي والنهاري
 */

export const Colors = {
  primary: '#6C63FF',
  primaryDark: '#5550e0',
  primaryLight: '#8B85FF',
  secondary: '#FF6584',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  
  // Dark theme
  dark: {
    background: '#1A1A2E',
    surface: '#16213E',
    surfaceLight: '#0F3460',
    card: 'rgba(22, 33, 62, 0.9)',
    border: 'rgba(108, 99, 255, 0.25)',
    text: '#E2E8F0',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    inputBg: 'rgba(255,255,255,0.06)',
    inputBorder: 'rgba(255,255,255,0.12)',
    tabBar: 'rgba(10, 10, 20, 0.98)',
    header: 'rgba(16, 13, 38, 0.97)',
    overlay: 'rgba(0,0,0,0.7)',
  },
  
  // Light theme
  light: {
    background: '#F1F5F9',
    surface: '#FFFFFF',
    surfaceLight: '#EEF2FF',
    card: 'rgba(255, 255, 255, 0.95)',
    border: 'rgba(108, 99, 255, 0.2)',
    text: '#1E293B',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    inputBg: 'rgba(108,99,255,0.05)',
    inputBorder: 'rgba(108,99,255,0.2)',
    tabBar: 'rgba(255,255,255,0.98)',
    header: 'rgba(255,255,255,0.97)',
    overlay: 'rgba(0,0,0,0.5)',
  },
};

export const getTheme = (isDark = true) => {
  const colors = isDark ? Colors.dark : Colors.light;
  return {
    isDark,
    colors: { ...colors, ...Colors },
    
    // Typography
    fonts: {
      regular: 'Cairo-Regular',
      medium: 'Cairo-Medium',
      semiBold: 'Cairo-SemiBold',
      bold: 'Cairo-Bold',
      black: 'Cairo-Black',
    },
    
    // Spacing
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
    },
    
    // Border radius
    radius: {
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      round: 100,
    },
    
    // Shadows
    shadows: {
      sm: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.15 : 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
      md: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.2 : 0.12,
        shadowRadius: 8,
        elevation: 6,
      },
      lg: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.25 : 0.15,
        shadowRadius: 16,
        elevation: 12,
      },
    },
    
    // Card style
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
  };
};

export const PRIORITY_COLORS = {
  urgent: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444', border: '#EF4444' },
  high: { bg: 'rgba(249, 115, 22, 0.15)', text: '#F97316', border: '#F97316' },
  medium: { bg: 'rgba(234, 179, 8, 0.15)', text: '#EAB308', border: '#EAB308' },
  low: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22C55E', border: '#22C55E' },
};

export const MOOD_EMOJIS = [
  { score: 1, emoji: '😭', label: 'مروّع', color: '#EF4444' },
  { score: 2, emoji: '😢', label: 'حزين جداً', color: '#F97316' },
  { score: 3, emoji: '😞', label: 'محبط', color: '#F59E0B' },
  { score: 4, emoji: '😕', label: 'متعب', color: '#EAB308' },
  { score: 5, emoji: '😐', label: 'عادي', color: '#84CC16' },
  { score: 6, emoji: '🙂', label: 'لا بأس', color: '#22C55E' },
  { score: 7, emoji: '😊', label: 'جيد', color: '#10B981' },
  { score: 8, emoji: '😄', label: 'سعيد', color: '#06B6D4' },
  { score: 9, emoji: '😁', label: 'ممتاز', color: '#6366F1' },
  { score: 10, emoji: '🤩', label: 'رائع!', color: '#8B5CF6' },
];

export const CATEGORY_LABELS = {
  work: 'عمل',
  personal: 'شخصي',
  health: 'صحة',
  learning: 'تعلم',
  finance: 'مالي',
  social: 'اجتماعي',
  other: 'أخرى',
  fitness: 'رياضة',
  mindfulness: 'تأمل',
  creativity: 'إبداع',
};

export const PRIORITY_LABELS = {
  urgent: 'عاجل',
  high: 'عالي',
  medium: 'متوسط',
  low: 'منخفض',
};
