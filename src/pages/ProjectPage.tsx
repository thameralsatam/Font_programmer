import React from 'react';
import { 
  Upload, Type, Download, Info, Trash2, CheckCircle2,
  Keyboard, Save, ArrowRight, PenTool, HelpCircle, Copy, Grid, History
} from 'lucide-react';
import { Glyph, Project } from '../types';
import { processUploadedSVG } from '../features/import/SvgImportManager';
import { exportToFont } from '../features/export/FontExportManager';
import { ArabicPreviewEngine, renderGlyphPaths, normalizeType } from '../features/preview/ArabicPreviewEngine';
import { VersionSnapshotsModal } from '../components/VersionSnapshotsModal';
import svgpath from 'svgpath';

interface ProjectPageProps {
  currentProject: Project;
  glyphs: Glyph[];
  setGlyphs: (updater: Glyph[] | ((prev: Glyph[]) => Glyph[])) => void;
  setCurrentProjectId: (id: string | null) => void;
  editingGlyphId: string | null;
  setEditingGlyphId: (id: string | null) => void;
  error: string | null;
  success: string | null;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  setConfirmDialog: (dialog: any) => void;
  
  isDrawingStudioOpen: boolean;
  setIsDrawingStudioOpen: (b: boolean) => void;
  setStudioInitialGlyph: (g: Glyph | null) => void;
  setStudioFallbackCharName: (c: string) => void;
  
  duplicatingGlyph: Glyph | null;
  setDuplicatingGlyph: (g: Glyph | null) => void;
  duplicateChar: string;
  setDuplicateChar: (s: string) => void;

  uploadChar: string;
  setUploadChar: (s: string) => void;
  inputText: string;
  setInputText: (s: string) => void;
}

