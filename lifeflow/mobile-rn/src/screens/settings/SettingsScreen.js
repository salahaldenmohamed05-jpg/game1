/**
 * LifeFlow Mobile - Settings Screen
 * ====================================
 * الإعدادات مع تبديل الثيم
 */

import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, Alert
} from 'react-native';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import { getTheme } from '../../theme/theme';

const PLAN_INFO = {
  free: { label: 'مجاني', color: '#94A3B8', icon: '🆓' },
  trial: { label: 'تجريبي', color: '#F59E0B', icon: '⚡' },
  premium: { label: 'بريميوم', color: '#8B5CF6', icon: '👑' },
  enterprise: { label: 'مؤسسي', color: '#3B82F6', icon: '🏢' },
};

export default function SettingsScreen({ navigation }) {
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const theme = getTheme(isDark);
  const c = theme.colors;

  const plan = user?.subscription_plan || 'free';
  const planInfo = PLAN_INFO[plan] || PLAN_INFO.free;

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد من تسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'خروج',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const styles = createStyles(theme);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Profile Card */}
      <View style={[styles.profileCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.[0] || 'م'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: c.text }]}>{user?.name || 'المستخدم'}</Text>
          <Text style={[styles.profileEmail, { color: c.textSecondary }]}>{user?.email}</Text>
          <View style={[styles.planBadge, { backgroundColor: `${planInfo.color}20` }]}>
            <Text style={[styles.planText, { color: planInfo.color }]}>
              {planInfo.icon} {planInfo.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Appearance */}
      <SectionTitle title="المظهر" theme={theme} />
      <View style={[styles.settingsCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <SettingRow
          icon={isDark ? '🌙' : '☀️'}
          label={isDark ? 'الثيم الليلي' : 'الثيم النهاري'}
          theme={theme}
          rightComponent={
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#E2E8F0', true: `${c.primary}60` }}
              thumbColor={isDark ? c.primary : '#fff'}
            />
          }
        />
      </View>

      {/* Notifications */}
      <SectionTitle title="الإشعارات" theme={theme} />
      <View style={[styles.settingsCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <SettingRow icon="🔔" label="تذكيرات المهام" theme={theme} rightComponent={
          <Switch defaultValue={true} trackColor={{ false: '#E2E8F0', true: `${c.primary}60` }} thumbColor={c.primary} />
        } />
        <Divider c={c} />
        <SettingRow icon="🏃" label="تذكيرات العادات" theme={theme} rightComponent={
          <Switch defaultValue={true} trackColor={{ false: '#E2E8F0', true: `${c.primary}60` }} thumbColor={c.primary} />
        } />
        <Divider c={c} />
        <SettingRow icon="😊" label="تذكير المزاج اليومي" theme={theme} rightComponent={
          <Switch defaultValue={true} trackColor={{ false: '#E2E8F0', true: `${c.primary}60` }} thumbColor={c.primary} />
        } />
      </View>

      {/* Account */}
      <SectionTitle title="الحساب" theme={theme} />
      <View style={[styles.settingsCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <SettingRow icon="👤" label="تعديل الملف الشخصي" theme={theme} showArrow />
        <Divider c={c} />
        <SettingRow icon="🔒" label="تغيير كلمة المرور" theme={theme} showArrow />
        <Divider c={c} />
        {plan === 'free' && (
          <>
            <SettingRow icon="⚡" label="الترقية للبريميوم" theme={theme} showArrow
              labelColor={c.primary} />
            <Divider c={c} />
          </>
        )}
        <TouchableOpacity onPress={handleLogout}>
          <SettingRow icon="🚪" label="تسجيل الخروج" theme={theme} labelColor={c.danger} />
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <SectionTitle title="عن التطبيق" theme={theme} />
      <View style={[styles.settingsCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <SettingRow icon="ℹ️" label="الإصدار 1.0.0" theme={theme} />
        <Divider c={c} />
        <SettingRow icon="📱" label="LifeFlow - مساعدك الشخصي الذكي" theme={theme} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function SectionTitle({ title, theme }) {
  return (
    <Text style={{ color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 20, textAlign: 'right' }}>
      {title}
    </Text>
  );
}

function Divider({ c }) {
  return <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 0 }} />;
}

function SettingRow({ icon, label, theme, rightComponent, showArrow, labelColor }) {
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 20, marginLeft: 8 }}>{icon}</Text>
      <Text style={{ flex: 1, color: labelColor || c.text, fontSize: 15, textAlign: 'right', marginRight: 8 }}>
        {label}
      </Text>
      {rightComponent || (showArrow && (
        <Text style={{ color: c.textMuted, fontSize: 18 }}>←</Text>
      ))}
    </View>
  );
}

const createStyles = (theme) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 80 },
    profileCard: {
      borderRadius: 20, borderWidth: 1, padding: 20,
      flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4,
    },
    avatar: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: '#6C63FF', justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
    profileInfo: { flex: 1, alignItems: 'flex-end' },
    profileName: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
    profileEmail: { fontSize: 13, marginBottom: 8 },
    planBadge: {
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    },
    planText: { fontSize: 12, fontWeight: '600' },
    settingsCard: {
      borderRadius: 16, borderWidth: 1, paddingHorizontal: 16,
    },
  });
};
