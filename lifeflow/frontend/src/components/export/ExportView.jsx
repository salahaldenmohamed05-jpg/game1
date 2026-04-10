/**
 * ExportView — تصدير البيانات كـ PDF أو CSV
 * ============================================
 * Allows users to export their tasks, habits, and mood data
 * Supports CSV download and printable HTML (for PDF via browser print)
 */

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { FileDown, FileSpreadsheet, FileText, Calendar, CheckCircle, Target, Heart, Loader2, Printer } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { exportAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const PERIODS = [
  { id: 'week', label: 'آخر أسبوع', icon: Calendar },
  { id: 'month', label: 'آخر شهر', icon: Calendar },
  { id: 'quarter', label: 'آخر 3 أشهر', icon: Calendar },
];

const TYPES = [
  { id: 'all', label: 'الكل', icon: FileText },
  { id: 'tasks', label: 'المهام', icon: CheckCircle },
  { id: 'habits', label: 'العادات', icon: Target },
  { id: 'mood', label: 'المزاج', icon: Heart },
];

export default function ExportView() {
  const [period, setPeriod] = useState('month');
  const [type, setType] = useState('all');
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef(null);

  // Fetch summary for preview
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['export-summary', period],
    queryFn: () => exportAPI.exportSummary(period),
    enabled: showReport,
    retry: 1,
  });

  const summary = summaryData?.data?.data || null;

  // CSV download
  const csvMutation = useMutation({
    mutationFn: () => exportAPI.exportCSV(type, period),
    onSuccess: (response) => {
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifeflow-report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تحميل ملف CSV بنجاح');
    },
    onError: () => toast.error('خطأ في تصدير البيانات'),
  });

  // JSON download
  const jsonMutation = useMutation({
    mutationFn: () => exportAPI.exportJSON(type, period),
    onSuccess: (response) => {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifeflow-report-${period}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تحميل ملف JSON بنجاح');
    },
    onError: () => toast.error('خطأ في تصدير البيانات'),
  });

  // Print as PDF
  const handlePrintPDF = () => {
    if (!summary) {
      toast.error('قم بمعاينة التقرير أولاً');
      return;
    }
    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>تقرير LifeFlow</title>
        <style>
          body { font-family: 'Cairo', 'Segoe UI', sans-serif; direction: rtl; padding: 40px; color: #1a1a2e; background: #fff; }
          h1 { color: #6C63FF; margin-bottom: 8px; font-size: 28px; }
          h2 { color: #333; font-size: 20px; margin-top: 30px; border-bottom: 2px solid #6C63FF; padding-bottom: 8px; }
          .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
          .stat-card { background: #f8f9fa; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #e9ecef; }
          .stat-value { font-size: 28px; font-weight: 700; color: #6C63FF; }
          .stat-label { font-size: 12px; color: #666; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th { background: #6C63FF; color: white; padding: 10px; text-align: right; font-size: 13px; }
          td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
          tr:nth-child(even) { background: #f8f9fa; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
          .badge-high { background: #fee2e2; color: #dc2626; }
          .badge-medium { background: #fef3c7; color: #d97706; }
          .badge-low { background: #d1fae5; color: #059669; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>📊 تقرير LifeFlow</h1>
        <p class="meta">الفترة: ${period === 'week' ? 'آخر أسبوع' : period === 'month' ? 'آخر شهر' : 'آخر 3 أشهر'} | التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${summary.stats?.total_tasks || 0}</div>
            <div class="stat-label">إجمالي المهام</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${summary.stats?.completed_tasks || 0}</div>
            <div class="stat-label">مهام مكتملة</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${summary.stats?.completion_rate || 0}%</div>
            <div class="stat-label">نسبة الإنجاز</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${summary.stats?.active_habits || 0}</div>
            <div class="stat-label">عادات نشطة</div>
          </div>
        </div>

        ${summary.top_habits?.length > 0 ? `
        <h2>🏆 أفضل العادات</h2>
        <table>
          <thead><tr><th>العادة</th><th>السلسلة</th><th>التصنيف</th></tr></thead>
          <tbody>
            ${summary.top_habits.map(h => `<tr><td>${h.name}</td><td>${h.streak} يوم</td><td>${h.category || '-'}</td></tr>`).join('')}
          </tbody>
        </table>` : ''}

        ${summary.recent_completed?.length > 0 ? `
        <h2>✅ المهام المكتملة مؤخراً</h2>
        <table>
          <thead><tr><th>المهمة</th><th>الأولوية</th></tr></thead>
          <tbody>
            ${summary.recent_completed.map(t => {
              const priorityClass = t.priority === 'high' ? 'badge-high' : t.priority === 'medium' ? 'badge-medium' : 'badge-low';
              const priorityLabel = t.priority === 'high' ? 'عالي' : t.priority === 'medium' ? 'متوسط' : 'منخفض';
              return `<tr><td>${t.title || t.name || 'مهمة'}</td><td><span class="badge ${priorityClass}">${priorityLabel}</span></td></tr>`;
            }).join('')}
          </tbody>
        </table>` : ''}

        <p style="color: #999; font-size: 11px; margin-top: 40px; text-align: center;">تم إنشاء هذا التقرير تلقائياً بواسطة LifeFlow</p>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const handlePreview = () => {
    setShowReport(true);
    refetchSummary();
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FileDown size={24} className="text-primary-400" />
          تصدير البيانات
        </h1>
        <p className="text-gray-400 text-sm mt-1">صدّر تقاريرك كملفات PDF أو CSV أو JSON</p>
      </div>

      {/* Period Selection */}
      <div className="glass-card p-4 rounded-2xl">
        <h3 className="text-sm font-semibold text-white mb-3">الفترة الزمنية</h3>
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
                period === p.id
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
              }`}
            >
              <p.icon size={14} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Type Selection */}
      <div className="glass-card p-4 rounded-2xl">
        <h3 className="text-sm font-semibold text-white mb-3">نوع البيانات</h3>
        <div className="flex gap-2 flex-wrap">
          {TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
                type === t.id
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Export Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => csvMutation.mutate()}
          disabled={csvMutation.isPending}
          className="glass-card p-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-white/5 transition-all border border-transparent hover:border-green-500/20"
        >
          {csvMutation.isPending ? (
            <Loader2 size={24} className="text-green-400 animate-spin" />
          ) : (
            <FileSpreadsheet size={24} className="text-green-400" />
          )}
          <span className="text-sm text-white font-medium">تحميل CSV</span>
          <span className="text-[11px] text-gray-500">يفتح في Excel</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handlePrintPDF}
          className="glass-card p-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-white/5 transition-all border border-transparent hover:border-red-500/20"
        >
          <Printer size={24} className="text-red-400" />
          <span className="text-sm text-white font-medium">طباعة PDF</span>
          <span className="text-[11px] text-gray-500">معاينة ثم طباعة</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => jsonMutation.mutate()}
          disabled={jsonMutation.isPending}
          className="glass-card p-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-white/5 transition-all border border-transparent hover:border-blue-500/20"
        >
          {jsonMutation.isPending ? (
            <Loader2 size={24} className="text-blue-400 animate-spin" />
          ) : (
            <FileText size={24} className="text-blue-400" />
          )}
          <span className="text-sm text-white font-medium">تحميل JSON</span>
          <span className="text-[11px] text-gray-500">بيانات خام</span>
        </motion.button>
      </div>

      {/* Preview Button */}
      <button
        onClick={handlePreview}
        className="w-full btn-primary py-3 rounded-xl text-sm font-semibold"
      >
        معاينة التقرير
      </button>

      {/* Summary Preview */}
      {showReport && (
        <div className="glass-card p-5 rounded-2xl space-y-4" ref={reportRef}>
          {summaryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="text-primary-400 animate-spin" />
            </div>
          ) : summary ? (
            <>
              <h3 className="text-white font-bold text-lg">ملخص التقرير</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'إجمالي المهام', value: summary.stats?.total_tasks || 0, color: 'text-blue-400' },
                  { label: 'مهام مكتملة', value: summary.stats?.completed_tasks || 0, color: 'text-green-400' },
                  { label: 'نسبة الإنجاز', value: `${summary.stats?.completion_rate || 0}%`, color: 'text-primary-400' },
                  { label: 'عادات نشطة', value: summary.stats?.active_habits || 0, color: 'text-emerald-400' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-3 text-center">
                    <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-[11px] text-gray-500 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {summary.top_habits?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">أفضل العادات</h4>
                  <div className="space-y-2">
                    {summary.top_habits.map((h, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                        <span className="text-sm text-gray-300">{h.name}</span>
                        <span className="text-xs text-primary-400">{h.streak} يوم</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">لا توجد بيانات</p>
          )}
        </div>
      )}
    </div>
  );
}
