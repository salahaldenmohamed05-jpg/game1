/**
 * Home Screen - Phase C: Assistant-First Design
 * ================================================
 * Phase C UX: Assistant is the DEFAULT tab (index 0).
 * Bottom nav: [ المساعد | المهام | العادات | المزاج | الرئيسية ]
 * 
 * Every screen answers: "What should I do now?"
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/task_provider.dart';
import '../../providers/habit_provider.dart';
import '../../providers/mood_provider.dart';
import '../../providers/ai_provider.dart';
import '../../providers/notification_provider.dart';
import '../../utils/app_constants.dart';
import '../home/dashboard_tab.dart';
import '../tasks/tasks_screen.dart';
import '../habits/habits_screen.dart';
import '../mood/mood_screen.dart';
import '../chat/chat_screen.dart';

class HomeScreen extends StatefulWidget {
  static const routeName = '/home';

  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  // Phase C: Assistant-first — default tab is ChatScreen (index 0)
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    ChatScreen(),      // Phase C: Assistant is FIRST
    TasksScreen(),
    HabitsScreen(),
    MoodScreen(),
    DashboardTab(),    // Dashboard moved to last — secondary view
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
    });
  }

  void _loadData() {
    context.read<TaskProvider>().loadTasks();
    context.read<HabitProvider>().loadHabits();
    context.read<MoodProvider>().loadMoodHistory();
    context.read<AIProvider>().loadSuggestions();
    context.read<NotificationProvider>().loadNotifications();
  }

  @override
  Widget build(BuildContext context) {
    final notifCount = context.watch<NotificationProvider>().unreadCount;

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: _buildBottomNav(notifCount),
    );
  }

  Widget _buildBottomNav(int notifCount) {
    return Container(
      decoration: BoxDecoration(
        color: AppConstants.darkSurface,
        border: Border(
          top: BorderSide(
            color: AppConstants.darkBorder,
            width: 1,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              // Phase C: Assistant is FIRST tab with highlight
              _NavItem(
                icon: Icons.auto_awesome_rounded,
                label: 'المساعد',
                isActive: _currentIndex == 0,
                onTap: () => setState(() => _currentIndex = 0),
                isHighlighted: true,
              ),
              _NavItem(
                icon: Icons.check_box_rounded,
                label: 'المهام',
                isActive: _currentIndex == 1,
                onTap: () => setState(() => _currentIndex = 1),
                badge: context.watch<TaskProvider>().pendingCount,
              ),
              _NavItem(
                icon: Icons.local_fire_department_rounded,
                label: 'العادات',
                isActive: _currentIndex == 2,
                onTap: () => setState(() => _currentIndex = 2),
              ),
              _NavItem(
                icon: Icons.favorite_rounded,
                label: 'المزاج',
                isActive: _currentIndex == 3,
                onTap: () => setState(() => _currentIndex = 3),
              ),
              _NavItem(
                icon: Icons.home_rounded,
                label: 'الرئيسية',
                isActive: _currentIndex == 4,
                onTap: () => setState(() => _currentIndex = 4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final int badge;
  final bool isHighlighted;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
    this.badge = 0,
    this.isHighlighted = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: AppConstants.animFast,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isActive
              ? AppConstants.primaryPurple.withOpacity(0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(AppConstants.radiusM),
          // Phase C: highlighted assistant tab gets a subtle glow
          border: isHighlighted && !isActive
              ? Border.all(color: AppConstants.primaryPurple.withOpacity(0.15))
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  icon,
                  size: 24,
                  color: isActive
                      ? AppConstants.primaryPurple
                      : isHighlighted
                          ? AppConstants.primaryPurple.withOpacity(0.6)
                          : AppConstants.textMuted,
                ),
                if (badge > 0)
                  Positioned(
                    right: -6,
                    top: -6,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                        color: AppConstants.accentRed,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          badge > 9 ? '9+' : badge.toString(),
                          style: const TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontFamily: AppConstants.fontFamily,
                fontSize: 10,
                fontWeight:
                    isActive ? FontWeight.w600 : FontWeight.w400,
                color: isActive
                    ? AppConstants.primaryPurple
                    : isHighlighted
                        ? AppConstants.primaryPurple.withOpacity(0.5)
                        : AppConstants.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
