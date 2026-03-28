/**
 * Database Seeder - Demo Data
 * ============================
 * يضيف بيانات تجريبية للتطبيق
 */

require('dotenv').config();

const { connectDB } = require('../config/database');
const User = require('../models/user.model');
const Task = require('../models/task.model');
const { Habit, HabitLog } = require('../models/habit.model');
const MoodEntry = require('../models/mood.model');
const { Insight, Notification } = require('../models/insight.model');
const Goal = require('../models/goal.model');
const moment = require('moment');

async function seed() {
  console.log('🌱 Starting database seed...');
  await connectDB();

  // Create demo user
  let user = await User.findOne({ where: { email: 'demo@lifeflow.app' } });
  if (!user) {
    user = await User.create({
      name: 'أحمد المستخدم',
      email: 'demo@lifeflow.app',
      password: 'demo123',
      timezone: 'Africa/Cairo',
      language: 'ar',
      wake_up_time: '07:00',
      work_start_time: '09:00',
      work_end_time: '17:00',
      sleep_time: '23:00',
      is_verified: true,
    });
    console.log('✅ Demo user created: demo@lifeflow.app / demo123');
  }

  // Create demo tasks
  const tasks = [
    { title: 'إتمام تقرير المشروع الأسبوعي', category: 'work', priority: 'high', status: 'pending', due_date: new Date(), ai_priority_score: 85 },
    { title: 'مراجعة بريد العمل', category: 'work', priority: 'medium', status: 'completed', completed_at: new Date(), ai_priority_score: 60 },
    { title: 'مكالمة مع العميل', category: 'work', priority: 'urgent', status: 'pending', due_date: moment().add(2, 'hours').toDate(), ai_priority_score: 95 },
    { title: 'قراءة كتاب تطوير الذات', category: 'personal', priority: 'low', status: 'pending', ai_priority_score: 40 },
    { title: 'شراء مستلزمات المنزل', category: 'personal', priority: 'medium', status: 'pending', ai_priority_score: 50 },
    { title: 'مراجعة خطة التعلم الشهرية', category: 'learning', priority: 'high', status: 'in_progress', ai_priority_score: 75 },
  ];

  for (const task of tasks) {
    await Task.findOrCreate({
      where: { user_id: user.id, title: task.title },
      defaults: { ...task, user_id: user.id },
    });
  }
  console.log('✅ Tasks seeded');

  // Create demo habits
  const habits = [
    { name: 'شرب الماء', name_ar: 'شرب الماء', category: 'health', icon: '💧', color: '#3B82F6', target_time: '08:00', duration_minutes: 5, target_value: 8, unit: 'كوب', current_streak: 5, longest_streak: 14 },
    { name: 'رياضة', name_ar: 'رياضة يومية', category: 'fitness', icon: '🏃', color: '#10B981', target_time: '18:00', duration_minutes: 45, current_streak: 3, longest_streak: 21 },
    { name: 'قراءة', name_ar: 'قراءة يومية', category: 'learning', icon: '📚', color: '#8B5CF6', target_time: '21:00', duration_minutes: 30, target_value: 20, unit: 'صفحة', current_streak: 7, longest_streak: 30 },
    { name: 'تأمل', name_ar: 'تأمل وتنفس', category: 'mindfulness', icon: '🧘', color: '#F59E0B', target_time: '07:30', duration_minutes: 10, current_streak: 2, longest_streak: 8 },
  ];

  for (const habit of habits) {
    await Habit.findOrCreate({
      where: { user_id: user.id, name: habit.name },
      defaults: { ...habit, user_id: user.id },
    });
  }
  console.log('✅ Habits seeded');

  // Create mood entries for last 7 days
  const moodScores = [7, 8, 6, 9, 7, 5, 8];
  const emotionSets = [
    ['سعيد', 'متحمس'],
    ['هادئ', 'ممتن'],
    ['قلق', 'تعب'],
    ['سعيد', 'متحمس', 'مركّز'],
    ['هادئ'],
    ['محبط', 'تعب'],
    ['سعيد', 'ممتن'],
  ];

  for (let i = 6; i >= 0; i--) {
    const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
    try {
      await MoodEntry.findOrCreate({
        where: { user_id: user.id, entry_date: date },
        defaults: {
          user_id: user.id,
          entry_date: date,
          mood_score: moodScores[6 - i],
          emotions: JSON.stringify(emotionSets[6 - i]),
          energy_level: 3,
          stress_level: 2,
          factors: JSON.stringify({
            positive: i % 2 === 0 ? ['نوم جيد', 'مارست رياضة'] : ['إنجاز مهمة'],
            negative: i % 3 === 0 ? ['ضغط عمل'] : [],
          }),
          period: 'evening',
        },
      });
    } catch (e) {
    logger.error('[SEED] Seeding error:', { error: e.message });
      // Skip if exists
    }
  }
  console.log('✅ Mood entries seeded');

  // Create goals
  const goals = [
    { title: 'إتمام مشروع العمل', description: 'إنهاء مشروع التطوير الرئيسي', category: 'productivity', target_date: '2026-03-15', progress: 60, status: 'active' },
    { title: 'تعلم الذكاء الاصطناعي', description: 'دراسة مبادئ AI والتعلم الآلي', category: 'learning', target_date: '2026-04-01', progress: 35, status: 'active' },
    { title: 'تحسين اللياقة البدنية', description: 'الوصول لوزن مثالي وقوة بدنية', category: 'health', target_date: '2026-06-01', progress: 20, status: 'active' },
  ];

  for (const goal of goals) {
    await Goal.findOrCreate({
      where: { user_id: user.id, title: goal.title },
      defaults: { ...goal, user_id: user.id },
    });
  }
  console.log('✅ Goals seeded');

  console.log('\n🎉 Seed completed successfully!');
  console.log('📧 Demo login: demo@lifeflow.app / demo123');
  process.exit(0);
}

seed().catch(e => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
