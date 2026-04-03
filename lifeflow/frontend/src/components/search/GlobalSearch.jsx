/**
 * GlobalSearch — بحث سريع عن المهام والعادات
 * =============================================
 * Cmd+K / Ctrl+K to open, supports real-time search with debouncing
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, CheckSquare, Target, ArrowLeft, Clock, Tag } from 'lucide-react';
import { searchAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function GlobalSearch({ isOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose?.(); // toggle - parent handles open
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Search with debounce
  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await searchAPI.search(searchQuery.trim());
      setResults(res.data?.data?.results || []);
      setSelectedIndex(0);
    } catch (err) {
      console.error('[Search] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(val), 250);
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleResultClick(results[selectedIndex]);
    }
  };

  const handleResultClick = (result) => {
    onNavigate?.(result.view);
    onClose();
    toast.success(`تم الانتقال إلى ${result.type === 'task' ? 'المهام' : 'العادات'}`, { duration: 1500 });
  };

  const getStatusBadge = (result) => {
    if (result.type === 'task') {
      const colors = {
        completed: 'bg-green-500/20 text-green-400',
        pending: 'bg-yellow-500/20 text-yellow-400',
        overdue: 'bg-red-500/20 text-red-400',
      };
      const labels = {
        completed: 'مكتمل',
        pending: 'قيد الانتظار',
        overdue: 'متأخر',
      };
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${colors[result.status] || colors.pending}`}>
          {labels[result.status] || result.status}
        </span>
      );
    }
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${result.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
        {result.status === 'active' ? 'نشطة' : 'متوقفة'}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        {/* Search Modal */}
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative w-[90%] max-w-lg z-10"
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          <div className="rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(15, 15, 30, 0.98)',
              border: '1px solid rgba(108, 99, 255, 0.2)',
            }}>
            {/* Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-white/5">
              <Search size={20} className="text-primary-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="ابحث عن مهمة أو عادة..."
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none font-[Cairo]"
                autoComplete="off"
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 text-gray-500 text-[10px] border border-white/10">
                ESC
              </kbd>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                </div>
              )}

              {!loading && query && results.length === 0 && (
                <div className="text-center py-8">
                  <Search size={32} className="text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">لا توجد نتائج لـ &quot;{query}&quot;</p>
                </div>
              )}

              {!loading && results.length > 0 && (
                <div className="py-2">
                  <p className="text-[10px] text-gray-500 px-4 pb-1">{results.length} نتيجة</p>
                  {results.map((result, idx) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all text-right ${
                        idx === selectedIndex
                          ? 'bg-primary-500/10 border-r-2 border-primary-500'
                          : 'hover:bg-white/5 border-r-2 border-transparent'
                      }`}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: result.type === 'task' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)' }}>
                        {result.type === 'task' ? <CheckSquare size={16} className="text-blue-400" /> : <Target size={16} className="text-emerald-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white truncate">{result.title}</span>
                          {getStatusBadge(result)}
                        </div>
                        {result.description && (
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">{result.description}</p>
                        )}
                      </div>
                      <ArrowLeft size={14} className="text-gray-600 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {!loading && !query && (
                <div className="text-center py-8">
                  <Search size={28} className="text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">اكتب للبحث عن مهامك وعاداتك</p>
                  <p className="text-gray-600 text-[11px] mt-1">Ctrl+K للفتح السريع</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
