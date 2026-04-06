/**
 * MobileLayout - Unified Layout Wrapper
 * =======================================
 *
 * LAYOUT ROLE:
 *   For most views: this is the ONLY scroll container for page content.
 *   For AssistantView: this becomes a flex container (fullHeight mode)
 *   so the chat can manage its own 3-layer scroll.
 *
 *   Parent chain:
 *     Dashboard root (flex h-screen overflow-hidden)
 *       → Main area (flex-1 flex flex-col min-h-0)
 *         → THIS component (flex-1, either overflow-y-auto OR flex container)
 *           → motion.div (padding wrapper)
 *             → child view
 *
 * UX DECISION:
 *   Chat needs its input always visible + its own message scroll.
 *   Other views scroll their full content here with bottom padding
 *   for the fixed MobileBottomNav (80px + 32px breathing).
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';

// Global keyboard fix: when virtual keyboard opens on mobile,
// scroll the focused input into view instead of pushing the navbar.
function useKeyboardSafeFocus() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleFocusIn = (e) => {
      const target = e.target;
      if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      
      // After a short delay (for keyboard to open), scroll element into view
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    };

    // Use visualViewport resize to detect keyboard open/close
    const handleViewportResize = () => {
      // When keyboard opens, viewport height shrinks but we DON'T hide navbar
      // Just ensure the focused element is visible
      const active = document.activeElement;
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    document.addEventListener('focusin', handleFocusIn, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
    };
  }, []);
}

export default function MobileLayout({
  children,
  className = '',
  noPadding = false,
  fullHeight = false,  // NEW: when true, child manages its own scroll (for chat)
  maxWidth = '',
}) {
  // Apply global keyboard-safe focus behavior
  useKeyboardSafeFocus();
  // fullHeight mode: flex container, no scroll, child fills height
  // Phase H: add bottom padding for mobile navbar even in fullHeight mode
  if (fullHeight) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="flex-1 min-h-0 flex flex-col"
          dir="rtl"
        >
          {children}
        </motion.div>
      </div>
    );
  }

  // Default mode: single scroll container for all content
  // Phase H: increased bottom padding to prevent navbar overlap on all devices
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
          // Bottom padding: 96px mobile (72px nav + 24px breathing), less on desktop
          'pb-24 md:pb-6',
          // Horizontal padding unless opted out
          !noPadding && 'px-3 sm:px-4 md:px-6',
          // Top padding
          'pt-3 sm:pt-4',
          // Optional max-width
          maxWidth,
          // Custom classes
          className,
        ].filter(Boolean).join(' ')}
        style={{ paddingBottom: 'max(6rem, calc(80px + env(safe-area-inset-bottom, 0px)))' }}
        dir="rtl"
      >
        {children}
      </motion.div>
    </div>
  );
}
