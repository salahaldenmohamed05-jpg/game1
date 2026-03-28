# LifeFlow - مساعدك الشخصي الذكي 🌟

<div dir="rtl">

> **LifeFlow** تطبيق ذكاء اصطناعي عربي شامل لإدارة الحياة الشخصية والمهنية — يجمع بين إدارة المهام، تتبع العادات، رصد المزاج، وتحليلات ذكية مدعومة بالـ AI.

</div>

---

## 📸 Live Demo

- **Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **API Backend**: [http://localhost:5000/health](http://localhost:5000/health)
- **Demo Login**: `demo@lifeflow.app` / `demo123`

---

## 🏗️ Project Architecture

```
lifeflow/
├── backend/          # Node.js + Express REST API
│   ├── src/
│   │   ├── controllers/   # Request handlers
│   │   ├── models/        # Sequelize ORM models (SQLite)
│   │   ├── routes/        # API route definitions
│   │   ├── services/      # Business logic
│   │   │   ├── ai.service.js        # AI suggestions & chat
│   │   │   ├── scheduler.service.js # Cron jobs & reminders
│   │   │   └── dashboard.service.js # Dashboard data aggregation
│   │   ├── middleware/    # Auth, validation, rate limiting
│   │   └── utils/         # Helpers, logger, seed data
│   └── package.json
│
├── frontend/         # Next.js React Web Dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── dashboard/     # Main dashboard
│   │   │   ├── tasks/         # Task management
│   │   │   ├── habits/        # Habit tracking
│   │   │   ├── mood/          # Mood tracking
│   │   │   ├── insights/      # Analytics & reports
│   │   │   ├── calendar/      # Calendar view
│   │   │   ├── notifications/ # Notification center
│   │   │   ├── voice/         # AI chat interface
│   │   │   └── layout/        # Sidebar, Header
│   │   ├── pages/             # Next.js pages
│   │   ├── store/             # Zustand state management
│   │   ├── utils/             # API client, helpers
│   │   └── styles/            # Global CSS + Tailwind
│   └── package.json
│
├── mobile/           # Flutter Arabic Mobile App
│   ├── lib/
│   │   ├── main.dart          # App entry point
│   │   ├── models/            # Data models
│   │   ├── providers/         # State management (Provider)
│   │   ├── screens/
│   │   │   ├── splash_screen.dart
│   │   │   ├── auth/          # Login / Register
│   │   │   ├── home/          # Dashboard
│   │   │   ├── tasks/         # Tasks management
│   │   │   ├── habits/        # Habit tracking
│   │   │   ├── mood/          # Mood logging
│   │   │   └── chat/          # AI assistant chat
│   │   ├── services/          # API + Notifications
│   │   ├── utils/             # Theme, constants
│   │   └── widgets/           # Reusable widgets
│   └── pubspec.yaml
│
└── docs/             # Documentation
```

> **Note (Phase B):** React Native is **NOT supported**. The mobile client is **Flutter only** (`mobile/` directory). Any React Native references in external docs are deprecated and should be disregarded. Flutter is the sole mobile platform going forward.

---

## ✨ Core Features

### 📋 Task Management - إدارة المهام
- **Smart Prioritization**: Auto-prioritize by deadline, importance & context
- **Categories**: Personal (شخصي) / Work (عمل) / Health (صحة) / Social (اجتماعي)
- **Recurring Tasks**: Daily, weekly, monthly, weekdays patterns
- **Context-aware reminders**: Based on location/time patterns
- **Calendar Integration**: Visual time-blocking calendar view
- **AI Suggestions**: Smart recommendations for task ordering

### 🔥 Habit Tracking - تتبع العادات
| العادة | الوقت | التذكير |
|--------|-------|---------|
| شرب ماء 💧 | 08:00 | إشعار صباحي |
| رياضة 🏃 | 18:00 | إشعار مسائي |
| قراءة 📚 | 21:00 | إشعار ليلي |
| تأمل 🧘 | 07:00 | صباح الخير |

- **Streak tracking**: 🔥 Visual streaks with motivation
- **Progress rings**: Daily completion percentage
- **Habit analytics**: Best days, completion rates, patterns
- **Smart reminders**: Context-aware notification timing

### 💭 Mood Tracking - تتبع المزاج
- **Daily check-in**: "كيف كان مزاجك اليوم؟" prompt at 21:00
- **10-point scale**: Visual emoji-based rating
- **Emotion tags**: سعيد / قلق / متحمس / هادئ / تعب...
- **Weekly analysis**: Trend charts and pattern detection
- **Correlation insights**: Mood vs productivity/sleep patterns
- **AI recommendations**: Mood-based activity suggestions

### 🧠 AI & Insights - الرؤى الذكية
- **Daily Summary**: Morning briefing with today's plan
- **Weekly Report**: Behavioral analysis every Friday
- **Smart suggestions**: Personalized productivity tips
- **Behavior patterns**: Learn user habits over time
- **Break recommendations**: Prevent burnout
- **Goal tracking**: Progress toward weekly/monthly goals

### 🔔 Notifications - الإشعارات الذكية
- **Context-aware**: Right message at the right time
- **Quiet hours**: Respects your sleep schedule (23:00–07:00)
- **Smart batching**: Groups similar notifications
- **Types**: Habit reminders, task alerts, mood check, weekly report, smart tips

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Flutter 3.0+ (for mobile)
- Dart SDK 3.0+

### Backend Setup

```bash
cd lifeflow/backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Seed demo data
node src/utils/seed.js

# Start server
npm run dev
# Server runs on http://localhost:5000
```

### Frontend Setup

```bash
cd lifeflow/frontend

# Install dependencies
npm install

# Configure API URL
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1" > .env.local

# Start dev server
npm run dev
# Dashboard at http://localhost:3000
```

### Flutter Mobile Setup

```bash
cd lifeflow/mobile

# Install dependencies
flutter pub get

# Configure API URL
# Edit lib/utils/app_constants.dart
# Change apiBaseUrl to your backend URL

# Run on connected device/emulator
flutter run

# Build release APK
flutter build apk --release
```

---

## 🔑 API Endpoints

### Authentication
```
POST /api/v1/auth/register   - إنشاء حساب جديد
POST /api/v1/auth/login      - تسجيل الدخول
GET  /api/v1/auth/me         - بيانات المستخدم
```

### Tasks
```
GET    /api/v1/tasks          - قائمة المهام
POST   /api/v1/tasks          - إنشاء مهمة
PATCH  /api/v1/tasks/:id      - تحديث مهمة
DELETE /api/v1/tasks/:id      - حذف مهمة
POST   /api/v1/tasks/ai-suggest - اقتراحات AI
```

### Habits
```
GET  /api/v1/habits             - قائمة العادات
POST /api/v1/habits             - إنشاء عادة
POST /api/v1/habits/:id/check-in - تسجيل إنجاز
GET  /api/v1/habits/:id/stats   - إحصائيات العادة
```

### Mood
```
GET  /api/v1/mood          - سجل المزاج
POST /api/v1/mood          - تسجيل مزاج جديد
GET  /api/v1/mood/analysis - تحليل المزاج
```

### AI Chat
```
POST /api/v1/ai/chat         - إرسال رسالة للمساعد
GET  /api/v1/ai/suggestions  - اقتراحات مخصصة
GET  /api/v1/ai/daily-brief  - الملخص اليومي
```

### Insights
```
GET /api/v1/insights/daily-summary  - ملخص يومي
GET /api/v1/insights/weekly-report  - تقرير أسبوعي
GET /api/v1/insights/productivity-tips - نصائح الإنتاجية
```

### Dashboard
```
GET /api/v1/dashboard - لوحة التحكم الكاملة
```

---

## 🗄️ Database Schema

### Users
```sql
id, name, email, password_hash, timezone, 
preferences (JSON), stats (JSON), created_at
```

### Tasks
```sql
id, user_id, title, description, status, priority,
category, due_date, is_recurring, recurrence_pattern,
tags (JSON), completed_at, created_at
```

### Habits
```sql
id, user_id, name, icon, color, frequency,
reminder_times (JSON), current_streak, longest_streak,
total_completions, is_active, created_at
```

### HabitLogs
```sql
id, habit_id, user_id, completed_date, notes, created_at
```

### MoodEntries
```sql
id, user_id, mood_score (1-10), emotions (JSON),
note, energy_level, period, date, created_at
```

### Insights
```sql
id, user_id, type, title, content, data (JSON),
period_start, period_end, is_read, created_at
```

### Notifications
```sql
id, user_id, type, title, message, scheduled_for,
is_read, is_sent, metadata (JSON), created_at
```

---

## 🎨 Design System

### Colors
```css
--primary:   #6C63FF  /* Purple - الأساسي */
--secondary: #0EA5E9  /* Blue   - الثانوي */
--accent-g:  #10B981  /* Green  - الأخضر */
--accent-o:  #F59E0B  /* Orange - البرتقالي */
--accent-p:  #EC4899  /* Pink   - الوردي */
--dark-bg:   #0F0F1A  /* Dark Background */
--dark-card: #1A2642  /* Card Background */
```

### Typography
- **Font**: Cairo (Google Fonts) - يدعم اللغة العربية
- **Weights**: 400 (Normal) / 600 (SemiBold) / 700 (Bold) / 800 (ExtraBold) / 900 (Black)
- **Direction**: RTL (Right-to-Left) by default

### Arabic Support
- Full RTL layout
- Cairo font for beautiful Arabic text
- Arabic numerals support
- Egypt/Cairo timezone defaults
- Arabic date formatting

---

## 🤖 AI Features

### Current Implementation
- **Smart Suggestions**: Rule-based recommendations using user data
- **Daily Summary**: Automated morning briefing
- **Weekly Report**: Behavioral analysis and patterns
- **Mood Analysis**: Correlation and trend detection
- **Task Ordering**: Priority + deadline + energy optimization

### Future AI Enhancements
- **LLM Integration**: Connect to OpenAI GPT-4 / Arabic LLMs
- **Voice Commands**: "Hey LifeFlow" wake word
- **Behavior Prediction**: ML model for habit/task completion prediction
- **Arabic NLP**: Natural language task creation
- **Personalization**: Learning from user behavior over time

---

## 📱 Mobile App Features

### Screens
1. **Splash Screen** - Animated logo with auth check
2. **Login/Register** - Tab-based auth with validation
3. **Dashboard** - Overview with smart suggestions
4. **Tasks** - Full task management with swipe-to-delete
5. **Habits** - Grid view with check-in, streaks
6. **Mood** - Slider + emotion tags + weekly chart
7. **AI Chat** - Full chat interface with typing indicators

### Mobile-Specific Features
- Local push notifications
- Offline support (future)
- Biometric authentication (future)
- Widget support (future)
- Dark mode only (system)

---

## 🔧 Technology Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18 |
| Framework | Express.js |
| Database | SQLite (dev) / PostgreSQL (prod) |
| ORM | Sequelize |
| Auth | JWT + bcrypt |
| Cache | In-memory (Redis in prod) |
| Scheduler | node-cron |
| Real-time | Socket.IO |
| Validation | express-validator |

### Frontend (Web)
| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 |
| Language | JavaScript/JSX |
| Styling | Tailwind CSS |
| State | Zustand |
| Data Fetching | React Query |
| Charts | Recharts |
| Animations | Framer Motion |
| Icons | Lucide React |

### Mobile (Flutter)
| Component | Technology |
|-----------|-----------|
| Framework | Flutter 3 |
| Language | Dart |
| State | Provider |
| HTTP | http package |
| Storage | SharedPreferences |
| Notifications | flutter_local_notifications |
| Charts | fl_chart |

---

## 👤 Demo User Profile

```json
{
  "name": "أحمد محمد",
  "email": "demo@lifeflow.app",
  "password": "demo123",
  "timezone": "Africa/Cairo",
  "schedule": {
    "wake_up": "07:00",
    "work_start": "09:00",
    "work_end": "17:00",
    "sleep": "23:00"
  },
  "habits": [
    { "name": "شرب ماء", "icon": "💧", "time": "08:00" },
    { "name": "رياضة",   "icon": "🏃", "time": "18:00" },
    { "name": "قراءة",   "icon": "📚", "time": "21:00" },
    { "name": "تأمل",    "icon": "🧘", "time": "07:30" }
  ]
}
```

---

## 🚢 Production Deployment

### Environment Variables
```env
# Backend (.env)
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...         # For AI chat
GOOGLE_CALENDAR_CLIENT_ID=... # For calendar sync
```

### Docker
```bash
# Build and run with Docker Compose
docker-compose up -d
```

### Scaling Considerations
- Horizontal scaling with PM2 cluster
- Redis for session sharing
- PostgreSQL for production database
- CDN for static assets
- WebSocket sticky sessions

---

## 📈 Roadmap

### Phase 1 (Current) ✅
- [x] Backend REST API with SQLite
- [x] React/Next.js Web Dashboard
- [x] Flutter Mobile App
- [x] Arabic RTL interface
- [x] Task management
- [x] Habit tracking with streaks
- [x] Mood logging and analysis
- [x] AI suggestions (rule-based)
- [x] Push notifications

### Phase 2 🔄
- [ ] Google Calendar & Outlook sync
- [ ] Real LLM integration (GPT-4 Arabic)
- [ ] Voice commands (Speech-to-Text)
- [ ] WhatsApp reminders
- [ ] Advanced analytics dashboard

### Phase 3 📅
- [ ] iOS/Android app store release
- [ ] Multi-user teams
- [ ] Goal tracking system
- [ ] Machine learning models
- [ ] Arabic voice assistant

---

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines and submit PRs to the `genspark_ai_developer` branch.

---

## 📄 License

MIT License - Built with ❤️ for the Arabic-speaking productivity community

---

<div align="center">
  <b>LifeFlow</b> - نظّم حياتك بذكاء 🌟
</div>
