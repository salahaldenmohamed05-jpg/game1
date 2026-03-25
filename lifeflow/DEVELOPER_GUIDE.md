# LifeFlow — Developer Guide & System Report
> Last Updated: 2026-03-24 | Version: 1.0.0

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Backend API Reference](#5-backend-api-reference)
6. [Database Schema](#6-database-schema)
7. [Frontend Components](#7-frontend-components)
8. [AI & Intelligence System](#8-ai--intelligence-system)
9. [Authentication & Security](#9-authentication--security)
10. [Deployment & DevOps](#10-deployment--devops)
11. [Current Status & Known Issues](#11-current-status--known-issues)
12. [Development Guidelines](#12-development-guidelines)
13. [Pending Work & Roadmap](#13-pending-work--roadmap)

---

## 1. Project Overview

**LifeFlow** is an Arabic-first AI-powered personal productivity platform. It combines task management, habit tracking, mood monitoring, and an AI assistant into a unified mobile-first experience. The platform targets Arabic-speaking users (Egypt/Cairo timezone as default) and uses RTL layout throughout.

### Core Features
| Feature | Status | Description |
|---------|--------|-------------|
| Task Management | Working | CRUD, grouping, AI prioritization, smart-view |
| Habit Tracking | Working | Daily/weekly/monthly/custom frequencies, check-in, streaks |
| Mood Logging | Working | Daily mood + energy tracking with history |
| AI Assistant | Working | Context-aware chat with persistent sessions |
| Dashboard | Working | Unified overview with stats and quick actions |
| Notifications | Working | In-app, real-time via Socket.IO |
| Calendar | Partial | Events CRUD, limited integration |
| Performance | Working | Productivity scores, weekly audits |
| Subscription | Stub | Stripe integration scaffolded, not fully wired |
| Intelligence | Partial | Life score, energy, predictions (some 404/stub) |

### Key Design Decisions
- **Arabic-first UI**: All labels, toasts, and error messages in Arabic
- **RTL layout**: `dir="rtl"` on HTML root and key containers
- **Dark theme default**: Dark background with light text, custom CSS variables
- **Mobile-first**: Bottom navigation, touch targets >= 44px, bottom-sheet modals
- **Cairo timezone**: All date/time operations normalize to `Africa/Cairo`

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client (Browser)                  │
│  Next.js 14 SSG + CSR | React 18 | Tailwind CSS     │
│  Zustand (auth/theme/sync) | React Query (data)     │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS (port 3000)
                        ▼
┌─────────────────────────────────────────────────────┐
│                  Express.js Backend                  │
│  Port 5000 | REST API + Socket.IO                   │
│  Sequelize ORM | JWT Auth | AI Services             │
└───────────────────────┬─────────────────────────────┘
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
         ┌────────┐ ┌───────┐ ┌──────────┐
         │ SQLite │ │ Redis │ │ AI APIs  │
         │ (dev)  │ │(cache)│ │Gemini/   │
         │ PgSQL  │ │       │ │Groq/     │
         │ (prod) │ │       │ │OpenAI    │
         └────────┘ └───────┘ └──────────┘
```

### Communication Flow
1. **Frontend → Backend**: Axios HTTP requests via centralized `api.js` client
2. **Real-time**: Socket.IO for notifications and proactive AI messages
3. **Auth**: JWT access token (7d) + refresh token (30d), stored in `localStorage`
4. **State**: Zustand stores for auth, theme, and sync; React Query for server data

---

## 3. Tech Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| Express.js | 4.18.2 | Web framework |
| Sequelize | 6.35.2 | ORM (SQLite dev / PostgreSQL prod) |
| SQLite3 | 5.1.7 | Development database |
| PostgreSQL | 15 | Production database |
| Socket.IO | 4.6.1 | Real-time communications |
| JWT | 9.0.2 | Authentication tokens |
| Winston | 3.11.0 | Logging |
| Moment-TZ | 0.5.43 | Timezone-aware date handling |
| Axios | 1.6.2 | External HTTP calls (AI APIs) |
| Stripe | 20.4.0 | Payment processing (scaffolded) |
| PM2 | (global) | Process management |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.0.4 | React framework (Pages Router, SSG) |
| React | 18.2.0 | UI library |
| Tailwind CSS | 3.x | Utility-first CSS |
| Framer Motion | 10.16.16 | Animations |
| React Query | 5.13.4 | Server state management |
| Zustand | 4.4.7 | Client state management |
| Lucide React | 0.294.0 | Icon library |
| React Hot Toast | 2.4.1 | Toast notifications |
| Recharts | 2.10.1 | Charts and data visualization |
| Socket.IO Client | 4.6.1 | Real-time connection |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker Compose | Container orchestration (prod) |
| Nginx | Reverse proxy (prod) |
| Redis | Caching & session storage |
| PM2 | Process management (dev/staging) |

---

## 4. Project Structure

```
lifeflow/
├── backend/
│   ├── src/
│   │   ├── index.js                    # Main entry point, Express setup, routes mounting
│   │   ├── ai/
│   │   │   ├── ai.service.js           # Core AI service (chat, insights, prioritization)
│   │   │   └── performance_engine.js   # Performance scoring engine
│   │   ├── config/
│   │   │   ├── database.js             # Sequelize config (SQLite/PostgreSQL dual-mode)
│   │   │   ├── execution.policy.js     # AI execution policies and safeguards
│   │   │   ├── personality.config.js   # AI personality and response style config
│   │   │   └── redis.js               # Redis connection config
│   │   ├── controllers/
│   │   │   ├── auth.controller.js      # Login, register, demo, password reset, OTP
│   │   │   ├── task.controller.js      # CRUD + smart-view + AI breakdown
│   │   │   ├── habit.controller.js     # CRUD + check-in + today summary
│   │   │   ├── mood.controller.js      # Mood logging and history
│   │   │   ├── dashboard.controller.js # Dashboard aggregation
│   │   │   ├── insight.controller.js   # AI insights
│   │   │   ├── performance.controller.js # Performance metrics
│   │   │   └── subscription.controller.js # Subscription management
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js       # JWT verification (protect route)
│   │   │   └── subscription.middleware.js # Feature gating by plan
│   │   ├── models/                     # 22 Sequelize models (see Database Schema)
│   │   ├── routes/                     # 17 route files (see API Reference)
│   │   ├── services/                   # 45+ service files (AI, scheduling, etc.)
│   │   └── utils/
│   │       ├── logger.js               # Winston logger setup
│   │       ├── seed.js                 # Demo user seed
│   │       ├── sqlite-compat.js        # SQLite compatibility helpers
│   │       └── time.util.js            # Cairo timezone utilities
│   ├── package.json
│   └── lifeflow_dev.db                 # SQLite development database
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── _app.js                # App root: QueryClient, Socket.IO, Toaster, theme
│   │   │   ├── _document.js           # HTML document: fonts, RTL, lang=ar
│   │   │   ├── index.js               # Home: auth check → Dashboard or Login
│   │   │   └── login.js               # Login/Register/Forgot/Verify/Demo
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── Dashboard.jsx      # Main shell: sidebar + header + content + bottom nav
│   │   │   │   └── DashboardHome.jsx  # Home view with stats cards
│   │   │   ├── tasks/
│   │   │   │   └── TasksView.jsx      # Task list with smart-view API integration
│   │   │   ├── habits/
│   │   │   │   └── HabitsView.jsx     # Habit tracker with check-in and AddHabitModal
│   │   │   ├── assistant/
│   │   │   │   └── AssistantView.jsx  # AI chat with sessions, next-action, daily timeline
│   │   │   ├── mood/
│   │   │   │   └── MoodView.jsx       # Mood logging interface
│   │   │   ├── layout/
│   │   │   │   ├── MobileLayout.jsx   # Scrollable content wrapper with bottom padding
│   │   │   │   ├── MobileBottomNav.jsx # Fixed bottom navigation (5 tabs)
│   │   │   │   ├── Header.jsx         # Top header with search and notifications
│   │   │   │   └── Sidebar.jsx        # Desktop sidebar navigation
│   │   │   └── ... (11 more view components)
│   │   ├── store/
│   │   │   ├── authStore.js           # Zustand: auth state, login/register/demo
│   │   │   ├── themeStore.js          # Zustand: dark/light theme toggle
│   │   │   └── syncStore.js           # Zustand: cross-view query invalidation
│   │   ├── utils/
│   │   │   └── api.js                 # Axios client + all API method exports
│   │   └── styles/
│   │       └── globals.css            # Tailwind + custom CSS variables + mobile styles
│   ├── next.config.js                 # Next.js config: i18n (ar/en), env vars
│   ├── tailwind.config.js             # Tailwind: custom colors, fonts, breakpoints
│   └── package.json
├── docker-compose.yml                 # Production: PgSQL + Redis + Backend + Frontend + Nginx
├── .env.production                    # Template for production environment variables
├── DEPLOYMENT.md                      # Deployment instructions
└── README.md                          # Project readme
```

---

## 5. Backend API Reference

All routes are mounted under `/api/v1/`. Authentication is required for most endpoints (JWT in `Authorization: Bearer <token>` header).

### Authentication (`/api/v1/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | No | Email/password login |
| POST | `/auth/register` | No | Create account |
| POST | `/auth/demo` | No | Demo login (returns pre-seeded user) |
| POST | `/auth/logout` | Yes | Invalidate token |
| POST | `/auth/refresh` | No | Refresh access token |
| GET | `/auth/profile` | Yes | Get current user profile |
| PUT | `/auth/password` | Yes | Change password |
| POST | `/auth/forgot-password` | No | Send OTP to email |
| POST | `/auth/reset-password` | No | Reset password with OTP |
| POST | `/auth/verify-email` | No | Verify email with OTP |

### Tasks (`/api/v1/tasks`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/tasks` | Yes | List tasks (with filters: status, category, priority, date, search, pagination) |
| GET | `/tasks/grouped` | Yes | List tasks grouped (overdue, timed, ai_scheduled, all_day, completed) |
| GET | `/tasks/today` | Yes | Today's tasks with summary stats |
| **GET** | **`/tasks/smart-view`** | **Yes** | **AI-scored grouping: overdue/today/upcoming/completed + recommendedTaskId + scores** |
| **POST** | **`/tasks/smart-view/log`** | **Yes** | **Log recommendation events: display, click, complete** |
| POST | `/tasks` | Yes | Create task |
| PUT | `/tasks/:id` | Yes | Update task |
| PATCH | `/tasks/:id/complete` | Yes | Mark task completed |
| DELETE | `/tasks/:id` | Yes | Delete task |
| POST | `/tasks/ai-breakdown` | Yes | AI-generated subtask breakdown |
| POST | `/tasks/ai-prioritize` | Yes | AI priority ranking |

### Habits (`/api/v1/habits`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/habits` | Yes | List all habits |
| GET | `/habits/today` | Yes | Today's habits with completion status |
| POST | `/habits` | Yes | Create habit |
| POST | `/habits/:id/check-in` | Yes | Check-in (boolean habit) |
| POST | `/habits/:id/log` | Yes | Log value (count habit) |
| GET | `/habits/:id/stats` | Yes | Habit statistics |
| DELETE | `/habits/:id` | Yes | Delete habit |

### Mood (`/api/v1/mood`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/mood/today` | Yes | Today's mood entry |
| POST | `/mood` | Yes | Log mood (score, notes, energy, stress, focus) |
| GET | `/mood/stats` | Yes | Mood statistics |
| GET | `/mood/history` | Yes | Mood history with pagination |

### Dashboard (`/api/v1/dashboard`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboard` | Yes | Full dashboard data (tasks, habits, mood, stats) |
| GET | `/dashboard/quick-stats` | Yes | Quick stats summary |

### Assistant (`/api/v1/assistant`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/assistant/command` | Yes | Execute AI command |
| POST | `/assistant/chat` | Yes | Direct chat (legacy) |
| GET | `/assistant/next-action` | Yes | Next best action recommendation |
| GET | `/assistant/daily-plan` | Yes | Smart daily plan/schedule |
| GET | `/assistant/suggestions` | Yes | Contextual suggestions |
| GET | `/assistant/metrics` | Yes | Assistant usage metrics |
| ... | ... | ... | (15+ more endpoints for advanced features) |

### Chat Sessions (`/api/v1/chat`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/chat/sessions` | Yes | List chat sessions |
| POST | `/chat/sessions` | Yes | Create new session |
| GET | `/chat/session/:id/messages` | Yes | Get session messages |
| POST | `/chat/session/:id/message` | Yes | Send message to session |
| DELETE | `/chat/session/:id` | Yes | Delete session |

### Other Routes
- **Notifications** (`/notifications`): List, mark-read, preferences, FCM registration
- **Calendar** (`/calendar`): Event CRUD
- **Performance** (`/performance`): Productivity scores, streaks, weekly analysis
- **Subscription** (`/subscription`): Plans, trial, checkout (Stripe)
- **Intelligence** (`/intelligence`): Life score, timeline, predictions, burnout risk
- **Adaptive** (`/adaptive`): Behavior profiles, patterns, recommendations
- **AI** (`/ai`): Insights, generation, analysis
- **Logs** (`/logs`): Client error logging, health check

---

## 6. Database Schema

### Core Models (22 tables)

#### `users`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | STRING | Display name |
| email | STRING | Unique, nullable |
| phone | STRING | Nullable (phone auth) |
| password | STRING | Bcrypt hashed |
| timezone | STRING | Default: Africa/Cairo |
| language | STRING | Default: ar |
| wake_up_time | STRING | e.g. "07:00" |
| sleep_time | STRING | e.g. "23:00" |
| work_start_time | STRING | e.g. "09:00" |
| work_end_time | STRING | e.g. "17:00" |
| subscription_plan | STRING | free/premium/pro |
| ai_mode | STRING | suggestive/autonomous/balanced |
| is_active | BOOLEAN | Account active flag |
| is_verified | BOOLEAN | Email verified flag |

#### `tasks`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| title | STRING | Task title |
| description | TEXT | Details |
| category | STRING | university/work/health/fitness/finance/personal/social/learning/other |
| priority | STRING | urgent/high/medium/low |
| status | STRING | pending/in_progress/completed |
| due_date | DATEONLY | Due date |
| due_time | STRING | Optional time |
| start_time | DATE | Full datetime start |
| end_time | DATE | Full datetime end |
| is_all_day | BOOLEAN | All-day flag |
| completed_at | DATE | Completion timestamp |
| ai_priority_score | FLOAT | AI-computed priority (0-100) |
| energy_level | STRING | Required energy (low/medium/high) |
| energy_required | STRING | Alias for energy_level |
| focus_required | BOOLEAN | Focus-intensive task |
| burnout_risk_flag | BOOLEAN | Burnout warning |
| is_recurring | BOOLEAN | Recurring task |
| recurrence_pattern | JSON | daily/weekly/monthly + config |
| tags | JSON | Array of tags |
| estimated_duration | INTEGER | Minutes |
| actual_duration | INTEGER | Minutes |
| parent_task_id | UUID | Subtask relationship |
| notes | TEXT | Additional notes |
| ai_suggestions | TEXT | AI suggestions JSON |
| reminders | JSON | Reminder configuration |
| reminder_before | INTEGER | Minutes before to remind |
| completion_mood | STRING | Mood when completed |
| reschedule_count | INTEGER | How many times rescheduled |
| order_index | INTEGER | Display order |

#### `habits`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| name | STRING | Habit name (English) |
| name_ar | STRING | Habit name (Arabic) |
| category | STRING | health/fitness/learning/mindfulness/social/work/religion/other |
| icon | STRING | Emoji icon |
| color | STRING | Hex color |
| habit_type | STRING | boolean/count |
| target_value | INTEGER | Target (for count type) |
| count_label | STRING | Unit label (e.g., "كأس") |
| frequency_type | STRING | daily/weekly/monthly/custom |
| custom_days | JSON | Array of day indices [0-6] |
| monthly_days | JSON | Array of day numbers [1-31] |
| preferred_time | STRING | "HH:mm" format |
| reminder_before | INTEGER | Minutes |
| reminder_enabled | BOOLEAN | |
| current_streak | INTEGER | Current streak count |
| best_streak | INTEGER | Best streak ever |
| is_active | BOOLEAN | |

#### Other Models
- **mood_entries**: mood_score(1-10), energy_level, stress_level, focus_level, notes, triggers
- **chat_sessions**: title, message_count, mode, is_pinned, auto_title
- **chat_messages**: session_id, role(user/assistant), content, confidence, suggestions
- **insights**: type, title, content, priority, is_read
- **productivity_scores**: daily scores, focus_time, break_time, completion_rate
- **subscriptions**: plan, stripe IDs, trial dates
- **day_plans**: date, schedule JSON, focus_score, total_work_hours
- **energy_logs**: timestamp, energy_level, notes
- **behavior_profiles**: user patterns, preferences, learning data
- **behavior_patterns**: detected behavioral patterns
- **life_predictions**: AI predictions for user behavior
- **learning_outcomes**: ML model learning results
- **goals**: long-term goals with progress tracking
- **connected_integrations**: external service connections
- **external_events**: imported calendar events
- **coach_sessions**: AI coaching interaction logs
- **weekly_audits**: weekly performance summaries

---

## 7. Frontend Components

### Page Flow
```
index.js
  └── hydrated?
       ├── No  → Loading spinner
       └── Yes → isAuthenticated?
                  ├── No  → LoginPage (login/register/forgot/verify/demo)
                  └── Yes → Dashboard
                              ├── Sidebar (desktop)
                              ├── Header
                              ├── MobileLayout
                              │    └── ActiveView (one of 16 views)
                              └── MobileBottomNav (mobile)
```

### View Components (16 total)
| Component | Path | Description |
|-----------|------|-------------|
| DashboardHome | `dashboard/DashboardHome.jsx` | Home view with stat cards |
| TasksView | `tasks/TasksView.jsx` | Task list with smart-view API |
| HabitsView | `habits/HabitsView.jsx` | Habit tracker with check-in |
| MoodView | `mood/MoodView.jsx` | Mood logging interface |
| AssistantView | `assistant/AssistantView.jsx` | AI chat with sessions |
| InsightsView | `insights/InsightsView.jsx` | AI-generated insights |
| CalendarView | `calendar/CalendarView.jsx` | Calendar events |
| NotificationsView | `notifications/NotificationsView.jsx` | Notification list |
| PerformanceView | `performance/PerformanceView.jsx` | Performance metrics |
| SubscriptionView | `subscription/SubscriptionView.jsx` | Subscription management |
| GlobalIntelligenceView | `global/GlobalIntelligenceView.jsx` | Life intelligence dashboard |
| IntegrationsView | `integrations/IntegrationsView.jsx` | External integrations |
| LogsView | `logs/LogsView.jsx` | System logs viewer |
| AdaptiveView | `adaptive/AdaptiveView.jsx` | Adaptive behavior |
| CopilotView | `copilot/CopilotView.jsx` | AI copilot |
| OptimizerView | `optimizer/OptimizerView.jsx` | Life optimizer |

### State Management
```
authStore.js (Zustand + localStorage persist)
  ├── user: Object | null
  ├── token: string | null
  ├── refreshToken: string | null
  ├── isAuthenticated: boolean
  ├── login(email, password, phone): Promise
  ├── register(payload): Promise
  ├── demoLogin(): Promise
  └── logout(): void

themeStore.js (Zustand + localStorage persist)
  ├── isDark: boolean
  └── setTheme(isDark): void

syncStore.js (Zustand)
  ├── queryClient: QueryClient | null
  ├── setQueryClient(client): void
  ├── invalidateAll(): void          # Invalidates common query keys
  └── recordAction(action): void     # Track user actions for sync
```

### CSS Architecture
- **Tailwind CSS** for utility classes
- **Custom CSS variables** in `globals.css` for theme colors:
  - `--color-primary`, `--color-secondary`, `--color-success`, etc.
  - Separate dark and light theme variable sets
- **Custom components**: `.glass-card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input-field`
- **Mobile breakpoints**: `max-width: 768px` and `max-width: 380px` with specific overrides
- **Bottom navigation**: Fixed position with glass morphism effect

---

## 8. AI & Intelligence System

### AI Service Architecture
```
ai.client.js          → HTTP client for AI providers (Gemini, Groq, OpenAI)
ai.provider.selector.js → Latency-based provider selection
ai.cache.js           → Response caching layer
ai.error.handler.js   → Retry and fallback logic
ai.safe.executor.js   → Safe execution with timeouts
ai.coach.service.js   → Coaching conversation engine
ai.insight.service.js → Insight generation
ai.planner.service.js → Daily plan generation
```

### AI Providers (Priority Order)
1. **Gemini** (Google): Primary provider, free tier available
2. **Groq** (Llama 3.3 70B): Fallback, very fast
3. **OpenAI** (GPT-4): Optional premium provider

### Smart View Scoring Algorithm
The `GET /tasks/smart-view` endpoint scores tasks using weighted factors:
```javascript
score = 0
if (overdue)          score += 40
if (priority=urgent)  score += 30
if (priority=high)    score += 20
if (priority=medium)  score += 10
if (due_today)        score += 15
if (within_1_hour)    score += 25
if (ai_priority_score) score += ai_priority_score * 0.3
if (energy_alignment) score += 10   // matches current energy level
```
The task with the highest score becomes `recommendedTaskId`.

### Key AI Features
| Feature | Service | Status |
|---------|---------|--------|
| Task prioritization | ai.service.js | Working |
| Task breakdown | task.decomposition.service.js | Working |
| Daily plan generation | daily.plan.generator.service.js | Working |
| Next best action | next.action.service.js | Working |
| Chat conversations | conversation.engine.service.js | Working |
| Mood analysis | ai.insight.service.js | Partial |
| Energy prediction | energy.service.js | Partial |
| Burnout detection | proactive.monitor.service.js | Partial |
| Life predictions | prediction.service.js | Stub |
| Pattern learning | pattern.learning.service.js | Stub |

---

## 9. Authentication & Security

### Auth Flow
1. User submits email/password → `POST /auth/login`
2. Backend validates credentials → returns `{ accessToken, refreshToken, user }`
3. Frontend stores in localStorage via `authStore`
4. Every request: interceptor adds `Authorization: Bearer <accessToken>`
5. On 401: interceptor calls `POST /auth/refresh` with refreshToken
6. If refresh fails: clear tokens, redirect to login

### Demo User
- Email: `demo@lifeflow.app`
- Password: (auto-generated)
- Endpoint: `POST /auth/demo` (no credentials needed)
- Pre-seeded with tasks, habits, and mood data

### Security Middleware
- **Helmet**: Security headers (CSP, XSS protection, etc.)
- **CORS**: Configurable origins
- **Rate Limiting**: Express rate limiter
- **JWT**: RS256/HS256 token signing
- **Bcrypt**: Password hashing (10 rounds)
- **Input Validation**: express-validator on key routes

---

## 10. Deployment & DevOps

### Development (Current Sandbox Setup)
```bash
# Backend (PM2)
pm2 start backend/src/index.js --name lifeflow-api

# Frontend (PM2)
cd frontend && npm run build && pm2 start npm --name lifeflow-web -- start

# Ports
Backend: 5000
Frontend: 3000
```

### Production (Docker Compose)
```bash
# Copy and configure environment
cp .env.production .env
# Edit .env with real values

# Start all services
docker-compose up -d

# Services:
# - postgres (5432)
# - redis (6379)
# - backend (5000)
# - frontend (3000)
# - nginx (80/443)
```

### Environment Variables (Required for Production)
```
NODE_ENV=production
PORT=5000
DB_HOST=postgres
DB_PORT=5432
DB_NAME=lifeflow_db
DB_USER=lifeflow
DB_PASSWORD=<strong_password>
USE_SQLITE=false
JWT_SECRET=<min_32_chars>
JWT_REFRESH_SECRET=<min_32_chars>
REDIS_URL=redis://:password@redis:6379
CLIENT_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com
# Optional
OPENAI_API_KEY=<key>
GEMINI_API_KEY=<key>
GROQ_API_KEY=<key>
STRIPE_SECRET_KEY=<key>
```

---

## 11. Current Status & Known Issues

### Working Features
- Login/Register/Demo authentication
- Task CRUD with grouping and smart-view AI scoring
- Habit CRUD with check-in, streaks, and progress tracking
- Mood logging and history
- AI Assistant with persistent chat sessions
- Dashboard with quick stats
- Notifications (in-app)
- Bottom navigation with smooth transitions
- RTL layout and Arabic text rendering
- UTF-8 charset middleware for proper Arabic API responses

### Known Issues

| Issue | Severity | Details |
|-------|----------|---------|
| `energy_level` column error | Medium | SQLite migration adds the column, but some user queries still fail if running without migration. Workaround: restart backend to trigger column migration. |
| AI rate limiting (429) | Low | Gemini API hits rate limits during heavy use. Groq fallback handles it but with degraded quality. |
| Socket.IO on sandbox | Low | WebSocket upgrade may fail through certain proxies. Falls back to long-polling. |
| `lifeflow-backend` PM2 stopped | Info | Duplicate PM2 entry. Only `lifeflow-api` should be used. The `lifeflow-backend` entry can be deleted with `pm2 delete lifeflow-backend`. |
| Some intelligence endpoints 404 | Medium | Some advanced intelligence features (life simulation, burnout risk) return 404 because the route handlers are stubs. |
| Subscription Stripe not wired | Low | Stripe integration is scaffolded but checkout/webhook flows are not complete. |

### Browser Compatibility
- **Chrome 90+**: Full support
- **Safari 15+**: Full support (iOS safe area handled)
- **Firefox 90+**: Full support
- **Edge 90+**: Full support

---

## 12. Development Guidelines

### Code Style
- **Backend**: CommonJS (`require`/`module.exports`), async/await
- **Frontend**: ES Modules (`import`/`export`), React functional components, hooks only
- **Naming**: camelCase for variables/functions, PascalCase for components, kebab-case for files
- **Arabic text**: Always use native Arabic characters directly in JSX, never Unicode escapes

### Adding a New Feature (Checklist)
1. **Backend Model**: Create `backend/src/models/<name>.model.js`
2. **Register Model**: Add `require` in `backend/src/config/database.js` → `registerModels()`
3. **Controller**: Create `backend/src/controllers/<name>.controller.js`
4. **Routes**: Create `backend/src/routes/<name>.routes.js`
5. **Mount Route**: Add to `backend/src/index.js` → `app.use('/api/v1/<name>', ...)`
6. **Frontend API**: Add methods to `frontend/src/utils/api.js`
7. **Component**: Create view in `frontend/src/components/<name>/`
8. **Register View**: Add to `VIEWS` map in `Dashboard.jsx`
9. **Navigation**: Add to `MobileBottomNav.jsx` (if core feature) or `Sidebar.jsx`
10. **Test**: Verify API with curl, verify UI on mobile viewport

### Common Patterns

#### Backend Controller Pattern
```javascript
exports.getItems = async (req, res) => {
  try {
    const userId = req.user.id;
    const items = await Model.findAll({ where: { user_id: userId } });
    res.json({ success: true, data: { items } });
  } catch (error) {
    logger.error('[CONTROLLER] Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};
```

#### Frontend Data Fetching Pattern
```jsx
const { data, isLoading } = useQuery({
  queryKey: ['items'],
  queryFn: () => itemAPI.getItems(),
  refetchInterval: 30000,
  select: (res) => res?.data?.data?.items || [],
});
```

#### Mutation with Toast Pattern
```jsx
const mutation = useMutation({
  mutationFn: (data) => itemAPI.create(data),
  onSuccess: () => {
    invalidateAll();
    toast.success('تم بنجاح');
  },
  onError: (e) => toast.error(e.message || 'فشل'),
});
```

### Timezone Handling
- **Backend**: Use `moment-timezone` with `Africa/Cairo` zone
- **Frontend**: Use `toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })`
- **Database**: Store all timestamps in UTC
- **Display**: Convert to Cairo time only at display layer

### RTL Considerations
- Use `dir="rtl"` on container elements
- Use `text-right` / `text-left` carefully (they're logical in RTL)
- Use `mr-` for spacing that should be on the right in RTL
- Icons that indicate direction should be mirrored or use `ChevronRight` for "forward"
- Bottom nav active indicator uses `layoutId` for smooth animation

---

## 13. Pending Work & Roadmap

### High Priority
| Task | Effort | Notes |
|------|--------|-------|
| Fix `energy_level` column migration reliability | 2h | Ensure addColumnIfMissing runs before any query |
| Complete subscription Stripe flow | 1-2 days | Wire up checkout, webhook, plan enforcement |
| Add comprehensive error boundaries per view | 4h | Currently only 1 ErrorBoundary wrapping all views |
| Add unit tests for controllers | 2-3 days | Zero test coverage currently |
| Fix 404 intelligence endpoints | 4h | Wire stub routes to actual implementations |

### Medium Priority
| Task | Effort | Notes |
|------|--------|-------|
| Add offline support (service worker) | 1-2 days | Cache critical API responses |
| Implement push notifications (FCM) | 1 day | FCM registration exists but not wired |
| Add task drag-and-drop reordering | 4h | Use framer-motion reorder |
| Calendar sync (Google Calendar) | 2 days | OAuth + event import/export |
| Voice input for assistant | 1 day | Web Speech API integration |
| Add data export/import (JSON/CSV) | 4h | User data portability |
| Implement habit reminders (local notifications) | 4h | Browser Notification API |

### Low Priority / Nice-to-Have
| Task | Effort | Notes |
|------|--------|-------|
| Light theme polish | 4h | Light mode CSS variables exist but need more work |
| Multi-language support (English UI) | 2 days | i18n framework already in next.config.js |
| Desktop layout optimization | 1 day | Currently mobile-first, desktop works but not optimized |
| Progressive Web App (PWA) | 4h | Add manifest.json and service worker |
| Analytics dashboard for admins | 2 days | Track user engagement, AI usage |
| Mobile React Native app | 2-4 weeks | `mobile-rn/` directory exists but is empty |

### Technical Debt
- Remove `lifeflow-backend` PM2 process entry
- Consolidate duplicate AI service files (root `ai/` vs `services/ai/`)
- Add TypeScript types for API responses
- Implement proper database migrations (currently using Sequelize sync + addColumnIfMissing)
- Add request validation (express-validator) to all routes
- Implement proper logging levels and log rotation
- Add health check endpoints that verify DB + Redis connectivity

---

## Quick Start for New Developers

```bash
# 1. Clone the repository
git clone https://github.com/salahaldenmohamed05-jpg/lifeflow.git
cd lifeflow

# 2. Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Start backend (uses SQLite by default)
cd backend && node src/index.js
# → Server on http://localhost:5000

# 4. Build and start frontend
cd frontend && npm run build && npm start
# → Frontend on http://localhost:3000

# 5. Access demo
# Go to http://localhost:3000 → Click "دخول كمستخدم تجريبي"

# 6. Test API
curl http://localhost:5000/health
curl -X POST http://localhost:5000/api/v1/auth/demo
```

---

*This document is intended to be maintained as the project evolves. Update it whenever significant changes are made to the architecture, API, or database schema.*
