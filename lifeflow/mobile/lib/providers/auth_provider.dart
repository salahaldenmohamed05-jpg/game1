/**
 * Auth Provider - مزود المصادقة
 * ================================
 * إدارة حالة المصادقة والمستخدم
 */

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../models/models.dart';
import '../services/api_service.dart';
import '../utils/app_constants.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  final SharedPreferences _prefs;

  AuthStatus _status = AuthStatus.unknown;
  User? _user;
  String? _token;
  String? _error;
  bool _isLoading = false;

  AuthProvider(this._prefs) {
    _loadStoredAuth();
  }

  // Getters
  AuthStatus get status => _status;
  User? get user => _user;
  String? get token => _token;
  String? get error => _error;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  // Load stored authentication
  Future<void> _loadStoredAuth() async {
    final token = _prefs.getString(AppConstants.keyToken);
    final userJson = _prefs.getString(AppConstants.keyUser);

    if (token != null && userJson != null) {
      try {
        _token = token;
        _user = User.fromJson(jsonDecode(userJson));
        ApiService.setToken(token);
        _status = AuthStatus.authenticated;
      } catch (e) {
        _status = AuthStatus.unauthenticated;
      }
    } else {
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  // Login
  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await ApiService.login(email, password);

      if (result['success']) {
        final data = result['data'];
        _token = data['token'];
        _user = User.fromJson(data['user']);

        // Save to storage
        await _prefs.setString(AppConstants.keyToken, _token!);
        await _prefs.setString(
            AppConstants.keyUser, jsonEncode(_user!.toJson()));

        ApiService.setToken(_token);
        _status = AuthStatus.authenticated;
        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _error = result['error'] ?? 'فشل تسجيل الدخول';
        _status = AuthStatus.unauthenticated;
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      _error = 'خطأ في الاتصال بالخادم';
      _status = AuthStatus.unauthenticated;
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  // Register
  Future<bool> register({
    required String name,
    required String email,
    required String password,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await ApiService.register(
        name: name,
        email: email,
        password: password,
      );

      if (result['success']) {
        final data = result['data'];
        _token = data['token'];
        _user = User.fromJson(data['user']);

        await _prefs.setString(AppConstants.keyToken, _token!);
        await _prefs.setString(
            AppConstants.keyUser, jsonEncode(_user!.toJson()));

        ApiService.setToken(_token);
        _status = AuthStatus.authenticated;
        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _error = result['error'] ?? 'فشل إنشاء الحساب';
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      _error = 'خطأ في الاتصال بالخادم';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  // Logout
  Future<void> logout() async {
    await _prefs.remove(AppConstants.keyToken);
    await _prefs.remove(AppConstants.keyUser);
    ApiService.setToken(null);
    _token = null;
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
