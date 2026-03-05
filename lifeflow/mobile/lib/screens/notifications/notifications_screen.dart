/**
 * Notifications Screen - شاشة الإشعارات
 */
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/notification_provider.dart';
import '../../utils/app_constants.dart';

class NotificationsScreen extends StatefulWidget {
  static const routeName = '/notifications';
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationProvider>().loadNotifications();
    });
  }

  IconData _getIcon(String type) {
    switch (type) {
      case 'task_reminder': return Icons.check_circle_outline;
      case 'habit_reminder': return Icons.track_changes;
      case 'mood_reminder': return Icons.sentiment_satisfied_alt;
      case 'achievement': return Icons.emoji_events;
      case 'coaching': return Icons.psychology;
      default: return Icons.notifications;
    }
  }

  Color _getColor(String type) {
    switch (type) {
      case 'task_reminder': return AppConstants.accentGreen;
      case 'habit_reminder': return AppConstants.primaryPurple;
      case 'mood_reminder': return AppConstants.accentPink;
      case 'achievement': return AppConstants.accentOrange;
      case 'coaching': return AppConstants.secondaryTeal;
      default: return Colors.white54;
    }
  }

  String _formatTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
    if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      appBar: AppBar(
        backgroundColor: AppConstants.darkSurface,
        title: const Text('الإشعارات',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          Consumer<NotificationProvider>(
            builder: (_, provider, __) => provider.unreadCount > 0
                ? TextButton(
                    onPressed: () => provider.markAllAsRead(),
                    child: Text(
                      'قراءة الكل',
                      style: const TextStyle(color: AppConstants.primaryPurple, fontSize: 12),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
      body: Consumer<NotificationProvider>(
        builder: (context, provider, _) {
          if (provider.isLoading) {
            return const Center(
                child: CircularProgressIndicator(color: AppConstants.primaryPurple));
          }

          final notifs = provider.notifications;
          if (notifs.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: AppConstants.primaryPurple.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.notifications_none,
                        size: 36, color: AppConstants.primaryPurple),
                  ),
                  const SizedBox(height: 16),
                  const Text('لا توجد إشعارات',
                      style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('ستظهر إشعاراتك هنا',
                      style: TextStyle(color: Colors.white.withOpacity(0.5))),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => provider.loadNotifications(),
            color: AppConstants.primaryPurple,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: notifs.length,
              itemBuilder: (context, index) {
                final n = notifs[index];
                final color = _getColor(n.type);
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    color: n.isRead
                        ? AppConstants.darkCard.withOpacity(0.5)
                        : AppConstants.darkCard,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: n.isRead
                          ? AppConstants.darkBorder
                          : color.withOpacity(0.3),
                    ),
                  ),
                  child: ListTile(
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    leading: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(_getIcon(n.type), color: color, size: 20),
                    ),
                    title: Text(
                      n.title,
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight:
                            n.isRead ? FontWeight.normal : FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(n.body,
                            style: TextStyle(
                                color: Colors.white.withOpacity(0.55),
                                fontSize: 12)),
                        const SizedBox(height: 4),
                        Text(
                          _formatTime(n.createdAt),
                          style: TextStyle(
                              color: Colors.white.withOpacity(0.35),
                              fontSize: 11),
                        ),
                      ],
                    ),
                    trailing: !n.isRead
                        ? GestureDetector(
                            onTap: () => provider.markAsRead(n.id),
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                  color: color, shape: BoxShape.circle),
                            ),
                          )
                        : null,
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
