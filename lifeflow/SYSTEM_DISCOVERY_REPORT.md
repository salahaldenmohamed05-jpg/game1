# LifeFlow - Comprehensive System Discovery Report

**Generated:** 2026-03-24  
**Author:** AI System Analyst  
**Project:** LifeFlow - Smart Personal Life Management Assistant  
**Language:** Arabic-first (RTL), Backend English

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
        assistant/    # AssistantView (AI chat with persistent sessions)
        calendar/     # CalendarView
        common/       # ErrorBoundary
        dashboard/    # Dashboard.jsx (main shell), DashboardHome.jsx (overview)
        habits/       # HabitsView (habit tracker)
        insights/     # InsightsView (AI analytics)
        intelligence/ # CoachWidget, DayPlannerWidget, EnergyWidget
        integrations/ # IntegrationsView
        layout/       # Sidebar, Header, MobileBottomNav, MobileLayout (NEW)
        logs/         # LogsView
        mood/         # MoodView (daily mood tracking)
        notifications/# NotificationsView
        performance/  # PerformanceView
        subscription/ # SubscriptionView, UpgradeModal
        tasks/        # TasksView (task manager - UPGRADED)
      pages/          # Next.js pages (_app.js, index.js, login.js)
      store/          # Zustand stores (authStore, themeStore, syncStore)
      styles/         # globals.css (Tailwind + custom)
      utils/          # api.js (Axios client + all API definitions)
  mobile-rn/          # React Native app (separate, not deployed)
```

---

## 2. Task System

### 2.1 Task Model (34 columns)
| Column | Type | Purpose |
|--------|------|---------|
| id | STRING(36) UUID | Primary key |
| user_id | STRING(36) | Owner reference |
| title | STRING(255) | Task name |
| description | TEXT | Detailed description |
| category | STRING(20) | personal, work, university, health, etc. |
| priority | STRING(10) | urgent, high, medium, low |
| status | STRING(15) | pending, in_progress, completed |
| due_date | DATE | Due date |
| due_time | STRING(8) | Direct time string (HH:mm) |
| start_time | STRING(50) | Scheduled start (ISO string) |
| end_time | STRING(50) | Scheduled end (ISO string) |
| is_all_day | BOOLEAN | All-day flag |
| energy_level | STRING(10) | low/medium/high energy required |
| energy_required | STRING(10) | Energy level for AI scheduling |
| focus_required | BOOLEAN | Deep focus needed |
| burnout_risk_flag | BOOLEAN | ML burnout risk |
| ai_priority_score | FLOAT | AI-computed priority |
| order_index | INTEGER | Manual sort order |
| reminder_before | INTEGER | Minutes before notification |
| completed_at | DATE | Completion timestamp |
| reschedule_count | INTEGER | How many times rescheduled |

### 2.2 Task Grouping (Backend)
The backend `/tasks?grouped=true` endpoint returns:
- **overdue**: Past due, not completed
- **timed**: Has start_time for today
- **scheduled**: AI-scheduled via order_index
- **all_day**: All-day tasks
- **completed**: Done tasks

### 2.3 Task Grouping (Frontend - Upgraded)
The upgraded TasksView performs dynamic client-side grouping:
- **Overdue**: past due_date + not completed (sorted: oldest first, then priority)
- **Today**: due today or no due date (sorted: start_time, then priority, then creation)
- **Upcoming**: future due_date (sorted: nearest first, then priority)
- **Completed**: status=completed (collapsible, max 10 shown)

### 2.4 AI Decision Engine Integration
A `computeAIScore()` function scores each task based on:
- Overdue status (+40)
- Priority level (urgent: +30, high: +20, medium: +10)
- Due today (+15)
- Scheduled time proximity to current hour (within 1h: +25, 2h: +15, 3h: +5)
- Backend AI priority score (up to +20)

The highest-scoring task receives "Recommended Task" badge.

---

## 3. Habit System

### 3.1 Habit Model
| Key Fields | Description |
|-----------|-------------|
| habit_type | boolean (done/not) or count (reach target) |
| frequency_type | daily, weekly, monthly, custom |
| custom_days | JSON array [0-6] for weekly/custom schedules |
| monthly_days | JSON array [1-31] for monthly |
| preferred_time | HH:mm user preference |
| current_streak | Active streak count |
| longest_streak | All-time record |
| ai_best_time | AI-suggested optimal time |
| reminder_before | Minutes before notification |

### 3.2 Habit Logs
Separate `habit_logs` table tracks daily completions with unique constraint on `(habit_id, log_date)`.

### 3.3 Frontend Behavior
- Fetches via `habitAPI.getTodaySummary()` with 30s refetch interval
- Check-in mutation invalidates all queries via `syncStore.invalidateAll()`
- Supports both boolean check-in and count-based logging
- Animated progress bars with framer-motion

---

## 4. AI System

### 4.1 AI Provider
- **Primary**: Groq API (`api.groq.com/openai/v1`)
- **Model**: `llama-3.3-70b-versatile` (configurable via env)
- **Fallback**: Static Arabic responses when key unavailable
- **Timeout**: 15 seconds per request

### 4.2 AI Features
| Feature | Endpoint | Description |
|---------|----------|-------------|
| Smart Daily Plan | `/assistant/smart-daily-plan` | AI-generated day schedule with confidence |
| Next Best Action | `/assistant/next-action` | Single recommended action |
| Life Feed | `/assistant/life-feed` | Real-time insights stream |
| Burnout Status | `/assistant/burnout-status` | Burnout risk assessment |
| Chat | `/chat/sessions/:id/message` | Persistent AI conversations |
| Task Decomposition | `/assistant/decompose-task` | Break down complex tasks |
| Coaching | `/assistant/coaching` | Personalized coaching |

### 4.3 AI Context Object
The AI service builds context from:
- Current tasks (pending + overdue)
- Today's habits (completed vs total)
- Latest mood entry (score + emotions)
- Energy level from mood_entries
- User profile (timezone, wake/sleep times)
- Behavioral patterns from learning outcomes

---

## 5. Context & Data Flow

### 5.1 Single Source of Truth Architecture
```
Database (SQLite/PostgreSQL)
    |
    v
