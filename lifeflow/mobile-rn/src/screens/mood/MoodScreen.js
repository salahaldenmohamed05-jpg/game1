/**
 * LifeFlow Mobile - Mood Screen
 * ================================
 * تتبع المزاج اليومي مع SQLite
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import { getTheme, MOOD_EMOJIS } from '../../theme/theme';
import { moodDB } from '../../database/database';
import { moodAPI } from '../../services/api';

const EMOTION_TAGS = [
  '😰 قلق', '😤 متوتر', '😌 هادئ', '💪 متحمس', '🎯 مركّز',
  '😴 متعب', '🤔 متفكر', '🥳 سعيد', '😔 حزين', '🔥 نشيط',
  '🌟 ملهَم', '😎 واثق', '🤯 مرهق', '🕊️ مرتاح', '💭 مشتت',
];

export default function MoodScreen() {
  const [selectedScore, setSelectedScore] = useState(7);
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [note, setNote] = useState('');

  const { user } = useAuthStore();
  const { isDark } = useThemeStore();
  const theme = getTheme(isDark);
  const c = theme.colors;
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data: todayData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['mood-today'],
    queryFn: async () => {
      try {
        const remote = await moodAPI.getTodayMood();
        return remote;
      } catch {
        if (userId) return await moodDB.getTodayMood(userId);
        throw new Error('غير متصل');
      }
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['mood-stats'],
    queryFn: async () => {
      try {
        const remote = await moodAPI.getMoodStats();
        return remote?.data || remote;
      } catch {
        if (userId) return await moodDB.getStats(userId, 30);
        return null;
      }
    },
  });

  const logMoodMutation = useMutation({
    mutationFn: async () => {
      const data = { mood_score: selectedScore, emotions: selectedEmotions, note };
      // Save locally first
      let result;
      if (userId) {
        result = await moodDB.logMood(userId, data);
      }
      // Sync to server
      try {
        const remote = await moodAPI.logMood(data);
        return remote?.data || remote || result;
      } catch {
        return result;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mood-today'] });
      queryClient.invalidateQueries({ queryKey: ['mood-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setNote('');
      setSelectedEmotions([]);
    },
    onError: (err) => {
      // Show error but don't crash
      console.error('Mood log error:', err);
    },
  });

  const todayMood = todayData ? {
    logged_today: todayData.has_checked_in,
    mood_score: todayData.data?.mood_score,
    note: todayData.data?.note || todayData.data?.journal_entry,
    ai_insight: todayData.data?.ai_recommendation || todayData.data?.ai_insight,
  } : null;

  const currentEmoji = MOOD_EMOJIS.find(m => m.score === selectedScore) || MOOD_EMOJIS[6];
  const styles = createStyles(theme);

  const toggleEmotion = (e) => {
    setSelectedEmotions(prev =>
      prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>تتبع المزاج</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>كيف حالك اليوم؟</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
      ) : todayMood?.logged_today ? (
        /* Already logged today */
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={styles.bigEmoji}>
            {MOOD_EMOJIS.find(m => m.score === todayMood.mood_score)?.emoji || '😊'}
          </Text>
          <Text style={[styles.moodLabel, { color: c.text }]}>
            {MOOD_EMOJIS.find(m => m.score === todayMood.mood_score)?.label}
          </Text>
          <Text style={[styles.alreadyLogged, { color: c.textSecondary }]}>
            سجّلت مزاجك اليوم ✅
          </Text>
          {todayMood.note && (
            <View style={[styles.noteBox, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
              <Text style={[styles.noteText, { color: c.textSecondary }]}>{todayMood.note}</Text>
            </View>
          )}
          {todayMood.ai_insight && (
            <View style={[styles.insightBox, { backgroundColor: `${c.primary}15`, borderColor: `${c.primary}30` }]}>
              <Text style={{ color: c.primary, fontSize: 13 }}>💡 {todayMood.ai_insight}</Text>
            </View>
          )}
        </View>
      ) : (
        /* Mood log form */
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {/* Emoji Display */}
          <View style={styles.emojiCenter}>
            <Text style={styles.bigEmoji}>{currentEmoji.emoji}</Text>
            <Text style={[styles.moodLabel, { color: c.text }]}>{currentEmoji.label}</Text>
            <Text style={{ color: currentEmoji.color, fontWeight: '700', fontSize: 16 }}>
              {selectedScore}/10
            </Text>
          </View>

          {/* Emoji Picker Row */}
          <View style={styles.emojiRow}>
            {MOOD_EMOJIS.map(m => (
              <TouchableOpacity
                key={m.score}
                onPress={() => setSelectedScore(m.score)}
                style={[
                  styles.emojiBtn,
                  selectedScore === m.score && { transform: [{ scale: 1.5 }] },
                ]}
              >
                <Text style={{ fontSize: selectedScore === m.score ? 18 : 16, opacity: selectedScore === m.score ? 1 : 0.4 }}>
                  {m.emoji}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Score Slider (using TouchableOpacity buttons for simplicity) */}
          <View style={styles.scoreRow}>
            {[1,2,3,4,5,6,7,8,9,10].map(score => (
              <TouchableOpacity
                key={score}
                onPress={() => setSelectedScore(score)}
                style={[
                  styles.scoreBtn,
                  { backgroundColor: score <= selectedScore ? currentEmoji.color : c.inputBg },
                ]}
              />
            ))}
          </View>

          {/* Emotion Tags */}
          <View style={styles.tagsSection}>
            <Text style={[styles.tagTitle, { color: c.textSecondary }]}>ما الذي تشعر به؟</Text>
            <View style={styles.tagsWrap}>
              {EMOTION_TAGS.map(emotion => (
                <TouchableOpacity
                  key={emotion}
                  style={[
                    styles.tag,
                    { borderColor: selectedEmotions.includes(emotion) ? c.primary : c.border },
                    selectedEmotions.includes(emotion) && { backgroundColor: `${c.primary}20` },
                  ]}
                  onPress={() => toggleEmotion(emotion)}
                >
                  <Text style={{
                    color: selectedEmotions.includes(emotion) ? c.primary : c.textSecondary,
                    fontSize: 12,
                  }}>
                    {emotion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Note */}
          <TextInput
            style={[styles.noteInput, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
            value={note}
            onChangeText={setNote}
            placeholder="ملاحظة اختيارية... ما الذي يؤثر في مزاجك اليوم؟"
            placeholderTextColor={c.textMuted}
            multiline
            numberOfLines={3}
            textAlign="right"
            textAlignVertical="top"
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: c.primary }, logMoodMutation.isPending && { opacity: 0.6 }]}
            onPress={() => logMoodMutation.mutate()}
            disabled={logMoodMutation.isPending}
          >
            {logMoodMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>💙 تسجيل المزاج</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Stats */}
      {statsData && (
        <View style={styles.statsRow}>
          <StatBox label="متوسط المزاج" value={statsData.average_mood?.toFixed(1) || '—'} color={c.primary} />
          <StatBox label="إجمالي السجلات" value={statsData.total_entries || 0} color={c.success} />
        </View>
      )}
    </ScrollView>
  );
}

function StatBox({ label, value, color }) {
  return (
    <View style={{
      flex: 1, backgroundColor: 'rgba(108,99,255,0.08)',
      borderRadius: 14, padding: 16, margin: 4, alignItems: 'center',
    }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{label}</Text>
    </View>
  );
}

const createStyles = (theme) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 100 },
    header: { marginBottom: 20 },
    title: { fontSize: 24, fontWeight: '900', textAlign: 'right' },
    subtitle: { fontSize: 14, textAlign: 'right', marginTop: 4 },
    card: {
      borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 20,
    },
    bigEmoji: { fontSize: 72, textAlign: 'center', marginBottom: 8 },
    moodLabel: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
    alreadyLogged: { textAlign: 'center', fontSize: 14, marginBottom: 12 },
    noteBox: {
      borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12,
    },
    noteText: { fontSize: 13, textAlign: 'right' },
    insightBox: {
      borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12,
    },
    emojiCenter: { alignItems: 'center', marginBottom: 16 },
    emojiRow: {
      flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16,
    },
    emojiBtn: { padding: 4 },
    scoreRow: {
      flexDirection: 'row', gap: 6, marginBottom: 20, justifyContent: 'center',
    },
    scoreBtn: {
      flex: 1, height: 10, borderRadius: 5,
    },
    tagsSection: { marginBottom: 16 },
    tagTitle: { fontSize: 14, marginBottom: 8, textAlign: 'right' },
    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
    },
    noteInput: {
      borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14,
      height: 80, marginBottom: 16,
    },
    submitBtn: {
      borderRadius: 14, paddingVertical: 16, alignItems: 'center',
      shadowColor: '#6C63FF', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
    },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    statsRow: { flexDirection: 'row', marginTop: 8 },
  });
};
