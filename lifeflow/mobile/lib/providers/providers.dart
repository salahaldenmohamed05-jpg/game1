/**
 * Mood Provider - مزود المزاج
 * ==============================
 */

import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_service.dart';

class MoodProvider extends ChangeNotifier {
  List<MoodEntry> _moodHistory = [];
  MoodEntry? _todayMood;
  bool _isLoading = false;
  String? _error;

  List<MoodEntry> get moodHistory => _moodHistory;
  MoodEntry? get todayMood => _todayMood;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get hasCheckedInToday => _todayMood != null;

  double get weeklyAverage {
    if (_moodHistory.isEmpty) return 0;
    final sum = _moodHistory.fold(0, (sum, m) => sum + m.moodScore);
    return sum / _moodHistory.length;
  }

  void updateToken(String? token) {
    ApiService.setToken(token);
    if (token != null) loadMoodHistory();
  }

  Future<void> loadMoodHistory({int days = 7}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await ApiService.getMoodHistory(days: days);
      if (result['success']) {
        final data = result['data']['data'];
        final entries = data['entries'] as List<dynamic>? ?? [];
        _moodHistory = entries.map((j) => MoodEntry.fromJson(j)).toList();

        // Find today's mood
        final today = DateTime.now();
        _todayMood = _moodHistory.cast<MoodEntry?>().firstWhere(
          (m) => m != null &&
              m.date.year == today.year &&
              m.date.month == today.month &&
              m.date.day == today.day,
          orElse: () => null,
        );
        _error = null;
      } else {
        _error = result['error'];
      }
    } catch (e) {
      _error = 'فشل تحميل سجل المزاج';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> logMood({
    required int score,
    List<String> emotions = const [],
    String? note,
    int? energyLevel,
    String period = 'evening',
  }) async {
    try {
      final result = await ApiService.logMood(
        score: score,
        emotions: emotions,
        note: note,
        energyLevel: energyLevel,
        period: period,
      );

      if (result['success']) {
        await loadMoodHistory(); // Refresh
        return true;
      }
      _error = result['error'];
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'فشل تسجيل المزاج';
      notifyListeners();
      return false;
    }
  }
}

// ============================================================

/**
 * AI Provider - مزود الذكاء الاصطناعي
 */

import 'package:flutter/material.dart';
import '../services/api_service.dart';

class ChatMessage {
  final String content;
  final bool isUser;
  final DateTime timestamp;

  ChatMessage({
    required this.content,
    required this.isUser,
    required this.timestamp,
  });
}

class AIProvider extends ChangeNotifier {
  final List<ChatMessage> _messages = [];
  bool _isLoading = false;
  List<Map<String, dynamic>> _suggestions = [];
  Map<String, dynamic>? _dailySummary;

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get isLoading => _isLoading;
  List<Map<String, dynamic>> get suggestions => _suggestions;
  Map<String, dynamic>? get dailySummary => _dailySummary;

  void updateToken(String? token) {
    ApiService.setToken(token);
    if (token != null) {
      loadSuggestions();
      _initWelcomeMessage();
    }
  }

  void _initWelcomeMessage() {
    if (_messages.isEmpty) {
      _messages.add(ChatMessage(
        content: 'مرحباً! أنا مساعدك الذكي في LifeFlow 🌟\n\nيمكنني مساعدتك في:\n• إدارة مهامك وأهدافك\n• تتبع عاداتك اليومية\n• تحليل مزاجك وصحتك النفسية\n• تقديم اقتراحات مخصصة لك\n\nكيف يمكنني مساعدتك اليوم؟',
        isUser: false,
        timestamp: DateTime.now(),
      ));
      notifyListeners();
    }
  }

  Future<void> sendMessage(String message) async {
    if (message.trim().isEmpty) return;

    // Add user message
    _messages.add(ChatMessage(
      content: message,
      isUser: true,
      timestamp: DateTime.now(),
    ));
    _isLoading = true;
    notifyListeners();

    try {
      final result = await ApiService.sendMessage(message);

      if (result['success']) {
        final data = result['data'];
        final reply = data['data']?['response'] ?? data['message'] ?? 'لا يوجد رد';
        _messages.add(ChatMessage(
          content: reply,
          isUser: false,
          timestamp: DateTime.now(),
        ));
      } else {
        _messages.add(ChatMessage(
          content: 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.',
          isUser: false,
          timestamp: DateTime.now(),
        ));
      }
    } catch (e) {
      _messages.add(ChatMessage(
        content: 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.',
        isUser: false,
        timestamp: DateTime.now(),
      ));
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadSuggestions() async {
    try {
      final result = await ApiService.getAISuggestions();
      if (result['success']) {
        final data = result['data']['data'];
        _suggestions = (data['suggestions'] as List<dynamic>?)
            ?.map((s) => s as Map<String, dynamic>)
            .toList() ?? [];
        notifyListeners();
      }
    } catch (e) {
      // Ignore silently
    }
  }

  void clearMessages() {
    _messages.clear();
    _initWelcomeMessage();
    notifyListeners();
  }
}

// ============================================================

/**
 * Notification Provider - مزود الإشعارات
 */

import 'package:flutter/material.dart';
import '../services/api_service.dart';

class NotificationProvider extends ChangeNotifier {
  List<Map<String, dynamic>> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = false;

  List<Map<String, dynamic>> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get isLoading => _isLoading;

  Future<void> loadNotifications() async {
    _isLoading = true;
    notifyListeners();

    try {
      final result = await ApiService.getNotifications(limit: 30);
      if (result['success']) {
        final data = result['data']['data'];
        _notifications = (data['notifications'] as List<dynamic>?)
            ?.map((n) => n as Map<String, dynamic>)
            .toList() ?? [];
        _unreadCount = _notifications.where((n) => n['is_read'] == false).length;
      }
    } catch (e) {
      // Ignore
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> markAllRead() async {
    await ApiService.markAllNotificationsRead();
    _unreadCount = 0;
    _notifications = _notifications.map((n) => {...n, 'is_read': true}).toList();
    notifyListeners();
  }
}
