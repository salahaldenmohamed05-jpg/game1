/**
 * Notifications View
 * ====================
 * عرض وإدارة الإشعارات
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, Check, CheckCheck, Trash2, Settings, Filter } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const TYPE_ICONS = {
  reminder: '⏰',
  achievement: '🏆',
  insight: '💡',
  coach: '🧠',
  habit: '🎯',
  task: '✅',
  mood: '💙',
  system: '⚙️',
};

const TYPE_COLORS = {
  reminder: 'border-blue-500/30 bg-blue-500/5',
  achievement: 'border-yellow-500/30 bg-yellow-500/5',
  insight: 'border-purple-500/30 bg-purple-500/5',
  coach: 'border-green-500/30 bg-green-500/5',
  habit: 'border-teal-500/30 bg-teal-500/5',
  task: 'border-cyan-500/30 bg-cyan-500/5',
  mood: 'border-pink-500/30 bg-pink-500/5',
  system: 'border-gray-500/30 bg-gray-500/5',
};

export default function NotificationsView() {
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'read'
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => api.get(`/notifications?limit=50${filter === 'unread' ? '&unread_only=true' : ''}`),  // fixed: was unread=true
    queryFn: () => api.get(`/notifications?limit=50${filter === 'unread' ? '&unread=true' : ''}`),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('تم تعليم كل الإشعارات كمقروءة');
    },
  });

  const notifications = data?.data?.notifications || [];
  const unreadCount = data?.data?.unread || data?.data?.unread_count || 0;  // backend uses 'unread'
  const unreadCount = data?.data?.unread_count || 0;

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : filter === 'read'
    ? notifications.filter(n => n.is_read)
    : notifications;

  const formatTime = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} دقيقة`;
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} ساعة`;
    return d.toLocaleDateString('ar-SA');
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Bell size={22} />
            الإشعارات
          </h2>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-400">{unreadCount} إشعار غير مقروء</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 glass-card px-4 py-2"
          >
            <CheckCheck size={16} />
            تعليم الكل كمقروء
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'unread', label: `غير مقروءة (${unreadCount})` },
          { id: 'read', label: 'مقروءة' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === tab.id
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'text-gray-400 hover:text-white glass-card'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass-card p-4 animate-pulse">
              <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Bell size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">لا توجد إشعارات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notif, i) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`glass-card p-4 border transition-all ${
                !notif.is_read
                  ? (TYPE_COLORS[notif.type] || TYPE_COLORS.system)
                  : 'border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl flex-shrink-0 mt-0.5">
                  {TYPE_ICONS[notif.type] || '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`font-semibold text-sm ${!notif.is_read ? 'text-white' : 'text-gray-400'}`}>
                      {notif.title}
                    </p>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatTime(notif.created_at || notif.createdAt)}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs mt-1 leading-relaxed">{notif.body}</p>
                  {notif.action_url && (
                    <a href={notif.action_url} className="text-xs text-primary-400 mt-1.5 inline-block hover:underline">
                      {notif.action_text || 'عرض التفاصيل'} ←
                    </a>
                  )}
                </div>
                {!notif.is_read && (
                  <button
                    onClick={() => markReadMutation.mutate(notif.id)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-green-400 transition-colors flex-shrink-0"
                    title="تعليم كمقروء"
                  >
                    <Check size={14} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
