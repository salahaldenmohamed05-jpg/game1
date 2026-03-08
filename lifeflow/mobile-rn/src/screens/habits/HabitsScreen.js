/**
 * LifeFlow Mobile - Habits Screen
 * =================================
 * تتبع العادات اليومية مع SQLite
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import { getTheme, CATEGORY_LABELS } from '../../theme/theme';
import { habitDB } from '../../database/database';
import { habitAPI } from '../../services/api';

const HABIT_ICONS = ['💧', '🏃', '📚', '🧘', '🥗', '💊', '✍️', '🎯', '🎵', '💰', '🛏️', '🌿', '🏋️', '🧠', '📝'];
const HABIT_CATEGORIES = ['health', 'fitness', 'learning', 'mindfulness', 'social', 'work', 'finance', 'creativity', 'other'];

export default function HabitsScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const [newHabit, setNewHabit] = useState({
    name_ar: '', category: 'health', icon: '⭐', target_time: '', duration_minutes: 30,
  });

  const { user } = useAuthStore();
  const { isDark } = useThemeStore();
  const theme = getTheme(isDark);
  const c = theme.colors;
  const queryClient = useQueryClient();
  const userId = user?.id;

  // Fetch habits summary
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['habits-today'],
    queryFn: async () => {
      try {
        const remote = await habitAPI.getTodaySummary();
        return remote?.data || remote;
      } catch {
        if (userId) return await habitDB.getTodaySummary(userId);
        throw new Error('غير متصل');
      }
    },
  });

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async (habitId) => {
      try {
        await habitDB.checkIn(habitId, userId);
      } catch (e) {
        if (e.message.includes('بالفعل')) throw e;
      }
      try { await habitAPI.checkIn(habitId); } catch {}
      return habitId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => Alert.alert('تنبيه', err.message || 'فشل التسجيل'),
  });

  // Create habit mutation
  const createMutation = useMutation({
    mutationFn: async (habit) => {
      const localHabit = await habitDB.create({ ...habit, name: habit.name_ar, user_id: userId });
      try { await habitAPI.createHabit(habit); } catch {}
      return localHabit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      setShowAdd(false);
      setNewHabit({ name_ar: '', category: 'health', icon: '⭐', target_time: '', duration_minutes: 30 });
    },
    onError: (err) => Alert.alert('خطأ', err.message || 'فشل في إنشاء العادة'),
  });

  const summary = data || { habits: [], total: 0, completed: 0, completion_percentage: 0 };
  const habits = summary.habits || [];
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Summary */}
        <View style={[styles.progressCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: c.text }]}>إنجاز اليوم</Text>
            <Text style={[styles.progressPercent, { color: c.primary }]}>
              {summary.completion_percentage || 0}%
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: c.inputBg }]}>
            <View
              style={[styles.progressFill, { width: `${summary.completion_percentage || 0}%`, backgroundColor: c.primary }]}
            />
          </View>
          <View style={styles.statsRow}>
            <StatItem label="مكتملة" value={summary.completed || 0} color={c.success} />
            <StatItem label="متبقية" value={summary.pending || (summary.total - summary.completed) || 0} color={c.warning} />
            <StatItem label="إجمالي" value={summary.total || 0} color={c.primary} />
          </View>
        </View>

        {/* Habits Grid */}
        {isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.habitsGrid}>
            {habits.map(habit => (
              <TouchableOpacity
                key={habit.id}
                style={[
                  styles.habitCard,
                  { backgroundColor: c.card, borderColor: habit.completed_today ? c.primary : c.border },
                  habit.completed_today && { backgroundColor: `${c.primary}15` },
                ]}
                onPress={() => !habit.completed_today && checkInMutation.mutate(habit.id)}
                disabled={habit.completed_today || checkInMutation.isPending}
              >
                <View style={styles.habitIconRow}>
                  <View style={[
                    styles.habitCircle,
                    { borderColor: habit.completed_today ? c.primary : c.border },
                    habit.completed_today && { backgroundColor: c.primary },
                  ]}>
                    <Text style={{ fontSize: 24 }}>{habit.completed_today ? '✅' : (habit.icon || '⭐')}</Text>
                  </View>
                  {(habit.current_streak || 0) > 0 && (
                    <View style={styles.streakBadge}>
                      <Text style={styles.streakText}>🔥 {habit.current_streak}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.habitName, { color: c.text }]} numberOfLines={1}>
                  {habit.name_ar || habit.name}
                </Text>
                <Text style={[styles.habitCategory, { color: c.textSecondary }]}>
                  {CATEGORY_LABELS[habit.category] || habit.category}
                </Text>
                {!habit.completed_today && (
                  <View style={[styles.tapHint, { backgroundColor: `${c.primary}15` }]}>
                    <Text style={{ color: c.primary, fontSize: 11 }}>اضغط للإنجاز</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {/* Add Habit Card */}
            <TouchableOpacity
              style={[styles.habitCard, styles.addCard, { borderColor: c.border }]}
              onPress={() => setShowAdd(true)}
            >
              <Text style={{ fontSize: 32, color: c.textSecondary }}>+</Text>
              <Text style={[styles.habitCategory, { color: c.textSecondary, marginTop: 4 }]}>عادة جديدة</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Add Habit Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: c.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>عادة جديدة 💪</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={{ color: c.textSecondary, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: c.textSecondary }]}>الاسم بالعربية</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
                value={newHabit.name_ar}
                onChangeText={t => setNewHabit({ ...newHabit, name_ar: t })}
                placeholder="مثال: شرب الماء"
                placeholderTextColor={c.textMuted}
                textAlign="right"
              />

              <Text style={[styles.inputLabel, { color: c.textSecondary, marginTop: 12 }]}>الأيقونة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
                  {HABIT_ICONS.map(icon => (
                    <TouchableOpacity
                      key={icon}
                      style={{
                        width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
                        backgroundColor: newHabit.icon === icon ? `${c.primary}30` : c.inputBg,
                        borderWidth: 1,
                        borderColor: newHabit.icon === icon ? c.primary : c.border,
                      }}
                      onPress={() => setNewHabit({ ...newHabit, icon })}
                    >
                      <Text style={{ fontSize: 22 }}>{icon}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.inputLabel, { color: c.textSecondary, marginTop: 12 }]}>التصنيف</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
                  {HABIT_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                        backgroundColor: newHabit.category === cat ? c.primary : c.inputBg,
                        borderColor: newHabit.category === cat ? c.primary : c.border,
                      }}
                      onPress={() => setNewHabit({ ...newHabit, category: cat })}
                    >
                      <Text style={{ color: newHabit.category === cat ? '#fff' : c.textSecondary, fontSize: 12 }}>
                        {CATEGORY_LABELS[cat] || cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={[styles.btnRow, { marginTop: 20 }]}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: c.border }]}
                  onPress={() => setShowAdd(false)}
                >
                  <Text style={{ color: c.textSecondary, fontWeight: '600' }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: c.primary }, (!newHabit.name_ar || createMutation.isPending) && { opacity: 0.6 }]}
                  onPress={() => createMutation.mutate(newHabit)}
                  disabled={!newHabit.name_ar || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '700' }}>إضافة العادة 💪</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatItem({ label, value, color }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const createStyles = (theme) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 100 },
    progressCard: {
      borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20,
    },
    progressHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
    },
    progressTitle: { fontSize: 16, fontWeight: '700' },
    progressPercent: { fontSize: 24, fontWeight: '900' },
    progressBar: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
    progressFill: { height: '100%', borderRadius: 4 },
    statsRow: { flexDirection: 'row' },
    habitsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    habitCard: {
      width: '47%', borderRadius: 16, borderWidth: 1,
      padding: 14, alignItems: 'center', minHeight: 130,
    },
    addCard: {
      justifyContent: 'center', backgroundColor: 'transparent',
      borderStyle: 'dashed',
    },
    habitIconRow: {
      flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start', marginBottom: 8,
    },
    habitCircle: {
      width: 52, height: 52, borderRadius: 26,
      borderWidth: 2, justifyContent: 'center', alignItems: 'center',
    },
    streakBadge: {
      backgroundColor: 'rgba(255, 101, 132, 0.2)',
      borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2,
    },
    streakText: { fontSize: 11, color: '#FF6584', fontWeight: '700' },
    habitName: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 2 },
    habitCategory: { fontSize: 11 },
    tapHint: {
      marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    },
    modalOverlay: {
      flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalContent: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, maxHeight: '90%',
    },
    modalHandle: {
      width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 2, alignSelf: 'center', marginBottom: 16,
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
    },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    inputLabel: { fontSize: 13, marginBottom: 6, textAlign: 'right' },
    input: {
      borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    },
    btnRow: { flexDirection: 'row', gap: 12 },
    cancelBtn: {
      flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    },
    submitBtn: {
      flex: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    },
  });
};
