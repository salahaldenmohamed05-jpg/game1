import 'package:flutter/foundation.dart';
import '../services/api_service.dart';

/// IntelligenceProvider — Phase 12
/// =================================
/// Manages state for Energy Score, Coach Insights, and Day Planner.
/// Used by EnergyScreen, CoachScreen, and DayPlannerScreen.
class IntelligenceProvider extends ChangeNotifier {
  final ApiService _api = ApiService.instance;

  // ── Energy ─────────────────────────────────────────────────────────────────
  Map<String, dynamic>? _energyData;
  bool _energyLoading = false;
  String? _energyError;

  Map<String, dynamic>? get energyData    => _energyData;
  bool                  get energyLoading => _energyLoading;
  String?               get energyError   => _energyError;

  Future<void> loadEnergyScore(String token) async {
    _energyLoading = true;
    _energyError   = null;
    notifyListeners();

    final res = await _api.getEnergyScore(token);
    if (res['success'] == true) {
      _energyData  = res['data'] as Map<String, dynamic>?;
    } else {
      _energyError = res['error'] ?? 'خطأ في تحميل الطاقة';
    }
    _energyLoading = false;
    notifyListeners();
  }

  // ── Coach ──────────────────────────────────────────────────────────────────
  Map<String, dynamic>? _coachData;
  bool _coachLoading = false;
  String? _coachError;

  Map<String, dynamic>? get coachData    => _coachData;
  bool                  get coachLoading => _coachLoading;
  String?               get coachError   => _coachError;

  Future<void> loadCoachInsights(String token) async {
    _coachLoading = true;
    _coachError   = null;
    notifyListeners();

    final res = await _api.getCoachInsights(token);
    if (res['success'] == true) {
      _coachData  = res['data'] as Map<String, dynamic>?;
    } else {
      _coachError = res['error'] ?? 'خطأ في تحميل المدرب';
    }
    _coachLoading = false;
    notifyListeners();
  }

  // ── Day Planner ────────────────────────────────────────────────────────────
  Map<String, dynamic>? _planData;
  bool _planLoading = false;
  String? _planError;

  Map<String, dynamic>? get planData    => _planData;
  bool                  get planLoading => _planLoading;
  String?               get planError   => _planError;

  Future<void> loadDayPlan(String token, {String? date}) async {
    _planLoading = true;
    _planError   = null;
    notifyListeners();

    final res = await _api.planDay(date: date, token: token);
    if (res['success'] == true) {
      _planData  = res['data'] as Map<String, dynamic>?;
    } else {
      _planError = res['error'] ?? 'خطأ في بناء الخطة';
    }
    _planLoading = false;
    notifyListeners();
  }

  // ── Convenience getters ────────────────────────────────────────────────────
  int    get energyScore  => (_energyData?['energy_score']  as num?)?.toInt() ?? 0;
  String get energyLevel  => _energyData?['level']          as String? ?? 'medium';
  String get energyLabel  => _energyData?['level_label']    as String? ?? 'طاقة متوسطة';

  String get burnoutRisk  => (_coachData?['burnout_warning']?['risk_level'] as String?) ?? 'low';
  bool   get burnoutUrgent => (_coachData?['burnout_warning']?['urgent'] as bool?) ?? false;
  int    get avgScore14d  => (_coachData?['summary']?['avg_score_14d'] as num?)?.toInt() ?? 0;

  int    get scheduledTasks   => (_planData?['stats']?['scheduled_tasks']    as num?)?.toInt() ?? 0;
  int    get energyMatchScore => (_planData?['stats']?['energy_match_score'] as num?)?.toInt() ?? 0;
  List   get schedule         => _planData?['schedule'] as List? ?? [];
  List   get focusWindows     => _planData?['focus_windows'] as List? ?? [];
}
