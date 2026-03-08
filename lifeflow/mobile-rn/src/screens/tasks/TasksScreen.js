/**
 * LifeFlow Mobile - Tasks Screen
 * =================================
 * إدارة المهام مع التخزين المحلي والمزامنة
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, ActivityIndicator,
  RefreshControl, KeyboardAvoidingView, Platform
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import { getTheme, PRIORITY_COLORS, CATEGORY_LABELS, PRIORITY_LABELS } from '../../theme/theme';
import { taskDB } from '../../database/database';
import { taskAPI } from '../../services/api';

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'معلقة' },
  { key: 'in_progress', label: 'جارية' },
  { key: 'completed', label: 'مكتملة' },
];

export default function TasksScreen() {
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', category: 'personal', priority: 'medium' });

  const { user } = useAuthStore();
  const { isDark } = useThemeStore();
  const theme = getTheme(isDark);
  const c = theme.colors;
  const queryClient = useQueryClient();
  const userId = user?.id;

  // Fetch tasks - local first, then try API
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      try {
        const remote = await taskAPI.getTasks(filter !== 'all' ? { status: filter } : {});
        return remote?.data?.tasks || remote?.tasks || [];
      } catch {
        // Fallback to local DB
        if (userId) {
          return await taskDB.getAll(userId, filter !== 'all' ? { status: filter } : {});
        }
        return [];
      }
    },
  });

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async (task) => {
      // Always save locally first
      const localTask = await taskDB.create({ ...task, user_id: userId });
      // Try to sync to server
      try {
        const remote = await taskAPI.createTask(task);
        return remote?.data || remote;
      } catch {
        return localTask; // Return local task if offline
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowAdd(false);
      setNewTask({ title: '', description: '', category: 'personal', priority: 'medium' });
    },
    onError: (err) => Alert.alert('خطأ', err.message || 'فشل في إنشاء المهمة'),
  });

  // Complete task mutation
  const completeMutation = useMutation({
    mutationFn: async (id) => {
      await taskDB.complete(id);
      try { await taskAPI.completeTask(id); } catch {}
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Delete task mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await taskDB.delete(id);
      try { await taskAPI.deleteTask(id); } catch {}
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasks = data || [];
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Tasks List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
        ) : tasks.length > 0 ? (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              theme={theme}
              onComplete={() => completeMutation.mutate(task.id)}
              onDelete={() => {
                Alert.alert('حذف المهمة', 'هل أنت متأكد؟', [
                  { text: 'إلغاء', style: 'cancel' },
                  { text: 'حذف', style: 'destructive', onPress: () => deleteMutation.mutate(task.id) },
                ]);
              }}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={[styles.emptyTitle, { color: c.textSecondary }]}>لا توجد مهام</Text>
            <Text style={[styles.emptySubtitle, { color: c.textMuted }]}>اضغط + لإضافة مهمة جديدة</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Task FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: c.primary }]}
        onPress={() => setShowAdd(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Add Task Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: c.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>مهمة جديدة ✨</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={{ color: c.textSecondary, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: c.textSecondary }]}>عنوان المهمة *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                  value={newTask.title}
                  onChangeText={t => setNewTask({ ...newTask, title: t })}
                  placeholder="ما الذي تريد إنجازه؟"
                  placeholderTextColor={c.textMuted}
                  textAlign="right"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: c.textSecondary }]}>الوصف</Text>
                <TextInput
                  style={[styles.input, styles.textarea, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                  value={newTask.description}
                  onChangeText={t => setNewTask({ ...newTask, description: t })}
                  placeholder="تفاصيل إضافية..."
                  placeholderTextColor={c.textMuted}
                  textAlign="right"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Priority Selector */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: c.textSecondary }]}>الأولوية</Text>
                <View style={styles.chipRow}>
                  {['urgent', 'high', 'medium', 'low'].map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.chip,
                        { borderColor: PRIORITY_COLORS[p].border },
                        newTask.priority === p && { backgroundColor: `${PRIORITY_COLORS[p].text}20` },
                      ]}
                      onPress={() => setNewTask({ ...newTask, priority: p })}
                    >
                      <Text style={{ color: PRIORITY_COLORS[p].text, fontSize: 12, fontWeight: '600' }}>
                        {PRIORITY_LABELS[p]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: c.border }]}
                  onPress={() => setShowAdd(false)}
                >
                  <Text style={{ color: c.textSecondary, fontWeight: '600' }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: c.primary }, (!newTask.title || createMutation.isPending) && { opacity: 0.6 }]}
                  onPress={() => createMutation.mutate(newTask)}
                  disabled={!newTask.title || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '700' }}>إضافة المهمة</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function TaskCard({ task, theme, onComplete, onDelete }) {
  const c = theme.colors;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const isCompleted = task.status === 'completed';

  return (
    <View style={{
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRightWidth: 4,
      borderRightColor: priorityColor.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Complete button */}
      <TouchableOpacity
        onPress={onComplete}
        disabled={isCompleted}
        style={{
          width: 24, height: 24, borderRadius: 12,
          borderWidth: 2,
          borderColor: isCompleted ? c.success : c.border,
          backgroundColor: isCompleted ? c.success : 'transparent',
          justifyContent: 'center', alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {isCompleted && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
      </TouchableOpacity>

      {/* Task info */}
      <View style={{ flex: 1 }}>
        <Text style={{
          color: isCompleted ? c.textMuted : c.text,
          fontSize: 14, fontWeight: '500',
          textDecorationLine: isCompleted ? 'line-through' : 'none',
          textAlign: 'right',
        }} numberOfLines={1}>
          {task.title}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, gap: 8 }}>
          <View style={{ backgroundColor: `${priorityColor.text}15`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: priorityColor.text, fontSize: 11 }}>{PRIORITY_LABELS[task.priority]}</Text>
          </View>
          <Text style={{ color: c.textMuted, fontSize: 11 }}>{CATEGORY_LABELS[task.category] || task.category}</Text>
        </View>
      </View>

      {/* Delete button */}
      <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}>
        <Text style={{ color: c.danger, fontSize: 18 }}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    filterScroll: { maxHeight: 56, paddingTop: 12 },
    filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    filterChip: {
      paddingHorizontal: 16, paddingVertical: 8,
      borderRadius: 20, backgroundColor: c.inputBg,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterText: { color: c.textSecondary, fontSize: 13, fontWeight: '500' },
    filterTextActive: { color: '#fff' },
    list: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 100 },
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
    emptySubtitle: { fontSize: 14 },
    fab: {
      position: 'absolute', bottom: 24, left: 24,
      width: 56, height: 56, borderRadius: 28,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
    },
    fabIcon: { color: '#fff', fontSize: 28, lineHeight: 32 },
    modalOverlay: {
      flex: 1, justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalContent: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, maxHeight: '85%',
    },
    modalHandle: {
      width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 2, alignSelf: 'center', marginBottom: 16,
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
    },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    inputGroup: { marginBottom: 16 },
    inputLabel: { fontSize: 13, marginBottom: 6, textAlign: 'right' },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    },
    textarea: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 8, borderWidth: 1,
    },
    btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cancelBtn: {
      flex: 1, borderWidth: 1, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    submitBtn: {
      flex: 1.5, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
  });
};
