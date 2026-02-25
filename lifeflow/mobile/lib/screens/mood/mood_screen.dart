/**
 * Mood Screen - شاشة المزاج
 * ============================
 * تتبع وتحليل المزاج اليومي
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/mood_provider.dart';
import '../../models/models.dart';
import '../../utils/app_constants.dart';

class MoodScreen extends StatefulWidget {
  const MoodScreen({super.key});

  @override
  State<MoodScreen> createState() => _MoodScreenState();
}

class _MoodScreenState extends State<MoodScreen> {
  @override
  Widget build(BuildContext context) {
    final moodProvider = context.watch<MoodProvider>();

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      appBar: AppBar(title: const Text('المزاج')),
      body: RefreshIndicator(
        onRefresh: moodProvider.loadMoodHistory,
        color: AppConstants.primaryPurple,
        backgroundColor: AppConstants.darkCard,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Check-in card or today's mood
            if (!moodProvider.hasCheckedInToday)
              _MoodCheckInCard()
            else
              _TodayMoodCard(mood: moodProvider.todayMood!),

            const SizedBox(height: 20),

            // Weekly overview
            if (moodProvider.moodHistory.isNotEmpty) ...[
              const _SectionTitle(title: 'أسبوع هذا المزاج', icon: '📊'),
              const SizedBox(height: 12),
              _WeeklyMoodChart(history: moodProvider.moodHistory),
              const SizedBox(height: 20),
              _WeeklyStats(history: moodProvider.moodHistory),
              const SizedBox(height: 20),
            ],

            // History
            const _SectionTitle(title: 'سجل المزاج', icon: '📅'),
            const SizedBox(height: 12),
            ...moodProvider.moodHistory.map(
              (entry) => _MoodHistoryCard(entry: entry),
            ),

            const SizedBox(height: 100),
          ],
        ),
      ),
    );
  }
}

// Mood Check-In Card
class _MoodCheckInCard extends StatefulWidget {
  @override
  State<_MoodCheckInCard> createState() => _MoodCheckInCardState();
}

class _MoodCheckInCardState extends State<_MoodCheckInCard> {
  int _selectedScore = 7;
  final List<String> _selectedEmotions = [];
  final _noteController = TextEditingController();
  bool _isLoading = false;

  final List<Map<String, dynamic>> _moodOptions = [
    {'score': 1, 'emoji': '😞', 'label': 'سيء جداً'},
    {'score': 2, 'emoji': '😔', 'label': 'سيء'},
    {'score': 3, 'emoji': '😕', 'label': 'ليس جيداً'},
    {'score': 4, 'emoji': '😐', 'label': 'عادي'},
    {'score': 5, 'emoji': '🙂', 'label': 'معتدل'},
    {'score': 6, 'emoji': '😊', 'label': 'جيد'},
    {'score': 7, 'emoji': '😄', 'label': 'جيد جداً'},
    {'score': 8, 'emoji': '😁', 'label': 'ممتاز'},
    {'score': 9, 'emoji': '🤩', 'label': 'رائع'},
    {'score': 10, 'emoji': '🌟', 'label': 'استثنائي'},
  ];

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _isLoading = true);

    final success = await context.read<MoodProvider>().logMood(
      score: _selectedScore,
      emotions: _selectedEmotions,
      note: _noteController.text.trim().isNotEmpty ? _noteController.text.trim() : null,
    );

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم تسجيل مزاجك ✓', style: TextStyle(fontFamily: AppConstants.fontFamily)),
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
    final selectedOption = _moodOptions.firstWhere(
      (o) => o['score'] == _selectedScore,
    );

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppConstants.accentPink.withOpacity(0.15),
            AppConstants.primaryPurple.withOpacity(0.10),
          ],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusXL),
        border: Border.all(color: AppConstants.accentPink.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          const Text('🌙', style: TextStyle(fontSize: 32)),
          const SizedBox(height: 8),
          const Text(
            'كيف كان مزاجك اليوم؟',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppConstants.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'سجّل كيف تشعر الآن',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 13,
              color: AppConstants.textMuted,
            ),
          ),

          const SizedBox(height: 20),

          // Selected mood display
          Text(
            selectedOption['emoji'],
            style: const TextStyle(fontSize: 56),
          ),
          Text(
            selectedOption['label'],
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppConstants.textPrimary,
            ),
          ),

          const SizedBox(height: 16),

          // Score Slider
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: AppConstants.primaryPurple,
              inactiveTrackColor: AppConstants.darkBorder,
              thumbColor: AppConstants.primaryPurple,
              overlayColor: AppConstants.primaryPurple.withOpacity(0.2),
              valueIndicatorColor: AppConstants.primaryPurple,
              valueIndicatorTextStyle: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
            child: Slider(
              value: _selectedScore.toDouble(),
              min: 1,
              max: 10,
              divisions: 9,
              label: _selectedScore.toString(),
              onChanged: (v) => setState(() => _selectedScore = v.round()),
            ),
          ),

          // Score numbers
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(10, (i) => Text(
                (i + 1).toString(),
                style: TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 11,
                  color: (i + 1) == _selectedScore
                      ? AppConstants.primaryPurple
                      : AppConstants.textMuted,
                  fontWeight: (i + 1) == _selectedScore
                      ? FontWeight.w700
                      : FontWeight.w400,
                ),
              )),
            ),
          ),

          const SizedBox(height: 16),

          // Emotions
          const Align(
            alignment: Alignment.centerRight,
            child: Text(
              'المشاعر (اختياري)',
              style: TextStyle(
                fontFamily: AppConstants.fontFamily,
                fontSize: 13,
                color: AppConstants.textMuted,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: AppConstants.moodEmotions.map((emotion) {
              final isSelected = _selectedEmotions.contains(emotion);
              return GestureDetector(
                onTap: () {
                  setState(() {
                    if (isSelected) {
                      _selectedEmotions.remove(emotion);
                    } else {
                      _selectedEmotions.add(emotion);
                    }
                  });
                },
                child: AnimatedContainer(
                  duration: AppConstants.animFast,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? AppConstants.primaryPurple.withOpacity(0.3)
                        : AppConstants.darkCard,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isSelected
                          ? AppConstants.primaryPurple
                          : AppConstants.darkBorder,
                    ),
                  ),
                  child: Text(
                    emotion,
                    style: TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 12,
                      color: isSelected
                          ? AppConstants.primaryPurple
                          : AppConstants.textSecondary,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 16),

          // Note
          TextField(
            controller: _noteController,
            maxLines: 2,
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              color: AppConstants.textPrimary,
              fontSize: 13,
            ),
            decoration: const InputDecoration(
              hintText: 'ملاحظة إضافية (اختياري)...',
              filled: true,
              fillColor: AppConstants.darkCard,
            ),
          ),
          const SizedBox(height: 16),

          // Submit
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
                      'تسجيل المزاج',
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

// Today's Mood Card (already checked in)
class _TodayMoodCard extends StatelessWidget {
  final MoodEntry mood;

  const _TodayMoodCard({required this.mood});

  @override
  Widget build(BuildContext context) {
    String emoji;
    if (mood.moodScore >= 9) emoji = '🤩';
    else if (mood.moodScore >= 7) emoji = '😄';
    else if (mood.moodScore >= 5) emoji = '😊';
    else if (mood.moodScore >= 3) emoji = '😔';
    else emoji = '😞';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppConstants.accentGreen.withOpacity(0.15),
            AppConstants.primaryPurple.withOpacity(0.10),
          ],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusXL),
        border: Border.all(color: AppConstants.accentGreen.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'مزاجك اليوم',
                style: TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 14,
                  color: AppConstants.textMuted,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppConstants.accentGreen.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  '✓ تم التسجيل',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 11,
                    color: AppConstants.accentGreen,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 52)),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${mood.moodScore}/10',
                    style: const TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      color: AppConstants.textPrimary,
                    ),
                  ),
                  Text(
                    AppConstants.moodLabels[mood.moodScore] ?? '',
                    style: const TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 14,
                      color: AppConstants.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (mood.emotions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: mood.emotions.map((e) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppConstants.primaryPurple.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppConstants.primaryPurple.withOpacity(0.3)),
                ),
                child: Text(
                  e,
                  style: const TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 12,
                    color: AppConstants.primaryPurple,
                  ),
                ),
              )).toList(),
            ),
          ],
        ],
      ),
    );
  }
}

// Weekly Chart (simplified bar chart)
class _WeeklyMoodChart extends StatelessWidget {
  final List<MoodEntry> history;

  const _WeeklyMoodChart({required this.history});

  @override
  Widget build(BuildContext context) {
    final last7 = history.take(7).toList().reversed.toList();
    final days = ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppConstants.darkCard,
        borderRadius: BorderRadius.circular(AppConstants.radiusL),
        border: Border.all(color: AppConstants.darkBorder),
      ),
      child: Column(
        children: [
          // Bars
          SizedBox(
            height: 100,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: last7.asMap().entries.map((entry) {
                final idx = entry.key;
                final mood = entry.value;
                final barHeight = (mood.moodScore / 10) * 80;

                Color barColor;
                if (mood.moodScore >= 7) barColor = AppConstants.accentGreen;
                else if (mood.moodScore >= 5) barColor = AppConstants.accentOrange;
                else barColor = AppConstants.accentRed;

                return Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      mood.moodScore.toString(),
                      style: TextStyle(
                        fontFamily: AppConstants.fontFamily,
                        fontSize: 10,
                        color: barColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    AnimatedContainer(
                      duration: Duration(milliseconds: 300 + (idx * 50)),
                      width: 28,
                      height: barHeight,
                      decoration: BoxDecoration(
                        color: barColor.withOpacity(0.8),
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(6),
                        ),
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),

          const SizedBox(height: 8),
          const Divider(color: AppConstants.darkBorder, height: 1),
          const SizedBox(height: 8),

          // Day labels
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: last7.map((m) {
              final day = m.date.weekday % 7;
              return Text(
                days[day],
                style: const TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 10,
                  color: AppConstants.textMuted,
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// Weekly Stats
class _WeeklyStats extends StatelessWidget {
  final List<MoodEntry> history;

  const _WeeklyStats({required this.history});

  @override
  Widget build(BuildContext context) {
    if (history.isEmpty) return const SizedBox.shrink();

    final last7 = history.take(7).toList();
    final avg = last7.fold<int>(0, (sum, m) => sum + m.moodScore) / last7.length;
    final maxMood = last7.reduce((a, b) => a.moodScore > b.moodScore ? a : b);
    final minMood = last7.reduce((a, b) => a.moodScore < b.moodScore ? a : b);

    return Row(
      children: [
        Expanded(
          child: _StatItem(
            label: 'المتوسط',
            value: avg.toStringAsFixed(1),
            icon: '📊',
            color: AppConstants.primaryPurple,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatItem(
            label: 'الأعلى',
            value: maxMood.moodScore.toString(),
            icon: '⬆️',
            color: AppConstants.accentGreen,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatItem(
            label: 'الأدنى',
            value: minMood.moodScore.toString(),
            icon: '⬇️',
            color: AppConstants.accentRed,
          ),
        ),
      ],
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final String icon;
  final Color color;

  const _StatItem({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppConstants.radiusM),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Text(icon, style: const TextStyle(fontSize: 20)),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 10,
              color: AppConstants.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

// Mood History Card
class _MoodHistoryCard extends StatelessWidget {
  final MoodEntry entry;

  const _MoodHistoryCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    String emoji;
    if (entry.moodScore >= 9) emoji = '🤩';
    else if (entry.moodScore >= 7) emoji = '😄';
    else if (entry.moodScore >= 5) emoji = '😊';
    else if (entry.moodScore >= 3) emoji = '😔';
    else emoji = '😞';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppConstants.darkCard,
        borderRadius: BorderRadius.circular(AppConstants.radiusL),
        border: Border.all(color: AppConstants.darkBorder),
      ),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 32)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      '${entry.moodScore}/10',
                      style: const TextStyle(
                        fontFamily: AppConstants.fontFamily,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppConstants.textPrimary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      AppConstants.moodLabels[entry.moodScore]?.split(' ').last ?? '',
                      style: const TextStyle(
                        fontFamily: AppConstants.fontFamily,
                        fontSize: 12,
                        color: AppConstants.textMuted,
                      ),
                    ),
                  ],
                ),
                if (entry.emotions.isNotEmpty)
                  Text(
                    entry.emotions.join(' • '),
                    style: const TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 11,
                      color: AppConstants.textMuted,
                    ),
                  ),
              ],
            ),
          ),
          Text(
            '${entry.date.day}/${entry.date.month}',
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 12,
              color: AppConstants.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

// Section Title
class _SectionTitle extends StatelessWidget {
  final String title;
  final String icon;

  const _SectionTitle({required this.title, required this.icon});

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
