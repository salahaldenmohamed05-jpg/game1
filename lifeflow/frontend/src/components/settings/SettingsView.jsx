/**
 * SettingsView — Control Center
 * ================================
 * NOT cosmetic toggles. These settings ACTIVELY control:
 *  - AI intervention behavior
 *  - Notification delivery
 *  - Smart scheduling
 *  - Privacy and data
 *
 * Sections:
 * 1. App Preferences (language, theme, time format)
 * 2. Notifications (enable/disable, timing, types)
 * 3. AI Behavior (intervention level, recommendation style, auto-reschedule)
 * 4. Privacy (data usage, delete account)
 * 5. Account (password, logout)
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Globe, Palette, Clock, Bell, BellOff, Volume2, VolumeX,
  Brain, Sparkles, Zap, Shield, Trash2, Download, LogOut, Key,
  ChevronDown, ChevronUp, Moon, Sun, CheckCircle, AlertTriangle,
  ToggleLeft, ToggleRight, RefreshCw, Eye, EyeOff,
} from 'lucide-react';
import { settingsAPI } from '../../utils/api';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import toast from 'react-hot-toast';

// ── Section Card ────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children, description, iconColor = 'text-primary-400', bgColor = 'bg-primary-500/15' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl overflow-hidden border border-white/[0.06]"
    >
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0`}>
          <Icon size={18} className={iconColor} />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">{title}</h3>
          {description && <p className="text-gray-500 text-xs mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </motion.div>
  );
}

// ── Toggle Switch (RTL-aware) ────────────────────────────────────────────
function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
        value ? 'bg-primary-500' : 'bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      role="switch"
      aria-checked={value}
    >
      <motion.div
        animate={{ x: value ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md"
      />
    </button>
  );
}

// ── Setting Row ─────────────────────────────────────────────────────────
function SettingRow({ icon: Icon, label, description, children }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {Icon && <Icon size={16} className="text-gray-400 flex-shrink-0" />}
        <div className="min-w-0">
          <p className="text-gray-200 text-sm font-medium">{label}</p>
          {description && <p className="text-gray-500 text-[11px] mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="flex-shrink-0 mr-3">{children}</div>
    </div>
  );
}

// ── Option Selector ─────────────────────────────────────────────────────
function OptionSelect({ options, value, onChange }) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            value === opt.id
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SettingsView() {
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const queryClient = useQueryClient();

  // ── Fetch settings ────────────────────────────────────────────────────
  const { data: settingsResp, isLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: settingsAPI.getSettings,
    staleTime: 30_000,
  });

  const serverSettings = settingsResp?.data?.data || {};
  const [settings, setSettings] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSaveTs, setLastSaveTs] = useState(0);

  // Seed local state from server data on first load or after external changes
  useEffect(() => {
    if (!serverSettings || Object.keys(serverSettings).length === 0) return;
    // Skip if we just saved (prevent overwriting local optimistic state)
    if (Date.now() - lastSaveTs < 3000) return;
    setSettings(prev => {
      if (Object.keys(prev).length === 0) return { ...serverSettings };
      // Only update if server has newer data than our last save
      if (!hasChanges) return { ...serverSettings };
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsResp?.data?.data?.updatedAt]);

  // ── Mutation ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (data) => settingsAPI.updateSettings(data),
    onSuccess: (resp) => {
      setLastSaveTs(Date.now());
      // Merge server response into local state to keep in sync
      const saved = resp?.data?.data;
      if (saved) setSettings(prev => ({ ...prev, ...saved }));
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('تم حفظ الإعدادات');
      setHasChanges(false);
    },
    onError: () => toast.error('فشل في حفظ الإعدادات'),
  });

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    // Auto-save with debounce — accumulate rapid changes into single PUT
    if (!window._pendingSettingsUpdates) window._pendingSettingsUpdates = {};
    window._pendingSettingsUpdates[key] = value;
    clearTimeout(window._settingsTimeout);
    window._settingsTimeout = setTimeout(() => {
      const batch = { ...window._pendingSettingsUpdates };
      window._pendingSettingsUpdates = {};
      saveMutation.mutate(batch);
    }, 800);
  };

  // ── Password change ───────────────────────────────────────────────────
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: (data) => settingsAPI.changePassword(data),
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور');
      setPasswordData({ current_password: '', new_password: '', confirm: '' });
      setShowPasswordForm(false);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'فشل في تغيير كلمة المرور'),
  });

  const handlePasswordChange = () => {
    if (!passwordData.current_password || !passwordData.new_password) {
      return toast.error('يرجى ملء جميع الحقول');
    }
    if (passwordData.new_password !== passwordData.confirm) {
      return toast.error('كلمات المرور غير متطابقة');
    }
    if (passwordData.new_password.length < 6) {
      return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    }
    passwordMutation.mutate({
      current_password: passwordData.current_password,
      new_password: passwordData.new_password,
    });
  };

  // ── Account deletion ──────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => settingsAPI.deleteAccount(),
    onSuccess: (resp) => {
      toast.success(resp?.data?.message || 'تم تسجيل طلب الحذف');
      setShowDeleteConfirm(false);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => settingsAPI.exportData(),
    onSuccess: (resp) => toast.success(resp?.data?.message || 'تم تسجيل طلب التصدير'),
  });

  const handleLogout = async () => {
    await logout();
    toast.success('تم تسجيل الخروج');
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-1"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center flex-shrink-0">
          <Settings size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-white font-black text-lg">الإعدادات</h1>
          <p className="text-gray-400 text-xs">تحكم في سلوك النظام والذكاء الاصطناعي</p>
        </div>
      </motion.div>

      {/* ═══ Section 1: App Preferences ═══ */}
      <SectionCard title="تفضيلات التطبيق" icon={Palette} description="المظهر واللغة والوقت" iconColor="text-blue-400" bgColor="bg-blue-500/15">
        <SettingRow icon={Globe} label="اللغة" description="لغة الواجهة">
          <OptionSelect
            options={[{ id: 'ar', label: 'العربية' }, { id: 'en', label: 'English' }]}
            value={settings.language || 'ar'}
            onChange={(v) => updateSetting('language', v)}
          />
        </SettingRow>

        <SettingRow icon={isDark ? Moon : Sun} label="المظهر" description="الثيم الداكن أو الفاتح">
          <OptionSelect
            options={[{ id: 'dark', label: 'داكن' }, { id: 'light', label: 'فاتح' }, { id: 'auto', label: 'تلقائي' }]}
            value={settings.theme || 'dark'}
            onChange={(v) => {
              updateSetting('theme', v);
              if ((v === 'dark' && !isDark) || (v === 'light' && isDark)) toggleTheme();
            }}
          />
        </SettingRow>

        <SettingRow icon={Clock} label="صيغة الوقت">
          <OptionSelect
            options={[{ id: '24h', label: '24 ساعة' }, { id: '12h', label: '12 ساعة' }]}
            value={settings.time_format || '24h'}
            onChange={(v) => updateSetting('time_format', v)}
          />
        </SettingRow>

        <SettingRow icon={Clock} label="بداية الأسبوع">
          <OptionSelect
            options={[{ id: 'saturday', label: 'السبت' }, { id: 'sunday', label: 'الأحد' }, { id: 'monday', label: 'الاثنين' }]}
            value={settings.start_of_week || 'saturday'}
            onChange={(v) => updateSetting('start_of_week', v)}
          />
        </SettingRow>
      </SectionCard>

      {/* ═══ Section 2: Notifications ═══ */}
      <SectionCard title="الإشعارات" icon={Bell} description="تحكم في ما تتلقاه ومتى" iconColor="text-yellow-400" bgColor="bg-yellow-500/15">
        <SettingRow icon={settings.notifications_enabled ? Bell : BellOff} label="تفعيل الإشعارات" description="إيقاف كل الإشعارات">
          <Toggle
            value={settings.notifications_enabled ?? true}
            onChange={(v) => updateSetting('notifications_enabled', v)}
          />
        </SettingRow>

        <SettingRow icon={settings.notification_sound ? Volume2 : VolumeX} label="صوت الإشعارات">
          <Toggle
            value={settings.notification_sound ?? true}
            onChange={(v) => updateSetting('notification_sound', v)}
            disabled={!settings.notifications_enabled}
          />
        </SettingRow>

        <div className={`transition-opacity ${settings.notifications_enabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="bg-white/[0.02] rounded-xl p-3 mt-2 space-y-0">
            <p className="text-xs text-gray-400 font-bold mb-2">أنواع الإشعارات</p>
            {[
              { key: 'notify_tasks',          label: 'تذكير المهام',          icon: '✅' },
              { key: 'notify_habits',         label: 'تذكير العادات',        icon: '🎯' },
              { key: 'notify_mood',           label: 'تسجيل المزاج',        icon: '💙' },
              { key: 'notify_ai_suggestions', label: 'اقتراحات الذكاء',     icon: '🤖' },
              { key: 'notify_weekly_report',  label: 'التقرير الأسبوعي',    icon: '📊' },
            ].map(({ key, label, icon }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                <span className="text-gray-300 text-xs flex items-center gap-2">
                  <span>{icon}</span> {label}
                </span>
                <Toggle
                  value={settings[key] ?? true}
                  onChange={(v) => updateSetting(key, v)}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">وقت الهدوء — من</label>
              <input
                type="time"
                value={settings.quiet_hours_start || '23:00'}
                onChange={(e) => updateSetting('quiet_hours_start', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">إلى</label>
              <input
                type="time"
                value={settings.quiet_hours_end || '07:00'}
                onChange={(e) => updateSetting('quiet_hours_end', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ═══ Section 3: AI Behavior (CRITICAL) ═══ */}
      <SectionCard title="سلوك الذكاء الاصطناعي" icon={Brain} description="يتحكم في كيفية تفاعل المساعد معك" iconColor="text-purple-400" bgColor="bg-purple-500/15">
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 mb-3">
          <p className="text-purple-300 text-xs font-bold flex items-center gap-1">
            <Sparkles size={12} /> هذا القسم يؤثر مباشرة على سلوك الذكاء الاصطناعي
          </p>
          <p className="text-gray-400 text-[11px] mt-1">تغيير هذه الإعدادات سيغير طريقة عمل المساعد والاقتراحات والجدولة</p>
        </div>

        {/* Intervention Level */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-2 font-medium">مستوى التدخل</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'low',    label: 'منخفض',  desc: 'فقط عند الطلب', icon: '🤫', color: 'border-green-500/30 bg-green-500/5' },
              { id: 'medium', label: 'متوسط',  desc: 'اقتراحات ذكية', icon: '💡', color: 'border-yellow-500/30 bg-yellow-500/5' },
              { id: 'high',   label: 'عالي',    desc: 'استباقي نشط',  icon: '🚀', color: 'border-purple-500/30 bg-purple-500/5' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => updateSetting('ai_intervention_level', opt.id)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  settings.ai_intervention_level === opt.id
                    ? `${opt.color} ring-1 ring-primary-500/50`
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/5'
                }`}
              >
                <span className="text-lg block">{opt.icon}</span>
                <span className="text-white text-xs font-bold block mt-1">{opt.label}</span>
                <span className="text-gray-500 text-[10px] block">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recommendation Style */}
        <SettingRow icon={Sparkles} label="أسلوب التوصيات" description="كيف يقدم لك المساعد الاقتراحات">
          <OptionSelect
            options={[
              { id: 'minimal',   label: 'مختصر' },
              { id: 'balanced',  label: 'متوازن' },
              { id: 'proactive', label: 'مفصّل' },
            ]}
            value={settings.recommendation_style || 'balanced'}
            onChange={(v) => updateSetting('recommendation_style', v)}
          />
        </SettingRow>

        {/* AI Coaching Tone */}
        <div className="mt-3">
          <label className="text-xs text-gray-400 block mb-2 font-medium">شخصية المساعد</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'friendly',   label: 'ودود 😊',    desc: 'محفز ولطيف' },
              { id: 'strict',     label: 'صارم 🎯',    desc: 'مباشر وحازم' },
              { id: 'soft',       label: 'هادئ 🌸',    desc: 'لطيف ومتعاطف' },
              { id: 'analytical', label: 'تحليلي 📊',  desc: 'أرقام وحقائق' },
              { id: 'coach',      label: 'مدرب 💪',    desc: 'محفز وداعم' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => updateSetting('ai_coaching_tone', opt.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  settings.ai_coaching_tone === opt.id
                    ? 'bg-primary-500/15 border-primary-500/40 text-primary-400'
                    : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-reschedule */}
        <div className="mt-3">
          <SettingRow icon={RefreshCw} label="إعادة الجدولة التلقائية" description="المساعد يعيد جدولة المهام المتأخرة تلقائياً">
            <Toggle
              value={settings.auto_reschedule ?? false}
              onChange={(v) => updateSetting('auto_reschedule', v)}
            />
          </SettingRow>
        </div>

        {/* Smart Reminders */}
        <SettingRow icon={Zap} label="التذكيرات الذكية" description="تذكيرات مبنية على نمط حياتك">
          <Toggle
            value={settings.smart_reminders ?? true}
            onChange={(v) => updateSetting('smart_reminders', v)}
          />
        </SettingRow>
      </SectionCard>

      {/* ═══ Section 4: Privacy ═══ */}
      <SectionCard title="الخصوصية" icon={Shield} description="تحكم في بياناتك" iconColor="text-green-400" bgColor="bg-green-500/15">
        <SettingRow icon={Eye} label="جمع البيانات" description="السماح للذكاء الاصطناعي بالتعلم من أنماطك">
          <Toggle
            value={settings.data_collection ?? true}
            onChange={(v) => updateSetting('data_collection', v)}
          />
        </SettingRow>

        <SettingRow icon={Globe} label="مشاركة إحصائيات مجهولة" description="تحسين النظام للجميع">
          <Toggle
            value={settings.share_anonymous_stats ?? false}
            onChange={(v) => updateSetting('share_anonymous_stats', v)}
          />
        </SettingRow>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-gray-300 text-xs font-medium transition-all"
          >
            <Download size={14} />
            {exportMutation.isPending ? 'جاري...' : 'تصدير بياناتي'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium transition-all"
          >
            <Trash2 size={14} /> حذف الحساب
          </button>
        </div>

        {/* Delete Confirm Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4"
            >
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400 text-xs font-bold">تأكيد حذف الحساب</p>
                  <p className="text-gray-400 text-[11px] mt-1">سيتم حذف جميع بياناتك خلال 30 يوماً. لا يمكن التراجع عن هذا الإجراء.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-all"
                >
                  {deleteMutation.isPending ? 'جاري...' : 'تأكيد الحذف'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 bg-white/5 text-gray-300 text-xs rounded-lg hover:bg-white/10 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SectionCard>

      {/* ═══ Section 5: Account ═══ */}
      <SectionCard title="الحساب" icon={Key} description="كلمة المرور وتسجيل الخروج" iconColor="text-orange-400" bgColor="bg-orange-500/15">
        {/* Password Change */}
        <button
          onClick={() => setShowPasswordForm(!showPasswordForm)}
          className="w-full flex items-center justify-between py-3 border-b border-white/[0.04]"
        >
          <div className="flex items-center gap-3">
            <Key size={16} className="text-gray-400" />
            <span className="text-gray-200 text-sm font-medium">تغيير كلمة المرور</span>
          </div>
          {showPasswordForm ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        <AnimatePresence>
          {showPasswordForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 py-3">
                {[
                  { key: 'current_password', label: 'كلمة المرور الحالية', placeholder: 'أدخل كلمة المرور الحالية' },
                  { key: 'new_password', label: 'كلمة المرور الجديدة', placeholder: 'أدخل كلمة المرور الجديدة' },
                  { key: 'confirm', label: 'تأكيد كلمة المرور', placeholder: 'أعد إدخال كلمة المرور الجديدة' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-400 block mb-1">{label}</label>
                    <div className="relative">
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={passwordData[key]}
                        onChange={(e) => setPasswordData(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-primary-500 focus:outline-none pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      >
                        {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={handlePasswordChange}
                  disabled={passwordMutation.isPending}
                  className="w-full py-2.5 bg-primary-500 text-white text-sm font-bold rounded-xl hover:bg-primary-600 transition-all disabled:opacity-50"
                >
                  {passwordMutation.isPending ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-3 mt-2 rounded-xl text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut size={16} />
          <span className="text-sm font-medium">تسجيل الخروج</span>
        </button>
      </SectionCard>

      {/* Saving indicator */}
      <AnimatePresence>
        {saveMutation.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-primary-500/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2"
          >
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            جاري الحفظ...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
