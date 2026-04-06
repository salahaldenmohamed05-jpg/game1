/**
 * InterventionBanner — Phase 15: Non-intrusive Proactive Intervention UI
 * ========================================================================
 * Renders a small, dismissable banner at the top of the dashboard.
 * NOT a modal. NOT blocking. Just a gentle, animated banner.
 *
 * Features:
 *   - Slides in from top with framer-motion
 *   - Auto-dismisses when expiresAt is reached
 *   - Dismiss button (X) + engage button (act on suggestion)
 *   - Color-coded by type: nudge (blue), warning (amber), boost (green), break (purple)
 *   - RTL-friendly (Arabic-first)
 *   - Max 3 banners visible (brainStore enforces this)
 */

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBrainStore } from '../../store/brainStore';
import {
  X,
  Lightbulb,
  AlertTriangle,
  Zap,
  Coffee,
  ChevronLeft,
} from 'lucide-react';

// ─── Type → style mapping ──────────────────────────────────────────────────
const TYPE_STYLES = {
  nudge: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-700',
    text: 'text-blue-800 dark:text-blue-200',
    subtext: 'text-blue-600 dark:text-blue-300',
    iconBg: 'bg-blue-100 dark:bg-blue-800',
    Icon: Lightbulb,
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-700',
    text: 'text-amber-800 dark:text-amber-200',
    subtext: 'text-amber-600 dark:text-amber-300',
    iconBg: 'bg-amber-100 dark:bg-amber-800',
    Icon: AlertTriangle,
  },
  boost: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-700',
    text: 'text-emerald-800 dark:text-emerald-200',
    subtext: 'text-emerald-600 dark:text-emerald-300',
    iconBg: 'bg-emerald-100 dark:bg-emerald-800',
    Icon: Zap,
  },
  break: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    border: 'border-purple-200 dark:border-purple-700',
    text: 'text-purple-800 dark:text-purple-200',
    subtext: 'text-purple-600 dark:text-purple-300',
    iconBg: 'bg-purple-100 dark:bg-purple-800',
    Icon: Coffee,
  },
};

const DEFAULT_STYLE = TYPE_STYLES.nudge;

/**
 * Single intervention banner item.
 */
function InterventionItem({ intervention, onDismiss, onEngage }) {
  const style = TYPE_STYLES[intervention.type] || DEFAULT_STYLE;
  const { Icon } = style;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`
        relative flex items-start gap-3 p-3 rounded-xl border shadow-sm
        ${style.bg} ${style.border}
        max-w-lg w-full mx-auto
      `}
      dir="rtl"
    >
      {/* Icon */}
      <div className={`flex-shrink-0 p-2 rounded-lg ${style.iconBg}`}>
        <Icon className={`w-4 h-4 ${style.text}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-relaxed ${style.text}`}>
          {intervention.message}
        </p>
        {intervention.submessage && (
          <p className={`text-xs mt-0.5 leading-relaxed ${style.subtext}`}>
            {intervention.submessage}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Engage button — only if there's a related task */}
        {intervention.taskId && (
          <button
            onClick={() => onEngage(intervention.id)}
            className={`p-1 rounded-md hover:bg-white/50 dark:hover:bg-white/10 transition-colors ${style.text}`}
            title="اذهب للمهمة"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Dismiss button */}
        <button
          onClick={() => onDismiss(intervention.id)}
          className={`p-1 rounded-md hover:bg-white/50 dark:hover:bg-white/10 transition-colors ${style.subtext}`}
          title="تجاهل"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/**
 * InterventionBanner — renders all active interventions as stacked banners.
 * Place this component at the top of the Dashboard layout.
 */
export default function InterventionBanner() {
  const interventions = useBrainStore((s) => s.interventions);
  const dismissIntervention = useBrainStore((s) => s.dismissIntervention);
  const engageIntervention = useBrainStore((s) => s.engageIntervention);
  const cleanExpiredInterventions = useBrainStore((s) => s.cleanExpiredInterventions);

  // Periodic cleanup of expired interventions
  useEffect(() => {
    const timer = setInterval(() => {
      cleanExpiredInterventions();
    }, 30000); // every 30s
    return () => clearInterval(timer);
  }, [cleanExpiredInterventions]);

  const handleDismiss = useCallback((id) => {
    dismissIntervention(id);
  }, [dismissIntervention]);

  const handleEngage = useCallback((id) => {
    engageIntervention(id);
  }, [engageIntervention]);

  // Don't render anything if no active interventions
  if (!interventions || interventions.length === 0) return null;

  // Filter out expired (defensive — brainStore should already clean them)
  const now = new Date().toISOString();
  const active = interventions.filter(i => i.expiresAt > now);

  if (active.length === 0) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none w-full px-4 max-w-lg">
      <AnimatePresence mode="popLayout">
        {active.map((intervention) => (
          <div key={intervention.id} className="pointer-events-auto">
            <InterventionItem
              intervention={intervention}
              onDismiss={handleDismiss}
              onEngage={handleEngage}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
