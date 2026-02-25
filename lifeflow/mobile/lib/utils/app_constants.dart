/**
 * App Constants - ثوابت التطبيق
 * ================================
 * جميع الثوابت المستخدمة في التطبيق
 */

import 'package:flutter/material.dart';

class AppConstants {
  // ============================================================
  // API Configuration - إعدادات الـ API
  // ============================================================
  // Change this to your backend URL
  static const String apiBaseUrl = 'http://localhost:5000/api/v1';
  static const String socketUrl = 'http://localhost:5000';

  // ============================================================
  // Colors - الألوان
  // ============================================================
  static const Color primaryPurple = Color(0xFF6C63FF);
  static const Color secondaryTeal = Color(0xFF0EA5E9);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentPink = Color(0xFFEC4899);
  static const Color accentRed = Color(0xFFEF4444);

  static const Color darkBackground = Color(0xFF0F0F1A);
  static const Color darkSurface = Color(0xFF16213E);
  static const Color darkCard = Color(0xFF1A2642);
  static const Color darkBorder = Color(0xFF1E2D4A);

  static const Color textPrimary = Color(0xFFE2E8F0);
  static const Color textSecondary = Color(0xFF94A3B8);
  static const Color textMuted = Color(0xFF475569);

  // ============================================================
  // Gradient Colors - ألوان التدرج
  // ============================================================
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [primaryPurple, Color(0xFF0EA5E9)],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );

  static const LinearGradient darkGradient = LinearGradient(
    colors: [darkBackground, darkSurface],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  // ============================================================
  // Typography - الخطوط
  // ============================================================
  static const String fontFamily = 'Cairo';

  // ============================================================
  // Spacing - المسافات
  // ============================================================
  static const double paddingXS = 4.0;
  static const double paddingS = 8.0;
  static const double paddingM = 16.0;
  static const double paddingL = 24.0;
  static const double paddingXL = 32.0;

  static const double radiusS = 8.0;
  static const double radiusM = 12.0;
  static const double radiusL = 16.0;
  static const double radiusXL = 24.0;

  // ============================================================
  // Animation Durations - مدد الرسوم المتحركة
  // ============================================================
  static const Duration animFast = Duration(milliseconds: 200);
  static const Duration animNormal = Duration(milliseconds: 350);
  static const Duration animSlow = Duration(milliseconds: 600);

  // ============================================================
  // SharedPreferences Keys - مفاتيح التخزين المحلي
  // ============================================================
  static const String keyToken = 'lifeflow_token';
  static const String keyUser = 'lifeflow_user';
  static const String keyTheme = 'lifeflow_theme';
  static const String keyOnboarded = 'lifeflow_onboarded';

  // ============================================================
  // Habit Categories - فئات العادات
  // ============================================================
  static const Map<String, String> habitIcons = {
    'شرب ماء': '💧',
    'رياضة': '🏃',
    'قراءة': '📚',
    'تأمل': '🧘',
    'نوم مبكر': '😴',
    'غذاء صحي': '🥗',
    'تطوير ذاتي': '🌱',
    'صلاة': '🤲',
  };

  // ============================================================
  // Mood Labels - تسميات المزاج
  // ============================================================
  static const Map<int, String> moodLabels = {
    1: 'سيء جداً 😞',
    2: 'سيء 😔',
    3: 'ليس جيداً 😕',
    4: 'عادي 😐',
    5: 'معتدل 🙂',
    6: 'جيد 😊',
    7: 'جيد جداً 😄',
    8: 'ممتاز 😁',
    9: 'رائع 🤩',
    10: 'استثنائي 🌟',
  };

  static const List<String> moodEmotions = [
    'سعيد', 'حزين', 'متحمس', 'قلق', 'هادئ',
    'تعب', 'مركّز', 'محبط', 'ممتن', 'متوتر',
    'فرحان', 'بائس', 'نشيط', 'كسلان', 'مستقر',
  ];

  // ============================================================
  // Task Priorities - أولويات المهام
  // ============================================================
  static const Map<String, Color> priorityColors = {
    'urgent': Color(0xFFEF4444),
    'high': Color(0xFFF97316),
    'medium': Color(0xFFEAB308),
    'low': Color(0xFF6B7280),
  };

  static const Map<String, String> priorityLabels = {
    'urgent': 'عاجل',
    'high': 'عالي',
    'medium': 'متوسط',
    'low': 'منخفض',
  };
}