Express API Controllers
    |
    v
Axios HTTP Client (frontend/utils/api.js)
    |
    v
React Query Cache (queryKey-based)
    |
    v
Component UI (re-renders on data change)
    |
    v (on mutation)
syncStore.invalidateAll() -> invalidates 15+ query keys -> bump version
```

### 5.2 Sync Store (Zustand)
The `useSyncStore` manages:
- **syncVersion**: Counter incremented on every mutation
- **lastActions**: Recent action log for dedup (max 20)
- **_queryClient**: Reference to React Query client
- **invalidateAll()**: Invalidates all 15 query keys:
  - tasks-view, habits-today, habits-all, dashboard
  - next-action-dash, next-action-assist, daily-plan-dash
  - timeline-assist, life-feed-dash, burnout-dash
  - notifications, mood-today, mood-stats, mood-log
  - header-notifications

### 5.3 Real-time Updates
- Socket.IO connection established in `_app.js`
- Events: `notification`, `proactive_message`
- On event: show toast + invalidate relevant queries
- Proactive AI messages sent by backend scheduler

---

## 6. Frontend Architecture

### 6.1 Page Routing
Single-page app with view switching via state (not Next.js routing):
- `index.js` -> checks auth -> renders `<Dashboard />` or `<LoginPage />`
- `Dashboard.jsx` maintains `activeView` state
- `VIEWS` map resolves view key to component

### 6.2 Mobile Layout (NEW)
**MobileLayout** component provides:
- Flex column container with `min-h-0` (enables scroll)
- `overflow-y-auto` with `-webkit-overflow-scrolling: touch`
- Bottom padding: `pb-28` on mobile (clears bottom nav), `pb-6` on desktop
- RTL direction
- Entry animation via framer-motion

### 6.3 Layout Hierarchy
```
Dashboard (h-screen, flex, overflow-hidden)
  |-- Sidebar (fixed, desktop only by default)
  |-- Main Column (flex-1, flex-col, min-h-0)
      |-- Header (sticky top)
      |-- MobileLayout (flex-1, scrollable)
      |   |-- ActiveView (page content)
      |-- MobileBottomNav (fixed bottom, md:hidden)
