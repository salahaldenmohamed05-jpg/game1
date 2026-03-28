# LifeFlow - Comprehensive System Discovery Report

**Last Updated:** 2026-03-28  
**Author:** AI System Analyst  
**Project:** LifeFlow - Smart Personal Life Management Assistant  
**Language:** Arabic-first (RTL), Backend English  
**Phases Completed:** G (Context-Aware Dashboard) + H (System Hardening) + I (Final Stability) + J (Hook Safety & Prevention)

---

## 1. Architecture Overview

### 1.1 Technology Stack
| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (Pages Router) | 14.0.4 |
| UI Framework | React | 18.2.0 |
| Styling | Tailwind CSS | 3.3.6 |
| State Management | Zustand | 4.4.7 |
| Data Fetching | TanStack React Query | 5.13.4 |
| Animation | Framer Motion | 10.16.16 |
| Charts | Recharts | 2.10.1 |
| Icons | Lucide React | 0.294.0 |
| HTTP Client | Axios | 1.6.2 |
| Real-time | Socket.IO Client | 4.6.1 |
| Backend | Node.js + Express | - |
| ORM | Sequelize | - |
| Database | SQLite (dev) / PostgreSQL (prod) | - |
| AI Provider | Groq (llama-3.3-70b-versatile) | - |
| Process Manager | PM2 | - |

### 1.2 Project Structure
```
lifeflow/
  backend/
    src/
      ai/             # AI service (Groq LLM integration)
      config/         # Database configuration + migrations
      controllers/    # Route handlers (auth, task, habit, mood, dashboard, etc.)
      middleware/     # Auth JWT + subscription middleware
      models/        # Sequelize models (26+ tables)
      routes/        # Express route definitions
      services/      # Business logic (scheduler, coaching, energy, prediction, etc.)
      utils/         # Logger, time utilities, seed data
    lifeflow_dev.db  # SQLite development database
  frontend/
    src/
      components/
        adaptive/     # AdaptiveView (Phase 10: Adaptive Life Model)
        analytics/    # AnalyticsView (unified analytics, replaces Insights+Performance)
        assistant/    # AssistantView (3-layer AI chat with persistent sessions)
        calendar/     # CalendarView
        common/       # ErrorBoundary (auto-retry, inline styles)
        dashboard/    # Dashboard.jsx (main shell), DashboardHome.jsx (context-aware)
        flow/         # QuickCommandInput (persistent floating assistant trigger)
        global/       # GlobalIntelligenceView (Phase 13)
        habits/       # HabitsView (habit tracker with check-in)
        integrations/ # IntegrationsView (Phase 14)
        layout/       # Header, MobileBottomNav (unified nav), MobileLayout
        logs/         # LogsView (system diagnostics)
        mood/         # MoodView (daily mood tracking)
        notifications/# NotificationsView
        profile/      # ProfileView (personalization hub)
        settings/     # SettingsView (control center)
        subscription/ # SubscriptionView, UpgradeModal
        tasks/        # TasksView (smart-view with AI recommendations)
      constants/      # smartActions.js (intent-based action system)
      pages/          # Next.js pages (_app.js, index.js, login.js, 404.js, 500.js, _error.js)
      store/          # Zustand stores (authStore, themeStore, syncStore)
      styles/         # globals.css (Tailwind + custom components)
      utils/          # api.js (Axios client + all API definitions)
```

---

## 2. Navigation Architecture (Phase G — Sidebar Removed)

### 2.1 Layout Hierarchy
```
Dashboard (h-screen, flex, overflow-hidden, dir=rtl)
  |-- Animated Background (fixed, pointer-events-none)
  |-- Header (sticky top, glass-card)
  |-- MobileBottomNav
  |   |-- Desktop: TopNav (md+, sticky below header)
  |   |-- Mobile: Bottom tab bar (fixed bottom, z-40)
  |-- Main Content Area (flex-1, min-h-0)
  |   |-- MobileLayout (scroll container OR flex for chat)
  |       |-- ErrorBoundary (key={activeView} — resets on view switch)
  |           |-- ActiveView (resolved from VIEWS map)
  |-- QuickCommandInput (floating assistant trigger, hidden on assistant views)
```

### 2.2 Navigation Items
**Primary (always visible):** Dashboard, Tasks, Habits, Assistant, More  
**More menu (10 items):** Analytics, Notifications, Calendar, Mood, Intelligence, Integrations, Logs, Subscription, Profile, Settings

