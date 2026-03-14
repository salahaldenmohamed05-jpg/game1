# LifeFlow Mobile App (React Native + Expo)
## تطبيق LifeFlow للموبايل - React Native

> **مساعدك الشخصي الذكي** - تطبيق موبايل كامل يعمل أوفلاين مع SQLite

---

## 🌟 المميزات

- ✅ **تخزين محلي كامل** - SQLite عبر expo-sqlite
- 🔄 **مزامنة ذكية** - يعمل أوفلاين ويزامن عند الاتصال  
- 🌙 **ثيم ليلي/نهاري** - تبديل سلس بين الثيمين
- 📱 **يثبت على الجهاز** - APK/IPA قابل للتثبيت
- 🔒 **تخزين آمن للتوكن** - expo-secure-store
- 🇸🇦 **واجهة عربية كاملة** - RTL بالكامل

---

## 🏗️ هيكل المشروع

```
mobile-rn/
├── App.js                          # نقطة الدخول + تهيئة DB
├── app.json                        # إعدادات Expo
├── src/
│   ├── database/
│   │   └── database.js             # SQLite - جميع عمليات CRUD
│   ├── services/
│   │   └── api.js                  # Axios API client
│   ├── store/
│   │   ├── authStore.js            # Zustand - المصادقة
│   │   └── themeStore.js           # Zustand - الثيم
│   ├── theme/
│   │   └── theme.js                # ألوان وستايلات
│   ├── navigation/
│   │   └── AppNavigator.js         # React Navigation
│   └── screens/
│       ├── auth/LoginScreen.js     # تسجيل الدخول
│       ├── home/HomeScreen.js      # الرئيسية
│       ├── tasks/TasksScreen.js    # المهام
│       ├── habits/HabitsScreen.js  # العادات
│       ├── mood/MoodScreen.js      # المزاج
│       └── settings/SettingsScreen.js # الإعدادات
```

---

## 🚀 تشغيل التطبيق

### المتطلبات
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app على الهاتف (للتطوير)

### التثبيت
```bash
cd mobile-rn
npm install
```

### التشغيل (تطوير)
```bash
npx expo start
```
ثم افتح Expo Go على الهاتف وامسح QR Code

### بناء APK للأندرويد
```bash
# باستخدام EAS Build
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

### بناء IPA للـ iOS
```bash
eas build --platform ios --profile preview
```

---

## 🗄️ قاعدة البيانات (SQLite)

### الجداول
| الجدول | الوصف |
|--------|-------|
| `users` | بيانات المستخدم |
| `tasks` | المهام |
| `habits` | العادات |
| `habit_checkins` | تسجيل العادات اليومي |
| `mood_entries` | سجلات المزاج |
| `notifications` | الإشعارات |
| `sync_queue` | قائمة انتظار المزامنة |
| `app_settings` | إعدادات التطبيق |

### مثال استخدام
```js
import { taskDB, habitDB, moodDB } from './src/database/database';

// إضافة مهمة
await taskDB.create({ user_id: 'uid', title: 'مهمة جديدة', priority: 'high' });

// جلب العادات اليومية
const summary = await habitDB.getTodaySummary('uid');

// تسجيل المزاج
await moodDB.logMood('uid', { mood_score: 8, emotions: ['😊 سعيد'], note: 'يوم رائع' });
```

---

## 🔄 آلية الأوفلاين

1. كل عملية **تُحفظ محلياً أولاً** في SQLite
2. ثم تحاول **المزامنة مع الخادم**
3. إذا فشل الاتصال، تبقى البيانات محلياً مع علامة `is_synced = 0`
4. عند الاتصال، يمكن مزامنة البيانات من جدول `sync_queue`

---

## ⚙️ متغيرات البيئة

```env
EXPO_PUBLIC_API_URL=https://your-api-server.com/api/v1
```

---

## 📦 المكتبات الرئيسية

| المكتبة | الاستخدام |
|---------|----------|
| `expo-sqlite` | قاعدة البيانات المحلية |
| `expo-secure-store` | تخزين التوكن بأمان |
| `@tanstack/react-query` | إدارة البيانات والكاش |
| `zustand` | إدارة الحالة |
| `@react-navigation` | التنقل بين الشاشات |
| `axios` | طلبات HTTP |

---

## 🧪 اختبار الحساب التجريبي

- **البريد**: `demo@lifeflow.app`
- **كلمة المرور**: `demo123456`
