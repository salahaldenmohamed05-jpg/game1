/**
 * Socket.IO Service — خدمة الاتصال المباشر
 * ==========================================
 * Phase B: Flutter parity — connects to backend Socket.IO for
 * real-time notifications and proactive AI messages.
 *
 * Events listened:
 *   - 'notification'       → new notification from server
 *   - 'proactive_message'  → AI proactive suggestion/alert
 *   - 'task_update'        → task changed remotely
 *   - 'connect'            → connected to server
 *   - 'disconnect'         → disconnected from server
 *
 * Usage:
 *   SocketService.instance.connect(token);
 *   SocketService.instance.onNotification = (data) { ... };
 *   SocketService.instance.disconnect();
 */
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/notification_service.dart';

/// Lightweight Socket.IO-like polling client.
/// Since we cannot add socket_io_client pub dependency in sandbox,
/// we simulate real-time via long-polling the /notifications/upcoming endpoint.
/// In production, replace with socket_io_client package.
class SocketService {
  static final SocketService instance = SocketService._internal();
  SocketService._internal();

  static const String _baseUrl = 'http://10.0.2.2:5000';
  String? _token;
  Timer? _pollTimer;
  bool _connected = false;
  int _lastNotifCount = 0;

  // Callbacks
  Function(Map<String, dynamic>)? onNotification;
  Function(Map<String, dynamic>)? onProactiveMessage;
  Function()? onConnected;
  Function()? onDisconnected;

  bool get isConnected => _connected;

  /// Connect to the backend and start listening for events.
  void connect(String token) {
    _token = token;
    _connected = true;

    // Poll every 30 seconds for new notifications/proactive messages
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) => _poll());

    // Initial poll
    _poll();
    onConnected?.call();
  }

  /// Disconnect and stop polling.
  void disconnect() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _connected = false;
    _token = null;
    onDisconnected?.call();
  }

  /// Join user room (called after auth).
  void joinRoom(String userId) {
    // In real socket.io, this would emit('join', userId)
    // With polling, we just ensure we're connected
    if (!_connected && _token != null) {
      connect(_token!);
    }
  }

  /// Poll for new notifications.
  Future<void> _poll() async {
    if (_token == null || !_connected) return;

    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/api/v1/notifications?limit=5'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final body = jsonDecode(utf8.decode(response.bodyBytes));
        final data = body['data'];

        if (data is Map && data['notifications'] is List) {
          final notifs = data['notifications'] as List;

          // Check for new notifications
          if (notifs.length > _lastNotifCount && _lastNotifCount > 0) {
            final newCount = notifs.length - _lastNotifCount;
            for (var i = 0; i < newCount && i < notifs.length; i++) {
              final notif = notifs[i] as Map<String, dynamic>;

              // Fire callback
              onNotification?.call(notif);

              // Show local notification
              final title = notif['title'] ?? 'LifeFlow';
              final notifBody = notif['body'] ?? notif['message'] ?? '';
              final type = notif['type'] ?? '';

              if (type.contains('proactive') || type.contains('ai_')) {
                onProactiveMessage?.call(notif);
              }

              await NotificationService.showNotification(
                id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
                title: title.toString(),
                body: notifBody.toString(),
              );
            }
          }
          _lastNotifCount = notifs.length;
        }
      }
    } catch (_) {
      // Silent failure — polling will retry
    }
  }
}
