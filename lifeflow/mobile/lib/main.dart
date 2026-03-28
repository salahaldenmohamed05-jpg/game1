/**
 * LifeFlow Flutter App - main.dart
 * =================================
 * نقطة الدخول الرئيسية لتطبيق LifeFlow
 * مساعدك الشخصي الذكي بالعربية
 */

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers/auth_provider.dart';
import 'providers/task_provider.dart';
import 'providers/habit_provider.dart';
import 'providers/mood_provider.dart';
import 'providers/ai_provider.dart';
import 'providers/notification_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'screens/calendar/calendar_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/subscription/subscription_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'utils/app_theme.dart';
import 'utils/app_constants.dart';
import 'services/notification_service.dart';
import 'services/socket_service.dart';

// Global navigator key for notifications
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  // Ensure Flutter bindings are initialized
  WidgetsFlutterBinding.ensureInitialized();

  // Set preferred orientations
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Initialize notifications
  await NotificationService.initialize();

  // Set system UI overlay style
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppConstants.darkBackground,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // Initialize SharedPreferences
  final prefs = await SharedPreferences.getInstance();

  runApp(LifeFlowApp(prefs: prefs));
}

class LifeFlowApp extends StatelessWidget {
  final SharedPreferences prefs;

  const LifeFlowApp({super.key, required this.prefs});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        // Auth Provider - manages user authentication
        ChangeNotifierProvider(create: (_) => AuthProvider(prefs)),
        // Task Provider - manages tasks and to-dos
        ChangeNotifierProxyProvider<AuthProvider, TaskProvider>(
          create: (_) => TaskProvider(),
          update: (_, auth, tasks) => tasks!..updateToken(auth.token),
        ),
        // Habit Provider - manages habits and streaks
        ChangeNotifierProxyProvider<AuthProvider, HabitProvider>(
          create: (_) => HabitProvider(),
          update: (_, auth, habits) => habits!..updateToken(auth.token),
        ),
        // Mood Provider - manages mood tracking
        ChangeNotifierProxyProvider<AuthProvider, MoodProvider>(
          create: (_) => MoodProvider(),
          update: (_, auth, mood) => mood!..updateToken(auth.token),
        ),
        // AI Provider - manages AI chat and suggestions
        ChangeNotifierProxyProvider<AuthProvider, AIProvider>(
          create: (_) => AIProvider(),
          update: (_, auth, ai) => ai!..updateToken(auth.token),
        ),
        // Notification Provider
        ChangeNotifierProvider(create: (_) => NotificationProvider()),
      ],
      child: MaterialApp(
        title: 'LifeFlow',
        navigatorKey: navigatorKey,
        debugShowCheckedModeBanner: false,

        // Arabic RTL Support
        locale: const Locale('ar', 'EG'),
        supportedLocales: const [
          Locale('ar', 'EG'),
          Locale('ar', 'SA'),
          Locale('en', 'US'),
        ],

        // RTL text direction
        builder: (context, child) {
          return Directionality(
            textDirection: TextDirection.rtl,
            child: child!,
          );
        },

        // App theme - dark mode with purple accents
        theme: AppTheme.darkTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.dark,

        // Route management
        initialRoute: SplashScreen.routeName,
        routes: {
          SplashScreen.routeName: (_) => const SplashScreen(),
          LoginScreen.routeName: (_) => const LoginScreen(),
          HomeScreen.routeName: (_) => const HomeScreen(),
          NotificationsScreen.routeName: (_) => const NotificationsScreen(),
          CalendarScreen.routeName: (_) => const CalendarScreen(),
          SettingsScreen.routeName: (_) => const SettingsScreen(),
          ProfileScreen.routeName: (_) => const ProfileScreen(),
          SubscriptionScreen.routeName: (_) => const SubscriptionScreen(),
        },

        // Handle unknown routes
        onUnknownRoute: (settings) => MaterialPageRoute(
          builder: (_) => const HomeScreen(),
        ),
      ),
    );
  }
}
