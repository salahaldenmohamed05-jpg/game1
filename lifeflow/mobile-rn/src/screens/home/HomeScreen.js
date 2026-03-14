/**
 * LifeFlow Mobile - Home/Dashboard Screen
 * ==========================================
 * الشاشة الرئيسية مع الملخص اليومي
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI } from '../../services/api';
import { taskDB, habitDB, moodDB } from '../../database/database';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import { getTheme, MOOD_EMOJIS } from '../../theme/theme';

export default function HomeScreen({ navigation }) {
  const { user } = useAuthStore();
  const { isDark } = useThemeStore();
  const theme = getTheme(isDark);
  const c = theme.colors;
  const userId = user?.id;

  // Try to fetch from API, fallback to local DB
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      try {
        const remote = await dashboardAPI.getDashboard();
        return remote?.data || remote;
      } catch (err) {
        // Fallback to local data
        if (userId) {
          const [tasks, habitsSummary, moodToday] = await Promise.all([
            taskDB.getTodayTasks(userId),
            habitDB.getTodaySummary(userId),
            moodDB.getTodayMood(userId),
          ]);
          return {
            greeting: `مرحباً ${user?.name?.split(' ')[0] || 'مستخدم'} 👋`,
            date: { formatted: new Date().toLocaleDateString('ar-SA') },
            summary: {
              tasks: { total: tasks.length, completed: tasks.filter(t => t.status === 'completed').length },
              habits: { total: habitsSummary.total, completed: habitsSummary.completed, percentage: habitsSummary.completion_percentage },
            },
            today_tasks: tasks.slice(0, 5),
            habits: habitsSummary.habits?.slice(0, 4),
            _offline: true,
          };
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const styles = createStyles(theme);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={[styles.loadingText, { color: c.textSecondary }]}>
          جاري تحميل البيانات...
        </Text>
      </View>
    );
  }

  const { greeting, date, summary, today_tasks = [], habits = [], _offline } = data || {};

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Offline Badge */}
      {_offline && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>📴 وضع عدم الاتصال - البيانات المحلية</Text>
        </View>
      )}

      {/* Greeting */}
      <View style={styles.greetingSection}>
        <Text style={[styles.greeting, { color: c.text }]}>{greeting || `مرحباً ${user?.name}!`}</Text>
        <Text style={[styles.date, { color: c.textSecondary }]}>
          {date?.formatted || new Date().toLocaleDateString('ar-SA')}
        </Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <StatCard
          icon="✅"
          label="المهام"
          value={`${summary?.tasks?.completed || 0}/${summary?.tasks?.total || 0}`}
          theme={theme}
          onPress={() => navigation.navigate('Tasks')}
        />
        <StatCard
          icon="🏃"
          label="العادات"
          value={`${summary?.habits?.percentage || 0}%`}
          theme={theme}
          onPress={() => navigation.navigate('Habits')}
        />
        <StatCard
          icon="💙"
          label="المزاج"
          value={summary?.mood?.today || '—'}
          theme={theme}
          onPress={() => navigation.navigate('Mood')}
        />
      </View>

      {/* Today's Tasks */}
      {today_tasks.length > 0 && (
        <Section title="مهام اليوم" onMore={() => navigation.navigate('Tasks')} theme={theme}>
          {today_tasks.slice(0, 5).map(task => (
            <TaskItem key={task.id} task={task} theme={theme} />
          ))}
        </Section>
      )}

      {/* Today's Habits */}
      {habits.length > 0 && (
        <Section title="عادات اليوم" onMore={() => navigation.navigate('Habits')} theme={theme}>
          <View style={styles.habitsGrid}>
            {habits.slice(0, 4).map(habit => (
              <HabitChip key={habit.id} habit={habit} theme={theme} />
            ))}
          </View>
        </Section>
      )}

      {/* Quick Actions */}
      <Section title="إجراءات سريعة" theme={theme}>
        <View style={styles.quickActions}>
          {[
            { icon: '➕', label: 'مهمة جديدة', screen: 'Tasks' },
            { icon: '😊', label: 'تسجيل المزاج', screen: 'Mood' },
            { icon: '🧠', label: 'رؤى ذكية', screen: 'Insights' },
            { icon: '📅', label: 'التقويم', screen: 'Calendar' },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.quickAction, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => navigation.navigate(action.screen)}
            >
              <Text style={styles.quickActionIcon}>{action.icon}</Text>
              <Text style={[styles.quickActionLabel, { color: c.textSecondary }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

function StatCard({ icon, label, value, theme, onPress }) {
  const c = theme.colors;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: c.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.border,
        padding: 14,
        alignItems: 'center',
        marginHorizontal: 4,
      }}
    >
      <Text style={{ fontSize: 24, marginBottom: 4 }}>{icon}</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: c.primary }}>{value}</Text>
      <Text style={{ fontSize: 11, color: c.textSecondary, marginTop: 2 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, onMore, theme, children }) {
  const c = theme.colors;
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{title}</Text>
        {onMore && (
          <TouchableOpacity onPress={onMore}>
            <Text style={{ fontSize: 13, color: c.primary }}>عرض الكل ←</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function TaskItem({ task, theme }) {
  const c = theme.colors;
  const priorityColor = { urgent: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#22C55E' }[task.priority] || c.primary;
  return (
    <View style={{
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
      borderRightWidth: 3,
      borderRightColor: priorityColor,
    }}>
      <Text style={{ color: c.text, fontSize: 14, fontWeight: '500', textAlign: 'right' }} numberOfLines={1}>
        {task.title}
      </Text>
      {task.due_date && (
        <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: 'right', marginTop: 4 }}>
          ⏰ {new Date(task.due_date).toLocaleDateString('ar-SA')}
        </Text>
      )}
    </View>
  );
}

function HabitChip({ habit, theme }) {
  const c = theme.colors;
  return (
    <View style={{
      backgroundColor: habit.completed_today ? `${c.primary}20` : c.card,
      borderRadius: 12,
      padding: 10,
      width: '48%',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: habit.completed_today ? c.primary : c.border,
      alignItems: 'center',
    }}>
      <Text style={{ fontSize: 22 }}>{habit.completed_today ? '✅' : (habit.icon || '⭐')}</Text>
      <Text style={{ color: c.text, fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
        {habit.name_ar || habit.name}
      </Text>
    </View>
  );
}

const createStyles = (theme) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: 20,
      paddingBottom: 100,
    },
    loadingText: { marginTop: 12, fontSize: 14 },
    offlineBadge: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderRadius: 8,
      padding: 8,
      marginBottom: 16,
      alignItems: 'center',
    },
    offlineText: { color: '#F59E0B', fontSize: 13 },
    greetingSection: { marginBottom: 24 },
    greeting: { fontSize: 26, fontWeight: '900', textAlign: 'right' },
    date: { fontSize: 14, marginTop: 4, textAlign: 'right' },
    statsRow: {
      flexDirection: 'row',
      marginBottom: 24,
    },
    habitsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    quickActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
    },
    quickAction: {
      width: '47%',
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      marginBottom: 4,
    },
    quickActionIcon: { fontSize: 28, marginBottom: 8 },
    quickActionLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  });
};
