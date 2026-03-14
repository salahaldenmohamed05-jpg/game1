import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  static final ApiService instance = ApiService._internal();
  ApiService._internal();

  static const String baseUrl = 'http://10.0.2.2:5000/api/v1';
  // Use 'http://localhost:5000/api/v1' for iOS simulator
  // Use actual IP for physical device testing

  String? _token;

  void setToken(String? token) => _token = token;
  String? get token => _token;

  Map<String, String> _headers([String? token]) => {
    'Content-Type': 'application/json',
    'Accept-Language': 'ar',
    if (token != null) 'Authorization': 'Bearer $token',
    if (_token != null && token == null) 'Authorization': 'Bearer $_token',
  };

  Map<String, dynamic> _handleResponse(http.Response response) {
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {'success': true, 'data': body['data'] ?? body};
      }
      return {
        'success': false,
        'error': body['message'] ?? 'حدث خطأ، يرجى المحاولة مرة أخرى',
        'status': response.statusCode,
      };
    } catch (e) {
      return {'success': false, 'error': 'خطأ في الاتصال بالخادم: $e'};
    }
  }

  // ─── Auth ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: _headers(),
        body: jsonEncode({'email': email, 'password': password}),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر الاتصال بالخادم'};
    }
  }

  Future<Map<String, dynamic>> register(Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: _headers(),
        body: jsonEncode(data),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر الاتصال بالخادم'};
    }
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getDashboard([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/dashboard'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل لوحة التحكم'};
    }
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getTasks([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/tasks'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل المهام'};
    }
  }

  Future<Map<String, dynamic>> createTask(Map<String, dynamic> data, [String? token]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/tasks'),
        headers: _headers(token),
        body: jsonEncode(data),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر إنشاء المهمة'};
    }
  }

  Future<Map<String, dynamic>> completeTask(String id, [String? token]) async {
    try {
      final response = await http.patch(
        Uri.parse('$baseUrl/tasks/$id/complete'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر إكمال المهمة'};
    }
  }

  // ─── Habits ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getHabitsToday([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/habits/today'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل العادات'};
    }
  }

  Future<Map<String, dynamic>> checkInHabit(String id, [String? token]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/habits/$id/checkin'),
        headers: _headers(token),
        body: '{}',
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تسجيل العادة'};
    }
  }

  // ─── Mood ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getTodayMood([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/mood/today'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل بيانات المزاج'};
    }
  }

  Future<Map<String, dynamic>> logMood(Map<String, dynamic> data, [String? token]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/mood'),
        headers: _headers(token),
        body: jsonEncode(data),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تسجيل المزاج'};
    }
  }

  // ─── Performance (Premium) ──────────────────────────────────────────────
  Future<Map<String, dynamic>> getPerformanceToday([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/performance/today'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل بيانات الأداء'};
    }
  }

  Future<Map<String, dynamic>> getPerformanceDashboard([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/performance/dashboard'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل لوحة الأداء'};
    }
  }

  Future<Map<String, dynamic>> getWeeklyAudit([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/performance/weekly-audit'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل المراجعة الأسبوعية'};
    }
  }

  Future<Map<String, dynamic>> getProcrastinationFlags([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/performance/procrastination-flags'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل تحليلات المماطلة'};
    }
  }

  Future<Map<String, dynamic>> getEnergyProfile([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/performance/energy-profile'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل خريطة الطاقة'};
    }
  }

  Future<Map<String, dynamic>> getDailyCoaching([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/performance/coaching'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل نصيحة اليوم'};
    }
  }

  // ─── Subscription ────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getSubscriptionStatus([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/subscription/status'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل بيانات الاشتراك'};
    }
  }

  Future<Map<String, dynamic>> startTrial([String? token]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/subscription/trial/start'),
        headers: _headers(token),
        body: '{}',
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تفعيل التجربة'};
    }
  }

  Future<Map<String, dynamic>> getSubscriptionPlans([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/subscription/plans'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل الخطط'};
    }
  }

  // ─── Notifications ───────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getNotifications([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/notifications?limit=20'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل الإشعارات'};
    }
  }

  Future<Map<String, dynamic>> registerFCMToken(String fcmToken, [String? token]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/notifications/fcm-token'),
        headers: _headers(token),
        body: jsonEncode({'fcm_token': fcmToken}),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تسجيل رمز الإشعارات'};
    }
  }

  // ─── Profile ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getProfile([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/users/profile'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل الملف الشخصي'};
    }
  }

  // ─── Intelligence (Life Score, Timeline, Predictions) ────────────────────

  Future<Map<String, dynamic>> getLifeScore({int days = 7, String? token}) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/intelligence/life-score?days=$days'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل نقاط الحياة'};
    }
  }

  Future<Map<String, dynamic>> getTimeline({int days = 30, String? token}) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/intelligence/timeline?days=$days'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 20));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل الجدول الزمني'};
    }
  }

  Future<Map<String, dynamic>> getBurnoutRisk([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/intelligence/burnout-risk'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تقييم الإجهاد'};
    }
  }

  Future<Map<String, dynamic>> getMoodForecast({int days = 7, String? token}) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/intelligence/predict/mood?days=$days'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تنبؤ المزاج'};
    }
  }

  Future<Map<String, dynamic>> getLifeTrajectory([String? token]) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/intelligence/trajectory'),
        headers: _headers(token),
      ).timeout(const Duration(seconds: 15));
      return _handleResponse(response);
    } catch (e) {
      return {'success': false, 'error': 'تعذر تحميل مسار الأداء'};
    }
  }
}
