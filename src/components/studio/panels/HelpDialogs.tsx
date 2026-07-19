import React from 'react';
import { Grid, HelpCircle, Save, Trash2, X } from 'lucide-react';

interface InitialSetupModalProps {
  isOpen: boolean;
  selectedPreset: string;
  setSelectedPreset: (p: string) => void;
  customWidth: number;
  setCustomWidth: (w: number) => void;
  customHeight: number;
  setCustomHeight: (h: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function InitialSetupModal({
  isOpen,
  selectedPreset,
  setSelectedPreset,
  customWidth,
  setCustomWidth,
  customHeight,
  setCustomHeight,
  onConfirm,
  onClose
}: InitialSetupModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-zinc-200 shadow-2xl rounded-3xl w-full max-w-lg overflow-hidden">
        <div className="p-6 pb-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600">
              <Grid className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-zinc-900">أبعاد لوحة الرسم الجديدة</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">اختر نسبة جاهزة أو أدخل مقاسات لوحتك بدقة</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: '1:1', label: 'مربع قياسي (1:1)', desc: '1000 × 1000', w: 1000, h: 1000 },
              { id: '4:3', label: 'لوحة عريضة (4:3)', desc: '1200 × 900', w: 1200, h: 900 },
              { id: '16:9', label: 'مستطيل عريض (16:9)', desc: '1600 × 900', w: 1600, h: 900 },
              { id: 'custom', label: 'مقاس مخصص', desc: 'تحديد يدوي', w: customWidth, h: customHeight }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPreset(p.id);
                  setCustomWidth(p.w);
                  setCustomHeight(p.h);
                }}
                className={`p-4 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  selectedPreset === p.id
                    ? 'border-zinc-900 bg-zinc-50'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <span className="text-xs font-black text-zinc-800">{p.label}</span>
                <span className="text-[10px] text-zinc-400 font-mono">{p.desc}</span>
              </button>
            ))}
          </div>

          {selectedPreset === 'custom' && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-150">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-1">عرض اللوحة (W)</label>
                <input
                  type="number"
                  value={customWidth}
                  onChange={e => setCustomWidth(Number(e.target.value))}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono text-center focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-1">ارتفاع اللوحة (H)</label>
                <input
                  type="number"
                  value={customHeight}
                  onChange={e => setCustomHeight(Number(e.target.value))}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono text-center focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-zinc-200 text-zinc-600 rounded-full font-bold text-xs hover:bg-zinc-100 transition-all">إلغاء</button>
          <button onClick={onConfirm} className="px-5 py-2 bg-zinc-900 hover:bg-black text-white rounded-full font-bold text-xs transition-all shadow-md">بدء الرسم</button>
        </div>
      </div>
    </div>
  );
}

interface SaveModalProps {
  isOpen: boolean;
  drawCharName: string;
  setDrawCharName: (name: string) => void;
  drawGlyphType: 'isol' | 'init' | 'medi' | 'fina';
  setDrawGlyphType: (type: 'isol' | 'init' | 'medi' | 'fina') => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function SaveModal({
  isOpen,
  drawCharName,
  setDrawCharName,
  drawGlyphType,
  setDrawGlyphType,
  onConfirm,
  onClose
}: SaveModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-zinc-200 shadow-2xl rounded-3xl w-full max-w-sm overflow-hidden">
        <div className="p-6 pb-4 border-b border-zinc-100">
          <h3 className="text-sm font-black text-zinc-900">حفظ المحرف في المشروع</h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-zinc-500 mb-1.5">اسم المحرف / الحرف</label>
            <input
              type="text"
              value={drawCharName}
              onChange={e => setDrawCharName(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-xs font-bold text-center focus:outline-none focus:bg-white focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-zinc-500 mb-1.5">موضع الحرف</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['isol', 'init', 'medi', 'fina'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setDrawGlyphType(t)}
                  className={`py-2 text-[10px] font-bold rounded-lg border text-center transition-all ${
                    drawGlyphType === t
                      ? 'bg-zinc-900 border-zinc-900 text-white shadow-sm'
                      : 'bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-600'
                  }`}
                >
                  {t === 'isol' ? 'منفصل' : t === 'init' ? 'بداية' : t === 'medi' ? 'وسط' : 'نهاية'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-zinc-200 text-zinc-600 rounded-full font-bold text-xs hover:bg-zinc-100 transition-all">إلغاء</button>
          <button onClick={onConfirm} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-full font-bold text-xs transition-all shadow-md">حفظ وتثبيت</button>
        </div>
      </div>
    </div>
  );
}

interface ExitConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ExitConfirmModal({
  isOpen,
  onConfirm,
  onClose
}: ExitConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-zinc-200 shadow-2xl rounded-3xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <X className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-black text-zinc-900 mb-2">تنبيه بالخروج</h3>
        <p className="text-xs text-zinc-500 mb-6 leading-relaxed">ستفقد كافة تعديلاتك غير المحفوظة، هل تود الخروج فعلاً؟</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onClose} className="px-4 py-2 border border-zinc-200 text-zinc-600 rounded-full font-bold text-xs hover:bg-zinc-100 transition-all">الرجوع للرسم</button>
          <button onClick={onConfirm} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-xs transition-all shadow-md">تأكيد الخروج</button>
        </div>
      </div>
    </div>
  );
}