### 2.3 View Resolution
```javascript
const VIEWS = {
  dashboard: DashboardHome, tasks: TasksView, habits: HabitsView,
  mood: MoodView, insights: AnalyticsView, assistant: AssistantView,
  calendar: CalendarView, notifications: NotificationsView,
  performance: AnalyticsView, analytics: AnalyticsView,
  subscription: SubscriptionView, intelligence: GlobalIntelligenceView,
  integrations: IntegrationsView, ai_chat: AssistantView,
  copilot: AssistantView, adaptive: AssistantView, optimizer: AssistantView,
  logs: LogsView, profile: ProfileView, settings: SettingsView,
};
```

### 2.4 MobileLayout Modes
- **Default mode**: Single scroll container with `pb-24 md:pb-6` + safe-area inset
- **fullHeight mode** (for chat): Flex container where child manages own scroll

---

## 3. Smart Actions System (Phase H — Intent-Based)

### 3.1 Single Source of Truth: `constants/smartActions.js`
Each action has: `id`, `label`, `icon`, `type`, `target`, `description`

**Action Types:**
- `navigate` — Opens a view (predictable, no side effects)
- `modal` — Opens a form for user confirmation
- `ai_chat` — Sends prompt to assistant (user reviews response)

**No action auto-creates tasks or triggers destructive changes.**

### 3.2 Exports
- `SMART_ACTIONS` — Full action set (6 items)
- `QUICK_PROMPTS` — Chat quick-start prompts (6 items)
- `QUICK_HINTS` — Placeholder hints for QuickCommandInput
- `WELCOME_MSG` — Assistant welcome message object

---

## 4. Error Handling & Stability (Phases H + I)

### 4.1 ErrorBoundary (`components/common/ErrorBoundary.jsx`)
- **Auto-retry**: Up to 2 retries with exponential backoff (3s base)
- **Compact mode**: For nested boundaries inside dashboard cards
- **Inline styles**: Works even if CSS fails to load
- **Error reporting**: Fire-and-forget POST to `/api/v1/logs/client-error`
- **Dev mode**: Full stack trace display

### 4.2 Error Pages (All use inline styles — zero external dependencies)
| Page | Purpose | Notes |
|------|---------|-------|
| `404.js` | Not found | Static, crash-proof |
| `500.js` | Server error | Static, crash-proof |
| `_error.js` | All other errors | Has `getInitialProps` for status code |

### 4.3 Global Error Handling (`_app.js`)
- `unhandledrejection` event listener (prevents white screen)
- `error` event listener (logs globally)
- Zustand hydration wrapped in try/catch
- Socket.IO operations all wrapped in try/catch
- QueryClient created per-instance (not module-level singleton)

### 4.4 Component-Level Hardening
| Component | Protection |
|-----------|-----------|
| AssistantView | 14 crash-prevention guards: null msg guard, safe array ops, send-lock, defensive session extraction |
| DashboardHome | Every sub-component: optional chaining, loading skeletons, error fallback UI |
| TasksView | Mutation deduplication, validation in Add Task modal |
| HabitsView | Validation in Add Habit modal, safe JSON parsing of custom_days |
| AnalyticsView | `Array.isArray()` guards on all data extraction (Phase I) |
| AdaptiveView | `Array.isArray()` guards on recommendations and scenarios (Phase I) |
| All Views | Wrapped in `<ErrorBoundary key={activeView}>` in Dashboard.jsx |

---

## 5. API Client (`utils/api.js`)

### 5.1 Dynamic URL Detection
```
Browser hostname → E2B sandbox (*.e2b.dev) → 5000-host/api/v1
                → Novita sandbox (*.sandbox.novita.ai) → 5000-host/api/v1
                → localhost → http://localhost:5000/api/v1
                → Env var fallback → NEXT_PUBLIC_API_URL
```

### 5.2 Interceptors
- **Request**: Attaches JWT from `localStorage.lifeflow_token`, re-resolves baseURL
- **Response 401**: Attempts token refresh via `/auth/refresh`, redirects to `/login` on failure

### 5.3 API Modules (17 total)
`authAPI`, `taskAPI`, `habitAPI`, `moodAPI`, `dashboardAPI`, `performanceAPI`,
`subscriptionAPI`, `aiAPI`, `notificationAPI`, `calendarAPI`, `intelligenceAPI`,
`adaptiveAPI`, `assistantAPI`, `chatAPI`, `logsAPI`, `profileAPI`, `settingsAPI`

---

## 6. Task System