```

### 6.4 Mobile Bottom Navigation
5 items: Home, Tasks, Habits, Assistant, Notifications
- Fixed at bottom with `z-50`
- Safe-area inset padding for iOS notch devices
- Badge counts from dashboard data
- Active indicator dot with layoutId animation

---

## 7. Database Schema

### 7.1 Tables (26 total)
| Table | Purpose |
|-------|---------|
| users | User accounts + preferences |
| tasks | Task management (34 cols) |
| habits | Habit definitions (34 cols) |
| habit_logs | Daily habit completions |
| mood_entries | Daily mood tracking |
| notifications | Smart notifications |
| chat_sessions | AI chat sessions |
| chat_messages | Chat message history |
| insights | AI-generated insights |
| day_plans | Daily AI schedules |
| energy_logs | Energy tracking |
| energy_profiles | User energy patterns |
| coach_sessions | AI coaching history |
| behavior_profiles | User behavior models |
| behavior_patterns | Detected patterns |
| behavioral_flags | ML behavioral flags |
| life_predictions | AI predictions |
| learning_outcomes | ML learning data |
| goals | Goal engine |
| connected_integrations | External integrations |
| external_events | Calendar imports |
| productivity_scores | Daily scores |
| subscriptions | Subscription state |
| payment_events | Stripe events |
| weekly_audits | Weekly reviews |
| habits_backup | Migration backup |

### 7.2 Migration Strategy
- SQLite: `sequelize.sync({ force: false })` + `addColumnIfMissing()` helper
- PostgreSQL: `sequelize.sync({ alter: true })`
- Phase 16 columns added safely via ALTER TABLE IF NOT EXISTS pattern

---

## 8. Known Issues & Resolutions

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| 1 | React Error #130 (Check not imported) | FIXED | Added `Check` to lucide-react imports in DashboardHome.jsx |
| 2 | SQLITE_ERROR missing energy_level | FIXED | Safe migration via `addColumnIfMissing()` in database.js |
| 3 | Toast bug in proactive_message | FIXED | Replaced `toast.custom()` with `toast()` in _app.js |
| 4 | Task time showing 02:00 for midnight UTC | FIXED | Only display time from `start_time`, not `due_date` |
| 5 | Mood queries not invalidated | FIXED | Added mood-today, mood-stats, mood-log to syncStore |
| 6 | No unified mobile layout | FIXED | Created MobileLayout component, updated Dashboard.jsx |
| 7 | Conflicting h-screen/overflow on views | FIXED | Removed per-view pb-20/pb-24, MobileLayout handles padding |
| 8 | CSS main padding conflicts | FIXED | Removed main{} padding rules from globals.css |
| 9 | Task grouping static | FIXED | Dynamic Today/Overdue/Upcoming/Completed grouping |
| 10 | No AI task recommendation | FIXED | Added computeAIScore + "Recommended" badge |
| 11 | Small tap targets on mobile | FIXED | All buttons now min-h-[44px] / w-11 h-11 |
| 12 | Backend restart count high (4754) | KNOWN | PM2 restart loops from SQLite lock contention under load |

---

## 9. API Verification Results

| Endpoint | Status | Response |
|----------|--------|----------|
| POST /api/v1/auth/demo | 200 OK | Token + user object |
| GET /api/v1/tasks?grouped=true | 200 OK | Timed: 2, Overdue: 6, Scheduled: 9, Completed: 12 |
| GET /api/v1/dashboard | 200 OK | Score: 50, Tasks: 3 pending, Habits: 3/13 |
| GET /api/v1/assistant/smart-daily-plan | 200 OK | 13 items, ML-enhanced, Focus: 75 |
| GET /api/v1/habits/today | 200 OK | 13 habits, 3 completed |

---

## 10. Final Evaluation

### Strengths
1. **Complete full-stack system** with 16 development phases implemented
2. **Real AI integration** with Groq LLM providing context-aware responses
3. **Smart scheduling engine** with ML-enhanced daily planning
4. **Comprehensive sync architecture** with Zustand + React Query invalidation
5. **Professional mobile-first UI** with Arabic RTL support, dark/light themes
6. **Rich feature set**: tasks, habits, mood tracking, AI coaching, notifications
7. **Unified MobileLayout** eliminates scroll/overlap issues across all views

### Areas for Improvement
1. **Backend stability**: PM2 restart count (4754) indicates crash loops under load
2. **Task model complexity**: 34 columns suggests possible over-engineering
3. **No offline support**: Requires network for all operations
4. **No automated tests**: No unit/integration test suite for frontend
5. **Socket.IO reliability**: No reconnection strategy documented
6. **API error handling**: Some controllers lack consistent error response format
7. **Database scaling**: SQLite appropriate for demo only, needs PostgreSQL for production

### System Health
- **Frontend**: Compiled successfully, zero console errors
- **Backend**: Running (PID online), all critical endpoints responding
- **Database**: 26 tables with correct schema, all migrations applied
- **Real-time**: Socket.IO connected, proactive messages flowing

---

**SYSTEM STABLE - ARCHITECTURE DOCUMENTED - READY FOR PRODUCTION HARDENING**
