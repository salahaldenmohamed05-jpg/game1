/**
 * Login Screen - شاشة تسجيل الدخول
 * ====================================
 * واجهة تسجيل الدخول وإنشاء الحساب
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/app_constants.dart';
import '../home/home_screen.dart';

class LoginScreen extends StatefulWidget {
  static const routeName = '/login';

  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _loginFormKey = GlobalKey<FormState>();
  final _registerFormKey = GlobalKey<FormState>();

  // Login fields
  final _emailController = TextEditingController(text: 'demo@lifeflow.app');
  final _passwordController = TextEditingController(text: 'demo123');

  // Register fields
  final _nameController = TextEditingController();
  final _regEmailController = TextEditingController();
  final _regPasswordController = TextEditingController();
  final _regConfirmController = TextEditingController();

  bool _obscurePass = true;
  bool _obscureRegPass = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _regEmailController.dispose();
    _regPasswordController.dispose();
    _regConfirmController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_loginFormKey.currentState!.validate()) return;

    final auth = context.read<AuthProvider>();
    final success = await auth.login(
      _emailController.text.trim(),
      _passwordController.text,
    );

    if (success && mounted) {
      Navigator.pushReplacementNamed(context, HomeScreen.routeName);
    } else if (mounted) {
      _showError(auth.error ?? 'فشل تسجيل الدخول');
    }
  }

  Future<void> _register() async {
    if (!_registerFormKey.currentState!.validate()) return;

    if (_regPasswordController.text != _regConfirmController.text) {
      _showError('كلمتا المرور غير متطابقتين');
      return;
    }

    final auth = context.read<AuthProvider>();
    final success = await auth.register(
      name: _nameController.text.trim(),
      email: _regEmailController.text.trim(),
      password: _regPasswordController.text,
    );

    if (success && mounted) {
      Navigator.pushReplacementNamed(context, HomeScreen.routeName);
    } else if (mounted) {
      _showError(auth.error ?? 'فشل إنشاء الحساب');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message,
            style: const TextStyle(fontFamily: AppConstants.fontFamily)),
        backgroundColor: AppConstants.accentRed,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
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
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppConstants.paddingL),
            child: Column(
              children: [
                const SizedBox(height: 40),

                // Logo & Title
                _buildHeader(),

                const SizedBox(height: 40),

                // Auth Card
                Container(
                  decoration: BoxDecoration(
                    color: AppConstants.darkCard,
                    borderRadius: BorderRadius.circular(AppConstants.radiusXL),
                    border: Border.all(color: AppConstants.darkBorder),
                  ),
                  child: Column(
                    children: [
                      // Tab Bar
                      Container(
                        margin: const EdgeInsets.all(AppConstants.paddingM),
                        decoration: BoxDecoration(
                          color: AppConstants.darkSurface,
                          borderRadius:
                              BorderRadius.circular(AppConstants.radiusM),
                        ),
                        child: TabBar(
                          controller: _tabController,
                          indicator: BoxDecoration(
                            color: AppConstants.primaryPurple,
                            borderRadius:
                                BorderRadius.circular(AppConstants.radiusM - 2),
                          ),
                          indicatorSize: TabBarIndicatorSize.tab,
                          dividerColor: Colors.transparent,
                          labelColor: Colors.white,
                          unselectedLabelColor: AppConstants.textMuted,
                          labelStyle: const TextStyle(
                            fontFamily: AppConstants.fontFamily,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                          tabs: const [
                            Tab(text: 'تسجيل الدخول'),
                            Tab(text: 'إنشاء حساب'),
                          ],
                        ),
                      ),

                      // Tab Views
                      SizedBox(
                        height: 400,
                        child: TabBarView(
                          controller: _tabController,
                          children: [
                            _buildLoginForm(),
                            _buildRegisterForm(),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Demo credentials hint
                Container(
                  padding: const EdgeInsets.all(AppConstants.paddingM),
                  decoration: BoxDecoration(
                    color: AppConstants.primaryPurple.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(AppConstants.radiusM),
                    border: Border.all(
                      color: AppConstants.primaryPurple.withOpacity(0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Text('💡', style: TextStyle(fontSize: 16)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: const [
                            Text(
                              'للتجربة السريعة',
                              style: TextStyle(
                                fontFamily: AppConstants.fontFamily,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppConstants.primaryPurple,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'البريد: demo@lifeflow.app | كلمة المرور: demo123',
                              style: TextStyle(
                                fontFamily: AppConstants.fontFamily,
                                fontSize: 11,
                                color: AppConstants.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Container(
          width: 70,
          height: 70,
          decoration: BoxDecoration(
            gradient: AppConstants.primaryGradient,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppConstants.primaryPurple.withOpacity(0.4),
                blurRadius: 20,
                spreadRadius: 2,
              ),
            ],
          ),
          child: const Center(child: Text('✨', style: TextStyle(fontSize: 34))),
        ),
        const SizedBox(height: 16),
        ShaderMask(
          shaderCallback: (bounds) =>
              AppConstants.primaryGradient.createShader(bounds),
          child: const Text(
            'LifeFlow',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 32,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'نظّم حياتك بذكاء',
          style: TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 14,
            color: AppConstants.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildLoginForm() {
    final auth = context.watch<AuthProvider>();

    return Padding(
      padding: const EdgeInsets.all(AppConstants.paddingL),
      child: Form(
        key: _loginFormKey,
        child: Column(
          children: [
            // Email
            TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: AppConstants.textPrimary,
              ),
              decoration: const InputDecoration(
                hintText: 'البريد الإلكتروني',
                prefixIcon: Icon(Icons.email_outlined,
                    color: AppConstants.textMuted, size: 20),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'البريد مطلوب';
                if (!v.contains('@')) return 'بريد إلكتروني غير صالح';
                return null;
              },
            ),
            const SizedBox(height: 12),

            // Password
            TextFormField(
              controller: _passwordController,
              obscureText: _obscurePass,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: AppConstants.textPrimary,
              ),
              decoration: InputDecoration(
                hintText: 'كلمة المرور',
                prefixIcon: const Icon(Icons.lock_outline,
                    color: AppConstants.textMuted, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscurePass ? Icons.visibility_off : Icons.visibility,
                    color: AppConstants.textMuted,
                    size: 20,
                  ),
                  onPressed: () => setState(() => _obscurePass = !_obscurePass),
                ),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'كلمة المرور مطلوبة';
                if (v.length < 6) return 'يجب أن تكون 6 أحرف على الأقل';
                return null;
              },
            ),

            const SizedBox(height: 24),

            // Login Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: auth.isLoading ? null : _login,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppConstants.radiusM),
                  ),
                ),
                child: auth.isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'تسجيل الدخول',
                        style: TextStyle(
                          fontFamily: AppConstants.fontFamily,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRegisterForm() {
    final auth = context.watch<AuthProvider>();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppConstants.paddingL),
      child: Form(
        key: _registerFormKey,
        child: Column(
          children: [
            // Name
            TextFormField(
              controller: _nameController,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: AppConstants.textPrimary,
              ),
              decoration: const InputDecoration(
                hintText: 'الاسم الكامل',
                prefixIcon: Icon(Icons.person_outline,
                    color: AppConstants.textMuted, size: 20),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'الاسم مطلوب';
                return null;
              },
            ),
            const SizedBox(height: 10),

            // Email
            TextFormField(
              controller: _regEmailController,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: AppConstants.textPrimary,
              ),
              decoration: const InputDecoration(
                hintText: 'البريد الإلكتروني',
                prefixIcon: Icon(Icons.email_outlined,
                    color: AppConstants.textMuted, size: 20),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'البريد مطلوب';
                if (!v.contains('@')) return 'بريد غير صالح';
                return null;
              },
            ),
            const SizedBox(height: 10),

            // Password
            TextFormField(
              controller: _regPasswordController,
              obscureText: _obscureRegPass,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: AppConstants.textPrimary,
              ),
              decoration: InputDecoration(
                hintText: 'كلمة المرور',
                prefixIcon: const Icon(Icons.lock_outline,
                    color: AppConstants.textMuted, size: 20),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscureRegPass ? Icons.visibility_off : Icons.visibility,
                    color: AppConstants.textMuted,
                    size: 20,
                  ),
                  onPressed: () =>
                      setState(() => _obscureRegPass = !_obscureRegPass),
                ),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'كلمة المرور مطلوبة';
                if (v.length < 6) return 'يجب أن تكون 6 أحرف على الأقل';
                return null;
              },
            ),
            const SizedBox(height: 10),

            // Confirm Password
            TextFormField(
              controller: _regConfirmController,
              obscureText: true,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: AppConstants.textPrimary,
              ),
              decoration: const InputDecoration(
                hintText: 'تأكيد كلمة المرور',
                prefixIcon: Icon(Icons.lock_outline,
                    color: AppConstants.textMuted, size: 20),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'تأكيد كلمة المرور مطلوب';
                return null;
              },
            ),
            const SizedBox(height: 20),

            // Register Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: auth.isLoading ? null : _register,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppConstants.radiusM),
                  ),
                ),
                child: auth.isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'إنشاء الحساب',
                        style: TextStyle(
                          fontFamily: AppConstants.fontFamily,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