### 6.1 Smart View (Backend-Driven)
Frontend uses `GET /tasks/smart-view` which returns:
- `overdue` — Past due, not completed
- `today` — Due today
- `upcoming` — Future tasks
- `completed` — Done tasks
- `recommendedTaskId` — AI-recommended task ID
- `scores` — AI scores per task
- `stats` — Summary counts

### 6.2 Frontend Sorting
Tasks sorted by: time (HH:mm → minutes) → priority (urgent=0) → createdAt
Cairo timezone used throughout: `Africa/Cairo`

### 6.3 Add Task Modal
- Solid opaque background (`modal-solid` class)
- Validation: title required (min 2 chars), end_time > start_time
- Loading/success states on submit button
- Sticky CTA at bottom with solid background

---

## 7. Habit System

### 7.1 Habit Types
- **Boolean**: Done/not done per day
- **Count**: Track progress toward numeric target

### 7.2 Frequencies
- Daily, Weekly (custom days), Monthly (custom days), Custom

### 7.3 Frontend Behavior
- Fetches via `habitAPI.getTodaySummary()` with 30s refetch
- Check-in invalidates all queries via `syncStore.invalidateAll()`
- Progress bars animated with framer-motion

---

## 8. Dashboard Home (Phase G — Context-Aware)

### 8.1 Components
| Component | Purpose |
|-----------|---------|
| BurnoutAlert | Shows when burnout risk is medium/high |
| OverdueStrategyBanner | Classifies recent vs old overdue tasks |
| EngagementBar | Positive reinforcement messages |
| ContextAwareActionCard | "Do Now" card with "Why this now?" explanation |
| TodaySummaryCard | Daily progress with time-of-day greeting |
| ContextualAction | Quick action buttons (intent-based) |
| DynamicExecutionTimeline | Current focus + upcoming tasks |
| BehaviorIntelligenceCard | Habit patterns, nudges, streak risk alerts |
| LifeFeedWidget | Collapsible AI insights feed |

### 8.2 Data Sources
- `dashboardAPI.getDashboard()` — Summary, tasks, habits
- `dashboardAPI.getTodayFlow()` — NextAction, LifeFeed, BurnoutStatus (unified call)

---

## 9. Assistant (3-Layer Chat Architecture)

### 9.1 Layers
- **Layer 1**: Fixed header (session title, session switcher)
- **Layer 2**: Scrollable messages area (only this scrolls)
- **Layer 3**: Fixed input bar (always visible, safe-area padding)

### 9.2 Features
- Persistent chat sessions via `chatAPI`
- Desktop sidebar: sessions list + DailyTimeline
- Mobile: dropdown sessions list
- Quick prompts from `QUICK_PROMPTS`
- Double-send protection via `sendLockRef`
- Race condition mitigation: don't update messages while sending

### 9.3 DailyTimeline (inside AssistantView)
- Fetches from `assistantAPI.getSmartTimeline()`
- Interactive: complete tasks, accept/reject suggestions
- Shows overdue tasks, free slots, smart suggestions

---

## 10. CSS Architecture

### 10.1 Theme Variables
- Dark mode (default): `--bg: #0A0F2C`, `--surface: #16213E`
- Light mode: `--bg: #F1F5F9`, `--surface: #FFFFFF`
- Primary: `#6C63FF`, Secondary: `#FF6584`

### 10.2 Key Custom Classes
| Class | Purpose |
|-------|---------|
| `.glass-card` | Translucent card with backdrop-filter blur |
| `.modal-solid` | Opaque modal background (no blur-through) |
| `.bottom-nav` | Fixed mobile bottom navigation |
| `.safe-bottom` | Padding for safe-area inset |
| `.skeleton` | Loading skeleton animation |
| `.loading-spinner` | Spinning loader |

### 10.3 Mobile Responsiveness
- All buttons: `min-h-[44px]` for touch targets
- Safe-area insets: `env(safe-area-inset-bottom)` on nav, input bars, floating buttons
- Bottom nav min-height: 64px

---

## 11. Zustand Stores

### 11.1 authStore
- Persisted to `localStorage` as `lifeflow-auth`
- Methods: `login`, `register`, `demoLogin`, `logout`, `updateUser`
- Token stored in `localStorage.lifeflow_token`

### 11.2 themeStore
- Persisted as `lifeflow-theme`
- Methods: `setTheme`, `toggleTheme`
- Applies `dark`/`light` class to `<html>`

