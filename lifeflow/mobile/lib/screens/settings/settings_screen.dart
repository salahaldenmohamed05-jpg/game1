/**
 * Settings Screen - شاشة الإعدادات
 * =====================================
 * Phase B: Full API integration with /profile-settings/settings
 */
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_constants.dart';
import '../profile/profile_screen.dart';

class SettingsScreen extends StatefulWidget {
  static const routeName = '/settings';
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _loading = true;
  bool _saving = false;
  bool _notificationsEnabled = true;
  bool _dailyReminder = true;
  bool _weeklyReport = true;
  bool _smartReminders = true;
  bool _autoReschedule = false;
  String _aiInterventionLevel = 'balanced';
  String _recommendationStyle = 'contextual';
  String _aiCoachingTone = 'supportive';
  String _quietHoursStart = '23:00';
  String _quietHoursEnd = '07:00';
  TimeOfDay _reminderTime = const TimeOfDay(hour: 9, minute: 0);

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    try {
      final api = ApiService.instance;
      final result = await api.getAppSettings();
      if (result['success'] == true && result['data'] != null) {
        final data = result['data'];
        setState(() {
          _notificationsEnabled = data['notifications_enabled'] ?? true;
          _dailyReminder = data['daily_reminder'] ?? true;
          _weeklyReport = data['weekly_report'] ?? true;
          _smartReminders = data['smart_reminders'] ?? true;
          _autoReschedule = data['auto_reschedule'] ?? false;
          _aiInterventionLevel = data['ai_intervention_level'] ?? 'balanced';
          _recommendationStyle = data['recommendation_style'] ?? 'contextual';
          _aiCoachingTone = data['ai_coaching_tone'] ?? 'supportive';
          _quietHoursStart = data['quiet_hours_start'] ?? '23:00';
          _quietHoursEnd = data['quiet_hours_end'] ?? '07:00';
        });
      }
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _saveSettings() async {
    setState(() => _saving = true);
    try {
      final api = ApiService.instance;
      await api.updateAppSettings({
        'notifications_enabled': _notificationsEnabled,
        'daily_reminder': _dailyReminder,
        'weekly_report': _weeklyReport,
        'smart_reminders': _smartReminders,
        'auto_reschedule': _autoReschedule,
        'ai_intervention_level': _aiInterventionLevel,
        'recommendation_style': _recommendationStyle,
        'ai_coaching_tone': _aiCoachingTone,
        'quiet_hours_start': _quietHoursStart,
        'quiet_hours_end': _quietHoursEnd,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم حفظ الإعدادات'), backgroundColor: AppConstants.accentGreen),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('فشل حفظ الإعدادات'), backgroundColor: Colors.red),
        );
      }
    }
    setState(() => _saving = false);
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            title,
            style: const TextStyle(
              color: AppConstants.primaryPurple,
              fontSize: 13,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppConstants.darkCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppConstants.darkBorder),
          ),
          child: Column(children: children),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildToggleTile(String title, String subtitle, bool value, Function(bool) onChanged) {
    return ListTile(
      title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 14)),
      subtitle: Text(subtitle, style: TextStyle(color: Colors.white.withOpacity(0.45), fontSize: 12)),
      trailing: Switch.adaptive(
        value: value,
        onChanged: onChanged,
        activeColor: AppConstants.primaryPurple,
      ),
    );
  }

  Widget _buildArrowTile(String title, String? subtitle, VoidCallback onTap, {Widget? leading}) {
    return ListTile(
      leading: leading,
      title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 14)),
      subtitle: subtitle != null
          ? Text(subtitle, style: TextStyle(color: Colors.white.withOpacity(0.45), fontSize: 12))
          : null,
      trailing: const Icon(Icons.chevron_right, color: Colors.white38, size: 18),
      onTap: onTap,
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      appBar: AppBar(
        backgroundColor: AppConstants.darkSurface,
        title: const Text('الإعدادات',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Profile Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppConstants.primaryPurple, AppConstants.accentPink],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: Colors.white.withOpacity(0.2),
                    child: Text(
                      user?.name.isNotEmpty == true ? user!.name[0] : 'م',
                      style: const TextStyle(
                          color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user?.name ?? 'المستخدم',
                            style: const TextStyle(
                                color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                        const SizedBox(height: 2),
                        Text(user?.email ?? '',
                            style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 12)),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            user?.subscriptionPlan == 'premium'
                                ? 'بريميوم'
                                : user?.subscriptionPlan == 'trial'
                                    ? 'تجريبي'
                                    : 'مجاني',
                            style: const TextStyle(color: Colors.white, fontSize: 11),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.edit, color: Colors.white70, size: 18),
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const ProfileScreen()),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Notifications
            _buildSection('الإشعارات', [
              _buildToggleTile(
                'تفعيل الإشعارات',
                'استلام جميع إشعارات التطبيق',
                _notificationsEnabled,
                (v) => setState(() => _notificationsEnabled = v),
              ),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildToggleTile(
                'التذكير اليومي',
                'تذكير يومي بمهامك وعاداتك',
                _dailyReminder,
                (v) => setState(() => _dailyReminder = v),
              ),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildToggleTile(
                'التقرير الأسبوعي',
                'ملخص إنجازات الأسبوع',
                _weeklyReport,
                (v) => setState(() => _weeklyReport = v),
              ),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              ListTile(
                title: const Text('وقت التذكير', style: TextStyle(color: Colors.white, fontSize: 14)),
                subtitle: Text(
                  '${_reminderTime.hour.toString().padLeft(2, '0')}:${_reminderTime.minute.toString().padLeft(2, '0')}',
                  style: TextStyle(color: Colors.white.withOpacity(0.45), fontSize: 12),
                ),
                trailing: const Icon(Icons.access_time, color: AppConstants.primaryPurple, size: 20),
                onTap: () async {
                  final t = await showTimePicker(context: context, initialTime: _reminderTime);
                  if (t != null) setState(() => _reminderTime = t);
                },
              ),
            ]),

            // AI Settings (Phase B)
            _buildSection('إعدادات الذكاء الاصطناعي', [
              _buildArrowTile(
                'مستوى التدخل',
                _aiInterventionLevel == 'minimal' ? 'حد أدنى' : _aiInterventionLevel == 'balanced' ? 'متوازن' : 'نشط',
                () => _showAiInterventionPicker(),
              ),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildArrowTile(
                'أسلوب التوصيات',
                _recommendationStyle == 'direct' ? 'مباشر' : _recommendationStyle == 'contextual' ? 'سياقي' : 'تفصيلي',
                () => _showRecommendationStylePicker(),
              ),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildArrowTile(
                'نبرة المدرب',
                _aiCoachingTone == 'strict' ? 'صارم' : _aiCoachingTone == 'supportive' ? 'داعم' : 'ودود',
                () => _showCoachingTonePicker(),
              ),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildToggleTile(
                'التذكيرات الذكية',
                'اقتراحات بناءً على أنماطك',
                _smartReminders,
                (v) { setState(() => _smartReminders = v); _saveSettings(); },
              ),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildToggleTile(
                'إعادة الجدولة التلقائية',
                'نقل المهام المتأخرة تلقائياً',
                _autoReschedule,
                (v) { setState(() => _autoReschedule = v); _saveSettings(); },
              ),
            ]),

            // Account
            _buildSection('الحساب', [
              _buildArrowTile('تغيير كلمة المرور', 'تحديث كلمة المرور', () {}),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildArrowTile('اشتراكات البريميوم', 'إدارة خطة الاشتراك', () {}),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildArrowTile(
                'حذف الحساب',
                'حذف جميع البيانات نهائياً',
                () => _showDeleteConfirm(context),
                leading: const Icon(Icons.delete_outline, color: Colors.red, size: 18),
              ),
            ]),

            // App Info
            _buildSection('عن التطبيق', [
              _buildArrowTile('الإصدار', '1.0.0', () {}),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildArrowTile('سياسة الخصوصية', null, () {}),
              const Divider(height: 1, color: Color(0xFF1E2D4A)),
              _buildArrowTile('شروط الاستخدام', null, () {}),
            ]),

            // Logout
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _showLogoutConfirm(context),
                icon: const Icon(Icons.logout, color: Colors.red, size: 18),
                label: const Text('تسجيل الخروج', style: TextStyle(color: Colors.red)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.red),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  void _showEditProfileDialog(BuildContext context, String currentName) {
    final ctrl = TextEditingController(text: currentName);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppConstants.darkCard,
        title: const Text('تعديل الاسم', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: ctrl,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'الاسم',
            labelStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
            enabledBorder: OutlineInputBorder(
              borderSide: const BorderSide(color: AppConstants.darkBorder),
              borderRadius: BorderRadius.circular(10),
            ),
            focusedBorder: OutlineInputBorder(
              borderSide: const BorderSide(color: AppConstants.primaryPurple),
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('تم تحديث الاسم'), backgroundColor: AppConstants.accentGreen),
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppConstants.primaryPurple),
            child: const Text('حفظ', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showAiInterventionPicker() {
    _showOptionPicker('مستوى التدخل', {'minimal': 'حد أدنى', 'balanced': 'متوازن', 'active': 'نشط'}, _aiInterventionLevel, (v) {
      setState(() => _aiInterventionLevel = v);
      _saveSettings();
    });
  }

  void _showRecommendationStylePicker() {
    _showOptionPicker('أسلوب التوصيات', {'direct': 'مباشر', 'contextual': 'سياقي', 'detailed': 'تفصيلي'}, _recommendationStyle, (v) {
      setState(() => _recommendationStyle = v);
      _saveSettings();
    });
  }

  void _showCoachingTonePicker() {
    _showOptionPicker('نبرة المدرب', {'strict': 'صارم', 'supportive': 'داعم', 'friendly': 'ودود'}, _aiCoachingTone, (v) {
      setState(() => _aiCoachingTone = v);
      _saveSettings();
    });
  }

  void _showOptionPicker(String title, Map<String, String> options, String current, Function(String) onSelect) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppConstants.darkCard,
        title: Text(title, style: const TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: options.entries.map((e) => RadioListTile<String>(
            value: e.key,
            groupValue: current,
            title: Text(e.value, style: const TextStyle(color: Colors.white)),
            activeColor: AppConstants.primaryPurple,
            onChanged: (v) {
              Navigator.pop(ctx);
              if (v != null) onSelect(v);
            },
          )).toList(),
        ),
      ),
    );
  }

  void _showLogoutConfirm(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppConstants.darkCard,
        title: const Text('تسجيل الخروج', style: TextStyle(color: Colors.white)),
        content: const Text('هل تريد تسجيل الخروج؟',
            style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<AuthProvider>().logout();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('خروج', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirm(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppConstants.darkCard,
        title: const Text('حذف الحساب', style: TextStyle(color: Colors.red)),
        content: const Text(
          'سيتم حذف جميع بياناتك نهائياً. هل أنت متأكد؟',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('حذف', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
