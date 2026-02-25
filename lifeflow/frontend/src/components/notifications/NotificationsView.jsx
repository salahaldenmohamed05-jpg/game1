/**
 * NotificationsView Component
 * ============================
 * عرض الإشعارات - مركز الإشعارات والتنبيهات
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, BellOff, Check, CheckCheck, Trash2,
  Clock, Flame, Brain, CheckCircle, Target,
  Settings, Filter, X
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

const getHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lifeflow_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const NOTIFICATION_ICONS = {
  habit_reminder:  { icon: <Flame size={16} />, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  task_reminder:   { icon: <CheckCircle size={16} />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  mood_check:      { icon: <Brain size={16} />, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  weekly_report:   { icon: <Target size={16} />, color: 'text-green-400', bg: 'bg-green-500/10' },
  daily_summary:   { icon: <Bell size={16} />, color: 'text-primary-400', bg: 'bg-primary-500/10' },
  smart_tip:       { icon: <Brain size={16} />, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  goal_deadline:   { icon: <Target size={16} />, color: 'text-red-400', bg: 'bg-red-500/10' },
};

const TYPE_LABELS = {
  habit_reminder: 'تذكير عادة',
  task_reminder:  'تذكير مهمة',
  mood_check:     'تسجيل المزاج',
  weekly_report:  'تقرير أسبوعي',
  daily_summary:  'ملخص يومي',
  smart_tip:      'نصيحة ذكية',
  goal_deadline:  'موعد هدف',
};

export default function NotificationsView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | type
  const [showSettings, setShowSettings] = useState(false);

  // Fetch notifications
  const { data: notifData, isLoading } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: async () => {
      const params = filter === 'unread' ? { read: false, limit: 50 } : { limit: 50 };
      const { data } = await axios.get(`${API}/notifications`, {
        headers: getHeaders(),
        params,
      });
      return data;
    },
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  const notifications = notifData?.data?.notifications || [];
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Mark as read
  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      const { data } = await axios.patch(`${API}/notifications/${id}/read`, {}, { headers: getHeaders() });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(['notifications']),
  });

  // Mark all read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.patch(`${API}/notifications/read-all`, {}, { headers: getHeaders() });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      queryClient.invalidateQueries(['dashboard']);
      toast.success('تم تعيين جميع الإشعارات كمقروءة');
    },
  });

  // Delete notification
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await axios.delete(`${API}/notifications/${id}`, { headers: getHeaders() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      toast.success('تم حذف الإشعار');
    },
  });

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  // Group by date
  const groupedNotifications = filteredNotifications.reduce((groups, notif) => {
    const date = new Date(notif.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label;
    if (date.toDateString() === today.toDateString()) {
      label = 'اليوم';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'أمس';
    } else {
      label = date.toLocaleDateString('ar', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(notif);
    return groups;
  }, {});

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Bell className="text-primary-400" size={24} />
            الإشعارات
            {unreadCount > 0 && (
              <span className="bg-primary-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-400 mt-1">مركز التنبيهات والتذكيرات الذكية</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isLoading}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <CheckCheck size={16} />
              قراءة الكل
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-white/10 rounded-xl transition-all text-gray-400 hover:text-white"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'الكل' },
          { key: 'unread', label: `غير مقروءة (${unreadCount})` },
          { key: 'habit_reminder', label: 'العادات' },
          { key: 'task_reminder', label: 'المهام' },
          { key: 'mood_check', label: 'المزاج' },
          { key: 'smart_tip', label: 'نصائح' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              filter === key
                ? 'bg-primary-500 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-12 text-center"
        >
          <BellOff size={48} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">لا توجد إشعارات</h3>
          <p className="text-sm text-gray-600">ستظهر هنا جميع التنبيهات والتذكيرات</p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedNotifications).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
                {dateLabel}
              </h3>
              <div className="space-y-2">
                <AnimatePresence>
                  {items.map((notif, idx) => (
                    <NotificationCard
                      key={notif.id}
                      notif={notif}
                      index={idx}
                      onRead={() => markReadMutation.mutate(notif.id)}
                      onDelete={() => deleteMutation.mutate(notif.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <NotificationSettings onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// Notification Card
function NotificationCard({ notif, index, onRead, onDelete }) {
  const typeInfo = NOTIFICATION_ICONS[notif.type] || NOTIFICATION_ICONS.daily_summary;

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.04 }}
      className={`glass-card p-4 flex items-start gap-4 group cursor-pointer hover:bg-white/5 transition-all ${
        !notif.is_read ? 'border-l-2 border-primary-500' : ''
      }`}
      onClick={() => !notif.is_read && onRead()}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeInfo.bg} ${typeInfo.color}`}>
        {typeInfo.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-gray-500 mb-0.5 block">
              {TYPE_LABELS[notif.type] || notif.type}
            </span>
            <p className={`text-sm leading-relaxed ${notif.is_read ? 'text-gray-400' : 'text-white font-medium'}`}>
              {notif.message || notif.body}
            </p>
          </div>
          {/* Unread dot */}
          {!notif.is_read && (
            <div className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" />
          )}
        </div>

        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <Clock size={10} />
            {formatTime(notif.created_at)}
          </span>
          {notif.scheduled_for && (
            <span className="text-xs text-gray-600">
              مجدول: {new Date(notif.scheduled_for).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!notif.is_read && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(); }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-gray-500 hover:text-green-400"
            title="تعيين كمقروء"
          >
            <Check size={14} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-gray-500 hover:text-red-400"
          title="حذف"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// Notification Settings Modal
function NotificationSettings({ onClose }) {
  const [settings, setSettings] = useState({
    habit_reminders: true,
    task_reminders: true,
    mood_check: true,
    weekly_report: true,
    daily_summary: true,
    smart_tips: true,
    quiet_hours_start: '23:00',
    quiet_hours_end: '07:00',
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-card p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings size={18} className="text-primary-400" />
            إعدادات الإشعارات
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-gray-500 mb-2">أنواع الإشعارات</p>

          {[
            { key: 'habit_reminders', label: 'تذكيرات العادات', icon: '🏃', desc: 'تذكيرك بموعد عاداتك اليومية' },
            { key: 'task_reminders', label: 'تذكيرات المهام', icon: '📋', desc: 'تنبيهات مهام الموعد النهائي' },
            { key: 'mood_check', label: 'تسجيل المزاج', icon: '🌙', desc: 'سؤال يومي عن حالتك المزاجية' },
            { key: 'weekly_report', label: 'التقرير الأسبوعي', icon: '📊', desc: 'ملخص أسبوعي كل يوم الجمعة' },
            { key: 'daily_summary', label: 'الملخص اليومي', icon: '📝', desc: 'ملخص نهاية يوم شامل' },
            { key: 'smart_tips', label: 'النصائح الذكية', icon: '💡', desc: 'توصيات شخصية من الذكاء الاصطناعي' },
          ].map(({ key, label, icon, desc }) => (
            <label key={key} className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/8 transition-all">
              <div className="flex items-center gap-3">
                <span className="text-lg">{icon}</span>
                <div>
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              </div>
              <div
                onClick={() => setSettings({ ...settings, [key]: !settings[key] })}
                className={`w-11 h-6 rounded-full transition-all cursor-pointer relative ${
                  settings[key] ? 'bg-primary-500' : 'bg-gray-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  settings[key] ? 'right-1' : 'left-1'
                }`} />
              </div>
            </label>
          ))}

          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-gray-500 mb-3">ساعات الهدوء (لن تصلك إشعارات)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">من</label>
                <input
                  type="time"
                  value={settings.quiet_hours_start}
                  onChange={e => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">إلى</label>
                <input
                  type="time"
                  value={settings.quiet_hours_end}
                  onChange={e => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                  className="input-field w-full"
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => { toast.success('تم حفظ الإعدادات'); onClose(); }}
            className="btn-primary w-full mt-2"
          >
            حفظ الإعدادات
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
