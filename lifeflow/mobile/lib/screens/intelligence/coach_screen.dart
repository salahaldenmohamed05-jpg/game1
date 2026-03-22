import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/intelligence_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/app_theme.dart';

class CoachScreen extends StatefulWidget {
  const CoachScreen({super.key});
  @override
  State<CoachScreen> createState() => _CoachScreenState();
}

class _CoachScreenState extends State<CoachScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth  = context.read<AuthProvider>();
      final intel = context.read<IntelligenceProvider>();
      if (auth.token != null) intel.loadCoachInsights(auth.token!);
    });
  }

  Color _priorityColor(String p) => switch(p) {
    'critical' => Colors.red,
    'high'     => Colors.orange,
    'medium'   => const Color(0xFFeab308),
    _          => Colors.grey,
  };

  Color _riskColor(String r) => switch(r) {
    'high'   => Colors.red,
    'medium' => const Color(0xFFeab308),
    _        => const Color(0xFF10b981),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.darkBg,
      appBar: AppBar(
        title: const Text('المدرب الذكي', style: TextStyle(color: Colors.white, fontFamily: 'Cairo')),
        backgroundColor: AppTheme.darkSurface,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white70),
            onPressed: () {
              final auth  = context.read<AuthProvider>();
              final intel = context.read<IntelligenceProvider>();
              if (auth.token != null) intel.loadCoachInsights(auth.token!);
            },
          ),
        ],
      ),
      body: Consumer<IntelligenceProvider>(
        builder: (ctx, intel, _) {
          if (intel.coachLoading) return const Center(child: CircularProgressIndicator());
          if (intel.coachError != null) return _buildError(intel.coachError!);
          if (intel.coachData == null) return const Center(child: Text('لا توجد بيانات', style: TextStyle(color: Colors.white70, fontFamily: 'Cairo')));

          final d       = intel.coachData!;
          final summary = d['summary'] as Map? ?? {};
          final burnout = d['burnout_warning'] as Map? ?? {};
          final balance = d['life_balance'] as Map? ?? {};
          final recs    = d['recommendations'] as List? ?? [];
          final plan    = d['action_plan'] as List? ?? [];
          final highlights = d['highlights'] as List? ?? [];

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

              // Summary metrics
              Row(children: [
                _MetricCard(label: 'متوسط الأداء', value: '${summary['avg_score_14d'] ?? 0}/100'),
                const SizedBox(width: 8),
                _MetricCard(label: 'متوسط المزاج', value: '${summary['avg_mood_14d'] ?? 0}/10'),
                const SizedBox(width: 8),
                _MetricCard(label: 'إتمام المهام', value: '${summary['task_completion_rate'] ?? 0}%'),
              ]),
              const SizedBox(height: 16),

              // Burnout card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _riskColor(burnout['risk_level'] ?? 'low').withOpacity(0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: _riskColor(burnout['risk_level'] ?? 'low').withOpacity(0.4)),
                ),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(burnout['urgent'] == true ? Icons.warning_amber : Icons.shield_outlined,
                      color: _riskColor(burnout['risk_level'] ?? 'low'), size: 22),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      burnout['urgent'] == true ? 'تحذير إجهاد!' : 'مستوى الإجهاد: ${burnout['risk_level'] == 'low' ? 'منخفض' : burnout['risk_level'] == 'medium' ? 'متوسط' : 'مرتفع'}',
                      style: TextStyle(color: _riskColor(burnout['risk_level'] ?? 'low'), fontWeight: FontWeight.bold, fontFamily: 'Cairo', fontSize: 13),
                    ),
                    if ((burnout['factors'] as List?)?.isNotEmpty == true) ...[
                      const SizedBox(height: 4),
                      Text((burnout['factors'] as List).join(' · '), style: const TextStyle(color: Colors.white60, fontFamily: 'Cairo', fontSize: 11)),
                    ],
                  ])),
                ]),
              ),
              const SizedBox(height: 16),

              // Life balance
              const Text('توازن الحياة', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
              const SizedBox(height: 10),
              _BalanceBar(label: 'المهام', value: (balance['tasks'] as num?)?.toInt() ?? 0, color: const Color(0xFF3b82f6)),
              _BalanceBar(label: 'العادات', value: (balance['habits'] as num?)?.toInt() ?? 0, color: const Color(0xFF10b981)),
              _BalanceBar(label: 'المزاج', value: (balance['mood'] as num?)?.toInt() ?? 0, color: const Color(0xFFec4899)),
              _BalanceBar(label: 'الاتساق', value: (balance['consistency'] as num?)?.toInt() ?? 0, color: const Color(0xFF8b5cf6)),
              const SizedBox(height: 16),

              // Recommendations
              const Text('التوصيات', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
              const SizedBox(height: 10),
              ...recs.map((r) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: _priorityColor(r['priority'] ?? 'low').withOpacity(0.08),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: _priorityColor(r['priority'] ?? 'low').withOpacity(0.35)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(r['title'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontFamily: 'Cairo', fontSize: 13)),
                  const SizedBox(height: 4),
                  Text(r['body'] ?? '', style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo', fontSize: 12)),
                ]),
              )),

              // Action plan
              if (plan.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('خطة العمل', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
                const SizedBox(height: 10),
                ...plan.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${item['day']}: ', style: const TextStyle(color: Color(0xFF818cf8), fontWeight: FontWeight.bold, fontFamily: 'Cairo', fontSize: 12)),
                    Expanded(child: Text(item['task'] ?? '', style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo', fontSize: 12))),
                  ]),
                )),
              ],

              // Highlights
              if (highlights.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('إنجازاتك', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold, fontFamily: 'Cairo')),
                const SizedBox(height: 10),
                ...highlights.map((h) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text('${h['emoji']} ${h['text']}', style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo', fontSize: 13)),
                )),
              ],
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

class _MetricCard extends StatelessWidget {
  final String label, value;
  const _MetricCard({required this.label, required this.value});
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

class _BalanceBar extends StatelessWidget {
  final String label; final int value; final Color color;
  const _BalanceBar({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(label, style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo', fontSize: 12)),
        Text('$value%', style: const TextStyle(color: Colors.white, fontFamily: 'Cairo', fontSize: 12)),
      ]),
      const SizedBox(height: 4),
      LinearProgressIndicator(
        value: value / 100, backgroundColor: Colors.white12,
        valueColor: AlwaysStoppedAnimation<Color>(color),
        minHeight: 7, borderRadius: BorderRadius.circular(4),
      ),
    ]),
  );
}