### 11.3 syncStore
- NOT persisted (in-memory only)
- `invalidateAll()` — Invalidates 20+ React Query keys
- `recordAction()` — Tracks recent actions for dedup
- `_queryClient` — Reference set in `_app.js`

---

## 12. Bugs Fixed in Phases H + I + J

| # | Bug | Root Cause | Fix | Phase |
|---|-----|-----------|-----|-------|
| 1 | AssistantView crash on null messages | `messages.map()` called on corrupted array | Safe array guard + `SAFE_WELCOME` fallback | H |
| 2 | Error page crash loops | CSS classes unavailable during error recovery | All error pages use inline styles only | H |
| 3 | Socket.IO crashes white-screen | Unhandled socket events threw exceptions | All socket ops wrapped in try/catch | H |
| 4 | Zustand hydration race | Store access before hydration complete | try/catch around all store hooks in `_app.js` | H |
| 5 | Double-send in chat | Rapid clicks triggered multiple API calls | `sendLockRef` + `isSending` guard | H |
| 6 | Race condition in message updates | `sessionMsgs` effect updated during send | Skip update while `isSending` is true | H |
| 7 | Missing 404 page | Next.js warning about custom error without 404 | Added dedicated `404.js` | H |
| 8 | AnalyticsView crash on non-array data | API returning object instead of array | `Array.isArray()` guard on all data extraction | I |
| 9 | AdaptiveView crash on undefined recommendations | `recs.recommendations.map()` without guard | `Array.isArray()` check before `.map()` | I |
| 10 | Low contrast text in modals | Blurred background made text unreadable | `modal-solid` class with opaque background | H |
| 11 | Content hidden behind bottom nav | No safe-area padding | `safe-bottom` class + inline safe-area calc | H |
| 12 | Add Task button creating empty tasks | No validation on submit | Title required, min 2 chars, loading states | H |
| 13 | ErrorBoundary not resetting on view switch | Same boundary instance across views | `key={activeView}` forces boundary reset | H |
| 14 | Unhandled promise rejections crash app | No global error handler | `unhandledrejection` listener in `_app.js` | H |
| 15 | QuickCommandInput hook-order crash | `useState(Math.random())` called AFTER early return | Moved all hooks before early return; replaced with `useMemo` | J |
| 16 | DailyTimeline hook-order crash | `useState()` called after `if (isError) return null` | Moved hooks before conditional return | J |
| 17 | AssistantView nondeterministic keys | `Math.random()` used as React keys in 3 `.map()` calls | Replaced with deterministic keys (`idx`, `id`, `title`) | J |
| 18 | AssistantView nondeterministic message IDs | `msg-${Math.random()}` in message mapping | Replaced with `msg-${idx}-${createdAt}` | J |

---

## 12.1 Phase J: Hook Safety Root-Cause Analysis

### Root Causes Identified
1. **QuickCommandInput.jsx** (CRITICAL): `useState(Math.floor(Math.random() * ...))` on line 78 was placed AFTER an early return on line 26. When `activeView` matched a hidden view, the component returned `null` before calling `useState`, violating React's Rules of Hooks. On the next render where `activeView` changed, React saw a different number of hooks.

2. **AssistantView.jsx — DailyTimeline** (CRITICAL): `useState(new Set())` and `useState(null)` on lines 141-142 were placed AFTER `if (isError) return null` on line 131. When `isError` toggled between `true`/`false`, the hook count changed.

3. **AssistantView.jsx — Math.random() keys** (HIGH): Three `.map()` calls used `Math.random()` as fallback keys (lines 195, 241, 267). This caused React to remount elements on every render, destroying component state and causing animation glitches.

4. **AssistantView.jsx — Math.random() message IDs** (MEDIUM): Message mapping used `msg-${Math.random()}` for IDs without stable identifiers, causing message deduplication issues.

### Fixes Applied
| File | Issue | Fix |
|------|-------|-----|
| `QuickCommandInput.jsx` | Hook after early return + `Math.random()` in `useState` | Moved all hooks before return; replaced `useState(Math.random)` with `useMemo(() => Math.random(), [])` |
| `AssistantView.jsx` (DailyTimeline) | 2 `useState` calls after `if (isError) return null` | Moved both hooks to top of component, before any returns |
| `AssistantView.jsx` (DailyTimeline) | `Math.random()` in 3 React keys | Replaced with deterministic `timeline-${idx}`, `overdue-${idx}`, `suggestion-${idx}` |
| `AssistantView.jsx` (messages) | `Math.random()` in message ID | Replaced with `msg-${idx}-${createdAt}` |

