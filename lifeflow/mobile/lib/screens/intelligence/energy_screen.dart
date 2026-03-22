import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/intelligence_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/app_theme.dart';

class EnergyScreen extends StatefulWidget {
  const EnergyScreen({super.key});
  @override
  State<EnergyScreen> createState() => _EnergyScreenState();
}

class _EnergyScreenState extends State<EnergyScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth  = context.read<AuthProvider>();
      final intel = context.read<IntelligenceProvider>();
      if (auth.token != null) intel.loadEnergyScore(auth.token!);
    });
  }

  static const _levelColor = {
    'high': Color(0xFF10b981), 'medium': Color(0xFFeab308),
    'low': Color(0xFFf97316), 'critical': Color(0xFFef4444),
  };

  static const _breakdownLabels = {
    'sleep_score': ('النوم', 20, Color(0xFF6366f1)),
    'mood_score':  ('المزاج', 25, Color(0xFFec4899)),
    'habit_score': ('العادات', 20, Color(0xFF10b981)),
    'task_load_score': ('تحميل المهام', 20, Color(0xFFf59e0b)),
    'stress_score': ('الإجهاد', 15, Color(0xFF8b5cf6)),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        title: const Text('طاقة اليوم', style: TextStyle(color: Colors.white, fontFamily: 'Cairo')),
        backgroundColor: AppTheme.darkSurface,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white70),
            onPressed: () {
              final auth  = context.read<AuthProvider>();
              final intel = context.read<IntelligenceProvider>();
              if (auth.token != null) intel.loadEnergyScore(auth.token!);
            },
          ),
        ],
      ),
      body: Consumer<IntelligenceProvider>(
        builder: (ctx, intel, _) {
          if (intel.energyLoading) return const Center(child: CircularProgressIndicator());
          if (intel.energyError != null) return _ErrorView(intel.energyError!);
          if (intel.energyData == null) return const Center(child: Text('لا توجد بيانات', style: TextStyle(color: Colors.white70, fontFamily: 'Cairo')));

          final d     = intel.energyData!;
          final level = d['level'] as String? ?? 'medium';
          final color = _levelColor[level] ?? const Color(0xFFeab308);
          final score = (d['energy_score'] as num?)?.toInt() ?? 0;
          final breakdown = d['breakdown'] as Map? ?? {};

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Score card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: color.withOpacity(0.4)),
                ),
                child: Column(children: [
                  Text('$score', style: TextStyle(fontSize: 56, fontWeight: FontWeight.bold, color: color, fontFamily: 'Cairo')),
                  Text(d['level_label'] ?? '', style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo', fontSize: 16)),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(
                    value: score / 100,
                    backgroundColor: Colors.white12,
                    valueColor: AlwaysStoppedAnimation<Color>(color),
                    minHeight: 8,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ]),
              ),
              const SizedBox(height: 20),
              // Breakdown
              const Text('التفاصيل', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
              const SizedBox(height: 12),
              ..._breakdownLabels.entries.map((entry) {
                final val = (breakdown[entry.key] as num?)?.toInt() ?? 0;
                final pct = val / entry.value.$2;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Text(entry.value.$1, style: const TextStyle(color: Colors.white70, fontSize: 12, fontFamily: 'Cairo')),
                      Text('$val/${entry.value.$2}', style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'Cairo')),
                    ]),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(
                      value: pct.clamp(0.0, 1.0),
                      backgroundColor: Colors.white12,
                      valueColor: AlwaysStoppedAnimation<Color>(entry.value.$3),
                      minHeight: 6,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ]),
                );
              }),
              // Focus windows
              if ((d['focus_windows'] as List?)?.isNotEmpty == true) ...[
                const SizedBox(height: 20),
                const Text('نوافذ التركيز', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8,
                  children: (d['focus_windows'] as List).map<Widget>((w) => Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6366f1).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFF6366f1).withOpacity(0.4)),
                    ),
                    child: Text('⚡ ${w['label']}', style: const TextStyle(color: Color(0xFF818cf8), fontSize: 12, fontFamily: 'Cairo')),
                  )).toList(),
                ),
              ],
              // Tips
              if ((d['tips'] as List?)?.isNotEmpty == true) ...[
                const SizedBox(height: 20),
                const Text('نصائح', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
                const SizedBox(height: 8),
                ...(d['tips'] as List).map((t) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Text('💡 ${t['text']}', style: const TextStyle(color: Colors.white70, fontSize: 13, fontFamily: 'Cairo')),
                )),
              ],
            ]),
          );
        },
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  const _ErrorView(this.message);
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo')),
      ]),
    ),
  );
}
