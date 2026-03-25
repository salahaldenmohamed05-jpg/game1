/**
 * Notifications View - Interactive & Action-Aware
 * ==================================================
 * - كل إشعار قابل للنقر ويوجّه للصفحة المناسبة
 * - تصفية: الكل / غير مقروءة / مقروءة
 * - دعم الإشعارات الذكية (smart reminders)
 * - تصميم متجاوب للموبايل بالكامل
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Check, CheckCheck, Trash2, ArrowLeft, Clock,
  Target, Heart, Brain, Calendar, Zap, AlertCircle, ChevronRight
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

// ─── Map notification type → icon, color, route ──────────────────────────────
const TYPE_META = {
  reminder:    { icon: '⏰', color: 'border-blue-500/40 bg-blue-500/8',     route: 'tasks',       label: 'تذكير' },
  achievement: { icon: '🏆', color: 'border-yellow-500/40 bg-yellow-500/8', route: 'performance', label: 'إنجاز' },
  insight:     { icon: '💡', color: 'border-purple-500/40 bg-purple-500/8', route: 'insights',    label: 'رؤية ذكية' },
  coach:       { icon: '🧠', color: 'border-green-500/40 bg-green-500/8',   route: 'assistant',   label: 'مدرّب' },
  habit:       { icon: '🎯', color: 'border-teal-500/40 bg-teal-500/8',     route: 'habits',      label: 'عادة' },
  task:        { icon: '✅', color: 'border-cyan-500/40 bg-cyan-500/8',     route: 'tasks',       label: 'مهمة' },
  mood:        { icon: '💙', color: 'border-pink-500/40 bg-pink-500/8',     route: 'mood',        label: 'مزاج' },
  system:      { icon: '⚙️', color: 'border-gray-500/30 bg-gray-500/5',    route: null,          label: 'نظام' },
  smart_task:  { icon: '🤖', color: 'border-blue-400/40 bg-blue-400/8',     route: 'tasks',       label: 'ذكاء اصطناعي' },
  smart_habit: { icon: '🔥', color: 'border-orange-400/40 bg-orange-400/8', route: 'habits',      label: 'عادة ذكية' },
  morning_check:{ icon: '🌅',color: 'border-orange-500/30 bg-orange-500/5', route: 'assistant',   label: 'صباح' },
  ai:          { icon: '🤖', color: 'border-violet-500/40 bg-violet-500/8', route: 'assistant',   label: 'ذكاء اصطناعي' },
};

function getTypeMeta(type) {
  return TYPE_META[type] || TYPE_META.system;
}

// ─── Resolve action route from notification data ──────────────────────────────
function resolveRoute(notif) {
  // explicit action_url takes precedence
  if (notif.action_url) return notif.action_url;
  // related_item_type mapping
  const typeMap = {
    task:  'tasks',
    habit: 'habits',
    mood:  'mood',
    insight: 'insights',
    assistant: 'assistant',
  };
  if (notif.related_item_type && typeMap[notif.related_item_type]) {
    return typeMap[notif.related_item_type];
  }
  return getTypeMeta(notif.type).route;
}

// ─── Single Notification Card ─────────────────────────────────────────────────
function NotifCard({ notif, onAction, onMarkRead, index }) {
  const meta = getTypeMeta(notif.type);
  const route = resolveRoute(notif);
  const isClickable = !!route;

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} د`;
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} س`;
    return d.toLocaleDateString('ar', { month: 'short', day: 'numeric' });
  };

  const handleClick = () => {
    if (!notif.is_read) onMarkRead(notif.id);
    if (isClickable) onAction(route);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={handleClick}
      className={`relative glass-card border transition-all duration-200 ${
        !notif.is_read ? meta.color : 'border-white/5 opacity-55'
      } ${isClickable ? 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]' : ''}`}
    >
      {/* Unread dot */}
      {!notif.is_read && (
        <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-primary-400 shadow-glow" />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="text-2xl flex-shrink-0 leading-none mt-0.5">{meta.icon}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                  {meta.label}
                </span>
              </div>
              <span className="text-xs text-gray-500 flex items-center gap-1 flex-shrink-0">
                <Clock size={9} />
                {formatTime(notif.created_at || notif.createdAt)}
              </span>
            </div>

            <p className={`font-semibold text-sm leading-snug mt-1 ${!notif.is_read ? 'text-white' : 'text-gray-400'}`}>
              {notif.title}
            </p>

            {notif.body && (
              <p className="text-gray-400 text-xs mt-1 leading-relaxed line-clamp-2">
                {notif.body}
              </p>
            )}

            {/* Dynamic message if present */}
            {notif.dynamic_message && notif.dynamic_message !== notif.body && (
              <p className="text-primary-400 text-xs mt-1.5 italic">{notif.dynamic_message}</p>
            )}

            {/* Action hint */}
            {isClickable && (
              <div className="flex items-center gap-1 mt-2 text-xs text-primary-400">
                <span>اضغط للانتقال</span>
                <ChevronRight size={11} />
              </div>
            )}
          </div>

          {/* Mark read button */}
          {!notif.is_read && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkRead(notif.id); }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-green-400 transition-colors flex-shrink-0 mt-0.5"
              title="تعليم كمقروء"
            >
              <Check size={13} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NotificationsView({ onViewChange }) {
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => api.get(`/notifications?limit=60${filter === 'unread' ? '&unread_only=true' : ''}`),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['header-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['header-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('تم تعليم كل الإشعارات كمقروءة ✓');
    },
  });

  const notifications = data?.data?.data?.notifications || [];
  const unreadCount = data?.data?.data?.unread || data?.data?.data?.unread_count || 0;

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : filter === 'read'
    ? notifications.filter(n => n.is_read)
    : notifications;

  const handleAction = (route) => {
    if (route && onViewChange) {
      onViewChange(route);
      toast.success(`الانتقال إلى ${route}…`, { duration: 1500 });
    }
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Bell size={22} className="text-primary-400" />
            الإشعارات
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} إشعار جديد — اضغط لاتخاذ الإجراء`
              : 'كل الإشعارات مقروءة ✓'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 glass-card px-4 py-2 rounded-xl transition-colors"
          >
            <CheckCheck size={15} />
            <span className="hidden sm:inline">تعليم الكل كمقروء</span>
          </button>
        )}
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { id: 'all',    label: `الكل (${notifications.length})` },
          { id: 'unread', label: `غير مقروءة (${unreadCount})` },
          { id: 'read',   label: 'مقروءة' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              filter === tab.id
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'text-gray-400 hover:text-white glass-card'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Hint Bar ── */}
      {filtered.some(n => resolveRoute(n)) && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary-500/10 border border-primary-500/20">
          <Zap size={14} className="text-primary-400 flex-shrink-0" />
          <p className="text-xs text-primary-300">اضغط على أي إشعار للانتقال مباشرة إلى الإجراء المطلوب</p>
        </div>
      )}

      {/* ── Notifications List ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass-card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/5" />
                <div className="flex-1">
                  <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Bell size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {filter === 'unread' ? 'كل الإشعارات مقروءة 🎉' : 'لا توجد إشعارات'}
          </p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {filtered.map((notif, i) => (
              <NotifCard
                key={notif.id}
                notif={notif}
                index={i}
                onAction={handleAction}
                onMarkRead={(id) => markReadMutation.mutate(id)}
              />
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
