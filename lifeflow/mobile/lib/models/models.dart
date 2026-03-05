/**
 * Habit Model - نموذج العادة
 * ============================
 */

class Habit {
  final String id;
  final String name;
  final String? description;
  final String? icon;
  final String? color;
  final String frequency; // daily | weekly | weekdays | custom
  final List<String> reminderTimes;
  final int currentStreak;
  final int longestStreak;
  final int totalCompletions;
  final bool completedToday;
  final bool isActive;
  final DateTime createdAt;

  Habit({
    required this.id,
    required this.name,
    this.description,
    this.icon,
    this.color,
    required this.frequency,
    this.reminderTimes = const [],
    this.currentStreak = 0,
    this.longestStreak = 0,
    this.totalCompletions = 0,
    this.completedToday = false,
    this.isActive = true,
    required this.createdAt,
  });

  factory Habit.fromJson(Map<String, dynamic> json) {
    return Habit(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      icon: json['icon'],
      color: json['color'],
      frequency: json['frequency'] ?? 'daily',
      reminderTimes: (json['reminder_times'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList() ?? [],
      currentStreak: json['current_streak'] ?? 0,
      longestStreak: json['longest_streak'] ?? 0,
      totalCompletions: json['total_completions'] ?? 0,
      completedToday: json['completed_today'] ?? false,
      isActive: json['is_active'] ?? true,
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'icon': icon,
    'color': color,
    'frequency': frequency,
    'reminder_times': reminderTimes,
    'current_streak': currentStreak,
    'is_active': isActive,
  };
}

// ============================================================

/**
 * Mood Model - نموذج المزاج
 */

class MoodEntry {
  final String id;
  final int moodScore;
  final List<String> emotions;
  final String? note;
  final int? energyLevel;
  final String period; // morning | afternoon | evening | night
  final DateTime date;
  final DateTime createdAt;

  MoodEntry({
    required this.id,
    required this.moodScore,
    this.emotions = const [],
    this.note,
    this.energyLevel,
    required this.period,
    required this.date,
    required this.createdAt,
  });

  factory MoodEntry.fromJson(Map<String, dynamic> json) {
    return MoodEntry(
      id: json['id']?.toString() ?? '',
      moodScore: json['mood_score'] ?? 5,
      emotions: (json['emotions'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList() ?? [],
      note: json['note'],
      energyLevel: json['energy_level'],
      period: json['period'] ?? 'evening',
      date: DateTime.tryParse(json['date'] ?? '') ?? DateTime.now(),
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'mood_score': moodScore,
    'emotions': emotions,
    'note': note,
    'energy_level': energyLevel,
    'period': period,
    'date': date.toIso8601String(),
  };
}

// ============================================================

/**
 * User Model - نموذج المستخدم
 */

class User {
  final String id;
  final String name;
  final String email;
  final String timezone;
  final Map<String, dynamic>? preferences;
  final Map<String, dynamic>? stats;
  final String subscriptionPlan;
  final String subscriptionStatus;
  final DateTime? trialEndsAt;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.timezone = 'Africa/Cairo',
    this.preferences,
    this.stats,
    this.subscriptionPlan = 'free',
    this.subscriptionStatus = 'active',
    this.trialEndsAt,
  });

  bool get isPremium => ['premium', 'enterprise', 'trial'].contains(subscriptionPlan);

  int get trialDaysRemaining {
    if (trialEndsAt == null) return 0;
    final diff = trialEndsAt!.difference(DateTime.now());
    return diff.isNegative ? 0 : diff.inDays;
  }

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      timezone: json['timezone'] ?? 'Africa/Cairo',
      preferences: json['preferences'] as Map<String, dynamic>?,
      stats: json['stats'] as Map<String, dynamic>?,
      subscriptionPlan:   json['subscription_plan']   ?? 'free',
      subscriptionStatus: json['subscription_status'] ?? 'active',
      trialEndsAt: json['trial_ends_at'] != null
        ? DateTime.tryParse(json['trial_ends_at'])
        : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'timezone': timezone,
    'preferences': preferences,
    'subscription_plan':   subscriptionPlan,
    'subscription_status': subscriptionStatus,
    'trial_ends_at': trialEndsAt?.toIso8601String(),
  };
}

// ============================================================

/**
 * AppNotification Model - نموذج الإشعار
 */
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final bool isRead;
  final DateTime createdAt;

  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.isRead,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id']?.toString() ?? '',
      type: json['type'] ?? 'system',
      title: json['title'] ?? '',
      body: json['body'] ?? '',
      isRead: json['is_read'] ?? false,
      createdAt: DateTime.tryParse(json['createdAt'] ?? json['created_at'] ?? '') ?? DateTime.now(),
    );
  }
}
