import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/intelligence_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/app_theme.dart';

class DayPlannerScreen extends StatefulWidget {
  const DayPlannerScreen({super.key});
  @override
  State<DayPlannerScreen> createState() => _DayPlannerScreenState();
}

class _DayPlannerScreenState extends State<DayPlannerScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth  = context.read<AuthProvider>();
      final intel = context.read<IntelligenceProvider>();
      if (auth.token != null) intel.loadDayPlan(auth.token!);
    });
  }

  static const _blockColors = {
    'task':    Color(0xFF3b82f6),
    'habit':   Color(0xFF8b5cf6),
    'break':   Color(0xFF10b981),
    'routine': Color(0xFFf59e0b),
    'review':  Color(0xFF6366f1),
  };

  static const _priorityColors = {
    'urgent': Color(0xFFef4444),
    'high':   Color(0xFFf97316),
    'medium': Color(0xFF3b82f6),
    'low':    Color(0xFF6b7280),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        title: const Text('خطة اليوم الذكية', style: TextStyle(color: Colors.white, fontFamily: 'Cairo')),
        backgroundColor: AppTheme.darkSurface,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white70),
            onPressed: () {
              final auth  = context.read<AuthProvider>();
              final intel = context.read<IntelligenceProvider>();
              if (auth.token != null) intel.loadDayPlan(auth.token!);
            },
          ),
        ],
      ),
      body: Consumer<IntelligenceProvider>(
        builder: (ctx, intel, _) {
          if (intel.planLoading) return const Center(child: CircularProgressIndicator());
          if (intel.planError != null) return _buildError(intel.planError!);
          if (intel.planData == null) return const Center(
            child: Text('لا توجد خطة. اضغط تحديث.', style: TextStyle(color: Colors.white70, fontFamily: 'Cairo')),
          );

          final d        = intel.planData!;
          final stats    = d['stats'] as Map? ?? {};
          final warnings = d['warnings'] as List? ?? [];
          final schedule = d['schedule'] as List? ?? [];
          final windows  = d['focus_windows'] as List? ?? [];
          final moodAdj  = d['mood_adjustments'] as Map?;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

              // Stats row
              Row(children: [
                _StatCard(label: 'المهام', value: '${stats['scheduled_tasks'] ?? 0}'),
                const SizedBox(width: 8),
                _StatCard(label: 'تطابق الطاقة', value: '${stats['energy_match_score'] ?? 0}%'),
                const SizedBox(width: 8),
                _StatCard(label: 'دقائق العمل', value: '${stats['estimated_work_minutes'] ?? 0}'),
              ]),
              const SizedBox(height: 14),

              // Warnings
              if (warnings.isNotEmpty) ...[
                ...warnings.map((w) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFf59e0b).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFf59e0b).withOpacity(0.4)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.warning_amber_outlined, color: Color(0xFFf59e0b), size: 16),
                    const SizedBox(width: 8),
                    Expanded(child: Text(w['message'] ?? '', style: const TextStyle(color: Color(0xFFfde68a), fontFamily: 'Cairo', fontSize: 12))),
                  ]),
                )),
              ],

              // Focus windows
              if (windows.isNotEmpty) ...[
                const Text('نوافذ التركيز العميق', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 6,
                  children: windows.map<Widget>((w) => Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF7c3aed).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFF7c3aed).withOpacity(0.5)),
                    ),
                    child: Text('⚡ ${w['label']}', style: const TextStyle(color: Color(0xFFc4b5fd), fontSize: 12, fontFamily: 'Cairo')),
                  )).toList(),
                ),
                const SizedBox(height: 14),
              ],

              // Mood note
              if (moodAdj != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
                  child: Text('💡 ${moodAdj['recommendation']}', style: const TextStyle(color: Colors.white60, fontFamily: 'Cairo', fontSize: 12)),
                ),
                const SizedBox(height: 14),
              ],

              // Schedule timeline
              const Text('جدول اليوم', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
              const SizedBox(height: 10),
              ...schedule.map((block) {
                final blockType  = block['type'] as String? ?? 'task';
                final blockColor = _blockColors[blockType] ?? const Color(0xFF3b82f6);
                final priority   = block['priority'] as String?;
                final priColor   = priority != null ? _priorityColors[priority] : null;

                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: blockColor.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: blockColor.withOpacity(0.3)),
                  ),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    // Time label
                    Text(block['time_label'] ?? '', style: TextStyle(color: blockColor, fontFamily: 'Cairo', fontSize: 11, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 10),
                    // Priority dot
                    if (priColor != null) ...[
                      Padding(padding: const EdgeInsets.only(top: 4), child: Container(width: 6, height: 6, decoration: BoxDecoration(color: priColor, shape: BoxShape.circle))),
                      const SizedBox(width: 6),
                    ],
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(block['title'] ?? '', style: const TextStyle(color: Colors.white, fontFamily: 'Cairo', fontSize: 13, fontWeight: FontWeight.w600)),
                      if ((block['description'] as String?)?.isNotEmpty == true)
                        Text(block['description'] as String, style: const TextStyle(color: Colors.white54, fontFamily: 'Cairo', fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
                      if (block['energy_match'] != null)
                        Text('تطابق طاقة: ${block['energy_match']}%', style: TextStyle(
                          color: (block['energy_match'] as num) >= 70 ? const Color(0xFF10b981)
                            : (block['energy_match'] as num) >= 50 ? const Color(0xFFeab308)
                            : const Color(0xFFf97316),
                          fontSize: 10, fontFamily: 'Cairo',
                        )),
                    ])),
                    if (block['duration'] != null)
                      Text('${block['duration']}د', style: const TextStyle(color: Colors.white38, fontFamily: 'Cairo', fontSize: 11)),
                  ]),
                );
              }),
            ]),
          );
        },
      ),
    );
  }

  Widget _buildError(String msg) => Center(
    child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
      const SizedBox(height: 12),
      Text(msg, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo')),
    ])),
  );
}

class _StatCard extends StatelessWidget {
  final String label, value;
  const _StatCard({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Expanded(child: Container(
    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
    decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
    child: Column(children: [
      Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontFamily: 'Cairo', fontSize: 14)),
      const SizedBox(height: 3),
      Text(label, style: const TextStyle(color: Colors.white54, fontFamily: 'Cairo', fontSize: 10), textAlign: TextAlign.center),
    ]),
  ));
}
