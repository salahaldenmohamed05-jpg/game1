/**
 * Notification Service - خدمة الإشعارات المحلية
 * ================================================
 */

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz_data;

class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static Future<void> initialize() async {
    tz_data.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Africa/Cairo'));

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _plugin.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
    );
  }

  static void _onNotificationTap(NotificationResponse details) {
    // Handle notification tap - navigate to relevant screen
    // This will be wired to the navigator in main.dart
  }

  static const _channel = AndroidNotificationDetails(
    'lifeflow_channel',
    'LifeFlow Reminders',
    channelDescription: 'تذكيرات LifeFlow الذكية',
    importance: Importance.high,
    priority: Priority.high,
    playSound: true,
    enableVibration: true,
    icon: '@mipmap/ic_launcher',
    color: Color(0xFF6C63FF),
  );

  // Schedule a habit reminder
  static Future<void> scheduleHabitReminder({
    required int id,
    required String habitName,
    required String time, // "HH:MM"
  }) async {
    final parts = time.split(':');
    final hour = int.parse(parts[0]);
    final minute = int.parse(parts[1]);

    final now = DateTime.now();
    var scheduled = DateTime(now.year, now.month, now.day, hour, minute);
    if (scheduled.isBefore(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }

    await _plugin.zonedSchedule(
      id,
      'تذكير: $habitName 🌟',
      'حان وقت $habitName! حافظ على تقدمك اليومي',
      tz.TZDateTime.from(scheduled, tz.local),
      NotificationDetails(android: _channel),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
          UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }

  // Send immediate notification
  static Future<void> showNotification({
    required int id,
    required String title,
    required String body,
  }) async {
    await _plugin.show(
      id,
      title,
      body,
      NotificationDetails(android: _channel),
    );
  }

  // Cancel a notification
  static Future<void> cancelNotification(int id) async {
    await _plugin.cancel(id);
  }

  // Cancel all notifications
  static Future<void> cancelAll() async {
    await _plugin.cancelAll();
  }

  // Schedule daily mood check reminder at 21:00
  static Future<void> scheduleDailyMoodCheck() async {
    await _plugin.zonedSchedule(
      9999,
      'كيف كان مزاجك اليوم؟ 🌙',
      'سجّل مزاجك الآن وتابع تطورك النفسي',
      _nextInstanceOfTime(21, 0),
      NotificationDetails(android: _channel),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
          UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }

  static tz.TZDateTime _nextInstanceOfTime(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (scheduled.isBefore(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }
}

// Needed import for Color
class Color {
  final int value;
  const Color(this.value);
}
