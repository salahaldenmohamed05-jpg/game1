/**
 * Habits Screen - شاشة العادات
 * ================================
 * تتبع وإدارة العادات اليومية
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/habit_provider.dart';
import '../../models/models.dart';
import '../../utils/app_constants.dart';

class HabitsScreen extends StatefulWidget {
  const HabitsScreen({super.key});

  @override
  State<HabitsScreen> createState() => _HabitsScreenState();
}

class _HabitsScreenState extends State<HabitsScreen> {
  void _showAddHabitSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AddHabitSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final habitProvider = context.watch<HabitProvider>();
    final habits = habitProvider.habits;
    final progress = habitProvider.todayProgress;

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      appBar: AppBar(title: const Text('العادات')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddHabitSheet,
        icon: const Icon(Icons.add),
        label: const Text(
          'عادة جديدة',
          style: TextStyle(fontFamily: AppConstants.fontFamily, fontWeight: FontWeight.w600),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: habitProvider.loadHabits,
        color: AppConstants.primaryPurple,
        backgroundColor: AppConstants.darkCard,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Progress Overview Card
            _ProgressCard(
              completedCount: habitProvider.completedToday,
              totalCount: habits.length,
              progress: progress,
            ),

            const SizedBox(height: 20),

            // Section title
            const Row(
              children: [
                Text('🏃', style: TextStyle(fontSize: 18)),
                SizedBox(width: 8),
                Text(
                  'عادات اليوم',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppConstants.textPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Habits Grid
            if (habitProvider.isLoading)
              const Center(
                child: CircularProgressIndicator(color: AppConstants.primaryPurple),
              )
            else if (habits.isEmpty)
              _EmptyHabits(onAdd: _showAddHabitSheet)
            else
              ...habits.map((habit) => _HabitCard(
                    habit: habit,
                    onCheckIn: () => context.read<HabitProvider>().checkIn(habit.id),
                  )),

            const SizedBox(height: 100),
          ],
        ),
      ),
    );
  }
}

// Progress Card
class _ProgressCard extends StatelessWidget {
  final int completedCount;
  final int totalCount;
  final double progress;

  const _ProgressCard({
    required this.completedCount,
    required this.totalCount,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppConstants.primaryPurple.withOpacity(0.2),
            AppConstants.accentGreen.withOpacity(0.1),
          ],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusXL),
        border: Border.all(color: AppConstants.primaryPurple.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'تقدم اليوم',
                    style: TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 12,
                      color: AppConstants.textMuted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$completedCount/$totalCount عادة',
                    style: const TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: AppConstants.textPrimary,
                    ),
                  ),
                ],
              ),
              SizedBox(
                width: 80,
                height: 80,
                child: Stack(
                  children: [
                    CircularProgressIndicator(
                      value: progress,
                      strokeWidth: 8,
                      backgroundColor: AppConstants.darkBorder,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        progress == 1
                            ? AppConstants.accentGreen
                            : AppConstants.primaryPurple,
                      ),
                    ),
                    Center(
                      child: Text(
                        '${(progress * 100).toInt()}%',
                        style: const TextStyle(
                          fontFamily: AppConstants.fontFamily,
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: AppConstants.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (progress == 1) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: AppConstants.accentGreen.withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                '🎉 أحسنت! أكملت جميع عاداتك اليوم',
                style: TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 13,
                  color: AppConstants.accentGreen,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// Habit Card
class _HabitCard extends StatelessWidget {
  final Habit habit;
  final VoidCallback onCheckIn;

  const _HabitCard({required this.habit, required this.onCheckIn});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppConstants.darkCard,
        borderRadius: BorderRadius.circular(AppConstants.radiusL),
        border: Border.all(
          color: habit.completedToday
              ? AppConstants.primaryPurple.withOpacity(0.4)
              : AppConstants.darkBorder,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: habit.completedToday
                ? AppConstants.primaryPurple.withOpacity(0.15)
                : AppConstants.darkSurface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(
              habit.icon ?? '⭐',
              style: const TextStyle(fontSize: 26),
            ),
          ),
        ),
        title: Text(
          habit.name,
          style: const TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppConstants.textPrimary,
          ),
        ),
        subtitle: Row(
          children: [
            // Streak
            if (habit.currentStreak > 0) ...[
              const Text('🔥', style: TextStyle(fontSize: 12)),
              const SizedBox(width: 3),
              Text(
                '${habit.currentStreak} يوم',
                style: const TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 11,
                  color: AppConstants.accentOrange,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 12),
            ],
            // Frequency
            Text(
              habit.frequency == 'daily' ? 'يومياً' :
              habit.frequency == 'weekly' ? 'أسبوعياً' : habit.frequency,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                fontSize: 11,
                color: AppConstants.textMuted,
              ),
            ),
          ],
        ),
        trailing: habit.completedToday
            ? Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppConstants.accentGreen.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppConstants.accentGreen.withOpacity(0.3),
                  ),
                ),
                child: const Text(
                  '✓ أنجزت',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 11,
                    color: AppConstants.accentGreen,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            : ElevatedButton(
                onPressed: onCheckIn,
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(70, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
                child: const Text(
                  'تسجيل',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
      ),
    );
  }
}

// Empty Habits
class _EmptyHabits extends StatelessWidget {
  final VoidCallback onAdd;

  const _EmptyHabits({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          const SizedBox(height: 40),
          const Text('🌱', style: TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          const Text(
            'لا توجد عادات بعد',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 16,
              color: AppConstants.textMuted,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'ابدأ ببناء عادات إيجابية تحسّن حياتك',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 13,
              color: AppConstants.textMuted,
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add, size: 18),
            label: const Text(
              'إضافة عادة',
              style: TextStyle(fontFamily: AppConstants.fontFamily),
            ),
          ),
        ],
      ),
    );
  }
}

// Add Habit Sheet
class _AddHabitSheet extends StatefulWidget {
  const _AddHabitSheet();

  @override
  State<_AddHabitSheet> createState() => _AddHabitSheetState();
}

class _AddHabitSheetState extends State<_AddHabitSheet> {
  final _nameController = TextEditingController();
  String _selectedIcon = '⭐';
  String _frequency = 'daily';
  bool _isLoading = false;

  final List<String> _icons = [
    '💧', '🏃', '📚', '🧘', '😴', '🥗', '🌱', '🤲',
    '💪', '🎯', '✍️', '🎨', '🎵', '🚶', '☕', '🌅',
  ];

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty) return;

    setState(() => _isLoading = true);

    final success = await context.read<HabitProvider>().createHabit(
      name: _nameController.text.trim(),
      icon: _selectedIcon,
      frequency: _frequency,
    );

    if (success && mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إضافة العادة ✓', style: TextStyle(fontFamily: AppConstants.fontFamily)),
          backgroundColor: AppConstants.accentGreen,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } else if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      decoration: const BoxDecoration(
        color: AppConstants.darkSurface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppConstants.darkBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),

          const Text(
            'عادة جديدة',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppConstants.textPrimary,
            ),
          ),
          const SizedBox(height: 16),

          // Name
          TextField(
            controller: _nameController,
            autofocus: true,
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              color: AppConstants.textPrimary,
            ),
            decoration: const InputDecoration(
              hintText: 'اسم العادة (مثال: شرب ماء، رياضة...)',
              filled: true,
              fillColor: AppConstants.darkCard,
            ),
          ),
          const SizedBox(height: 16),

          // Icon picker
          const Text(
            'اختر أيقونة',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 13,
              color: AppConstants.textMuted,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 50,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: _icons.length,
              itemBuilder: (context, index) {
                final icon = _icons[index];
                return GestureDetector(
                  onTap: () => setState(() => _selectedIcon = icon),
                  child: AnimatedContainer(
                    duration: AppConstants.animFast,
                    margin: const EdgeInsets.only(left: 8),
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: _selectedIcon == icon
                          ? AppConstants.primaryPurple.withOpacity(0.2)
                          : AppConstants.darkCard,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: _selectedIcon == icon
                            ? AppConstants.primaryPurple
                            : AppConstants.darkBorder,
                      ),
                    ),
                    child: Center(
                      child: Text(icon, style: const TextStyle(fontSize: 22)),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),

          // Frequency
          DropdownButtonFormField<String>(
            value: _frequency,
            dropdownColor: AppConstants.darkCard,
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              color: AppConstants.textPrimary,
              fontSize: 14,
            ),
            decoration: const InputDecoration(
              labelText: 'التكرار',
              filled: true,
              fillColor: AppConstants.darkCard,
            ),
            items: const [
              DropdownMenuItem(value: 'daily', child: Text('يومياً')),
              DropdownMenuItem(value: 'weekly', child: Text('أسبوعياً')),
              DropdownMenuItem(value: 'weekdays', child: Text('أيام الأسبوع فقط')),
            ],
            onChanged: (v) => setState(() => _frequency = v!),
          ),
          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _submit,
              child: _isLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text(
                      'إضافة العادة',
                      style: TextStyle(
                        fontFamily: AppConstants.fontFamily,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
