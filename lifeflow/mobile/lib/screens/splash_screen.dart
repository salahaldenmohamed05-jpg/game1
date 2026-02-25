/**
 * Splash Screen - شاشة البداية
 * ================================
 * شاشة التحميل مع شعار LifeFlow
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../utils/app_constants.dart';
import 'auth/login_screen.dart';
import 'home/home_screen.dart';

class SplashScreen extends StatefulWidget {
  static const routeName = '/';

  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnim;
  late Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );

    _fadeAnim = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.6)),
    );

    _scaleAnim = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );

    _controller.forward();

    // Navigate after auth check
    Future.delayed(const Duration(seconds: 2), () {
      _checkAuth();
    });
  }

  void _checkAuth() {
    final auth = context.read<AuthProvider>();

    // Wait for auth to be determined
    if (auth.status == AuthStatus.unknown) {
      Future.delayed(const Duration(milliseconds: 500), _checkAuth);
      return;
    }

    if (!mounted) return;

    if (auth.status == AuthStatus.authenticated) {
      Navigator.pushReplacementNamed(context, HomeScreen.routeName);
    } else {
      Navigator.pushReplacementNamed(context, LoginScreen.routeName);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [
              Color(0xFF0F0F1A),
              Color(0xFF16213E),
              Color(0xFF1A0533),
            ],
          ),
        ),
        child: Center(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return FadeTransition(
                opacity: _fadeAnim,
                child: ScaleTransition(
                  scale: _scaleAnim,
                  child: child,
                ),
              );
            },
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    gradient: AppConstants.primaryGradient,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: [
                      BoxShadow(
                        color: AppConstants.primaryPurple.withOpacity(0.4),
                        blurRadius: 30,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Text('✨', style: TextStyle(fontSize: 48)),
                  ),
                ),

                const SizedBox(height: 24),

                // App Name
                ShaderMask(
                  shaderCallback: (bounds) =>
                      AppConstants.primaryGradient.createShader(bounds),
                  child: const Text(
                    'LifeFlow',
                    style: TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 42,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: 1,
                    ),
                  ),
                ),

                const SizedBox(height: 8),

                // Tagline
                const Text(
                  'مساعدك الشخصي الذكي',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 16,
                    fontWeight: FontWeight.w400,
                    color: AppConstants.textSecondary,
                    letterSpacing: 0.5,
                  ),
                ),

                const SizedBox(height: 60),

                // Loading indicator
                SizedBox(
                  width: 40,
                  height: 40,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      AppConstants.primaryPurple.withOpacity(0.7),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
