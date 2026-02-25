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
    final sum = _moodHistory.fold<int>(0, (sum, m) => sum + m.moodScore);
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
        _moodHistory = entries.map((j) => MoodEntry.fromJson(j as Map<String, dynamic>)).toList();

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
        await loadMoodHistory();
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
