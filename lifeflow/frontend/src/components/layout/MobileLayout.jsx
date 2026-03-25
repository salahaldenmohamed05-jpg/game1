/**
 * MobileLayout - Unified Layout Wrapper
 * =======================================
 *
 * LAYOUT ROLE:
 *   This is the ONLY scroll container for page content.
 *   Child views (TasksView, AssistantView, etc.) must NOT create their own
 *   scroll containers or use flex-1/min-h-0 for height management.
 *   
 *   Parent chain:
 *     Dashboard root (flex h-screen overflow-hidden)
 *       → Main area (flex-1 flex flex-col min-h-0)
 *         → THIS component (flex-1 overflow-y-auto) ← scroll happens here
 *           → motion.div (padding wrapper)
 *             → child view
 *
 * Bottom padding accounts for the fixed MobileBottomNav (80px + 32px breathing).
 * On desktop (sm+), bottom nav is hidden so less padding is needed.
 */

import { motion } from 'framer-motion';

export default function MobileLayout({ children, className = '', noPadding = false, maxWidth = '' }) {
  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={[
          // Bottom padding: 112px mobile (80px nav + 32px), less on desktop
          'pb-32 sm:pb-6',
          // Horizontal padding unless opted out
          !noPadding && 'px-3 sm:px-4 md:px-6',
          // Top padding
          'pt-3 sm:pt-4',
          // Optional max-width
          maxWidth,
          // Custom classes
          className,
        ].filter(Boolean).join(' ')}
        dir="rtl"
      >
        {children}
      </motion.div>
    </div>
  );
}
