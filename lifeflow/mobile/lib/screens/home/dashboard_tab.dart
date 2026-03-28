/**
 * Dashboard Tab - Phase C: Simplified Today Flow
 * ==================================================
 * Phase C: Dashboard is now a SECONDARY view.
 * Simplified to focus on:
 *   1. Today Summary (progress bar)
 *   2. Smart Action Buttons
 *   3. Tasks + Habits (compact interactive lists)
 *   4. Engagement feedback
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/task_provider.dart';
import '../../providers/habit_provider.dart';
import '../../providers/mood_provider.dart';
import '../../utils/app_constants.dart';
import '../../widgets/stat_card.dart';
import '../../services/api_service.dart';

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
    if (hour < 12) return 'صباح الخير ☀️';
    if (hour < 17) return 'مساء النور 🌤';
    if (hour < 21) return 'مساء الخير 🌆';
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
            // Compact Header
            SliverAppBar(
              expandedHeight: 100,
              floating: false,
              pinned: false,
              backgroundColor: Colors.transparent,
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  padding: const EdgeInsets.fromLTRB(20, 60, 20, 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _getGreeting(),
                            style: const TextStyle(
                              fontFamily: AppConstants.fontFamily,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: AppConstants.textPrimary,
                            ),
                          ),
                          Text(
                            user?.name ?? '',
                            style: const TextStyle(
                              fontFamily: AppConstants.fontFamily,
                              fontSize: 14,
                              color: AppConstants.textMuted,
                            ),
                          ),
                        ],
                      ),
                      // Productivity Score Badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppConstants.primaryPurple.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '🏆 ${summary?['productivity_score'] ?? 0}',
                          style: const TextStyle(
                            fontFamily: AppConstants.fontFamily,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppConstants.primaryPurple,
                          ),
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
                  // Phase C: Today Progress Card
                  _TodayProgressCard(summary: summary),
                  const SizedBox(height: 12),

                  // Engagement reward
                  if ((summary?['tasks']?['completed'] ?? 0) >= 1)
                    _EngagementReward(summary: summary),

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

// Phase C: Today Progress Card with progress bar
class _TodayProgressCard extends StatelessWidget {
  final Map<String, dynamic>? summary;

  const _TodayProgressCard({this.summary});

  @override
  Widget build(BuildContext context) {
    final tasksTotal = summary?['tasks']?['total'] ?? 0;
    final tasksCompleted = summary?['tasks']?['completed'] ?? 0;
    final habitsTotal = summary?['habits']?['total'] ?? 0;
    final habitsCompleted = summary?['habits']?['completed'] ?? 0;
    final overdue = summary?['tasks']?['overdue'] ?? 0;

    final totalItems = tasksTotal + habitsTotal;
    final doneItems = tasksCompleted + habitsCompleted;
    final progressPct = totalItems > 0 ? (doneItems / totalItems) : 0.0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppConstants.darkCard,
        borderRadius: BorderRadius.circular(AppConstants.radiusL),
        border: Border.all(color: AppConstants.darkBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'تقدم اليوم',
                style: TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppConstants.textPrimary,
                ),
              ),
              Text(
                '${(progressPct * 100).round()}%',
                style: const TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: AppConstants.primaryPurple,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progressPct,
              minHeight: 8,
              backgroundColor: AppConstants.darkBorder,
              valueColor: AlwaysStoppedAnimation<Color>(
                progressPct >= 0.8
                    ? AppConstants.accentGreen
                    : progressPct >= 0.5
                        ? AppConstants.primaryPurple
                        : AppConstants.accentOrange,
              ),
            ),
          ),
          if (overdue > 0) ...[
            const SizedBox(height: 8),
            Text(
              '⚠️ $overdue مهمة متأخرة',
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                fontSize: 11,
                color: AppConstants.accentRed,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// Phase C: Engagement Reward
class _EngagementReward extends StatelessWidget {
  final Map<String, dynamic>? summary;

  const _EngagementReward({this.summary});

  @override
  Widget build(BuildContext context) {
    final tasksCompleted = summary?['tasks']?['completed'] ?? 0;
    final habitsCompleted = summary?['habits']?['completed'] ?? 0;

    String message;
    Color color;
    if (tasksCompleted >= 5 && habitsCompleted >= 3) {
      message = 'أداء استثنائي! أنت نجم اليوم ⭐';
      color = AppConstants.accentOrange;
    } else if (tasksCompleted >= 3) {
      message = 'أحسنت! استمر بهذا الإيقاع 🔥';
      color = AppConstants.accentOrange;
    } else {
      message = 'بداية رائعة! كمّل وما توقفش 💪';
      color = AppConstants.accentGreen;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppConstants.radiusM),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Text(
        message,
        style: TextStyle(
          fontFamily: AppConstants.fontFamily,
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: color,
        ),
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
            fontSize: 15,
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
        padding: const EdgeInsets.all(16),
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
      children: tasks.take(4).map((task) {
        return Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppConstants.darkCard,
            borderRadius: BorderRadius.circular(AppConstants.radiusM),
            border: Border.all(color: AppConstants.darkBorder),
          ),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppConstants.priorityColors[task.priority] ??
                      AppConstants.textMuted,
                ),
              ),
              const SizedBox(width: 10),
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
        padding: const EdgeInsets.all(16),
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
      spacing: 8,
      runSpacing: 8,
      children: habits.take(6).map((habit) {
        return GestureDetector(
          onTap: () async {
            if (!habit.completedToday) {
              await habitProvider.checkIn(habit.id);
            }
          },
          child: Container(
            width: (MediaQuery.of(context).size.width - 60) / 3,
            padding: const EdgeInsets.all(10),
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
                Text(habit.icon ?? '⭐', style: const TextStyle(fontSize: 24)),
                const SizedBox(height: 4),
                Text(
                  habit.name,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 10,
                    color: AppConstants.textSecondary,
                  ),
                ),
                if (habit.currentStreak > 0) ...[
                  const SizedBox(height: 2),
                  Text(
                    '🔥${habit.currentStreak}',
                    style: const TextStyle(
                      fontSize: 9,
                      color: AppConstants.accentOrange,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                if (habit.completedToday)
                  const Text(
                    '✓',
                    style: TextStyle(
                      fontSize: 10,
                      color: AppConstants.accentGreen,
                      fontWeight: FontWeight.w700,
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
