/**
 * LifeFlow Mobile - Navigation
 * ==============================
 * هيكل التنقل بين الشاشات
 */

import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import useAuthStore from '../store/authStore';
import useThemeStore from '../store/themeStore';
import { getTheme } from '../theme/theme';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import HomeScreen from '../screens/home/HomeScreen';
import TasksScreen from '../screens/tasks/TasksScreen';
import HabitsScreen from '../screens/habits/HabitsScreen';
import MoodScreen from '../screens/mood/MoodScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, color }) {
  const icons = {
    Home: '🏠',
    Tasks: '✅',
    Habits: '🏃',
    Mood: '💙',
    Settings: '⚙️',
  };
  return (
    <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.6 }}>
      {icons[name] || '●'}
    </Text>
  );
}

function MainTabs() {
  const { isDark } = useThemeStore();
  const theme = getTheme(isDark);
  const c = theme.colors;

  const tabTheme = {
    tabBarStyle: {
      backgroundColor: c.tabBar,
      borderTopColor: c.border,
      borderTopWidth: 1,
      paddingBottom: 8,
      paddingTop: 8,
      height: 70,
    },
    tabBarActiveTintColor: c.primary,
    tabBarInactiveTintColor: c.textMuted,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    headerStyle: { backgroundColor: c.header },
    headerTintColor: c.text,
    headerTitleStyle: { fontWeight: '700', fontSize: 18 },
    headerShadowVisible: false,
  };

  return (
    <Tab.Navigator screenOptions={tabTheme}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ focused, color }) => <TabIcon name="Home" focused={focused} color={color} />,
          headerTitle: 'LifeFlow 🌊',
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          title: 'المهام',
          tabBarIcon: ({ focused, color }) => <TabIcon name="Tasks" focused={focused} color={color} />,
          headerTitle: 'المهام ✅',
        }}
      />
      <Tab.Screen
        name="Habits"
        component={HabitsScreen}
        options={{
          title: 'العادات',
          tabBarIcon: ({ focused, color }) => <TabIcon name="Habits" focused={focused} color={color} />,
          headerTitle: 'العادات 🏃',
        }}
      />
      <Tab.Screen
        name="Mood"
        component={MoodScreen}
        options={{
          title: 'المزاج',
          tabBarIcon: ({ focused, color }) => <TabIcon name="Mood" focused={focused} color={color} />,
          headerTitle: 'تتبع المزاج 💙',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'الإعدادات',
          tabBarIcon: ({ focused, color }) => <TabIcon name="Settings" focused={focused} color={color} />,
          headerTitle: 'الإعدادات ⚙️',
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isHydrated } = useAuthStore();
  const { isDark, isHydrated: themeHydrated } = useThemeStore();

  if (!isHydrated || !themeHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A2E' }}>
        <Text style={{ color: '#6C63FF', fontSize: 48 }}>🌊</Text>
        <Text style={{ color: '#E2E8F0', fontSize: 20, fontWeight: '700', marginTop: 12 }}>LifeFlow</Text>
      </View>
    );
  }

  const navTheme = isDark ? {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: '#1A1A2E', card: '#16213E', border: 'rgba(108,99,255,0.2)', text: '#E2E8F0', primary: '#6C63FF' },
  } : {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: '#F1F5F9', card: '#FFFFFF', border: 'rgba(108,99,255,0.2)', text: '#1E293B', primary: '#6C63FF' },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
