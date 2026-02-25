/**
 * App Theme - ثيم التطبيق
 * =========================
 * إعدادات الثيم الداكن مع دعم العربية
 */

import 'package:flutter/material.dart';
import 'app_constants.dart';

class AppTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: AppConstants.fontFamily,

      // Color Scheme
      colorScheme: const ColorScheme.dark(
        primary: AppConstants.primaryPurple,
        secondary: AppConstants.secondaryTeal,
        surface: AppConstants.darkSurface,
        background: AppConstants.darkBackground,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: AppConstants.textPrimary,
        onBackground: AppConstants.textPrimary,
        error: AppConstants.accentRed,
        tertiary: AppConstants.accentGreen,
      ),

      // Scaffold
      scaffoldBackgroundColor: AppConstants.darkBackground,

      // AppBar Theme
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 20,
          fontWeight: FontWeight.w800,
          color: AppConstants.textPrimary,
        ),
        iconTheme: IconThemeData(color: AppConstants.textPrimary),
        actionsIconTheme: IconThemeData(color: AppConstants.textSecondary),
      ),

      // Card Theme
      cardTheme: CardTheme(
        color: AppConstants.darkCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusL),
          side: const BorderSide(
            color: AppConstants.darkBorder,
            width: 1,
          ),
        ),
      ),

      // Bottom Navigation Bar
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppConstants.darkSurface,
        selectedItemColor: AppConstants.primaryPurple,
        unselectedItemColor: AppConstants.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        selectedLabelStyle: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 11,
        ),
      ),

      // NavigationBar Theme (Material 3)
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppConstants.darkSurface,
        indicatorColor: AppConstants.primaryPurple.withOpacity(0.2),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppConstants.primaryPurple, size: 24);
          }
          return const IconThemeData(color: AppConstants.textMuted, size: 22);
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppConstants.primaryPurple,
            );
          }
          return const TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 11,
            color: AppConstants.textMuted,
          );
        }),
      ),

      // Text Theme
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 32,
          fontWeight: FontWeight.w900,
          color: AppConstants.textPrimary,
        ),
        displayMedium: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 28,
          fontWeight: FontWeight.w800,
          color: AppConstants.textPrimary,
        ),
        headlineLarge: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 24,
          fontWeight: FontWeight.w800,
          color: AppConstants.textPrimary,
        ),
        headlineMedium: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: AppConstants.textPrimary,
        ),
        headlineSmall: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppConstants.textPrimary,
        ),
        titleLarge: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: AppConstants.textPrimary,
        ),
        titleMedium: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: AppConstants.textPrimary,
        ),
        titleSmall: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppConstants.textSecondary,
        ),
        bodyLarge: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w400,
          color: AppConstants.textPrimary,
        ),
        bodyMedium: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: AppConstants.textPrimary,
        ),
        bodySmall: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: AppConstants.textSecondary,
        ),
        labelLarge: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: AppConstants.textPrimary,
          letterSpacing: 0.5,
        ),
      ),

      // Input Decoration Theme
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppConstants.darkCard,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusM),
          borderSide: const BorderSide(color: AppConstants.darkBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusM),
          borderSide: const BorderSide(color: AppConstants.darkBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusM),
          borderSide: const BorderSide(color: AppConstants.primaryPurple, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusM),
          borderSide: const BorderSide(color: AppConstants.accentRed),
        ),
        hintStyle: const TextStyle(
          fontFamily: AppConstants.fontFamily,
          color: AppConstants.textMuted,
          fontSize: 14,
        ),
        labelStyle: const TextStyle(
          fontFamily: AppConstants.fontFamily,
          color: AppConstants.textSecondary,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),

      // Elevated Button Theme
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppConstants.primaryPurple,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppConstants.radiusM),
          ),
          elevation: 0,
          textStyle: const TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),

      // Text Button Theme
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppConstants.primaryPurple,
          textStyle: const TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // Floating Action Button
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppConstants.primaryPurple,
        foregroundColor: Colors.white,
        elevation: 4,
      ),

      // Dialog Theme
      dialogTheme: DialogTheme(
        backgroundColor: AppConstants.darkSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusXL),
        ),
        titleTextStyle: const TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppConstants.textPrimary,
        ),
      ),

      // Bottom Sheet Theme
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppConstants.darkSurface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXL),
          ),
        ),
      ),

      // Chip Theme
      chipTheme: ChipThemeData(
        backgroundColor: AppConstants.darkCard,
        selectedColor: AppConstants.primaryPurple.withOpacity(0.3),
        labelStyle: const TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 12,
          color: AppConstants.textPrimary,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusS),
          side: const BorderSide(color: AppConstants.darkBorder),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      ),

      // Divider
      dividerTheme: const DividerThemeData(
        color: AppConstants.darkBorder,
        thickness: 1,
        space: 0,
      ),

      // List Tile
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        textColor: AppConstants.textPrimary,
        iconColor: AppConstants.textSecondary,
      ),

      // Switch Theme
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.white;
          }
          return AppConstants.textMuted;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppConstants.primaryPurple;
          }
          return AppConstants.darkCard;
        }),
      ),
    );
  }
}
