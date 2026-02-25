/**
 * Notification Provider - مزود الإشعارات
 * ==========================================
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
