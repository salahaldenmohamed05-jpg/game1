/**
 * LifeFlow Mobile - Login Screen
 * ================================
 * شاشة تسجيل الدخول وإنشاء الحساب
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import { getTheme } from '../../theme/theme';
import { authAPI } from '../../services/api';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { setAuth } = useAuthStore();
  const { isDark } = useThemeStore();
  const theme = getTheme(isDark);
  const c = theme.colors;

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('تنبيه', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (isRegister && !name) {
      Alert.alert('تنبيه', 'يرجى إدخال اسمك');
      return;
    }

    setLoading(true);
    try {
      let response;
      if (isRegister) {
        response = await authAPI.register({ name, email, password });
      } else {
        response = await authAPI.login({ email, password });
      }

      const payload = response?.data || response;
      const { user, accessToken, refreshToken } = payload;

      if (!accessToken) throw new Error('فشل في المصادقة');

      await setAuth({ user, accessToken, refreshToken });
    } catch (error) {
      Alert.alert('خطأ', error.message || 'فشل في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      const response = await authAPI.login({ email: 'demo@lifeflow.app', password: 'demo123456' });
      const payload = response?.data || response;
      const { user, accessToken, refreshToken } = payload;
      if (!accessToken) throw new Error('فشل في المصادقة');
      await setAuth({ user, accessToken, refreshToken });
    } catch (error) {
      Alert.alert('خطأ', error.message || 'فشل في الدخول كمستخدم تجريبي');
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <LinearGradient
      colors={isDark ? ['#1A1A2E', '#16213E', '#0F3460'] : ['#EEF2FF', '#F1F5F9', '#E0E7FF']}
      style={styles.container}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Title */}
          <View style={styles.header}>
            <Text style={styles.logo}>🌊</Text>
            <Text style={styles.title}>LifeFlow</Text>
            <Text style={styles.subtitle}>مساعدك الشخصي الذكي</Text>
          </View>

          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, !isRegister && styles.tabActive]}
              onPress={() => setIsRegister(false)}
            >
              <Text style={[styles.tabText, !isRegister && styles.tabTextActive]}>
                تسجيل الدخول
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, isRegister && styles.tabActive]}
              onPress={() => setIsRegister(true)}
            >
              <Text style={[styles.tabText, isRegister && styles.tabTextActive]}>
                حساب جديد
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {isRegister && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>الاسم الكامل</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="أدخل اسمك"
                  placeholderTextColor={c.textMuted}
                  textAlign="right"
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>البريد الإلكتروني</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="example@email.com"
                placeholderTextColor={c.textMuted}
                textAlign="left"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>كلمة المرور</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={c.textMuted}
                textAlign="right"
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isRegister ? 'إنشاء الحساب ✅' : 'تسجيل الدخول'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Demo Account */}
          {!isRegister && (
            <TouchableOpacity
              style={styles.demoBtn}
              onPress={handleDemoLogin}
              disabled={loading}
            >
              <Text style={styles.demoBtnText}>
                🎭 جرّب كمستخدم تجريبي
              </Text>
            </TouchableOpacity>
          )}

          {/* Features Preview */}
          <View style={styles.features}>
            {[
              { icon: '📋', text: 'إدارة المهام الذكية' },
              { icon: '🏃', text: 'تتبع العادات اليومية' },
              { icon: '🧠', text: 'رؤى بالذكاء الاصطناعي' },
            ].map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const createStyles = (theme) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1 },
    keyboardView: { flex: 1 },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 40,
      alignItems: 'center',
    },
    header: { alignItems: 'center', marginBottom: 32 },
    logo: { fontSize: 64, marginBottom: 8 },
    title: {
      fontSize: 36,
      fontWeight: '900',
      color: c.primary,
      letterSpacing: 1,
    },
    subtitle: {
      fontSize: 16,
      color: c.textSecondary,
      marginTop: 4,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: c.inputBg,
      borderRadius: 12,
      padding: 4,
      marginBottom: 24,
      width: '100%',
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: c.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tabTextActive: {
      color: '#fff',
    },
    card: {
      width: '100%',
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    inputGroup: { marginBottom: 16 },
    label: {
      fontSize: 13,
      color: c.textSecondary,
      marginBottom: 6,
      textAlign: 'right',
    },
    input: {
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: c.text,
    },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    },
    btnDisabled: { opacity: 0.6 },
    primaryBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    demoBtn: {
      width: '100%',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: c.inputBg,
      marginBottom: 24,
    },
    demoBtnText: {
      color: c.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
    features: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    featureItem: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 12,
      width: (width - 72) / 3,
      borderWidth: 1,
      borderColor: c.border,
    },
    featureIcon: { fontSize: 24, marginBottom: 4 },
    featureText: {
      fontSize: 11,
      color: c.textSecondary,
      textAlign: 'center',
    },
  });
};
