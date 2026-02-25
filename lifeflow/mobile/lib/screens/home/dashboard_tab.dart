/**
 * Dashboard Tab - تبويب لوحة التحكم
 * ====================================
 * الشاشة الرئيسية للتطبيق
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/task_provider.dart';
import '../../providers/habit_provider.dart';
import '../../providers/mood_provider.dart';
import '../../providers/ai_provider.dart';
import '../../utils/app_constants.dart';
import '../../widgets/gradient_card.dart';
import '../../widgets/stat_card.dart';
import '../../services/api_service.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class DashboardTab extends StatefulWidget {
  const DashboardTab({super.key});

  @override
  State<DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<DashboardTab> {
  Map<String, dynamic>? _dashData;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() => _isLoading = true);
    try {
      final result = await ApiService.getDashboard();
      if (result['success']) {
        setState(() {
          _dashData = result['data']['data'];
          _isLoading = false;
        });
      } else {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'صباح الخير 🌅';
    if (hour < 17) return 'مساء النور 🌤';
    if (hour < 21) return 'طاب مساؤك 🌆';
    return 'تصبح على خير 🌙';
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final tasks = context.watch<TaskProvider>();
    final habits = context.watch<HabitProvider>();
    final mood = context.watch<MoodProvider>();

    final summary = _dashData?['summary'];

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      body: RefreshIndicator(
        onRefresh: _loadDashboard,
        color: AppConstants.primaryPurple,
        backgroundColor: AppConstants.darkCard,
        child: CustomScrollView(
          slivers: [
            // Header
            SliverAppBar(
              expandedHeight: 140,
              floating: false,
              pinned: false,
              backgroundColor: Colors.transparent,
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topRight,
                      end: Alignment.bottomLeft,
                      colors: [
                        AppConstants.primaryPurple.withOpacity(0.2),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(20, 60, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _getGreeting(),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        user?.name ?? '',
                        style: const TextStyle(
                          fontFamily: AppConstants.fontFamily,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: AppConstants.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Content
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Smart Suggestion
                  if (_dashData?['smart_suggestion'] != null) ...[
                    _SmartSuggestionCard(
                      suggestion: _dashData!['smart_suggestion'],
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Stats Row
                  Row(
                    children: [
                      Expanded(
                        child: StatCard(
                          emoji: '✅',
                          label: 'المهام',
                          value: '${summary?['tasks']?['completed'] ?? 0}/${summary?['tasks']?['total'] ?? 0}',
                          color: AppConstants.primaryPurple,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: StatCard(
                          emoji: '🔥',
                          label: 'العادات',
                          value: '${summary?['habits']?['percentage'] ?? 0}%',
                          color: AppConstants.accentOrange,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: StatCard(
                          emoji: mood.hasCheckedInToday ? '😊' : '🌙',
                          label: 'المزاج',
                          value: mood.hasCheckedInToday
                              ? '${mood.todayMood!.moodScore}/10'
                              : 'لم يُسجَّل',
                          color: AppConstants.accentPink,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: StatCard(
                          emoji: '⭐',
                          label: 'الإنتاجية',
                          value: '${summary?['productivity_score'] ?? 0}',
                          color: AppConstants.accentGreen,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  // Today's Tasks
                  _SectionHeader(title: 'مهام اليوم', icon: '📋'),
                  const SizedBox(height: 8),
                  _TodayTasksList(),

                  const SizedBox(height: 20),

                  // Today's Habits
                  _SectionHeader(title: 'عادات اليوم', icon: '🏃'),
                  const SizedBox(height: 8),
                  _TodayHabitsList(),

                  const SizedBox(height: 100),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Smart Suggestion Card
class _SmartSuggestionCard extends StatelessWidget {
  final Map<String, dynamic> suggestion;

  const _SmartSuggestionCard({required this.suggestion});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.paddingM),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppConstants.primaryPurple.withOpacity(0.15),
            AppConstants.secondaryTeal.withOpacity(0.10),
          ],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusL),
        border: Border.all(
          color: AppConstants.primaryPurple.withOpacity(0.3),
        ),
      ),
      child: Row(
        children: [
          const Text('💡', style: TextStyle(fontSize: 24)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'اقتراح ذكي',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppConstants.primaryPurple,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  suggestion['suggestion'] ?? '',
                  style: const TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 13,
                    color: AppConstants.textPrimary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Section Header
class _SectionHeader extends StatelessWidget {
  final String title;
  final String icon;

  const _SectionHeader({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(icon, style: const TextStyle(fontSize: 16)),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppConstants.textPrimary,
          ),
        ),
      ],
    );
  }
}

// Today's Tasks List
class _TodayTasksList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final tasks = context.watch<TaskProvider>().todayTasks;

    if (tasks.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppConstants.darkCard,
          borderRadius: BorderRadius.circular(AppConstants.radiusL),
          border: Border.all(color: AppConstants.darkBorder),
        ),
        child: const Center(
          child: Text(
            'لا توجد مهام لليوم 🎉',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 13,
              color: AppConstants.textMuted,
            ),
          ),
        ),
      );
    }

    return Column(
      children: tasks.take(5).map((task) {
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppConstants.darkCard,
            borderRadius: BorderRadius.circular(AppConstants.radiusM),
            border: Border.all(color: AppConstants.darkBorder),
          ),
          child: Row(
            children: [
              // Priority dot
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppConstants.priorityColors[task.priority] ??
                      AppConstants.textMuted,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  task.title,
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 13,
                    color: task.isCompleted
                        ? AppConstants.textMuted
                        : AppConstants.textPrimary,
                    decoration:
                        task.isCompleted ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
              if (task.isCompleted)
                const Icon(Icons.check_circle,
                    size: 16, color: AppConstants.accentGreen),
            ],
          ),
        );
      }).toList(),
    );
  }
}

// Today's Habits List
class _TodayHabitsList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final habits = context.watch<HabitProvider>().habits;
    final habitProvider = context.read<HabitProvider>();

    if (habits.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppConstants.darkCard,
          borderRadius: BorderRadius.circular(AppConstants.radiusL),
          border: Border.all(color: AppConstants.darkBorder),
        ),
        child: const Center(
          child: Text(
            'لا توجد عادات مضافة بعد',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 13,
              color: AppConstants.textMuted,
            ),
          ),
        ),
      );
    }

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: habits.take(6).map((habit) {
        return GestureDetector(
          onTap: () async {
            if (!habit.completedToday) {
              await habitProvider.checkIn(habit.id);
            }
          },
          child: Container(
            width: (MediaQuery.of(context).size.width - 60) / 3,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: habit.completedToday
                  ? AppConstants.primaryPurple.withOpacity(0.15)
                  : AppConstants.darkCard,
              borderRadius: BorderRadius.circular(AppConstants.radiusL),
              border: Border.all(
                color: habit.completedToday
                    ? AppConstants.primaryPurple.withOpacity(0.4)
                    : AppConstants.darkBorder,
              ),
            ),
            child: Column(
              children: [
                Text(
                  habit.icon ?? '⭐',
                  style: const TextStyle(fontSize: 26),
                ),
                const SizedBox(height: 6),
                Text(
                  habit.name,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 11,
                    color: AppConstants.textSecondary,
                  ),
                ),
                if (habit.currentStreak > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '🔥 ${habit.currentStreak}',
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppConstants.accentOrange,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                if (habit.completedToday)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text(
                      '✓ أنجزت',
                      style: TextStyle(
                        fontSize: 9,
                        color: AppConstants.accentGreen,
                        fontWeight: FontWeight.w600,
                        fontFamily: AppConstants.fontFamily,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}
