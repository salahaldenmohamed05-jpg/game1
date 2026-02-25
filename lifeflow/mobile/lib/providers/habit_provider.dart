/**
 * Habit Provider - مزود العادات
 * ================================
 */

import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_service.dart';

class HabitProvider extends ChangeNotifier {
  List<Habit> _habits = [];
  bool _isLoading = false;
  String? _error;

  List<Habit> get habits => _habits;
  bool get isLoading => _isLoading;
  String? get error => _error;
  int get completedToday => _habits.where((h) => h.completedToday).length;
  double get todayProgress => _habits.isEmpty ? 0 : completedToday / _habits.length;

  void updateToken(String? token) {
    ApiService.setToken(token);
    if (token != null) loadHabits();
  }

  Future<void> loadHabits() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await ApiService.getHabits();
      if (result['success']) {
        final data = result['data']['data'];
        final habitsList = data['habits'] as List<dynamic>? ?? [];
        _habits = habitsList.map((j) => Habit.fromJson(j)).toList();
        _error = null;
      } else {
        _error = result['error'];
      }
    } catch (e) {
      _error = 'فشل تحميل العادات';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> checkIn(String habitId) async {
    try {
      final result = await ApiService.checkInHabit(habitId);
      if (result['success']) {
        await loadHabits();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  Future<bool> createHabit({
    required String name,
    String? icon,
    String frequency = 'daily',
    List<String> reminderTimes = const [],
  }) async {
    try {
      final result = await ApiService.createHabit({
        'name': name,
        'icon': icon,
        'frequency': frequency,
        'reminder_times': reminderTimes,
      });

      if (result['success']) {
        await loadHabits();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}
