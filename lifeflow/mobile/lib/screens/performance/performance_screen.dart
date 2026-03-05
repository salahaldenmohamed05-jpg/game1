/// PerformanceScreen - AI Performance Engine
/// ============================================
/// Shows daily scores, behavioral flags, energy heatmap, coaching.
/// Premium-gated with upgrade prompt.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';
import 'package:fl_chart/fl_chart.dart';

class PerformanceScreen extends StatefulWidget {
  const PerformanceScreen({Key? key}) : super(key: key);

  @override
  State<PerformanceScreen> createState() => _PerformanceScreenState();
}

class _PerformanceScreenState extends State<PerformanceScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  Map<String, dynamic>? _dashboardData;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final auth = context.read<AuthProvider>();
    if (!auth.isPremium) {
      setState(() => _isLoading = false);
      return;
    }
    try {
      final api = ApiService(token: auth.token);
      final data = await api.get('/performance/dashboard');
      setState(() {
        _dashboardData = data['data'];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (!auth.isPremium) {
      return _buildLockedView();
    }

    return Scaffold(
      backgroundColor: AppTheme.darkBackground,
      appBar: AppBar(
        backgroundColor: AppTheme.darkBackground,
        title: const Text('محرك الأداء الذكي',
            style: TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() => _isLoading = true);
              _loadData();
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppTheme.primaryColor,
          labelStyle: const TextStyle(fontFamily: 'Cairo', fontSize: 12),
          tabs: const [
            Tab(text: 'اليوم'),
            Tab(text: 'الطاقة'),
            Tab(text: 'التنبيهات'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryColor))
          : _error != null
              ? _buildError()
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildTodayTab(),
                    _buildEnergyTab(),
                    _buildFlagsTab(),
                  ],
                ),
    );
  }

  // ── TODAY TAB ─────────────────────────────────────────────────────────────
  Widget _buildTodayTab() {
    final score    = _dashboardData?['today_score'];
    final coaching = _dashboardData?['coaching'];
    final audit    = _dashboardData?['weekly_audit'];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (coaching != null) _buildCoachingCard(coaching),
          const SizedBox(height: 16),
          if (score != null) _buildScoreCard(score),
          const SizedBox(height: 16),
          if (audit != null) _buildAuditPreview(audit),
        ],
      ),
    );
  }

  Widget _buildCoachingCard(Map<String, dynamic> coaching) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.primaryColor.withOpacity(0.2), AppTheme.secondaryColor.withOpacity(0.1)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.primaryColor.withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('💡', style: TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              coaching['message'] ?? '',
              style: const TextStyle(color: Colors.white, fontFamily: 'Cairo', fontSize: 14, height: 1.6),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScoreCard(Map<String, dynamic> score) {
    final scores = [
      {'label': 'الإنتاجية', 'value': score['productivity_score'] ?? 0, 'color': AppTheme.primaryColor},
      {'label': 'التركيز',   'value': score['focus_score']        ?? 0, 'color': AppTheme.secondaryColor},
      {'label': 'الاتساق',  'value': score['consistency_score']   ?? 0, 'color': AppTheme.accentColor},
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.star, color: Colors.amber, size: 18),
              const SizedBox(width: 6),
              const Text('أداء اليوم', style: TextStyle(
                color: Colors.white, fontFamily: 'Cairo', fontWeight: FontWeight.bold)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${score['overall_score'] ?? 0} / 100',
                  style: const TextStyle(color: AppTheme.primaryColor, fontFamily: 'Cairo', fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: scores.map((s) => Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: _ScoreCircle(
                  value:  (s['value'] as num).toDouble(),
                  label:  s['label'] as String,
                  color:  s['color'] as Color,
                ),
              ),
            )).toList(),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _metricChip('مهام', '${score['task_completion_rate'] ?? 0}%'),
              const SizedBox(width: 8),
              _metricChip('عادات', '${score['habit_completion_rate'] ?? 0}%'),
              const SizedBox(width: 8),
              _metricChip('مزاج', '${score['mood_average'] ?? 0}/10'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _metricChip(String label, String value) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          children: [
            Text(value, style: const TextStyle(color: Colors.white, fontFamily: 'Cairo', fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.grey, fontFamily: 'Cairo', fontSize: 11)),
          ],
        ),
      ),
    );
  }

  Widget _buildAuditPreview(Map<String, dynamic> audit) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.amber.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.auto_awesome, color: Colors.amber, size: 18),
              SizedBox(width: 6),
              Text('التدقيق الأسبوعي', style: TextStyle(
                color: Colors.white, fontFamily: 'Cairo', fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 12),
          if (audit['coach_summary'] != null)
            Text(
              audit['coach_summary'],
              style: const TextStyle(color: Colors.grey, fontFamily: 'Cairo', fontSize: 13, height: 1.5),
            ),
          const SizedBox(height: 12),
          if (audit['improvement_strategies'] != null)
            ...(audit['improvement_strategies'] as List).take(2).map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('💡', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s['title'] ?? '', style: const TextStyle(
                          color: Colors.white, fontFamily: 'Cairo', fontSize: 12, fontWeight: FontWeight.w600)),
                        Text(s['action'] ?? '', style: const TextStyle(
                          color: Colors.grey, fontFamily: 'Cairo', fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
            )),
        ],
      ),
    );
  }

  // ── ENERGY TAB ────────────────────────────────────────────────────────────
  Widget _buildEnergyTab() {
    final energy = _dashboardData?['energy_profile'];
    if (energy == null || energy['has_data'] != true) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('⚡', style: TextStyle(fontSize: 48)),
              const SizedBox(height: 16),
              const Text('نحتاج المزيد من البيانات',
                style: TextStyle(color: Colors.white, fontFamily: 'Cairo', fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(
                energy?['message'] ?? 'أتمم بعض المهام وسنبني خريطة طاقتك',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.grey, fontFamily: 'Cairo'),
              ),
            ],
          ),
        ),
      );
    }

    final hourlyHeatmap = energy['hourly_heatmap'] as List? ?? [];
    final peakHours     = energy['peak_hours_labels'] as List? ?? [];
    final schedule      = energy['schedule'] as List? ?? [];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Heatmap
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.surfaceColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('خريطة إنتاجيتك اليومية',
                  style: TextStyle(color: Colors.white, fontFamily: 'Cairo', fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                SizedBox(
                  height: 80,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: hourlyHeatmap
                      .where((h) => (h['hour'] as int) >= 6 && (h['hour'] as int) <= 22)
                      .map<Widget>((h) {
                        final pct = (h['percentage'] as num).toDouble();
                        final isPeak = energy['peak_hours']?.contains(h['hour']) ?? false;
                        return Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 1),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                Flexible(
                                  child: FractionallySizedBox(
                                    heightFactor: pct / 100 + 0.05,
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: isPeak
                                          ? AppTheme.secondaryColor
                                          : AppTheme.secondaryColor.withOpacity(0.3 + pct / 200),
                                        borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: ['6', '9', '12', '15', '18', '22']
                    .map((h) => Text(h, style: const TextStyle(color: Colors.grey, fontSize: 10)))
                    .toList(),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Peak hours & best day
          Row(
            children: [
              Expanded(child: _infoCard(
                '⏰',
                'وقت العمل المثالي',
                energy['best_work_window']?['label'] ?? '--',
                AppTheme.secondaryColor,
              )),
              const SizedBox(width: 12),
              Expanded(child: _infoCard(
                '📅',
                'أفضل يوم',
                energy['best_day'] ?? '--',
                AppTheme.accentColor,
              )),
            ],
          ),

          const SizedBox(height: 16),

          // Recommended schedule
          if (schedule.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.surfaceColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('الجدول اليومي المقترح',
                    style: TextStyle(color: Colors.white, fontFamily: 'Cairo', fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  ...schedule.take(5).map<Widget>((s) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryColor.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(s['time'] ?? '',
                            style: const TextStyle(color: AppTheme.primaryColor, fontSize: 11, fontFamily: 'Cairo')),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Text(s['activity'] ?? '',
                          style: const TextStyle(color: Colors.white, fontFamily: 'Cairo', fontSize: 13))),
                      ],
                    ),
                  )),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── FLAGS TAB ─────────────────────────────────────────────────────────────
  Widget _buildFlagsTab() {
    final flags = _dashboardData?['active_flags'] as List? ?? [];

    if (flags.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('✅', style: TextStyle(fontSize: 48)),
            SizedBox(height: 16),
            Text('لا توجد تنبيهات سلوكية حالياً',
              style: TextStyle(color: Colors.white, fontFamily: 'Cairo', fontSize: 18)),
            SizedBox(height: 8),
            Text('أداؤك ممتاز! استمر هكذا',
              style: TextStyle(color: Colors.grey, fontFamily: 'Cairo')),
          ],
        ),
      );
    }

    final severityColors = {
      'low':      Colors.grey,
      'medium':   Colors.amber,
      'high':     Colors.red,
      'critical': const Color(0xFFDC2626),
    };

    final typeEmojis = {
      'procrastination': '⏰',
      'avoidance':       '🙈',
      'burnout_risk':    '🔥',
      'overcommitment':  '📚',
      'energy_mismatch': '⚡',
    };

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: flags.length,
      itemBuilder: (ctx, i) {
        final flag    = flags[i];
        final severity = flag['severity'] as String? ?? 'medium';
        final color   = severityColors[severity] ?? Colors.amber;

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: color.withOpacity(0.05),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withOpacity(0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(typeEmojis[flag['flag_type']] ?? '🚩', style: const TextStyle(fontSize: 20)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(flag['description'] ?? '',
                      style: const TextStyle(color: Colors.white, fontFamily: 'Cairo', fontWeight: FontWeight.w600)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(severity, style: TextStyle(color: color, fontSize: 11, fontFamily: 'Cairo')),
                  ),
                ],
              ),
              if (flag['ai_recommendation'] != null) ...[
                const SizedBox(height: 8),
                Text('💡 ${flag['ai_recommendation']}',
                  style: const TextStyle(color: Colors.grey, fontFamily: 'Cairo', fontSize: 12, height: 1.4)),
              ],
            ],
          ),
        );
      },
    );
  }

  // ── LOCKED VIEW ───────────────────────────────────────────────────────────
  Widget _buildLockedView() {
    return Scaffold(
      backgroundColor: AppTheme.darkBackground,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const SizedBox(height: 40),
            const Text('🚀', style: TextStyle(fontSize: 64)),
            const SizedBox(height: 24),
            const Text(
              'محرك الأداء الذكي',
              style: TextStyle(
                color: Colors.white, fontFamily: 'Cairo',
                fontSize: 26, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            const Text(
              'حوّل LifeFlow إلى مدرّب حياة شخصي يحلّل أداءك ويساعدك على التحسين المستمر',
              style: TextStyle(color: Colors.grey, fontFamily: 'Cairo', fontSize: 14, height: 1.6),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            ...[
              ['🎯', 'درجات يومية للإنتاجية والتركيز'],
              ['📊', 'التدقيق الأسبوعي الشامل للحياة'],
              ['🚩', 'كشف المماطلة والتأجيل الذكي'],
              ['⚡', 'خريطة الطاقة الشخصية'],
              ['💡', 'وضع التدريب الذكي اليومي'],
            ].map((f) => _featureRow(f[0], f[1])),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  // Show upgrade dialog
                  _showUpgradeDialog();
                },
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  backgroundColor: AppTheme.primaryColor,
                ),
                child: const Text('جرّب مجاناً 7 أيام',
                  style: TextStyle(fontFamily: 'Cairo', fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 8),
            const Text('لا بطاقة ائتمان مطلوبة',
              style: TextStyle(color: Colors.grey, fontFamily: 'Cairo', fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _featureRow(String emoji, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 12),
          Text(text, style: const TextStyle(color: Colors.white, fontFamily: 'Cairo')),
          const Spacer(),
          const Icon(Icons.lock, color: Colors.amber, size: 16),
        ],
      ),
    );
  }

  Widget _infoCard(String emoji, String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(
            color: color, fontFamily: 'Cairo', fontWeight: FontWeight.bold, fontSize: 14)),
          Text(label, style: const TextStyle(color: Colors.grey, fontFamily: 'Cairo', fontSize: 11)),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 48),
          const SizedBox(height: 16),
          const Text('تعذّر تحميل البيانات', style: TextStyle(color: Colors.white, fontFamily: 'Cairo')),
          TextButton(onPressed: _loadData, child: const Text('إعادة المحاولة', style: TextStyle(fontFamily: 'Cairo'))),
        ],
      ),
    );
  }

  void _showUpgradeDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1a1a2e),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('ترقية للخطة المميزة', style: TextStyle(color: Colors.white, fontFamily: 'Cairo')),
        content: const Text(
          'استمتع بتجربة مجانية 7 أيام كاملة بدون بطاقة ائتمان.',
          style: TextStyle(color: Colors.grey, fontFamily: 'Cairo'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('لاحقاً', style: TextStyle(color: Colors.grey, fontFamily: 'Cairo')),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _activateTrial();
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryColor),
            child: const Text('ابدأ التجربة', style: TextStyle(fontFamily: 'Cairo')),
          ),
        ],
      ),
    );
  }

  Future<void> _activateTrial() async {
    final auth = context.read<AuthProvider>();
    try {
      final api = ApiService(token: auth.token);
      await api.post('/subscription/trial', {});
      await auth.refreshUser();
      if (mounted) {
        setState(() {
          _isLoading = true;
        });
        _loadData();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🎉 تم تفعيل التجربة المجانية لـ 7 أيام!',
              style: TextStyle(fontFamily: 'Cairo')),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('خطأ: $e', style: const TextStyle(fontFamily: 'Cairo'))),
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE CIRCLE WIDGET
// ─────────────────────────────────────────────────────────────────────────────

class _ScoreCircle extends StatelessWidget {
  final double value;
  final String label;
  final Color  color;

  const _ScoreCircle({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: 72,
          height: 72,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CircularProgressIndicator(
                value:             value / 100,
                strokeWidth:       6,
                backgroundColor:   color.withOpacity(0.15),
                valueColor:        AlwaysStoppedAnimation<Color>(color),
              ),
              Text('${value.toInt()}',
                style: TextStyle(color: color, fontFamily: 'Cairo', fontWeight: FontWeight.bold, fontSize: 18)),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: Colors.grey, fontFamily: 'Cairo', fontSize: 12)),
      ],
    );
  }
}
