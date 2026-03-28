/**
 * Profile Screen — شاشة الملف الشخصي
 * =====================================
 * Phase B: Flutter parity — fetches/edits /profile-settings/profile
 * Displays role, focus areas, work preferences, energy level, goals.
 */
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_constants.dart';

class ProfileScreen extends StatefulWidget {
  static const routeName = '/profile';
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _loading = true;
  bool _saving = false;
  Map<String, dynamic>? _profile;
  String? _error;

  // Form controllers
  final _roleCtrl = TextEditingController();
  final _weeklyGoalsCtrl = TextEditingController();
  final _monthlyGoalsCtrl = TextEditingController();
  String _preferredWorkTime = 'morning';
  String _energyLevel = 'medium';
  int _deepWorkDuration = 90;
  List<String> _focusAreas = [];

  final _allFocusAreas = [
    'productivity',
    'health',
    'fitness',
    'learning',
    'work',
    'social',
    'finance',
    'creativity',
  ];

  final _focusLabels = {
    'productivity': 'الإنتاجية',
    'health': 'الصحة',
    'fitness': 'اللياقة',
    'learning': 'التعلم',
    'work': 'العمل',
    'social': 'الحياة الاجتماعية',
    'finance': 'المالية',
    'creativity': 'الإبداع',
  };

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _roleCtrl.dispose();
    _weeklyGoalsCtrl.dispose();
    _monthlyGoalsCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ApiService.instance;
      final result = await api.getProfileSettings();
      if (result['success'] == true && result['data'] != null) {
        final data = result['data'];
        setState(() {
          _profile = data;
          _roleCtrl.text = data['role'] ?? '';
          _weeklyGoalsCtrl.text = data['weekly_goals'] ?? '';
          _monthlyGoalsCtrl.text = data['monthly_goals'] ?? '';
          _preferredWorkTime = data['preferred_work_time'] ?? 'morning';
          _energyLevel = data['energy_level'] ?? 'medium';
          _deepWorkDuration = data['deep_work_duration'] ?? 90;
          _focusAreas = List<String>.from(data['focus_areas'] ?? []);
        });
      }
    } catch (e) {
      setState(() => _error = 'تعذر تحميل الملف الشخصي');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    try {
      final api = ApiService.instance;
      final result = await api.updateProfileSettings({
        'role': _roleCtrl.text.trim(),
        'focus_areas': _focusAreas,
        'preferred_work_time': _preferredWorkTime,
        'energy_level': _energyLevel,
        'deep_work_duration': _deepWorkDuration,
        'weekly_goals': _weeklyGoalsCtrl.text.trim(),
        'monthly_goals': _monthlyGoalsCtrl.text.trim(),
      });
      if (result['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('تم حفظ الملف الشخصي'),
              backgroundColor: AppConstants.accentGreen,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('فشل الحفظ: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      appBar: AppBar(
        backgroundColor: AppConstants.darkSurface,
        title: const Text('الملف الشخصي',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (!_loading)
            IconButton(
              icon: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.save, color: AppConstants.primaryPurple),
              onPressed: _saving ? null : _saveProfile,
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppConstants.primaryPurple))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, style: const TextStyle(color: Colors.white70)),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: _loadProfile,
                        child: const Text('إعادة المحاولة'),
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // User header card
                      _buildUserCard(user),
                      const SizedBox(height: 24),

                      // Role
                      _buildSectionTitle('الدور / الوظيفة'),
                      _buildTextField(_roleCtrl, 'مثال: طالب، مبرمج، مصمم'),
                      const SizedBox(height: 20),

                      // Focus Areas
                      _buildSectionTitle('مجالات التركيز'),
                      _buildFocusChips(),
                      const SizedBox(height: 20),

                      // Work Time Preference
                      _buildSectionTitle('وقت العمل المفضل'),
                      _buildWorkTimePicker(),
                      const SizedBox(height: 20),

                      // Energy Level
                      _buildSectionTitle('مستوى الطاقة'),
                      _buildEnergyPicker(),
                      const SizedBox(height: 20),

                      // Deep Work Duration
                      _buildSectionTitle('مدة التركيز العميق (دقيقة)'),
                      _buildDeepWorkSlider(),
                      const SizedBox(height: 20),

                      // Goals
                      _buildSectionTitle('أهداف الأسبوع'),
                      _buildTextField(_weeklyGoalsCtrl, 'أهدافك لهذا الأسبوع'),
                      const SizedBox(height: 16),
                      _buildSectionTitle('أهداف الشهر'),
                      _buildTextField(_monthlyGoalsCtrl, 'أهدافك لهذا الشهر'),
                      const SizedBox(height: 32),

                      // Save Button
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _saving ? null : _saveProfile,
                          icon: const Icon(Icons.save),
                          label: Text(_saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppConstants.primaryPurple,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
    );
  }

  Widget _buildUserCard(dynamic user) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppConstants.primaryPurple, AppConstants.accentPink],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: Colors.white.withOpacity(0.2),
            child: Text(
              user?.name?.isNotEmpty == true ? user!.name[0] : 'م',
              style: const TextStyle(
                  color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user?.name ?? 'المستخدم',
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                const SizedBox(height: 2),
                Text(user?.email ?? '',
                    style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 13)),
                if (_roleCtrl.text.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(_roleCtrl.text,
                      style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title,
          style: const TextStyle(
              color: AppConstants.primaryPurple,
              fontSize: 13,
              fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildTextField(TextEditingController ctrl, String hint) {
    return TextField(
      controller: ctrl,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
        filled: true,
        fillColor: AppConstants.darkCard,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppConstants.darkBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppConstants.darkBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppConstants.primaryPurple),
        ),
      ),
    );
  }

  Widget _buildFocusChips() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _allFocusAreas.map((area) {
        final isSelected = _focusAreas.contains(area);
        return FilterChip(
          label: Text(_focusLabels[area] ?? area,
              style: TextStyle(
                  color: isSelected ? Colors.white : Colors.white70, fontSize: 12)),
          selected: isSelected,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                _focusAreas.add(area);
              } else {
                _focusAreas.remove(area);
              }
            });
          },
          selectedColor: AppConstants.primaryPurple.withOpacity(0.8),
          backgroundColor: AppConstants.darkCard,
          checkmarkColor: Colors.white,
          side: BorderSide(
              color: isSelected ? AppConstants.primaryPurple : AppConstants.darkBorder),
        );
      }).toList(),
    );
  }

  Widget _buildWorkTimePicker() {
    final options = {
      'morning': 'صباحاً ☀️',
      'afternoon': 'ظهراً 🌤️',
      'evening': 'مساءً 🌙',
      'night': 'ليلاً 🌃',
    };
    return Wrap(
      spacing: 8,
      children: options.entries.map((e) {
        final isSelected = _preferredWorkTime == e.key;
        return ChoiceChip(
          label: Text(e.value,
              style: TextStyle(
                  color: isSelected ? Colors.white : Colors.white70, fontSize: 12)),
          selected: isSelected,
          onSelected: (_) => setState(() => _preferredWorkTime = e.key),
          selectedColor: AppConstants.primaryPurple,
          backgroundColor: AppConstants.darkCard,
          side: BorderSide(
              color: isSelected ? AppConstants.primaryPurple : AppConstants.darkBorder),
        );
      }).toList(),
    );
  }

  Widget _buildEnergyPicker() {
    final options = {'low': 'منخفض 🔋', 'medium': 'متوسط ⚡', 'high': 'عالي 🔥'};
    return Wrap(
      spacing: 8,
      children: options.entries.map((e) {
        final isSelected = _energyLevel == e.key;
        return ChoiceChip(
          label: Text(e.value,
              style: TextStyle(
                  color: isSelected ? Colors.white : Colors.white70, fontSize: 12)),
          selected: isSelected,
          onSelected: (_) => setState(() => _energyLevel = e.key),
          selectedColor: AppConstants.primaryPurple,
          backgroundColor: AppConstants.darkCard,
          side: BorderSide(
              color: isSelected ? AppConstants.primaryPurple : AppConstants.darkBorder),
        );
      }).toList(),
    );
  }

  Widget _buildDeepWorkSlider() {
    return Column(
      children: [
        Slider(
          value: _deepWorkDuration.toDouble(),
          min: 15,
          max: 180,
          divisions: 11,
          label: '$_deepWorkDuration دقيقة',
          activeColor: AppConstants.primaryPurple,
          inactiveColor: AppConstants.darkBorder,
          onChanged: (v) => setState(() => _deepWorkDuration = v.round()),
        ),
        Text('$_deepWorkDuration دقيقة',
            style: const TextStyle(color: Colors.white70, fontSize: 12)),
      ],
    );
  }
}
