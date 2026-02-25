/**
 * Task Provider - مزود المهام
 * ==============================
 */

import 'package:flutter/material.dart';
import '../models/task_model.dart';
import '../services/api_service.dart';

class TaskProvider extends ChangeNotifier {
  List<Task> _tasks = [];
  bool _isLoading = false;
  String? _error;
  String _filter = 'all'; // all | today | pending | completed

  List<Task> get tasks => _getFilteredTasks();
  List<Task> get allTasks => _tasks;
  bool get isLoading => _isLoading;
  String? get error => _error;
  String get filter => _filter;

  int get pendingCount => _tasks.where((t) => t.status == 'pending').length;
  int get completedCount => _tasks.where((t) => t.isCompleted).length;
  int get overdueCount => _tasks.where((t) => t.isOverdue).length;

  List<Task> get todayTasks {
    final today = DateTime.now();
    return _tasks.where((t) {
      if (t.dueDate == null) return false;
      return t.dueDate!.year == today.year &&
          t.dueDate!.month == today.month &&
          t.dueDate!.day == today.day;
    }).toList();
  }

  List<Task> _getFilteredTasks() {
    switch (_filter) {
      case 'today':
        return todayTasks;
      case 'pending':
        return _tasks.where((t) => t.status == 'pending').toList();
      case 'completed':
        return _tasks.where((t) => t.isCompleted).toList();
      case 'overdue':
        return _tasks.where((t) => t.isOverdue).toList();
      default:
        return _tasks;
    }
  }

  void updateToken(String? token) {
    ApiService.setToken(token);
    if (token != null) loadTasks();
  }

  void setFilter(String filter) {
    _filter = filter;
    notifyListeners();
  }

  Future<void> loadTasks() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await ApiService.getTasks(limit: 100);
      if (result['success']) {
        final data = result['data']['data'];
        final tasksList = data['tasks'] as List<dynamic>? ?? [];
        _tasks = tasksList.map((j) => Task.fromJson(j)).toList();
        // Sort: by priority, then by due date
        _tasks.sort((a, b) {
          const order = {'urgent': 0, 'high': 1, 'medium': 2, 'low': 3};
          final pa = order[a.priority] ?? 2;
          final pb = order[b.priority] ?? 2;
          if (pa != pb) return pa.compareTo(pb);
          if (a.dueDate != null && b.dueDate != null) {
            return a.dueDate!.compareTo(b.dueDate!);
          }
          return 0;
        });
        _error = null;
      } else {
        _error = result['error'];
      }
    } catch (e) {
      _error = 'فشل تحميل المهام';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> createTask({
    required String title,
    String? description,
    String priority = 'medium',
    String category = 'personal',
    DateTime? dueDate,
    bool isRecurring = false,
    String? recurrencePattern,
  }) async {
    try {
      final result = await ApiService.createTask({
        'title': title,
        'description': description,
        'priority': priority,
        'category': category,
        'due_date': dueDate?.toIso8601String(),
        'is_recurring': isRecurring,
        'recurrence_pattern': recurrencePattern,
      });

      if (result['success']) {
        await loadTasks(); // Refresh
        return true;
      }
      _error = result['error'];
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'فشل إنشاء المهمة';
      notifyListeners();
      return false;
    }
  }

  Future<bool> completeTask(String id) async {
    // Optimistic update
    final idx = _tasks.indexWhere((t) => t.id == id);
    if (idx != -1) {
      _tasks[idx] = _tasks[idx].copyWith(status: 'completed');
      notifyListeners();
    }

    try {
      final result = await ApiService.updateTask(id, {'status': 'completed'});
      if (!result['success']) {
        // Revert on failure
        if (idx != -1) {
          _tasks[idx] = _tasks[idx].copyWith(status: 'pending');
          notifyListeners();
        }
        return false;
      }
      return true;
    } catch (e) {
      if (idx != -1) {
        _tasks[idx] = _tasks[idx].copyWith(status: 'pending');
        notifyListeners();
      }
      return false;
    }
  }

  Future<bool> deleteTask(String id) async {
    try {
      final result = await ApiService.deleteTask(id);
      if (result['success']) {
        _tasks.removeWhere((t) => t.id == id);
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}

// ============================================================

/**
 * Habit Provider - مزود العادات
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
    // Optimistic update
    final idx = _habits.indexWhere((h) => h.id == habitId);
    if (idx == -1) return false;

    try {
      final result = await ApiService.checkInHabit(habitId);
      if (result['success']) {
        await loadHabits(); // Refresh to get updated streak
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
