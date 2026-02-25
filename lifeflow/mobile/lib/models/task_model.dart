/**
 * Task Model - نموذج المهمة
 * ==========================
 * بيانات المهام
 */

class Task {
  final String id;
  final String title;
  final String? description;
  final String status; // pending | in_progress | completed | archived
  final String priority; // urgent | high | medium | low
  final String category; // work | personal | health | social | habit
  final DateTime? dueDate;
  final bool isRecurring;
  final String? recurrencePattern;
  final List<String> tags;
  final DateTime createdAt;
  final DateTime updatedAt;

  Task({
    required this.id,
    required this.title,
    this.description,
    required this.status,
    required this.priority,
    required this.category,
    this.dueDate,
    this.isRecurring = false,
    this.recurrencePattern,
    this.tags = const [],
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isCompleted => status == 'completed';
  bool get isOverdue => dueDate != null && dueDate!.isBefore(DateTime.now()) && !isCompleted;

  factory Task.fromJson(Map<String, dynamic> json) {
    return Task(
      id: json['id']?.toString() ?? '',
      title: json['title'] ?? '',
      description: json['description'],
      status: json['status'] ?? 'pending',
      priority: json['priority'] ?? 'medium',
      category: json['category'] ?? 'personal',
      dueDate: json['due_date'] != null ? DateTime.tryParse(json['due_date']) : null,
      isRecurring: json['is_recurring'] ?? false,
      recurrencePattern: json['recurrence_pattern'],
      tags: (json['tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at'] ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'status': status,
    'priority': priority,
    'category': category,
    'due_date': dueDate?.toIso8601String(),
    'is_recurring': isRecurring,
    'recurrence_pattern': recurrencePattern,
    'tags': tags,
  };

  Task copyWith({
    String? id,
    String? title,
    String? description,
    String? status,
    String? priority,
    String? category,
    DateTime? dueDate,
    bool? isRecurring,
    String? recurrencePattern,
    List<String>? tags,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Task(
      id: id ?? this.id,
      title: title ?? this.title,
      description: description ?? this.description,
      status: status ?? this.status,
      priority: priority ?? this.priority,
      category: category ?? this.category,
      dueDate: dueDate ?? this.dueDate,
      isRecurring: isRecurring ?? this.isRecurring,
      recurrencePattern: recurrencePattern ?? this.recurrencePattern,
      tags: tags ?? this.tags,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