export function ProjectPage({
  currentProject,
  glyphs,
  setGlyphs,
  setCurrentProjectId,
  editingGlyphId,
  setEditingGlyphId,
  error,
  success,
  showSuccess,
  showError,
  setConfirmDialog,
  setIsDrawingStudioOpen,
  setStudioInitialGlyph,
  setStudioFallbackCharName,
    duplicatingGlyph,
  setDuplicatingGlyph,
  duplicateChar,
  setDuplicateChar,
  uploadChar,
  setUploadChar,
  inputText,
  setInputText
}: ProjectPageProps) {
  const [isSnapshotsModalOpen, setIsSnapshotsModalOpen] = React.useState(false);

  const handleUpload = async (file: File) => {
    try {
      const glyph = await processUploadedSVG(file, uploadChar);
      setGlyphs(prev => [
        ...prev.filter(g => !(g.char === glyph.char)),
        glyph
      ]);
      setUploadChar('');
      showSuccess(`تمت إضافة "${glyph.char}"`);
    } catch (err: any) {
      showError(err.message || 'خطأ أثناء معالجة الملف');
    }
  };

  const moveGlyph = (id: string, dx: number, dy: number) => {
    setGlyphs(prev => prev.map(g => {
      if (g.id !== id) return g;
      return {
        ...g,
        pathData: svgpath(g.pathData).translate(dx, dy).toString(),
        bounds: {
          minX: g.bounds.minX + dx,
          maxX: g.bounds.maxX + dx,
          minY: g.bounds.minY + dy,
          maxY: g.bounds.maxY + dy
        }
      };
    }));
  };

  const scaleGlyph = (id: string, f: number) => {
    setGlyphs(prev => prev.map(g => {
      if (g.id !== id) return g;
      const midX = (g.bounds.minX + g.bounds.maxX) / 2;
      const midY = (g.bounds.minY + g.bounds.maxY) / 2;
      const np = svgpath(g.pathData).translate(-midX, -midY).scale(f).translate(midX, midY).toString();
      let b = g.bounds;
      try {
        const bb = (svgpath(np) as any).bounds();
        b = { minX: Math.round(bb[0]), maxX: Math.round(bb[2]), minY: Math.round(bb[1]), maxY: Math.round(bb[3]) };
      } catch {}
      return { ...g, pathData: np, bounds: b };
    }));
  };

  const updateGlyph = (id: string, update: Partial<Glyph>) => {
    setGlyphs(prev => prev.map(g => g.id === id ? { ...g, ...update } : g));
  };

  // ── Duplicate Dialog ──
  const renderDuplicateDialog = () => {
    if (!duplicatingGlyph) return null;
    const isAlreadyExisting = glyphs.some(g => 
      g.id !== duplicatingGlyph.id && 
      g.char === duplicateChar && 
      g.char === duplicateChar
    );

    const handleConfirmDuplicate = () => {
      if (!duplicateChar.trim()) {
        showError('يرجى إدخال اسم أو حرف للمحرف');
        return;
      }
      if (isAlreadyExisting) {
        showError('هذا الحرف بنفس الموضع موجود بالفعل في المشروع');
        return;
      }
      
      const newGlyph: Glyph = {
        ...duplicatingGlyph,
        id: Date.now().toString(),
        char: duplicateChar.trim(),
        
      };
      
      setGlyphs(prev => [...prev, newGlyph]);
      setDuplicatingGlyph(null);
      showSuccess(`تم تكرار المحرف بنجاح كـ "${duplicateChar}"`);
    };

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/80 backdrop-blur-md p-4" dir="rtl">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
          <h3 className="text-base font-bold text-zinc-900 mb-4 flex items-center gap-2">
            <Copy className="w-4 h-4 text-zinc-500" /> تكرار المحرف
          </h3>
          <p className="text-xs text-zinc-600 mb-4 leading-relaxed">
            ملاحظة: لا يقبل النظام تكرار نفس الحرف بنفس الموضع. يجب تغيير الحرف أو موقعه لتتمكن من الحفظ.
          </p>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 mb-1">اسم المحرف / الحرف الجديد:</label>
              <input 
                type="text" 
                value={duplicateChar} 
                onChange={e => setDuplicateChar(e.target.value)} 
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:bg-white transition-all text-center"
              />
            </div>
            
            {isAlreadyExisting && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-[10px] font-medium leading-relaxed">
                ⚠️ هناك محرف بنفس الاسم والموضع المختار في المشروع! يرجى اختيار موضع أو حرف مختلف.
              </div>
            )}
          </div>
          <div className="flex flex-row gap-3 justify-end w-full">
            <button 
              onClick={() => setDuplicatingGlyph(null)} 
              className="flex-1 sm:flex-none px-6 py-2.5 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full font-bold hover:bg-zinc-200 transition-all text-xs"
            >
              إلغاء
            </button>
            <button 
              onClick={handleConfirmDuplicate} 
              disabled={isAlreadyExisting || !duplicateChar.trim()}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-zinc-900 text-white rounded-full font-bold hover:bg-black transition-all text-xs disabled:opacity-30 disabled:hover:bg-zinc-900"
            >
              تأكيد التكرار
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      
      {renderDuplicateDialog()}

      <VersionSnapshotsModal 
        isOpen={isSnapshotsModalOpen}
        onClose={() => setIsSnapshotsModalOpen(false)}
        projectId={currentProject.id}
        glyphs={glyphs}
        setGlyphs={setGlyphs}
        showSuccess={showSuccess}
        showError={showError}
      />

      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-auto py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
              <Type className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-zinc-900 truncate">{currentProject.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 justify-end">
            <button 
              onClick={() => setIsSnapshotsModalOpen(true)} 
              className="w-8 h-8 bg-zinc-100 text-zinc-700 rounded-lg font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center"
              title="التاريخ"
            >
              <History className="w-3.5 h-3.5 text-zinc-500" />
            </button>
            <button onClick={() => setCurrentProjectId(null)} className="w-8 h-8 bg-zinc-100 text-zinc-800 rounded-lg font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center" title="المشاريع">
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {error && <div className="px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded-lg text-[10px] truncate">{error}</div>}
            {success && <div className="px-2 py-1 bg-green-50 border border-green-200 text-green-600 rounded-lg text-[10px] flex items-center gap-1 truncate"><CheckCircle2 className="w-3 h-3 shrink-0" /><span className="truncate">{success}</span></div>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        {/* Left column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6">
            <h2 className="text-base font-bold mb-4 flex items-center gap-2" dir="rtl">
              <Upload className="w-4 h-4 text-zinc-500" /> إضافة محرف جديد
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5" dir="rtl">اسم المحرف</label>
                <input type="text" value={uploadChar} onChange={e => setUploadChar(e.target.value)} placeholder="أدخل الحرف..." className="w-full bg-white border border-zinc-300 rounded-2xl px-4 py-2.5 text-xs focus:outline-none focus:border-zinc-500 transition-all text-right" dir="rtl" />
              </div>
              <div className="relative group">
                <input 
                  type="file" 
                  accept=".svg,.svgz" 
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = '';
                  }} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                />
                <div className="w-full border-2 border-dashed border-zinc-300 group-hover:border-zinc-500 rounded-3xl p-6 flex flex-col items-center gap-2 transition-all bg-white/40">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-4 h-4 text-zinc-500" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-600">اسحب أو انقر لرفع SVG / SVGZ</p>
                </div>
              </div>
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200" /></div>
                <span className="relative px-3 bg-zinc-50 text-[10px] text-zinc-500 font-bold">أو ارسم يدوياً</span>
              </div>
              <button 
                onClick={() => {
                  setStudioInitialGlyph(null);
                  setStudioFallbackCharName(uploadChar || '');
                  setIsDrawingStudioOpen(true);
                }} 
                className="w-full py-3 bg-teal-600/10 hover:bg-teal-600/20 text-teal-600 border border-teal-500/20 rounded-2xl text-xs font-bold flex items-center justify-center gap-2" dir="rtl"
              >
                <PenTool className="w-3.5 h-3.5" /> استوديو الرسم المباشر
              </button>
            </div>
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4" dir="rtl">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Save className="w-4 h-4 text-zinc-500" /> مكتبة المحارف ({glyphs.length})
              </h2>
            </div>
            {!glyphs.length ? (
              <div className="text-center py-12 text-zinc-400 text-xs border-2 border-dashed border-zinc-200 rounded-3xl" dir="rtl">لا توجد محارف. أضف محرفاً للبدء.</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                {glyphs.map(g => {
                  const mW = Math.max(1, g.rsb - g.lsb);
                  const mH = Math.max(1, g.metrics.ascent - g.metrics.descent);
                  const pad = Math.max(mW, mH) * 0.3;
                  const vb = `${g.lsb - pad} ${g.baselineY - g.metrics.ascent - pad} ${mW + pad * 2} ${mH + pad * 2}`;
                  return (
                    <div key={g.id} onClick={() => { setStudioInitialGlyph(g); setStudioFallbackCharName(g.char); setIsDrawingStudioOpen(true); }} className="group relative bg-white border border-zinc-200 rounded-2xl p-2.5 flex flex-col items-center gap-1.5 hover:border-zinc-400 transition-all cursor-pointer">
                      <button 
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmDialog({
                            isOpen: true,
                            message: 'حذف المحرف؟',
                            onConfirm: () => setGlyphs(p => p.filter(x => x.id !== g.id))
                          });
                        }} 
                        className="absolute top-1 right-1 p-1 bg-red-50 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white z-10"
                        title="حذف"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={e => {
                          e.stopPropagation();
                          setDuplicatingGlyph(g);
                          setDuplicateChar(g.char);
                          
                        }} 
                        className="absolute top-1 left-7.5 p-1 bg-blue-50 text-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-500 hover:text-white z-10" 
                        title="تكرار المحرف"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={e => {
                          e.stopPropagation();
                          setStudioInitialGlyph(g);
                          setStudioFallbackCharName(g.char);
                          
                          setIsDrawingStudioOpen(true);
                        }} 
                        className="absolute top-1 left-1 p-1 bg-teal-50 text-teal-500 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-teal-500 hover:text-white z-10"
                        title="تعديل"
                      >
                        <PenTool className="w-3 h-3" />
                      </button>
                      <div className="w-full aspect-square bg-zinc-50 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-100">
                        <svg viewBox={vb} className="w-full h-full p-2">
                          {renderGlyphPaths(g)}
                        </svg>
                      </div>
                      <div className="text-center w-full">
                        <div className="font-bold text-sm truncate text-zinc-800" dir="rtl">{g.char === '!' ? '؟' : g.char}</div>
                        
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5" dir="rtl">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-zinc-500" /> معاينة حية
              </h2>
              <button 
                onClick={() => exportToFont(glyphs, currentProject.name, showSuccess, showError)} 
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all"
              >
                <Download className="w-3.5 h-3.5" /> تصدير TTF
              </button>
            </div>
            <input 
              type="text" 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              placeholder="اكتب هنا لمعاينة الخط..." 
              className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-400 transition-all text-right mb-4" 
              dir="rtl" 
            />
            
            <div className="w-full aspect-video bg-white border border-zinc-200 rounded-3xl relative overflow-hidden flex items-center justify-center p-8">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000005_1px,transparent_1px),linear-gradient(to_bottom,#00000005_1px,transparent_1px)] bg-[size:40px_40px]" />
              <div className="relative z-10 w-full h-full flex items-center justify-center text-zinc-900">
                {inputText ? (
                  <ArabicPreviewEngine inputText={inputText} glyphs={glyphs} />
                ) : (
                  <div className="text-zinc-400 flex flex-col items-center gap-2.5">
                    <Type className="w-10 h-10 opacity-30" />
                    <p className="text-xs">اكتب لرؤية النتيجة</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
