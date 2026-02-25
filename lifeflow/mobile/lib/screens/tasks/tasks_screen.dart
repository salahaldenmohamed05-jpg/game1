/**
 * Tasks Screen - شاشة المهام
 * =============================
 * إدارة وعرض المهام
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/task_provider.dart';
import '../../models/task_model.dart';
import '../../utils/app_constants.dart';

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  void _showAddTaskSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AddTaskSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final taskProvider = context.watch<TaskProvider>();

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      appBar: AppBar(
        title: const Text('المهام'),
        actions: [
          // Filter button
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            color: AppConstants.darkCard,
            onSelected: taskProvider.setFilter,
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'all', child: Text('الكل', style: TextStyle(fontFamily: AppConstants.fontFamily))),
              const PopupMenuItem(value: 'today', child: Text('اليوم', style: TextStyle(fontFamily: AppConstants.fontFamily))),
              const PopupMenuItem(value: 'pending', child: Text('معلقة', style: TextStyle(fontFamily: AppConstants.fontFamily))),
              const PopupMenuItem(value: 'completed', child: Text('مكتملة', style: TextStyle(fontFamily: AppConstants.fontFamily))),
              const PopupMenuItem(value: 'overdue', child: Text('متأخرة', style: TextStyle(fontFamily: AppConstants.fontFamily))),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddTaskSheet,
        icon: const Icon(Icons.add),
        label: const Text(
          'مهمة جديدة',
          style: TextStyle(fontFamily: AppConstants.fontFamily, fontWeight: FontWeight.w600),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: taskProvider.loadTasks,
        color: AppConstants.primaryPurple,
        backgroundColor: AppConstants.darkCard,
        child: Column(
          children: [
            // Stats Bar
            _StatsBar(
              total: taskProvider.allTasks.length,
              pending: taskProvider.pendingCount,
              completed: taskProvider.completedCount,
              overdue: taskProvider.overdueCount,
            ),

            // Filter chips
            _FilterChips(
              currentFilter: taskProvider.filter,
              onFilterChanged: taskProvider.setFilter,
            ),

            // Task List
            Expanded(
              child: taskProvider.isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: AppConstants.primaryPurple,
                      ),
                    )
                  : taskProvider.tasks.isEmpty
                      ? _EmptyState(
                          filter: taskProvider.filter,
                          onAdd: _showAddTaskSheet,
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: taskProvider.tasks.length,
                          itemBuilder: (context, index) {
                            final task = taskProvider.tasks[index];
                            return _TaskCard(
                              task: task,
                              onComplete: () => context
                                  .read<TaskProvider>()
                                  .completeTask(task.id),
                              onDelete: () => context
                                  .read<TaskProvider>()
                                  .deleteTask(task.id),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

// Stats Bar
class _StatsBar extends StatelessWidget {
  final int total, pending, completed, overdue;

  const _StatsBar({
    required this.total,
    required this.pending,
    required this.completed,
    required this.overdue,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppConstants.darkCard,
        borderRadius: BorderRadius.circular(AppConstants.radiusL),
        border: Border.all(color: AppConstants.darkBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _StatItem(value: total, label: 'الكل', color: AppConstants.primaryPurple),
          _StatItem(value: pending, label: 'معلقة', color: AppConstants.accentOrange),
          _StatItem(value: completed, label: 'مكتملة', color: AppConstants.accentGreen),
          _StatItem(value: overdue, label: 'متأخرة', color: AppConstants.accentRed),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final int value;
  final String label;
  final Color color;

  const _StatItem({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value.toString(),
          style: TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 22,
            fontWeight: FontWeight.w900,
            color: color,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            fontFamily: AppConstants.fontFamily,
            fontSize: 11,
            color: AppConstants.textMuted,
          ),
        ),
      ],
    );
  }
}

// Filter Chips
class _FilterChips extends StatelessWidget {
  final String currentFilter;
  final Function(String) onFilterChanged;

  const _FilterChips({required this.currentFilter, required this.onFilterChanged});

  @override
  Widget build(BuildContext context) {
    final filters = [
      {'id': 'all', 'label': 'الكل'},
      {'id': 'today', 'label': 'اليوم'},
      {'id': 'pending', 'label': 'معلقة'},
      {'id': 'completed', 'label': 'مكتملة'},
      {'id': 'overdue', 'label': 'متأخرة'},
    ];

    return SizedBox(
      height: 40,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: filters.length,
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isSelected = currentFilter == filter['id'];

          return GestureDetector(
            onTap: () => onFilterChanged(filter['id']!),
            child: AnimatedContainer(
              duration: AppConstants.animFast,
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppConstants.primaryPurple
                    : AppConstants.darkCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected
                      ? AppConstants.primaryPurple
                      : AppConstants.darkBorder,
                ),
              ),
              child: Text(
                filter['label']!,
                style: TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isSelected ? Colors.white : AppConstants.textMuted,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// Task Card
class _TaskCard extends StatelessWidget {
  final Task task;
  final VoidCallback onComplete;
  final VoidCallback onDelete;

  const _TaskCard({required this.task, required this.onComplete, required this.onDelete});

  Color _getPriorityColor() {
    return AppConstants.priorityColors[task.priority] ?? AppConstants.textMuted;
  }

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key(task.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        decoration: BoxDecoration(
          color: AppConstants.accentRed.withOpacity(0.8),
          borderRadius: BorderRadius.circular(AppConstants.radiusL),
        ),
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      onDismissed: (_) => onDelete(),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: AppConstants.darkCard,
          borderRadius: BorderRadius.circular(AppConstants.radiusL),
          border: Border.all(
            color: task.isOverdue
                ? AppConstants.accentRed.withOpacity(0.3)
                : AppConstants.darkBorder,
          ),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          leading: GestureDetector(
            onTap: task.isCompleted ? null : onComplete,
            child: AnimatedContainer(
              duration: AppConstants.animFast,
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: task.isCompleted
                    ? AppConstants.accentGreen
                    : Colors.transparent,
                border: Border.all(
                  color: task.isCompleted
                      ? AppConstants.accentGreen
                      : _getPriorityColor(),
                  width: 2,
                ),
              ),
              child: task.isCompleted
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : null,
            ),
          ),
          title: Text(
            task.title,
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: task.isCompleted
                  ? AppConstants.textMuted
                  : AppConstants.textPrimary,
              decoration: task.isCompleted ? TextDecoration.lineThrough : null,
            ),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 4),
              Row(
                children: [
                  // Priority badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: _getPriorityColor().withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                          color: _getPriorityColor().withOpacity(0.3)),
                    ),
                    child: Text(
                      AppConstants.priorityLabels[task.priority] ?? task.priority,
                      style: TextStyle(
                        fontFamily: AppConstants.fontFamily,
                        fontSize: 10,
                        color: _getPriorityColor(),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (task.dueDate != null) ...[
                    const SizedBox(width: 8),
                    Icon(
                      Icons.access_time,
                      size: 12,
                      color: task.isOverdue
                          ? AppConstants.accentRed
                          : AppConstants.textMuted,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      _formatDueDate(task.dueDate!),
                      style: TextStyle(
                        fontFamily: AppConstants.fontFamily,
                        fontSize: 11,
                        color: task.isOverdue
                            ? AppConstants.accentRed
                            : AppConstants.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
          trailing: task.isRecurring
              ? const Icon(Icons.repeat, size: 16, color: AppConstants.textMuted)
              : null,
        ),
      ),
    );
  }

  String _formatDueDate(DateTime date) {
    final now = DateTime.now();
    final diff = date.difference(now);

    if (diff.inDays == 0) {
      return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } else if (diff.inDays == 1) {
      return 'غداً';
    } else if (diff.inDays == -1) {
      return 'أمس';
    } else {
      return '${date.day}/${date.month}';
    }
  }
}

// Empty State
class _EmptyState extends StatelessWidget {
  final String filter;
  final VoidCallback onAdd;

  const _EmptyState({required this.filter, required this.onAdd});

  @override
  Widget build(BuildContext context) {
    String message;
    switch (filter) {
      case 'today':
        message = 'لا توجد مهام لليوم 🎉';
        break;
      case 'pending':
        message = 'لا توجد مهام معلقة 👍';
        break;
      case 'completed':
        message = 'لم تكتمل أي مهمة بعد';
        break;
      case 'overdue':
        message = 'لا توجد مهام متأخرة ✨';
        break;
      default:
        message = 'لا توجد مهام بعد';
    }

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('📋', style: TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          Text(
            message,
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 16,
              color: AppConstants.textMuted,
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add, size: 18),
            label: const Text(
              'إضافة مهمة',
              style: TextStyle(fontFamily: AppConstants.fontFamily),
            ),
          ),
        ],
      ),
    );
  }
}

// Add Task Sheet
class _AddTaskSheet extends StatefulWidget {
  const _AddTaskSheet();

  @override
  State<_AddTaskSheet> createState() => _AddTaskSheetState();
}

class _AddTaskSheetState extends State<_AddTaskSheet> {
  final _titleController = TextEditingController();
  String _priority = 'medium';
  String _category = 'personal';
  DateTime? _dueDate;
  bool _isLoading = false;

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_titleController.text.trim().isEmpty) return;

    setState(() => _isLoading = true);

    final success = await context.read<TaskProvider>().createTask(
      title: _titleController.text.trim(),
      priority: _priority,
      category: _category,
      dueDate: _dueDate,
    );

    if (success && mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إضافة المهمة ✓', style: TextStyle(fontFamily: AppConstants.fontFamily)),
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
    return Container(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      decoration: const BoxDecoration(
        color: AppConstants.darkSurface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppConstants.darkBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),

          const Text(
            'مهمة جديدة',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppConstants.textPrimary,
            ),
          ),
          const SizedBox(height: 16),

          // Title
          TextField(
            controller: _titleController,
            autofocus: true,
            style: const TextStyle(
              fontFamily: AppConstants.fontFamily,
              color: AppConstants.textPrimary,
            ),
            decoration: const InputDecoration(
              hintText: 'عنوان المهمة...',
              filled: true,
              fillColor: AppConstants.darkCard,
            ),
          ),
          const SizedBox(height: 12),

          // Priority & Category Row
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _priority,
                  dropdownColor: AppConstants.darkCard,
                  style: const TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    color: AppConstants.textPrimary,
                    fontSize: 13,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'الأولوية',
                    filled: true,
                    fillColor: AppConstants.darkCard,
                  ),
                  items: [
                    const DropdownMenuItem(value: 'low', child: Text('منخفضة')),
                    const DropdownMenuItem(value: 'medium', child: Text('متوسطة')),
                    const DropdownMenuItem(value: 'high', child: Text('عالية')),
                    const DropdownMenuItem(value: 'urgent', child: Text('عاجلة')),
                  ],
                  onChanged: (v) => setState(() => _priority = v!),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _category,
                  dropdownColor: AppConstants.darkCard,
                  style: const TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    color: AppConstants.textPrimary,
                    fontSize: 13,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'الفئة',
                    filled: true,
                    fillColor: AppConstants.darkCard,
                  ),
                  items: [
                    const DropdownMenuItem(value: 'personal', child: Text('شخصي')),
                    const DropdownMenuItem(value: 'work', child: Text('عمل')),
                    const DropdownMenuItem(value: 'health', child: Text('صحة')),
                    const DropdownMenuItem(value: 'social', child: Text('اجتماعي')),
                  ],
                  onChanged: (v) => setState(() => _category = v!),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Due Date
          GestureDetector(
            onTap: () async {
              final date = await showDatePicker(
                context: context,
                initialDate: DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365)),
                builder: (_, child) => Theme(
                  data: ThemeData.dark().copyWith(
                    colorScheme: const ColorScheme.dark(
                      primary: AppConstants.primaryPurple,
                    ),
                  ),
                  child: child!,
                ),
              );
              if (date != null) setState(() => _dueDate = date);
            },
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppConstants.darkCard,
                borderRadius: BorderRadius.circular(AppConstants.radiusM),
                border: Border.all(color: AppConstants.darkBorder),
              ),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today_outlined,
                      size: 16, color: AppConstants.textMuted),
                  const SizedBox(width: 10),
                  Text(
                    _dueDate != null
                        ? '${_dueDate!.day}/${_dueDate!.month}/${_dueDate!.year}'
                        : 'تاريخ الاستحقاق (اختياري)',
                    style: TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 13,
                      color: _dueDate != null
                          ? AppConstants.textPrimary
                          : AppConstants.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Submit Button
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
                      'إضافة المهمة',
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
