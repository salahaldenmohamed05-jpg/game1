# LifeFlow Mobile Architecture Plan
## Complete Migration Strategy: Next.js Web App to Production-Ready Native Mobile App

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Codebase Analysis](#2-codebase-analysis)
3. [Architecture Decision: React Native (Expo)](#3-architecture-decision)
4. [Phased Migration Strategy](#4-phased-migration-strategy)
5. [Component Migration Map](#5-component-migration-map)
6. [Mobile-Specific Features](#6-mobile-specific-features)
7. [Performance Optimization Plan](#7-performance-optimization-plan)
8. [Folder Structure](#8-folder-structure)
9. [Critical Risks & Mitigations](#9-critical-risks--mitigations)
10. [Execution Plan](#10-execution-plan)

---

## 1. Executive Summary

LifeFlow is an Arabic-first AI-powered life management app (Next.js 14 + Node/Express) with 51 frontend source files (~6,200 lines in core files), 29 backend routes, 26 models, and 61 services. The app uses React + Zustand + React Query + Framer Motion + Tailwind CSS + Socket.IO.

**Chosen Architecture: React Native with Expo (SDK 51+)**

**Key Decision**: Create a new React Native Expo project that **reuses** the API layer, state management patterns, and business logic while **rebuilding** the UI with native components. The backend remains 100% untouched.

---

## 2. Codebase Analysis

### 2.1 Current Tech Stack Inventory

| Layer | Technology | Mobile Compatibility |
|-------|-----------|---------------------|
| Framework | Next.js 14 (Pages Router) | Cannot reuse (SSR/SSG web-only) |
| State (Global) | Zustand 4.4.7 | **Direct reuse** (platform-agnostic) |
| State (Server) | React Query 5.13.4 | **Direct reuse** (platform-agnostic) |
| HTTP Client | Axios 1.6.2 | **Direct reuse** (platform-agnostic) |
| Animation | Framer Motion 10.16 | **Replace** with React Native Reanimated |
| Styling | Tailwind CSS 3.3.6 | **Replace** with NativeWind or StyleSheet |
| Icons | Lucide React 0.294 | **Replace** with lucide-react-native |
| Toasts | react-hot-toast 2.4.1 | **Replace** with react-native-toast-message |
| Forms | react-hook-form 7.48.2 | **Direct reuse** |
| Charts | Recharts 2.10.1 | **Replace** with react-native-svg + victory-native |
| Realtime | socket.io-client 4.6.1 | **Direct reuse** |
| Voice | Web Speech API | **Replace** with expo-speech + expo-av |

### 2.2 Code Reuse Assessment

```
DIRECT REUSE (zero changes):
  - utils/api.js          → API client & all 20+ API modules (575 lines)
  - store/authStore.js    → Auth state + persistence (173 lines)
  - store/syncStore.js    → Sync coordination (74 lines)
  - constants/smartActions.js → Action definitions
  - All business logic (validation, formatting, helpers)

ADAPT (minor changes):
  - React Query hooks/patterns from all views
  - Form validation logic (react-hook-form)
  - Socket.IO connection logic (_app.js lines 162-268)

REBUILD (new native UI):
  - All 35 React components using framer-motion
  - All Tailwind-styled layouts
  - Navigation (Next.js pages → React Navigation)
  - All 23 files using window/document/navigator APIs
```

### 2.3 Browser API Dependencies (23 files)

| API | Files | Mobile Replacement |
|-----|-------|-------------------|
| `localStorage` | 8 files | `@react-native-async-storage/async-storage` |
| `window.location` | api.js, _app.js | Expo Constants / config |
| `navigator.serviceWorker` | _app.js, sw.js | `expo-notifications` |
| `Web Speech API` | useVoiceChat.js | `expo-speech` + `expo-av` |
| `document.addEventListener` | MobileBottomNav, GlobalSearch | React Navigation events |
| `window.addEventListener('keydown')` | GlobalSearch, Dashboard | N/A on mobile (remove) |

### 2.4 RTL & Arabic Support

- **Current**: HTML `dir="rtl"` + Tailwind utilities + Cairo font family
- **Mobile**: React Native's `I18nManager.forceRTL(true)` + `writingDirection: 'rtl'` styles
- **Font**: Cairo loaded via `expo-font` + `@expo-google-fonts/cairo`
- **Risk**: Medium — RN has good RTL support but some third-party libs may not respect it

---

## 3. Architecture Decision

### 3.1 Options Evaluated

#### Option A: React Native Expo (CHOSEN)
| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Code reuse from existing codebase | 9/10 | Zustand, React Query, Axios, react-hook-form all work unchanged |
| Chat UX quality | 9/10 | Native FlatList with keyboard-aware views; smooth scrolling |
| Performance | 9/10 | Native rendering, Hermes engine, 60fps animations |
| Push notifications | 10/10 | `expo-notifications` with FCM/APNs built-in |
| Offline support | 9/10 | `@tanstack/react-query` persistQueryClient + AsyncStorage |
| RTL Arabic support | 8/10 | Native I18nManager + custom RTL utilities |
| Long-term scalability | 9/10 | EAS Build, OTA updates, native module support |
| Dev team ramp-up | 8/10 | Team already knows React; minimal new concepts |
| Time to first deploy | 8/10 | Expo Go for dev, EAS for production builds |

#### Option B: React Native CLI (bare)
| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Code reuse | 9/10 | Same as Expo for JS code |
| Chat UX quality | 9/10 | Same native components |
| Performance | 9/10 | Same Hermes engine |
| Push notifications | 7/10 | Manual FCM/APNs setup |
| Offline support | 9/10 | Same approach |
| RTL Arabic support | 8/10 | Same |
| Long-term scalability | 8/10 | More control but more maintenance |
| Dev team ramp-up | 6/10 | Xcode/Android Studio required from day 1 |
| Time to first deploy | 5/10 | Longer setup; native build config needed |

#### Option C: Capacitor (Ionic)
| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Code reuse | 7/10 | Could reuse more JSX but wrapped in WebView |
| Chat UX quality | 4/10 | **CRITICAL FAIL**: WebView chat = laggy keyboard, scroll jank, no native feel |
| Performance | 5/10 | WebView overhead; DOM rendering not native |
| Push notifications | 7/10 | Capacitor push plugin |
| Offline support | 6/10 | Service worker in WebView; less reliable |
| RTL Arabic support | 6/10 | CSS RTL works but WebView quirks |
| Long-term scalability | 5/10 | Hitting WebView walls requires native plugins |
| Dev team ramp-up | 7/10 | Closer to current web stack |
| Time to first deploy | 7/10 | Faster initial wrap but slower optimization |

#### Option D: Enhanced PWA
| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Code reuse | 10/10 | Zero changes |
| Chat UX quality | 5/10 | No native keyboard handling; iOS PWA limitations |
| Performance | 5/10 | Still 12s initial load; no Hermes |
| Push notifications | 3/10 | **CRITICAL FAIL**: iOS Safari still restricts push notifications for PWAs |
| Offline support | 5/10 | Service worker caching but unreliable on iOS |
| RTL Arabic support | 7/10 | Current CSS approach works |
| Long-term scalability | 3/10 | No app store presence; iOS keeps adding restrictions |
| Dev team ramp-up | 10/10 | No new skills |
| Time to first deploy | 10/10 | Already deployed |

### 3.2 Decision: React Native Expo

**Primary Reasons:**

1. **Chat UX is mission-critical**: LifeFlow's AssistantView (917 lines, 14 hooks, 7 React Query calls) is the core feature. A WebView-based chat (Capacitor/PWA) will never match native keyboard behavior, scroll performance, and haptic feedback. React Native's `FlatList` + `KeyboardAvoidingView` provides production-grade chat UX.

2. **State management ports 1:1**: Zustand (3 stores) and React Query (used in all 35 components) work identically in React Native. The entire API layer (`api.js`, 575 lines, 20+ API modules) copies over with only `getBaseUrl()` needing a config change.

3. **Push notifications are non-negotiable**: LifeFlow's AI nudges, reminders, and proactive messages require reliable push. Expo Notifications provides a unified FCM + APNs API. PWA push on iOS is unreliable; Capacitor requires separate native code.

4. **Performance ceiling**: The current 12-second sandbox load time is partly Next.js SSR overhead and partly the 145KB shared JS bundle. React Native with Hermes eliminates HTML/CSS parsing entirely, giving 2-3x faster perceived startup.

5. **Expo removes native complexity**: The team doesn't need Xcode/Android Studio for 90% of development. EAS Build handles binary compilation. OTA updates via `expo-updates` mean bug fixes deploy without app store review.

**What Expo CANNOT do (and mitigations):**
- Background audio processing → Use `expo-av` with background audio mode (supported)
- Complex native animations → Use `react-native-reanimated` (Expo-compatible)
- Custom native modules → Expo's "prebuild" system allows ejecting per-module without losing Expo benefits

---

## 4. Phased Migration Strategy

### Phase 1: Quick Mobile Deployment (4-6 weeks)
**Goal**: Ship a functional mobile app to TestFlight/Play Store internal testing

#### What to Change
| Item | Action | Effort |
|------|--------|--------|
| Project setup | Create Expo project, configure EAS | 2 days |
| Navigation | React Navigation (bottom tabs + stacks) | 3 days |
| Auth flow | Port `authStore.js` + login/register screens | 3 days |
| API layer | Copy `api.js`, replace `getBaseUrl()` with config, replace `localStorage` with AsyncStorage | 2 days |
| Dashboard | Rebuild DashboardHome with native ScrollView + cards | 5 days |
| Tasks | Rebuild TasksView with native FlatList + modals | 5 days |
| Habits | Rebuild HabitsView with native list + animations | 4 days |
| Assistant Chat | Rebuild AssistantView with FlatList + KeyboardAvoidingView | 7 days |
| Bottom Nav | Adapt MobileBottomNav to React Navigation TabBar | 2 days |
| RTL + Arabic | Configure I18nManager + Cairo font + RTL styles | 2 days |
| Basic styling | Create design system (colors, spacing, typography) from Tailwind config | 3 days |

#### What to Keep (Unchanged)
- Backend (all 29 routes, 61 services, 26 models)
- API contracts (all 20+ API modules)
- Zustand store logic (auth, sync, theme)
- React Query patterns (keys, staleTime, refetch intervals)
- Socket.IO event names and payloads

#### Risk Level: **Medium**
- Chat UX must feel native from day 1; this is the hardest screen
- RTL layout may have unexpected behavior in some RN components

#### Estimated Effort: **1 senior RN dev + 1 mid-level dev, 4-6 weeks**

---

### Phase 2: Native Enhancements (4-6 weeks)
**Goal**: Add features impossible on web; polish UX to App Store quality

#### What to Change
| Item | Action | Effort |
|------|--------|--------|
| Push notifications | `expo-notifications` + backend FCM integration | 4 days |
| Offline caching | React Query `persistQueryClient` + AsyncStorage adapter | 3 days |
| Background sync | `expo-background-fetch` + retry queue | 4 days |
| Deep linking | `expo-linking` + React Navigation deep link config | 3 days |
| Gesture navigation | `react-native-gesture-handler` swipe actions on tasks/habits | 3 days |
| Voice input | `expo-speech` (TTS) + `@react-native-voice/voice` (STT) | 4 days |
| Biometric auth | `expo-local-authentication` (Face ID / fingerprint) | 2 days |
| Haptic feedback | `expo-haptics` on completions, streaks, rewards | 1 day |
| App icon + splash | Custom branded assets via `expo-splash-screen` | 2 days |
| Daily execution flow | Port DailyExecutionFlow (899 lines) + ExecutionScreen (993 lines) | 7 days |
| Performance screens | Port AnalyticsView, FocusTimerView, MoodView | 5 days |
| Widget (iOS/Android) | Today's tasks/habits widget via expo-widget | 5 days |

#### What to Keep
- All Phase 1 screens (iterate on feedback)
- Backend (still untouched)
- API layer (add FCM token registration endpoint usage)

#### Risk Level: **Medium-High**
- Background sync on iOS is throttled; must handle gracefully
- Push notification permissions UX must be designed carefully (ask at the right moment)
- Widget development is Expo's newest feature; may hit edge cases

#### Estimated Effort: **2 devs, 4-6 weeks**

---

### Phase 3: Full Mobile Optimization (6-8 weeks)
**Goal**: Production-quality app with performance parity to top productivity apps

#### What to Change
| Item | Action | Effort |
|------|--------|--------|
| Animations | Replace all Framer Motion with Reanimated 3 shared values | 5 days |
| List virtualization | FlashList for all long lists (tasks, habits, chat) | 3 days |
| Image optimization | `expo-image` with caching + progressive loading | 2 days |
| Bundle optimization | Hermes bytecode, tree shaking, lazy imports | 3 days |
| Memory management | Profile with Flipper; fix leaks in chat/dashboard | 4 days |
| Accessibility | VoiceOver/TalkBack support, semantic roles, Arabic labels | 4 days |
| App Store assets | Screenshots, descriptions, review compliance | 3 days |
| Analytics | `expo-analytics` or Mixpanel for mobile-specific events | 2 days |
| Crash reporting | Sentry React Native integration | 2 days |
| CI/CD | EAS Build + EAS Submit automation | 3 days |
| Testing | Detox E2E tests for critical flows | 5 days |
| Advanced chat | Typing indicators, message reactions, voice messages | 5 days |
| Onboarding | Native onboarding flow with animations | 3 days |
| Settings | Native settings screen with system preferences | 2 days |
| Remaining views | Port all "More" menu views (Calendar, Export, Logs, etc.) | 7 days |

#### What to Keep
- Backend (untouched through all phases)
- API contracts (backward compatible)
- All Phase 1 + 2 features

#### Risk Level: **Low-Medium** (iterating on stable foundation)

#### Estimated Effort: **2-3 devs, 6-8 weeks**

---

## 5. Component Migration Map

### 5.1 Dashboard (Context-Aware) — REBUILD

**Current**: `DashboardHome.jsx` — Uses React Query for 7+ API calls, Framer Motion animations, Tailwind glass-card styling, complex ExecutionStrip + ContextAwareActionCard + DynamicExecutionTimeline.

**Mobile Strategy**: Rebuild with native components.

```
Web Component                    → Mobile Component
─────────────────────────────────────────────────────
DashboardHome (ScrollView)       → DashboardScreen (ScrollView + RefreshControl)
ExecutionStrip                   → ExecutionStripCard (native Pressable + Animated)
ContextAwareActionCard           → ActionCard (native Card with Reanimated)
DynamicExecutionTimeline         → TimelineFlatList (FlatList, virtualized)
BehaviorIntelligenceCard         → BehaviorCard (native)
BurnoutAlert                     → BurnoutBanner (native Alert-style)
QuickActions (embedded)          → FloatingActionButton (native FAB)

REUSE UNCHANGED:
  - All useQuery() hooks (queryKey, queryFn, staleTime)
  - dashboardAPI, engineAPI, taskAPI, habitAPI calls
  - Data transformation logic
  - useSyncStore invalidation patterns

WHY REBUILD (not reuse):
  - 35 Framer Motion animations → Reanimated shared values
  - Tailwind glass-card → native StyleSheet with blur
  - Recharts → victory-native or react-native-svg charts
  - HTML div/button → View/Pressable
```

**Code-Level Suggestion**:
```jsx
// WEB (current): DashboardHome.jsx
<motion.div initial={{opacity:0}} animate={{opacity:1}} className="glass-card p-4">
  <ExecutionStrip onViewChange={onViewChange} />
</motion.div>

// MOBILE (new): screens/DashboardScreen.tsx
import Animated, { FadeIn } from 'react-native-reanimated';
import { RefreshControl, ScrollView } from 'react-native';

<ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} />}>
  <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
    <ExecutionStripCard onNavigate={navigation.navigate} />
  </Animated.View>
</ScrollView>
```

---

### 5.2 TasksView (Smart View) — REBUILD

**Current**: `TasksView.jsx` (968 lines) — Uses React Query for smart-view API, complex filter/sort/group logic, modal for task creation, inline editing, Framer Motion list animations.

**Mobile Strategy**: Rebuild UI, reuse all data logic.

```
Web Component                    → Mobile Component
─────────────────────────────────────────────────────
TasksView (main)                 → TasksScreen (Screen)
Task list (map + motion.div)     → FlashList (virtualized, 60fps)
Filter bar (buttons)             → Horizontal ScrollView chips
Task creation modal              → Bottom Sheet (react-native-bottom-sheet)
Task card                        → Swipeable TaskCard (gesture handler)
Priority selector                → Native SegmentedControl / chips
Date picker                      → @react-native-community/datetimepicker

REUSE UNCHANGED:
  - taskAPI.getSmartView(), createTask(), completeTask(), deleteTask()
  - useQuery(['tasks-smart-view'], ...) pattern
  - PRIORITIES, CATEGORIES constants
  - toCairoTime(), toCairoDate(), getTodayCairo() helpers
  - All useMutation patterns
  - useSyncStore.invalidateAll() after mutations
```

**Swipe Actions (new for mobile)**:
```jsx
// Left swipe → Complete task
// Right swipe → Reschedule
// Long press → Edit/Delete menu
import { Swipeable } from 'react-native-gesture-handler';

<Swipeable
  renderLeftActions={() => <CompleteAction />}
  renderRightActions={() => <RescheduleAction />}
  onSwipeableLeftOpen={() => completeTask(task.id)}
>
  <TaskCard task={task} />
</Swipeable>
```

---

### 5.3 AssistantView (Chat) — REBUILD (highest priority)

**Current**: `AssistantView.jsx` (917 lines) — 14 React hooks, 7 React Query calls, Web Speech API for voice, Framer Motion for message animations, fixed header/scrollable messages/fixed input layout.

**Mobile Strategy**: Complete rebuild with native chat components. This is the most critical screen.

```
Web Component                    → Mobile Component
─────────────────────────────────────────────────────
Message list (div + overflow)    → FlatList (inverted, virtualized)
Message bubble (motion.div)      → Animated MessageBubble (Reanimated)
Input bar (fixed bottom)         → KeyboardAvoidingView + TextInput
Voice input (Web Speech API)     → @react-native-voice/voice (STT)
Voice output (speechSynthesis)   → expo-speech (TTS)
Typing indicator (TypingDots)    → TypingDots (Reanimated)
Quick prompts (buttons)          → Horizontal FlatList chips
Timeline sidebar                 → Separate screen or bottom sheet

REUSE UNCHANGED:
  - chatAPI.createSession(), sendMessage() calls
  - assistantAPI.getSmartTimeline(), completeTimelineTask()
  - handleSend() core logic (session management, message state)
  - WELCOME_MSG, QUICK_PROMPTS constants
  - Message parsing and formatting logic
```

**Critical Chat UX Details**:
```jsx
// MOBILE CHAT ARCHITECTURE
import { FlatList, KeyboardAvoidingView, Platform } from 'react-native';

// 1. Inverted FlatList = messages auto-scroll to bottom
<FlatList
  inverted
  data={[...messages].reverse()}
  renderItem={({item}) => <MessageBubble message={item} />}
  keyExtractor={m => m.id}
  // 2. Maintain scroll position when keyboard appears
  keyboardDismissMode="interactive"
  // 3. Virtualized = handles 1000+ messages without lag
  windowSize={10}
  maxToRenderPerBatch={10}
  // 4. Auto-scroll on new message
  onContentSizeChange={() => flatListRef.current?.scrollToOffset({offset: 0})}
/>

// 5. Keyboard-aware input
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
>
  <ChatInput
    value={input}
    onSend={handleSend}
    onVoice={toggleVoice}
    isRecording={isRecording}
  />
</KeyboardAvoidingView>
```

---

### 5.4 MobileBottomNav — ADAPT

**Current**: `MobileBottomNav.jsx` (397 lines) — 5 primary tabs + "More" bottom sheet, active view persistence in localStorage, badge counts, Framer Motion animations.

**Mobile Strategy**: Adapt to React Navigation's bottom tab navigator.

```jsx
// MOBILE: navigation/TabNavigator.tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Tab = createBottomTabNavigator();

// Primary tabs match current MobileBottomNav:
// الرئيسية (Dashboard), يومك (Daily Flow), المهام (Tasks), المساعد (Assistant), المزيد (More)

<Tab.Navigator
  screenOptions={{
    tabBarStyle: { backgroundColor: '#1A1A2E', borderTopColor: 'rgba(255,255,255,0.1)' },
    tabBarActiveTintColor: '#6C63FF',
    tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
    headerShown: false,
  }}
>
  <Tab.Screen name="Dashboard" component={DashboardStack} options={{
    tabBarLabel: 'الرئيسية',
    tabBarIcon: ({color}) => <LayoutDashboard size={22} color={color} />,
  }} />
  <Tab.Screen name="DailyFlow" component={DailyFlowStack} options={{
    tabBarLabel: 'يومك',
    tabBarIcon: ({color}) => <Play size={22} color={color} />,
  }} />
  <Tab.Screen name="Tasks" component={TasksStack} options={{
    tabBarLabel: 'المهام',
    tabBarIcon: ({color}) => <CheckSquare size={22} color={color} />,
    tabBarBadge: unreadTasks > 0 ? unreadTasks : undefined,
  }} />
  <Tab.Screen name="Assistant" component={AssistantStack} options={{
    tabBarLabel: 'المساعد',
    tabBarIcon: ({color}) => <Sparkles size={22} color={color} />,
  }} />
  <Tab.Screen name="More" component={MoreStack} options={{
    tabBarLabel: 'المزيد',
    tabBarIcon: ({color}) => <Menu size={22} color={color} />,
  }} />
</Tab.Navigator>
```

**REUSE**: Tab structure, icon mapping, badge count logic, "More" menu grouping (Tools, Analytics, Account sections).

**ADAPT**: Replace `onViewChange` callback with `navigation.navigate()`; replace `localStorage` persistence with React Navigation state persistence.

---

### 5.5 QuickCommandInput — REDESIGN

**Current**: `QuickCommandInput.jsx` — Floating overlay on every screen, sends to assistantAPI.sendCommand(), shows inline AI response.

**Mobile Strategy**: Redesign as a floating action button + bottom sheet.

```
Web: Floating input bar at bottom of every screen
Mobile: FAB (sparkle icon) → opens bottom sheet with text input + AI response

WHY REDESIGN:
  - Floating overlay conflicts with bottom tab bar on mobile
  - Keyboard handling needs native behavior
  - FAB is the standard mobile pattern for "quick action from any screen"

REUSE:
  - assistantAPI.sendCommand() call
  - QUICK_HINTS constants
  - Response parsing logic

NEW:
  - FAB component with Reanimated spring animation
  - Bottom sheet with TextInput + response card
  - Haptic feedback on open/close
```

---

## 6. Mobile-Specific Features

### 6.1 Push Notifications (Reminders + AI Nudges)

**Architecture**:
```
Backend (existing)                    Mobile (new)
─────────────────────────────────────────────────────
POST /notifications/fcm-token    ←── expo-notifications registers token
Socket.IO 'push_notification'    ←── Also received as native push when app backgrounded
Socket.IO 'proactive_message'    ←── Displayed as notification with deep link
Notification model (existing)    ←── Query with React Query, mark read
```

**Implementation**:
```typescript
// services/notifications.ts
import * as Notifications from 'expo-notifications';
import { notificationAPI } from './api';

export async function registerPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  })).data;

  // Register with backend (existing endpoint)
  await notificationAPI.registerFCM(token);
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
```

**Notification Types**:
| Type | Trigger | Action |
|------|---------|--------|
| Task reminder | 30min before due_time | Deep link to task detail |
| Habit nudge | At preferred_time | Deep link to habit check-in |
| AI proactive | Backend decision engine | Deep link to assistant chat |
| Streak at risk | 20:00 if not checked in | Deep link to habits |
| Day not started | 10:00 if no start-day | Deep link to daily flow |
| Execution reminder | After 25min idle in session | Deep link to execution |

---

### 6.2 Offline Caching

**Strategy**: React Query `persistQueryClient` with AsyncStorage adapter.

```typescript
// store/queryClient.ts
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'LIFEFLOW_QUERY_CACHE',
});

// Persist strategy: cache critical queries for offline access
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,      // 2 min (matches current web config)
      gcTime: 10 * 60 * 1000,         // 10 min
      networkMode: 'offlineFirst',     // Already set in web _app.js
      retry: 1,
    },
  },
});

// Only persist essential data
persistQueryClient({
  queryClient,
  persister: asyncStoragePersister,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      ['tasks', 'habits', 'dashboard', 'chat-sessions'].some(
        key => query.queryKey[0] === key
      ),
  },
});
```

**Offline Mutation Queue**:
```typescript
// When offline, queue mutations and replay when reconnected
import NetInfo from '@react-native-community/netinfo';

const offlineMutationQueue: PendingMutation[] = [];

// On reconnect, replay
NetInfo.addEventListener((state) => {
  if (state.isConnected && offlineMutationQueue.length > 0) {
    replayMutations(offlineMutationQueue);
  }
});
```

---

### 6.3 Background Sync

```typescript
// services/backgroundSync.ts
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_SYNC_TASK = 'LIFEFLOW_BACKGROUND_SYNC';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // 1. Sync pending mutations (offline queue)
    await replayPendingMutations();

    // 2. Prefetch critical data for offline access
    await prefetchCriticalData();

    // 3. Check for proactive notifications
    await checkProactiveMessages();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register (minimum interval: 15 minutes on iOS)
BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
  minimumInterval: 15 * 60, // 15 minutes
  stopOnTerminate: false,
  startOnBoot: true,
});
```

---

### 6.4 Deep Linking

```typescript
// navigation/linking.ts
const linking = {
  prefixes: ['lifeflow://', 'https://lifeflow.app'],
  config: {
    screens: {
      Dashboard: 'dashboard',
      Tasks: {
        screens: {
          TasksList: 'tasks',
          TaskDetail: 'tasks/:id',
        },
      },
      Assistant: {
        screens: {
          Chat: 'assistant',
          ChatSession: 'assistant/session/:sessionId',
        },
      },
      DailyFlow: 'daily-flow',
      Habits: 'habits',
      More: {
        screens: {
          Mood: 'mood',
          Calendar: 'calendar',
          Analytics: 'analytics',
          Profile: 'profile',
          Settings: 'settings',
        },
      },
    },
  },
};

// Usage in push notifications:
// notification.data.url = 'lifeflow://tasks/123'
// → React Navigation auto-navigates to TaskDetail with id=123
```

---

### 6.5 Gesture Navigation

| Gesture | Screen | Action |
|---------|--------|--------|
| Swipe left on task | TasksScreen | Complete task |
| Swipe right on task | TasksScreen | Reschedule / edit |
| Swipe left on habit | HabitsScreen | Check-in |
| Pull down | All lists | Refresh data |
| Swipe between tabs | Tab navigator | Switch tabs |
| Long press on task | TasksScreen | Quick action menu |
| Pinch on chart | Analytics | Zoom time range |
| Swipe down on modal | Bottom sheets | Dismiss |

---

## 7. Performance Optimization Plan

### 7.1 Current Problems & Root Causes

| Problem | Root Cause | Impact |
|---------|-----------|--------|
| ~12s initial load | Next.js SSR + 145KB shared JS + sandbox latency | Critical |
| API latency | Sandbox network overhead + sequential API calls | High |
| Heavy dashboard render | 7+ parallel API calls + complex layout + animations | High |
| Chat scroll jank | DOM rendering + Framer Motion on long message lists | Medium |
| Memory pressure | All views loaded in single SPA + no virtualization | Medium |

### 7.2 Optimizations

#### A. Startup Performance (Target: <3s cold start)

```
CURRENT WEB:
  HTML download → Parse CSS → Parse 145KB JS → Hydrate React → Render
  Total: ~12 seconds (sandbox)

MOBILE WITH EXPO + HERMES:
  Hermes bytecode (pre-compiled) → Initialize JS → Render native views
  No HTML, no CSS parsing, no hydration
  Target: 1.5-3 seconds cold start
```

**Specific actions**:
1. **Hermes engine**: Pre-compiles JS to bytecode at build time (50-70% faster parse time)
2. **Lazy screen loading**: Only load current tab; defer others
   ```typescript
   const DashboardScreen = React.lazy(() => import('./screens/DashboardScreen'));
   ```
3. **Splash screen hold**: Show branded splash until first data loads
   ```typescript
   SplashScreen.preventAutoHideAsync();
   // After auth + initial data:
   SplashScreen.hideAsync();
   ```
4. **Auth preload**: Check AsyncStorage token during splash, skip login if valid

#### B. API Latency (Target: <500ms perceived)

```
CURRENT: 7 sequential useQuery() calls on dashboard mount
MOBILE OPTIMIZATION:
```

1. **Parallel prefetch on tab focus**:
   ```typescript
   useFocusEffect(
     useCallback(() => {
       // Prefetch all dashboard data in parallel
       queryClient.prefetchQuery({ queryKey: ['dashboard'], queryFn: dashboardAPI.getDashboard });
       queryClient.prefetchQuery({ queryKey: ['engine-today'], queryFn: engineAPI.getToday });
       queryClient.prefetchQuery({ queryKey: ['tasks'], queryFn: taskAPI.getTasks });
     }, [])
   );
   ```

2. **Stale-while-revalidate**: Show cached data immediately, refresh in background (already configured with `networkMode: 'offlineFirst'`)

3. **Optimistic updates for mutations** (already partially implemented):
   ```typescript
   const completeTask = useMutation({
     mutationFn: (id) => taskAPI.completeTask(id),
     onMutate: async (id) => {
       await queryClient.cancelQueries(['tasks']);
       const previous = queryClient.getQueryData(['tasks']);
       // Optimistically update UI
       queryClient.setQueryData(['tasks'], old =>
         old.map(t => t.id === id ? {...t, status: 'completed'} : t)
       );
       return { previous };
     },
     onError: (err, id, context) => {
       queryClient.setQueryData(['tasks'], context.previous);
     },
   });
   ```

#### C. Heavy Rendering (Target: 60fps constant)

1. **FlatList everywhere** (replaces `array.map()` rendering):
   - Tasks list: `FlashList` with estimated item size
   - Chat messages: Inverted `FlatList` with windowSize=10
   - Habits: `FlatList` with sections

2. **Reanimated 3 worklets** (replaces Framer Motion):
   ```typescript
   // UI thread animations — zero JS thread blocking
   const opacity = useSharedValue(0);
   const animatedStyle = useAnimatedStyle(() => ({
     opacity: withTiming(opacity.value, { duration: 300 }),
   }));
   ```

3. **Memoization discipline**:
   ```typescript
   // Memoize expensive renders
   const TaskCard = React.memo(({ task, onComplete }) => { ... });

   // Memoize callbacks passed to lists
   const renderItem = useCallback(({ item }) => (
     <TaskCard task={item} onComplete={handleComplete} />
   ), [handleComplete]);
   ```

4. **Image optimization**: `expo-image` with memory caching (replaces browser image cache)

#### D. Memory Management

1. **Screen unmounting**: React Navigation unmounts inactive stack screens
2. **Chat pagination**: Load last 50 messages, paginate on scroll-up
3. **Query garbage collection**: gcTime of 10 min (already configured)
4. **Flipper profiling**: Monitor heap during development

---

## 8. Folder Structure

```
lifeflow-mobile/
├── app.json                          # Expo config
├── eas.json                          # EAS Build config
├── babel.config.js                   # Babel + Reanimated plugin
├── metro.config.js                   # Metro bundler config
├── tsconfig.json                     # TypeScript config
├── package.json
│
├── assets/
│   ├── fonts/
│   │   └── Cairo-*.ttf               # Arabic font files
│   ├── images/
│   │   ├── splash.png
│   │   ├── icon.png
│   │   └── adaptive-icon.png
│   └── animations/                   # Lottie files for celebrations
│
├── src/
│   ├── app/                          # Entry point
│   │   ├── App.tsx                   # Root component (providers, navigation)
│   │   └── index.ts                  # Expo entry
│   │
│   ├── navigation/
│   │   ├── RootNavigator.tsx         # Auth flow + main tabs
│   │   ├── TabNavigator.tsx          # Bottom tab bar (5 tabs)
│   │   ├── DashboardStack.tsx        # Dashboard → Detail screens
│   │   ├── TasksStack.tsx            # Tasks → Task Detail → Create
│   │   ├── AssistantStack.tsx        # Chat → Session → Timeline
│   │   ├── DailyFlowStack.tsx        # Start Day → Execution → Narrative
│   │   ├── MoreStack.tsx             # More menu → sub-screens
│   │   └── linking.ts               # Deep link configuration
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── OnboardingScreen.tsx
│   │   ├── dashboard/
│   │   │   └── DashboardScreen.tsx
│   │   ├── tasks/
│   │   │   ├── TasksScreen.tsx
│   │   │   ├── TaskDetailScreen.tsx
│   │   │   └── CreateTaskScreen.tsx
│   │   ├── habits/
│   │   │   ├── HabitsScreen.tsx
│   │   │   └── CreateHabitScreen.tsx
│   │   ├── assistant/
│   │   │   ├── ChatScreen.tsx
│   │   │   └── TimelineScreen.tsx
│   │   ├── execution/
│   │   │   ├── DailyFlowScreen.tsx
│   │   │   ├── ExecutionScreen.tsx
│   │   │   └── NarrativeScreen.tsx
│   │   ├── mood/
│   │   │   └── MoodScreen.tsx
│   │   ├── analytics/
│   │   │   └── AnalyticsScreen.tsx
│   │   ├── focus/
│   │   │   └── FocusTimerScreen.tsx
│   │   ├── calendar/
│   │   │   └── CalendarScreen.tsx
│   │   ├── settings/
│   │   │   ├── SettingsScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   └── more/
│   │       └── MoreMenuScreen.tsx
│   │
│   ├── components/                   # Shared UI components
│   │   ├── common/
│   │   │   ├── Card.tsx              # Glass-card equivalent
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Chip.tsx
│   │   │   ├── BottomSheet.tsx       # Reusable bottom sheet
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── LoadingSkeleton.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── FAB.tsx              # Floating Action Button
│   │   ├── dashboard/
│   │   │   ├── ExecutionStripCard.tsx
│   │   │   ├── ActionCard.tsx
│   │   │   ├── BehaviorCard.tsx
│   │   │   └── ProgressRing.tsx
│   │   ├── tasks/
│   │   │   ├── TaskCard.tsx          # Swipeable task card
│   │   │   ├── TaskForm.tsx
│   │   │   ├── PrioritySelector.tsx
│   │   │   └── FilterBar.tsx
│   │   ├── habits/
│   │   │   ├── HabitCard.tsx
│   │   │   ├── HabitForm.tsx
│   │   │   └── StreakBadge.tsx
│   │   ├── chat/
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   ├── QuickPrompts.tsx
│   │   │   └── VoiceButton.tsx
│   │   ├── execution/
│   │   │   ├── BlockCard.tsx
│   │   │   ├── TimerRing.tsx
│   │   │   ├── RewardAnimation.tsx
│   │   │   └── SkipReasons.tsx
│   │   └── widgets/
│   │       ├── QuickCommandFAB.tsx   # Redesigned QuickCommandInput
│   │       └── GlobalSearch.tsx
│   │
│   ├── services/                     # API layer (REUSED from web)
│   │   ├── api.ts                    # Axios config (adapted from web api.js)
│   │   ├── auth.api.ts              # authAPI (copied)
│   │   ├── tasks.api.ts             # taskAPI (copied)
│   │   ├── habits.api.ts            # habitAPI (copied)
│   │   ├── chat.api.ts              # chatAPI (copied)
│   │   ├── assistant.api.ts         # assistantAPI (copied)
│   │   ├── dashboard.api.ts         # dashboardAPI (copied)
│   │   ├── engine.api.ts            # engineAPI (copied)
│   │   ├── dailyFlow.api.ts         # dailyFlowAPI (copied)
│   │   ├── notifications.api.ts     # notificationAPI (copied + push setup)
│   │   ├── socket.ts               # Socket.IO client (adapted)
│   │   ├── backgroundSync.ts       # Background fetch + sync
│   │   └── pushNotifications.ts    # Expo push notification registration
│   │
│   ├── store/                        # State management (REUSED from web)
│   │   ├── authStore.ts             # Zustand auth (adapted: AsyncStorage)
│   │   ├── syncStore.ts            # Zustand sync (copied)
│   │   ├── themeStore.ts           # Zustand theme (adapted)
│   │   └── queryClient.ts          # React Query client + persistence
│   │
│   ├── hooks/                        # Custom hooks
│   │   ├── useVoiceChat.ts          # expo-speech + voice (replaces Web Speech)
│   │   ├── useNetworkStatus.ts     # NetInfo connectivity
│   │   ├── useBackgroundSync.ts    # Background task management
│   │   ├── useDeepLink.ts          # Deep link handling
│   │   └── useHaptics.ts           # Haptic feedback patterns
│   │
│   ├── utils/
│   │   ├── sanitize.ts             # Text sanitizer (copied from web)
│   │   ├── formatters.ts           # Date/time formatters (copied)
│   │   ├── constants.ts            # App constants
│   │   └── rtl.ts                  # RTL helper utilities
│   │
│   └── theme/
│       ├── colors.ts               # Color palette (from Tailwind config)
│       ├── typography.ts           # Font sizes, weights (Cairo)
│       ├── spacing.ts              # Spacing scale
│       └── index.ts                # Unified theme object
```

### Key Design Decisions:

1. **`services/` mirrors web `utils/api.js`**: Each API module is a separate file for tree-shaking. The base Axios config is adapted (AsyncStorage for tokens, config-based URL instead of window.location).

2. **`store/` is nearly identical to web**: Zustand stores are platform-agnostic. Only change: `authStore.ts` uses `zustand/middleware` with AsyncStorage instead of localStorage.

3. **`screens/` vs `components/`**: Screens are route-level containers (connected to navigation); components are reusable UI pieces. This matches React Navigation conventions.

4. **`hooks/`**: Platform-specific hooks replace browser APIs. The web's `useVoiceChat.js` becomes a native implementation using expo-speech + @react-native-voice/voice.

---

## 9. Critical Risks & Mitigations

### Risk 1: Chat UX Breaking on Mobile (CRITICAL)

**Risk**: The AssistantView is 917 lines with complex state (14 hooks, 7 queries, voice, typing indicators). Rebuilding may lose functionality or feel worse than web.

**Mitigation**:
- Build chat screen FIRST in Phase 1 (7 days allocated)
- Use inverted FlatList (proven pattern used by WhatsApp, Telegram RN clones)
- Test on physical devices early (not just simulator)
- Keep the `handleSend()` logic byte-for-byte from web; only change the UI layer
- Use `KeyboardAvoidingView` with platform-specific offset tuning
- Arabic RTL testing must happen on both iOS and Android from day 1

**Acceptance Criteria**: Chat must support: send/receive messages, auto-scroll, keyboard doesn't cover input, voice input works, quick prompts are tappable, 60fps scroll with 100+ messages.

---

### Risk 2: State Sync Issues (HIGH)

**Risk**: Mobile app + web app accessing same backend could cause stale data, especially with the in-memory `localStorage_dayState` Map in daily-flow.routes.js.

**Mitigation**:
- React Query's `refetchOnFocus` (refetch when app comes to foreground)
- Socket.IO reconnect on app foreground (already handles reconnection)
- `useSyncStore.invalidateAll()` on Socket.IO events (already implemented)
- Backend: The in-memory Map is per-server-instance; for multi-device, migrate to Redis (noted in code as TODO)
- Add `If-Modified-Since` headers for conditional fetching

---

### Risk 3: Navigation Complexity (HIGH)

**Risk**: Current web app uses a flat view-switching pattern (`onViewChange` callback in Dashboard.jsx). React Navigation has nested navigators, params passing, deep linking — fundamentally different.

**Mitigation**:
- Map ALL 15+ views to named routes before writing code
- Use TypeScript for navigation params (type-safe routes)
- Test deep links for every screen in Phase 2
- Don't over-nest: maximum 2 levels of stack nesting per tab

**Navigation Map**:
```
Tab Bar
├── Dashboard (Stack)
│   ├── DashboardHome
│   └── ExecutionDetail
├── DailyFlow (Stack)
│   ├── StartDay
│   ├── PlanTimeline
│   ├── ExecutionLoop
│   └── DayNarrative
├── Tasks (Stack)
│   ├── TasksList
│   ├── TaskDetail
│   └── CreateTask
├── Assistant (Stack)
│   ├── Chat
│   └── SessionHistory
└── More (Stack)
    ├── MoreMenu
    ├── Habits
    ├── Mood
    ├── Calendar
    ├── Analytics
    ├── FocusTimer
    ├── Profile
    ├── Settings
    ├── Export
    └── Logs
```

---

### Risk 4: RTL Arabic Support (MEDIUM)

**Risk**: React Native's RTL support is good but inconsistent across third-party libraries. Some gesture handlers, charts, and navigation animations may not respect RTL.

**Mitigation**:
- Call `I18nManager.forceRTL(true)` + `I18nManager.allowRTL(true)` at app startup
- Test EVERY screen in RTL mode on both platforms
- Use `writingDirection: 'rtl'` explicitly on TextInputs
- For charts: `victory-native` has RTL support; configure axis direction
- For swipe gestures: reverse swipe directions in RTL mode
- Create a `useRTL()` hook that provides platform-specific adjustments

---

### Risk 5: Framer Motion Migration (MEDIUM)

**Risk**: 35 files use Framer Motion. Each animation must be manually converted to Reanimated.

**Mitigation**:
- Create an animation utility library mapping common Framer patterns:
  ```typescript
  // utils/animations.ts
  // Replaces: initial={{opacity:0, y:20}} animate={{opacity:1, y:0}}
  export const fadeInUp = FadeInUp.duration(300).springify();

  // Replaces: AnimatePresence + exit animations
  export const fadeOut = FadeOut.duration(200);
  ```
- Phase 1: Use simple Animated API (fewer dependencies)
- Phase 3: Migrate to Reanimated 3 worklets for 60fps

---

### Risk 6: AsyncStorage vs localStorage (LOW)

**Risk**: localStorage is synchronous; AsyncStorage is asynchronous. Code that reads/writes localStorage synchronously will break.

**Mitigation**:
- Zustand's `persist` middleware already handles async storage adapters
- Auth store: Use `waitForHydration()` pattern (already implemented in web's `authStore.js`)
- Create a `storage.ts` utility:
  ```typescript
  import AsyncStorage from '@react-native-async-storage/async-storage';

  export const storage = {
    get: async (key: string) => {
      try { return await AsyncStorage.getItem(key); }
      catch { return null; }
    },
    set: async (key: string, value: string) => {
      try { await AsyncStorage.setItem(key, value); }
      catch { /* log */ }
    },
    remove: async (key: string) => {
      try { await AsyncStorage.removeItem(key); }
      catch { /* log */ }
    },
  };
  ```

---

### Risk 7: Backend In-Memory State (MEDIUM)

**Risk**: `daily-flow.routes.js` uses `const m = {}` (plain object) for day state. This is lost on server restart and doesn't support multiple mobile devices per user.

**Mitigation**:
- Phase 1: Acceptable for MVP (single user per demo)
- Phase 2: Backend task — migrate to Redis or use the existing DayPlan DB table as primary store
- No frontend changes needed; the API contract stays the same

---

### Risk 8: iOS App Store Review (LOW-MEDIUM)

**Risk**: Apple may reject for: AI-generated content without disclosure, Arabic content review challenges, subscription compliance.

**Mitigation**:
- Add "AI-generated" labels on assistant responses
- Ensure all Arabic text is properly localized (no mixed languages in UI labels)
- Subscription: Use RevenueCat for compliant in-app purchases
- Include privacy policy and terms of service in Arabic

---

## 10. Execution Plan

### Team Composition
- **1 Senior React Native Developer** (lead): Architecture, chat, navigation, performance
- **1 Mid-Level React Native Developer**: Screen implementation, styling, testing
- **1 Backend Developer** (part-time Phase 2): Push notifications, Redis migration
- **1 QA/Tester**: Arabic RTL testing, device matrix

### Timeline

```
WEEK 1-2: Foundation
  ├── Expo project setup + EAS config
  ├── Navigation structure (all stacks + tabs)
  ├── Theme system (colors, typography, spacing from Tailwind)
  ├── API layer port (api.ts + all modules)
  ├── Auth store + login/register screens
  └── RTL + Cairo font setup

WEEK 3-4: Core Screens
  ├── AssistantView → ChatScreen (PRIORITY)
  ├── DashboardHome → DashboardScreen
  ├── TasksView → TasksScreen
  └── HabitsView → HabitsScreen

WEEK 5-6: Daily Flow + Polish
  ├── DailyExecutionFlow → DailyFlowScreen
  ├── Bottom tab bar refinement
  ├── QuickCommandFAB
  ├── Bug fixes + RTL testing
  └── TestFlight / Play Store internal release

WEEK 7-8: Native Enhancements
  ├── Push notifications setup
  ├── Offline caching with React Query persist
  ├── Deep linking configuration
  ├── Gesture actions on task/habit cards
  └── Voice input/output (expo-speech + voice)

WEEK 9-10: Advanced Features
  ├── Background sync
  ├── Biometric auth
  ├── Mood, Calendar, Analytics screens
  ├── Haptic feedback
  └── App icon + splash screen

WEEK 11-12: Optimization + Launch
  ├── Reanimated 3 animation migration
  ├── FlashList optimization
  ├── Memory profiling + leak fixes
  ├── Crash reporting (Sentry)
  ├── App Store assets + submission
  └── Production launch
```

### Success Metrics

| Metric | Web (Current) | Mobile Target |
|--------|--------------|---------------|
| Cold start | ~12s (sandbox) | <3s |
| Chat message send-to-display | ~2s | <1s |
| Task complete interaction | 2 taps + wait | 1 swipe (instant optimistic) |
| Habit check-in | Navigate + tap | 1 swipe from habits tab |
| Daily plan generation | 3-5s | 3-5s (API bound) + skeleton |
| FPS during scroll | ~30-45 (DOM) | 60 (native) |
| Offline capability | None (SW partial) | Full read + queued writes |
| Push notifications | Web push (iOS broken) | Native FCM + APNs |

---

## Appendix A: Package Dependencies (Phase 1)

```json
{
  "dependencies": {
    "expo": "~51.0.0",
    "expo-font": "~12.0.0",
    "expo-splash-screen": "~0.27.0",
    "expo-status-bar": "~1.12.0",
    "expo-constants": "~16.0.0",

    "@react-navigation/native": "^6.1.0",
    "@react-navigation/bottom-tabs": "^6.5.0",
    "@react-navigation/native-stack": "^6.9.0",
    "react-native-screens": "~3.31.0",
    "react-native-safe-area-context": "4.10.0",

    "@tanstack/react-query": "^5.13.4",
    "zustand": "^4.4.7",
    "axios": "^1.6.2",
    "react-hook-form": "^7.48.2",
    "socket.io-client": "^4.6.1",

    "@react-native-async-storage/async-storage": "1.23.0",
    "react-native-reanimated": "~3.10.0",
    "react-native-gesture-handler": "~2.16.0",
    "@gorhom/bottom-sheet": "^4.6.0",
    "react-native-toast-message": "^2.2.0",
    "lucide-react-native": "^0.294.0",
    "react-native-svg": "15.2.0",
    "date-fns": "^3.0.6",
    "clsx": "^2.0.0",

    "@expo-google-fonts/cairo": "^0.2.3",
    "@shopify/flash-list": "1.6.4"
  }
}
```

## Appendix B: API Layer Adaptation

The single most impactful change for the API layer:

```typescript
// services/api.ts — Mobile version
// CHANGE 1: Replace getBaseUrl() browser detection with config
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

function getBaseUrl(): string {
  // Production
  const apiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (apiUrl) return apiUrl;

  // Development fallback
  if (__DEV__) {
    // Android emulator uses 10.0.2.2 for localhost
    const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
    return `http://${host}:5000/api/v1`;
  }

  return 'https://api.lifeflow.app/api/v1';
}

// CHANGE 2: Replace localStorage with AsyncStorage in interceptors
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('lifeflow_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// EVERYTHING ELSE: Identical to web api.js
// All 20+ API modules (authAPI, taskAPI, habitAPI, chatAPI, etc.)
// copy-paste with zero changes.
```

## Appendix C: Auth Store Adaptation

```typescript
// store/authStore.ts — Mobile version
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ONLY CHANGE: storage adapter
const useAuthStore = create(
  persist(
    (set, get) => ({
      // IDENTICAL to web authStore.js:
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (data) => { /* identical */ },
      register: async (data) => { /* identical */ },
      demoLogin: async () => { /* identical */ },
      logout: async () => {
        await AsyncStorage.multiRemove(['lifeflow_token', 'lifeflow_refresh_token']);
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'lifeflow-auth',
      // THIS IS THE ONLY CHANGE:
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

---

*Document generated: 2026-04-03*
*Based on codebase analysis: 51 frontend files, 29 backend routes, 61 services, 26 models*
*Backend remains 100% untouched through all phases*
