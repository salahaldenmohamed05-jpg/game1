/**
 * Notification Provider - مزود الإشعارات
 * ==========================================
 */

import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_service.dart';

class NotificationProvider extends ChangeNotifier {
  List<AppNotification> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = false;

  List<AppNotification> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get isLoading => _isLoading;

  Future<void> loadNotifications() async {
    _isLoading = true;
    notifyListeners();

    try {
      final result = await ApiService.getNotifications(limit: 30);
      if (result['success'] == true) {
        final rawData = result['data'];
        final data = rawData is Map ? rawData['data'] ?? rawData : rawData;
        final notifList = (data['notifications'] as List<dynamic>?) ?? [];
        _notifications = notifList
            .map((n) => AppNotification.fromJson(n as Map<String, dynamic>))
            .toList();
        _unreadCount = _notifications.where((n) => !n.isRead).length;
      }
    } catch (e) {
      debugPrint('Notification load error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> markAsRead(String id) async {
    try {
      await ApiService.markNotificationRead(id);
      _notifications = _notifications.map((n) {
        if (n.id == id) {
          return AppNotification(
            id: n.id, type: n.type, title: n.title,
            body: n.body, isRead: true, createdAt: n.createdAt,
          );
        }
        return n;
      }).toList();
      _unreadCount = _notifications.where((n) => !n.isRead).length;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> markAllAsRead() async {
    try {
      await ApiService.markAllNotificationsRead();
      _notifications = _notifications.map((n) => AppNotification(
        id: n.id, type: n.type, title: n.title,
        body: n.body, isRead: true, createdAt: n.createdAt,
      )).toList();
      _unreadCount = 0;
      notifyListeners();
    } catch (_) {}
  }
}