### Prevention System
- **ESLint Config** (`.eslintrc.json`): `react-hooks/rules-of-hooks` as `error`, `react-hooks/exhaustive-deps` as `warn`
- **Custom Lint Rule**: `no-restricted-syntax` banning `Math.random()` in render scope
- **Hook Safety Script** (`scripts/hook-safety-lint.js`): Custom static analyzer that checks:
  - Hooks after early returns
  - `Math.random()` in React keys
  - `Math.random()` in `useState` initializers
  - Run via `npm run lint:hooks` (42 files scanned, 0 violations)

### Developer Guidelines
1. **ALL hooks at the top** of every component, before any `return` or `if` statement
2. **Never use `Math.random()`** in `useState`, JSX keys, or render scope. Use `useMemo(() => ..., [])` if randomness is needed.
3. **React keys must be deterministic**: use `id`, `index`, `title`, or composite keys
4. **Run `npm run lint:hooks`** before every commit to catch violations instantly

---

## 13. Verified API Endpoints

| Endpoint | Status | Response Shape |
|----------|--------|---------------|
| `POST /auth/demo` | 200 | `{ user, accessToken, refreshToken }` |
| `GET /dashboard` | 200 | `{ greeting, date, summary, today_tasks, habits }` |
| `GET /tasks/smart-view` | 200 | `{ overdue, today, upcoming, completed, recommendedTaskId, scores, stats }` |
| `GET /habits/today-summary` | 200 | `{ total, completed, pending, habits[] }` |
| `GET /dashboard/today-flow` | 200 | `{ nextAction, lifeFeed, burnoutStatus }` |
| `GET /chat/sessions` | 200 | `{ sessions[] }` |
| `GET /assistant/timeline/smart` | 200 | `{ timeline, overdue, freeSlots, suggestions, stats }` |
| `GET /notifications` | 200 | `{ notifications[], unread_count }` |
| `GET /subscription/status` | 200 | `{ plan, is_premium }` |

---

## 14. Known Warnings (Non-Breaking)

| Warning | Source | Impact | Notes |
|---------|--------|--------|-------|
| "custom /_error without custom /404" | Next.js 14 dev mode | None | 404.js exists and works; warning is because _error.js has getInitialProps |
| "Fast Refresh had to perform full reload" | Next.js HMR | Dev only | Occurs after file changes in dev mode |

---

## 15. Performance Notes

- **Page load**: ~12-14s in sandbox (network latency), ~2-3s locally
- **Memoization**: `memo()` on TaskItem, MsgBubble, SectionHeader
- **Hooks**: 16+ `useCallback`, 12+ `useMemo` across components
- **React Query**: Stale times 2-5min, refetch intervals 30s-5min
- **Bundle**: Dashboard lazy-loaded via `dynamic()` import

---

## 16. For New Developers

### Quick Start
```bash
cd lifeflow
pm2 start ecosystem.config.js   # Starts backend + frontend
pm2 logs                         # View all logs
pm2 status                       # Check process health
```

### Key Files to Read First
1. `frontend/src/pages/index.js` — App entry point, auth gate
2. `frontend/src/components/dashboard/Dashboard.jsx` — Main layout shell
3. `frontend/src/utils/api.js` — All API definitions
4. `frontend/src/constants/smartActions.js` — Intent-based action system
5. `frontend/src/store/syncStore.js` — Data sync architecture

### Important Patterns
- **All data flows from backend** — No mock data in production components
- **syncStore.invalidateAll()** — Call after ANY mutation
- **ErrorBoundary wraps every view** — Crashes are caught, not propagated
- **Safe-area padding** — Always use `env(safe-area-inset-bottom)` for mobile
- **modal-solid class** — Use for all modal backgrounds (prevents blur-through)
- **RTL direction** — All containers must have `dir="rtl"`
- **Cairo timezone** — Use `Africa/Cairo` for all time displays

### PR #8 Contains
All Phase G + H + I + J changes:
- Phase G+H+I: 14 files modified + 1 new file (404.js)
- Phase J: 5 files modified + 3 new files (.eslintrc.json, scripts/hook-safety-lint.js, updated package.json)
- Zero compilation errors, zero console errors, zero hook violations
- Link: https://github.com/salahaldenmohamed05-jpg/lifeflow/pull/8

---

**SYSTEM STATUS: STABLE — 0 COMPILATION ERRORS — 0 RUNTIME ERRORS — 0 HOOK VIOLATIONS — READY FOR BETA TESTING**
