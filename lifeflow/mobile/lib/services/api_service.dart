/**
 * API Service - خدمة الـ API
 * ============================
 * التواصل مع الـ Backend
 */

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../utils/app_constants.dart';

class ApiService {
  static String? _token;

  static void setToken(String? token) {
    _token = token;
  }

  static Map<String, String> get _headers => {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  // ============================================================
  // Auth Endpoints
  // ============================================================

  static Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('${AppConstants.apiBaseUrl}/auth/login'),
      headers: _headers,
      body: jsonEncode({'email': email, 'password': password}),
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConstants.apiBaseUrl}/auth/register'),
      headers: _headers,
      body: jsonEncode({'name': name, 'email': email, 'password': password}),
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> getProfile() async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/auth/me'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // ============================================================
  // Dashboard
  // ============================================================

  static Future<Map<String, dynamic>> getDashboard() async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/dashboard'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // ============================================================
  // Tasks
  // ============================================================

  static Future<Map<String, dynamic>> getTasks({
    String? status,
    String? category,
    int limit = 50,
  }) async {
    final params = {
      if (status != null) 'status': status,
      if (category != null) 'category': category,
      'limit': limit.toString(),
    };
    final uri = Uri.parse('${AppConstants.apiBaseUrl}/tasks')
        .replace(queryParameters: params);

    final response = await http.get(uri, headers: _headers);
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> createTask(Map<String, dynamic> task) async {
    final response = await http.post(
      Uri.parse('${AppConstants.apiBaseUrl}/tasks'),
      headers: _headers,
      body: jsonEncode(task),
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> updateTask(
      String id, Map<String, dynamic> updates) async {
    final response = await http.patch(
      Uri.parse('${AppConstants.apiBaseUrl}/tasks/$id'),
      headers: _headers,
      body: jsonEncode(updates),
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> deleteTask(String id) async {
    final response = await http.delete(
      Uri.parse('${AppConstants.apiBaseUrl}/tasks/$id'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // ============================================================
  // Habits
  // ============================================================

  static Future<Map<String, dynamic>> getHabits() async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/habits'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> createHabit(Map<String, dynamic> habit) async {
    final response = await http.post(
      Uri.parse('${AppConstants.apiBaseUrl}/habits'),
      headers: _headers,
      body: jsonEncode(habit),
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> checkInHabit(String id) async {
    final response = await http.post(
      Uri.parse('${AppConstants.apiBaseUrl}/habits/$id/check-in'),
      headers: _headers,
      body: jsonEncode({'date': DateTime.now().toIso8601String()}),
    );
    return _handleResponse(response);
  }

  // ============================================================
  // Mood
  // ============================================================

  static Future<Map<String, dynamic>> getMoodHistory({int days = 7}) async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/mood?days=$days'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> logMood({
    required int score,
    List<String> emotions = const [],
    String? note,
    int? energyLevel,
    String period = 'evening',
  }) async {
    final response = await http.post(
      Uri.parse('${AppConstants.apiBaseUrl}/mood'),
      headers: _headers,
      body: jsonEncode({
        'mood_score': score,
        'emotions': emotions,
        'note': note,
        'energy_level': energyLevel,
        'period': period,
        'date': DateTime.now().toIso8601String(),
      }),
    );
    return _handleResponse(response);
  }

  // ============================================================
  // Insights
  // ============================================================

  static Future<Map<String, dynamic>> getDailySummary() async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/insights/daily-summary'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> getWeeklyReport() async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/insights/weekly-report'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // ============================================================
  // AI Chat
  // ============================================================

  static Future<Map<String, dynamic>> sendMessage(String message) async {
    final response = await http.post(
      Uri.parse('${AppConstants.apiBaseUrl}/ai/chat'),
      headers: _headers,
      body: jsonEncode({'message': message}),
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> getAISuggestions() async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/ai/suggestions'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // ============================================================
  // Notifications
  // ============================================================

  static Future<Map<String, dynamic>> getNotifications({int limit = 20}) async {
    final response = await http.get(
      Uri.parse('${AppConstants.apiBaseUrl}/notifications?limit=$limit'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  static Future<Map<String, dynamic>> markAllNotificationsRead() async {
    final response = await http.patch(
      Uri.parse('${AppConstants.apiBaseUrl}/notifications/read-all'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // ============================================================
  // Response Handler
  // ============================================================

  static Map<String, dynamic> _handleResponse(http.Response response) {
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {'success': true, 'data': body};
      } else {
        return {
          'success': false,
          'error': body['message'] ?? 'حدث خطأ، يرجى المحاولة مرة أخرى',
          'status': response.statusCode,
        };
      }
    } catch (e) {
      return {
        'success': false,
        'error': 'خطأ في الاتصال بالخادم',
        'details': e.toString(),
      };
    }
  }
}
