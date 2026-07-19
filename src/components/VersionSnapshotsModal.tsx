import React, { useState, useEffect } from 'react';
import { History, Plus, Trash2, RotateCcw, Camera, Calendar, Tag } from 'lucide-react';
import { Glyph } from '../types';
import { VersionSnapshots, Snapshot } from '../features/snapshots/VersionSnapshots';

interface VersionSnapshotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  glyphs: Glyph[];
  setGlyphs: (updater: Glyph[] | ((prev: Glyph[]) => Glyph[])) => void;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export function VersionSnapshotsModal({
  isOpen,
  onClose,
  projectId,
  glyphs,
  setGlyphs,
  showSuccess,
  showError
}: VersionSnapshotsModalProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [selectedGlyphId, setSelectedGlyphId] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSnapshots();
    }
  }, [isOpen, projectId]);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      const list = await VersionSnapshots.getSnapshotsForProject(projectId);
      setSnapshots(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!newLabel.trim()) {
      showError('الرجاء إدخال اسم أو وصف للقطة التاريخية');
      return;
    }

    if (selectedGlyphId === 'all') {
      showError('الرجاء اختيار محرف محدد لأخذ لقطة تاريخية له');
      return;
    }

    const targetGlyph = glyphs.find(g => g.id === selectedGlyphId);
    if (!targetGlyph) {
      showError('المحرف المحدد غير موجود');
      return;
    }

    try {
      await VersionSnapshots.saveSnapshot(projectId, targetGlyph.id, newLabel.trim(), targetGlyph);
      showSuccess(`تم حفظ اللقطة التاريخية "${newLabel}" بنجاح`);
      setNewLabel('');
      loadSnapshots();
    } catch (e) {
      showError('فشل حفظ اللقطة التاريخية');
    }
  };

  const handleRestoreSnapshot = async (snapshot: Snapshot) => {
    try {
      setGlyphs(prev => {
        // If the glyph already exists, replace it, otherwise add it back.
        const exists = prev.some(g => g.id === snapshot.glyphId);
        if (exists) {
          return prev.map(g => g.id === snapshot.glyphId ? { ...snapshot.glyph, id: snapshot.glyphId } : g);
        } else {
          return [...prev, { ...snapshot.glyph, id: snapshot.glyphId }];
        }
      });
      showSuccess(`تمت استعادة المحرف "${snapshot.glyph.char}" إلى حالة: ${snapshot.label}`);
      onClose();
    } catch (e) {
      showError('فشل استعادة اللقطة التاريخية');
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذه اللقطة التاريخية نهائياً؟')) {
      try {
        await VersionSnapshots.deleteSnapshot(id);
        setSnapshots(prev => prev.filter(s => s.id !== id));
        showSuccess('تم حذف اللقطة بنجاح');
      } catch (e) {
        showError('فشل حذف اللقطة');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-zinc-200 rounded-[24px] w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-700 shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">نسخ التاريخ واللقطات الزمنية</h3>
              <p className="text-[11px] text-zinc-500 font-medium">سجل لقطات مستقل تماماً لحماية تقدم المشروع</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center bg-white text-zinc-500 border border-zinc-200 rounded-full hover:bg-zinc-100 transition-all font-bold shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Create Section */}
          <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/60 space-y-3">
            <h4 className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-zinc-500" /> أخذ لقطة تاريخية جديدة لمحرّف
            </h4>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedGlyphId}
                onChange={e => setSelectedGlyphId(e.target.value)}
                className="bg-white border border-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none font-sans flex-1"
              >
                <option value="all">-- اختر المحرف --</option>
                {glyphs.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.char} ({g.glyphType === 'isol' ? 'منفصل' : g.glyphType === 'init' ? 'بداية' : g.glyphType === 'medi' ? 'وسط' : g.glyphType === 'fina' ? 'نهاية' : 'غير محدد'})
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="مثال: قبل دمج أجزاء الحرف، نسخة تجريبية..."
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="bg-white border border-zinc-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-zinc-500 flex-[2] text-right"
              />

              <button
                onClick={handleCreateSnapshot}
                className="bg-zinc-900 hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> حفظ اللقطة
              </button>
            </div>
          </div>

          {/* List Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-zinc-500" /> اللقطات الزمنية المحفوظة ({snapshots.length})
            </h4>

            {loading ? (
              <div className="text-center py-8 text-zinc-400 text-xs font-medium">جاري تحميل اللقطات...</div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-xs border border-dashed border-zinc-200 rounded-2xl">
                لا توجد لقطات تاريخية محفوظة لهذا المشروع بعد. يمكنك أخذ لقطات لأي محرف لحفظ حالته والعودة لها بأي وقت.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 border border-zinc-100 rounded-2xl overflow-hidden bg-white">
                {snapshots.map(s => (
                  <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center border border-zinc-200 font-bold text-zinc-800 text-lg shrink-0">
                        {s.glyph.char}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-800 flex flex-wrap items-center gap-2">
                          <span className="truncate">{s.label}</span>
                          <span className="text-[10px] text-zinc-400 font-medium bg-zinc-100 px-2 py-0.5 rounded-full font-mono shrink-0">
                            {s.glyph.glyphType === 'isol' ? 'منفصل' : s.glyph.glyphType === 'init' ? 'بداية' : s.glyph.glyphType === 'medi' ? 'وسط' : 'نهاية'}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500 flex flex-wrap items-center gap-3 mt-1.5 font-medium">
                          <span className="flex items-center gap-1 shrink-0"><Calendar className="w-3 h-3 text-zinc-400" /> {new Date(s.timestamp).toLocaleString('ar-EG')}</span>
                          <span className="flex items-center gap-1 shrink-0"><Tag className="w-3 h-3 text-zinc-400" /> ID: {s.id.split('_')[0]}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleRestoreSnapshot(s)}
                        className="flex-1 sm:flex-none flex justify-center items-center gap-1 px-4 py-2 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> استعادة
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(s.id)}
                        className="shrink-0 p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg border border-red-200 transition-all flex items-center justify-center"
                        title="حذف اللقطة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
