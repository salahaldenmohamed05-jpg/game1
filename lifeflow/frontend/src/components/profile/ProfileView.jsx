/**
 * ProfileView — Personalization Hub
 * ====================================
 * NOT a static form. Every field here influences AI behavior.
 *
 * Sections:
 * 1. User Identity (name, email, avatar)
 * 2. Life Context (role, focus areas, bio)
 * 3. Energy Profile (work time, energy level, deep work)
 * 4. Goals (weekly + monthly)
 * 5. AI Snapshot (productivity patterns, focus time, insights)
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Briefcase, Target, Zap, Battery, Clock, Sun, Moon, Sunset,
  TrendingUp, Brain, Award, Edit3, Save, ChevronDown, ChevronUp, Plus, X,
  Flame, BarChart2, CheckCircle, AlertTriangle, Sparkles, Coffee, Dumbbell,
  BookOpen, Heart, Code, Palette, Music, Globe,
} from 'lucide-react';
import { profileAPI } from '../../utils/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

// ── Constants ───────────────────────────────────────────────────────────
const ROLES = [
  { id: 'student',       label: 'طالب',           icon: BookOpen },
  { id: 'employee',      label: 'موظف',           icon: Briefcase },
  { id: 'freelancer',    label: 'عمل حر',         icon: Code },
  { id: 'entrepreneur',  label: 'رائد أعمال',     icon: TrendingUp },
  { id: 'parent',        label: 'والد/ة',         icon: Heart },
  { id: 'retired',       label: 'متقاعد',         icon: Coffee },
  { id: 'other',         label: 'أخرى',           icon: Globe },
];

const FOCUS_AREAS = [
  { id: 'work',       label: 'العمل',         icon: Briefcase, color: 'from-blue-500 to-blue-600' },
  { id: 'study',      label: 'الدراسة',       icon: BookOpen,  color: 'from-purple-500 to-purple-600' },
  { id: 'fitness',    label: 'اللياقة',       icon: Dumbbell,  color: 'from-green-500 to-green-600' },
  { id: 'health',     label: 'الصحة',         icon: Heart,     color: 'from-red-500 to-red-600' },
  { id: 'creativity', label: 'الإبداع',       icon: Palette,   color: 'from-pink-500 to-pink-600' },
  { id: 'social',     label: 'العلاقات',      icon: Globe,     color: 'from-yellow-500 to-yellow-600' },
  { id: 'finance',    label: 'المالية',       icon: TrendingUp,color: 'from-emerald-500 to-emerald-600' },
  { id: 'hobbies',    label: 'الهوايات',      icon: Music,     color: 'from-indigo-500 to-indigo-600' },
];

const WORK_TIMES = [
  { id: 'early_morning', label: 'فجر (4-7)',        icon: '🌅', desc: 'أعمل أفضل في الفجر' },
  { id: 'morning',       label: 'صباح (7-12)',       icon: '☀️', desc: 'نشاطي الأعلى صباحاً' },
  { id: 'afternoon',     label: 'ظهر (12-17)',       icon: '🌤️', desc: 'بعد الظهر أفضل وقت' },
  { id: 'evening',       label: 'مساء (17-22)',      icon: '🌆', desc: 'أبدع في المساء' },
  { id: 'night',         label: 'ليل (22-4)',        icon: '🌙', desc: 'أعمل في الليل' },
];

const ENERGY_LEVELS = [
  { id: 'very_low',  label: 'منخفضة جداً', color: 'bg-red-500',    width: 'w-1/5' },
  { id: 'low',       label: 'منخفضة',      color: 'bg-orange-500',  width: 'w-2/5' },
  { id: 'medium',    label: 'متوسطة',      color: 'bg-yellow-500',  width: 'w-3/5' },
  { id: 'high',      label: 'عالية',        color: 'bg-green-500',   width: 'w-4/5' },
  { id: 'very_high', label: 'عالية جداً',   color: 'bg-emerald-500', width: 'w-full' },
];

// ── Section Card Component ──────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children, description, collapsible = false, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl overflow-hidden border border-white/[0.06]"
    >
      <button
        onClick={() => collapsible && setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-3 p-4 pb-${isOpen ? '2' : '4'} text-right ${collapsible ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'}`}
      >
        <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm">{title}</h3>
          {description && <p className="text-gray-500 text-xs mt-0.5">{description}</p>}
        </div>
        {collapsible && (
          isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Completeness Ring ───────────────────────────────────────────────────
function CompletenessRing({ percent }) {
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 80 ? '#22c55e' : percent >= 50 ? '#eab308' : '#ef4444';

  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white font-bold text-sm">{percent}%</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function ProfileView() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  // ── Data fetching ─────────────────────────────────────────────────────
  const { data: profileResp, isLoading } = useQuery({
    queryKey: ['user-profile'],
    queryFn: profileAPI.getProfile,
    staleTime: 30_000,
  });

  const { data: snapshotResp, isLoading: snapshotLoading } = useQuery({
    queryKey: ['ai-snapshot'],
    queryFn: profileAPI.getAISnapshot,
    staleTime: 60_000,
  });

  const profile  = profileResp?.data?.data  || {};
  const snapshot = snapshotResp?.data?.data || {};

  // ── Local edit state ──────────────────────────────────────────────────
  const [editing, setEditing] = useState(null); // 'identity' | 'context' | 'energy' | 'goals'
  const [formData, setFormData] = useState({});
  const [lastSaveTs, setLastSaveTs] = useState(0); // prevents refetch overwrite after save

  // Sync form from server data — only on initial load or external changes
  const serverDataKey = profile.last_ai_sync || profile.profile_completeness;
  useEffect(() => {
    // Skip if we just saved (give 3s for the refetch to settle)
    if (Date.now() - lastSaveTs < 3000) return;
    if (profile && Object.keys(profile).length > 0) {
      setFormData(prev => {
        // Only seed if form is empty (first load) or not currently editing
        if (Object.keys(prev).length === 0 || !editing) {
          return {
            name: profile.name || '',
            role: profile.role || 'employee',
            focus_areas: profile.focus_areas || [],
            bio: profile.bio || '',
            preferred_work_time: profile.preferred_work_time || 'morning',
            energy_level: profile.energy_level || 'medium',
            deep_work_duration: profile.deep_work_duration || 90,
            break_frequency: profile.break_frequency || 60,
            wake_up_time: profile.wake_up_time || '07:00',
            sleep_time: profile.sleep_time || '23:00',
            work_start_time: profile.work_start_time || '09:00',
            work_end_time: profile.work_end_time || '17:00',
            weekly_goals: profile.weekly_goals || [],
            monthly_goals: profile.monthly_goals || [],
          };
        }
        return prev;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDataKey, profile.name, profile.role]);

  // ── Mutation ──────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data) => profileAPI.updateProfile(data),
    onSuccess: (resp) => {
      const updated = resp?.data?.data || {};
      setLastSaveTs(Date.now());
      // Immediately merge the mutation response into formData
      setFormData(prev => ({ ...prev, ...updated }));
      // Invalidate queries so other pages get fresh data
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      queryClient.invalidateQueries({ queryKey: ['ai-snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (updated.name) updateUser({ name: updated.name });
      toast.success('تم حفظ التغييرات');
      setEditing(null);
    },
    onError: () => toast.error('فشل في الحفظ'),
  });

  const handleSave = (section) => {
    const data = {};
    if (section === 'identity') {
      data.name = formData.name;
    } else if (section === 'context') {
      data.role = formData.role;
      data.focus_areas = formData.focus_areas;
      data.bio = formData.bio;
    } else if (section === 'energy') {
      data.preferred_work_time = formData.preferred_work_time;
      data.energy_level = formData.energy_level;
      data.deep_work_duration = formData.deep_work_duration;
      data.break_frequency = formData.break_frequency;
      data.wake_up_time = formData.wake_up_time;
      data.sleep_time = formData.sleep_time;
      data.work_start_time = formData.work_start_time;
      data.work_end_time = formData.work_end_time;
    } else if (section === 'goals') {
      data.weekly_goals = formData.weekly_goals;
      data.monthly_goals = formData.monthly_goals;
    }
    updateMutation.mutate(data);
  };

  const toggleFocusArea = (areaId) => {
    setFormData(prev => ({
      ...prev,
      focus_areas: prev.focus_areas.includes(areaId)
        ? prev.focus_areas.filter(a => a !== areaId)
        : [...prev.focus_areas, areaId],
    }));
  };

  // ── Goal helpers ──────────────────────────────────────────────────────
  const [newWeeklyGoal, setNewWeeklyGoal] = useState('');
  const [newMonthlyGoal, setNewMonthlyGoal] = useState('');

  const addGoal = (type) => {
    const value = type === 'weekly' ? newWeeklyGoal : newMonthlyGoal;
    if (!value.trim()) return;
    setFormData(prev => ({
      ...prev,
      [`${type}_goals`]: [...(prev[`${type}_goals`] || []), value.trim()],
    }));
    if (type === 'weekly') setNewWeeklyGoal('');
    else setNewMonthlyGoal('');
  };

  const removeGoal = (type, index) => {
    setFormData(prev => ({
      ...prev,
      [`${type}_goals`]: prev[`${type}_goals`].filter((_, i) => i !== index),
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const editButton = (section) => (
    <button
      onClick={() => editing === section ? handleSave(section) : setEditing(section)}
      disabled={updateMutation.isPending}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        editing === section
          ? 'bg-primary-500 text-white hover:bg-primary-600'
          : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {editing === section ? <><Save size={12} /> حفظ</> : <><Edit3 size={12} /> تعديل</>}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24" dir="rtl">
      {/* ── Header + Completeness ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 px-1"
      >
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
          {profile.name?.[0] || 'م'}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight">الملف الشخصي</h1>
          <p className="text-gray-400 text-xs mt-0.5">عرّف نفسك ليعمل المساعد الذكي بأفضل شكل</p>
        </div>
        <CompletenessRing percent={profile.profile_completeness || 0} />
      </motion.div>

      {/* ═══ Section 1: Identity ═══ */}
      <SectionCard title="الهوية" icon={User} description="معلوماتك الأساسية">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">المعلومات الشخصية</span>
          {editButton('identity')}
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">الاسم</label>
            {editing === 'identity' ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-primary-500 focus:outline-none transition-colors"
              />
            ) : (
              <p className="text-white text-sm font-medium">{profile.name}</p>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">البريد الإلكتروني</label>
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-gray-500" />
              <p className="text-gray-300 text-sm">{profile.email}</p>
            </div>
          </div>
          {profile.phone && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">الهاتف</label>
              <p className="text-gray-300 text-sm">{profile.phone}</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ═══ Section 2: Life Context ═══ */}
      <SectionCard title="السياق الحياتي" icon={Briefcase} description="يساعد الذكاء الاصطناعي على فهم احتياجاتك">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">الدور ومجالات التركيز</span>
          {editButton('context')}
        </div>

        {/* Role */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-2">دورك الحالي</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {ROLES.map(({ id, label, icon: RIcon }) => (
              <button
                key={id}
                disabled={editing !== 'context'}
                onClick={() => setFormData(p => ({ ...p, role: id }))}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  formData.role === id
                    ? 'bg-primary-500/15 border-primary-500/40 text-primary-400'
                    : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/5'
                } ${editing !== 'context' ? 'opacity-70' : ''}`}
              >
                <RIcon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus Areas */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-2">مجالات التركيز</label>
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map(({ id, label, icon: FIcon, color }) => {
              const selected = formData.focus_areas?.includes(id);
              return (
                <button
                  key={id}
                  disabled={editing !== 'context'}
                  onClick={() => toggleFocusArea(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                    selected
                      ? 'bg-gradient-to-r ' + color + ' text-white border-transparent shadow-lg'
                      : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/5'
                  } ${editing !== 'context' ? 'opacity-70' : ''}`}
                >
                  <FIcon size={14} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bio */}
        {editing === 'context' && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">نبذة (اختياري)</label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData(p => ({ ...p, bio: e.target.value }))}
              placeholder="أخبر المساعد عن نفسك..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-primary-500 focus:outline-none transition-colors resize-none"
            />
          </div>
        )}
        {!editing && formData.bio && (
          <p className="text-gray-300 text-xs bg-white/[0.03] rounded-lg p-2.5">{formData.bio}</p>
        )}
      </SectionCard>

      {/* ═══ Section 3: Energy Profile ═══ */}
      <SectionCard title="ملف الطاقة" icon={Zap} description="يحدد أفضل أوقات العمل والراحة لك">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">إعدادات الطاقة والوقت</span>
          {editButton('energy')}
        </div>

        {/* Preferred Work Time */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-2">وقت العمل المفضل</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {WORK_TIMES.map(({ id, label, icon, desc }) => (
              <button
                key={id}
                disabled={editing !== 'energy'}
                onClick={() => setFormData(p => ({ ...p, preferred_work_time: id }))}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs transition-all ${
                  formData.preferred_work_time === id
                    ? 'bg-primary-500/15 border-primary-500/40 text-primary-400'
                    : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/5'
                } ${editing !== 'energy' ? 'opacity-70' : ''}`}
              >
                <span className="text-lg">{icon}</span>
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Energy Level */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-2">مستوى الطاقة العام</label>
          <div className="flex items-center gap-2 bg-white/[0.03] rounded-xl p-3">
            <Battery size={16} className="text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex gap-1">
                {ENERGY_LEVELS.map(({ id, label, color }) => (
                  <button
                    key={id}
                    disabled={editing !== 'energy'}
                    onClick={() => setFormData(p => ({ ...p, energy_level: id }))}
                    className={`flex-1 h-8 rounded-lg text-[10px] font-medium transition-all ${
                      formData.energy_level === id
                        ? `${color} text-white shadow-lg`
                        : 'bg-white/5 text-gray-500 hover:bg-white/10'
                    } ${editing !== 'energy' ? 'opacity-70' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Time inputs */}
        {editing === 'energy' && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'wake_up_time', label: 'وقت الاستيقاظ', icon: Sun },
              { key: 'sleep_time', label: 'وقت النوم', icon: Moon },
              { key: 'work_start_time', label: 'بداية العمل', icon: Clock },
              { key: 'work_end_time', label: 'نهاية العمل', icon: Clock },
            ].map(({ key, label, icon: TIcon }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                  <TIcon size={12} /> {label}
                </label>
                <input
                  type="time"
                  value={formData[key] || ''}
                  onChange={(e) => setFormData(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">مدة التركيز العميق (دقيقة)</label>
              <input
                type="number" min="15" max="240" step="15"
                value={formData.deep_work_duration}
                onChange={(e) => setFormData(p => ({ ...p, deep_work_duration: +e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">تكرار الاستراحة (دقيقة)</label>
              <input
                type="number" min="15" max="180" step="15"
                value={formData.break_frequency}
                onChange={(e) => setFormData(p => ({ ...p, break_frequency: +e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>
        )}
        {!editing && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/[0.03] rounded-lg p-2.5 flex items-center gap-2">
              <Sun size={14} className="text-yellow-400" /> استيقاظ: {formData.wake_up_time}
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2.5 flex items-center gap-2">
              <Moon size={14} className="text-blue-400" /> نوم: {formData.sleep_time}
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2.5 flex items-center gap-2">
              <Brain size={14} className="text-purple-400" /> تركيز: {formData.deep_work_duration} دقيقة
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2.5 flex items-center gap-2">
              <Coffee size={14} className="text-orange-400" /> استراحة كل: {formData.break_frequency} دقيقة
            </div>
          </div>
        )}
      </SectionCard>

      {/* ═══ Section 4: Goals ═══ */}
      <SectionCard title="الأهداف" icon={Target} description="أهدافك الأسبوعية والشهرية">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">حدد أهدافك ليتابعها المساعد</span>
          {editButton('goals')}
        </div>

        {/* Weekly Goals */}
        <div className="mb-4">
          <h4 className="text-xs font-bold text-primary-400 mb-2 flex items-center gap-1">
            <Flame size={12} /> أهداف أسبوعية
          </h4>
          <div className="space-y-1.5">
            {(formData.weekly_goals || []).map((goal, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2">
                <CheckCircle size={14} className="text-primary-400 flex-shrink-0" />
                <span className="text-gray-300 text-xs flex-1">{goal}</span>
                {editing === 'goals' && (
                  <button onClick={() => removeGoal('weekly', i)} className="text-gray-500 hover:text-red-400">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {editing === 'goals' && (
              <div className="flex gap-2">
                <input
                  value={newWeeklyGoal}
                  onChange={(e) => setNewWeeklyGoal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addGoal('weekly')}
                  placeholder="أضف هدف أسبوعي..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:border-primary-500 focus:outline-none"
                />
                <button onClick={() => addGoal('weekly')} className="p-2 bg-primary-500/20 rounded-lg text-primary-400 hover:bg-primary-500/30">
                  <Plus size={14} />
                </button>
              </div>
            )}
            {!editing && formData.weekly_goals?.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-2">لم تضع أهداف أسبوعية بعد</p>
            )}
          </div>
        </div>

        {/* Monthly Goals */}
        <div>
          <h4 className="text-xs font-bold text-purple-400 mb-2 flex items-center gap-1">
            <Award size={12} /> أهداف شهرية
          </h4>
          <div className="space-y-1.5">
            {(formData.monthly_goals || []).map((goal, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2">
                <Award size={14} className="text-purple-400 flex-shrink-0" />
                <span className="text-gray-300 text-xs flex-1">{goal}</span>
                {editing === 'goals' && (
                  <button onClick={() => removeGoal('monthly', i)} className="text-gray-500 hover:text-red-400">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {editing === 'goals' && (
              <div className="flex gap-2">
                <input
                  value={newMonthlyGoal}
                  onChange={(e) => setNewMonthlyGoal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addGoal('monthly')}
                  placeholder="أضف هدف شهري..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:border-primary-500 focus:outline-none"
                />
                <button onClick={() => addGoal('monthly')} className="p-2 bg-purple-500/20 rounded-lg text-purple-400 hover:bg-purple-500/30">
                  <Plus size={14} />
                </button>
              </div>
            )}
            {!editing && formData.monthly_goals?.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-2">لم تضع أهداف شهرية بعد</p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ═══ Section 5: AI Snapshot ═══ */}
      <SectionCard title="نظرة الذكاء الاصطناعي" icon={Sparkles} description="رؤى المساعد الذكي عن أدائك">
        {snapshotLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Productivity Score */}
            {snapshot.productivity && (
              <div className="bg-white/[0.03] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-medium">الإنتاجية</span>
                  {snapshot.productivity.average_score !== null && (
                    <span className="text-lg font-black text-primary-400">{snapshot.productivity.average_score}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/[0.03] rounded-lg p-2">
                    <p className="text-white font-bold text-sm">{snapshot.productivity.completed || 0}</p>
                    <p className="text-gray-500 text-[10px]">مكتملة</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-2">
                    <p className="text-white font-bold text-sm">{snapshot.productivity.completion_rate || 0}%</p>
                    <p className="text-gray-500 text-[10px]">معدل الإنجاز</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-2">
                    <p className="text-red-400 font-bold text-sm">{snapshot.productivity.overdue || 0}</p>
                    <p className="text-gray-500 text-[10px]">متأخرة</p>
                  </div>
                </div>
              </div>
            )}

            {/* Focus Time */}
            {snapshot.focus && (
              <div className="bg-white/[0.03] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Brain size={14} className="text-purple-400" />
                  <span className="text-xs text-gray-400 font-medium">وقت التركيز الأمثل</span>
                </div>
                <p className="text-white text-sm font-medium">
                  {snapshot.focus.best_time || snapshot.focus.recommended_deep_work || 'يتم التحليل...'}
                </p>
              </div>
            )}

            {/* Habits */}
            {snapshot.habits?.top_streaks?.length > 0 && (
              <div className="bg-white/[0.03] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Flame size={14} className="text-orange-400" />
                  <span className="text-xs text-gray-400 font-medium">أفضل السلاسل</span>
                </div>
                <div className="space-y-1.5">
                  {snapshot.habits.top_streaks.map((h, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-gray-300 text-xs">{h.name}</span>
                      <span className="text-orange-400 text-xs font-bold">{h.streak} يوم 🔥</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Smart Insights */}
            {snapshot.insights?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs text-gray-400 font-medium flex items-center gap-1">
                  <Sparkles size={12} className="text-primary-400" /> رؤى ذكية
                </h4>
                {snapshot.insights.map((insight, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${
                      insight.type === 'warning' ? 'bg-red-500/5 border-red-500/20' :
                      insight.type === 'achievement' ? 'bg-green-500/5 border-green-500/20' :
                      insight.type === 'streak' ? 'bg-orange-500/5 border-orange-500/20' :
                      'bg-primary-500/5 border-primary-500/20'
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{insight.icon}</span>
                    <div>
                      <p className="text-white text-xs font-bold">{insight.title}</p>
                      <p className="text-gray-400 text-[11px] mt-0.5">{insight.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
