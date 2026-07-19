import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface MetricsGuidesPanelProps {
  ascent: number;
  setAscent: (val: number) => void;
  descent: number;
  setDescent: (val: number) => void;
  baselineY: number;
  setBaselineY: (val: number) => void;
  lsb: number;
  setLsb: (val: number) => void;
  rsb: number;
  setRsb: (val: number) => void;
  extraGuides: number[];
  setExtraGuides: (val: number[]) => void;
}

export function MetricsGuidesPanel({
  ascent,
  setAscent,
  descent,
  setDescent,
  baselineY,
  setBaselineY,
  lsb,
  setLsb,
  rsb,
  setRsb,
  extraGuides,
  setExtraGuides
}: MetricsGuidesPanelProps) {
  return (
    <div className="bg-white border border-zinc-200 rounded-3xl p-5 space-y-4" dir="rtl">
      <div>
        <h4 className="text-xs font-black text-zinc-800 border-b border-zinc-100 pb-2 mb-3">مقاييس المحرف (Glyph Metrics)</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 mb-1">Ascent (أقصى صعود)</label>
            <input
              type="number"
              value={ascent}
              onChange={e => setAscent(Number(e.target.value))}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-center focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 mb-1">Descent (أقصى نزول)</label>
            <input
              type="number"
              value={descent}
              onChange={e => setDescent(Number(e.target.value))}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-center focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-zinc-400 mb-1">BaselineY (موقع السطر)</label>
            <input
              type="number"
              value={baselineY}
              onChange={e => setBaselineY(Number(e.target.value))}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-center focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100 pt-3">
        <h4 className="text-xs font-black text-zinc-800 mb-3">خطوط المحاذاة الجانبية</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 mb-1">LSB (يسار)</label>
            <input
              type="number"
              value={lsb}
              onChange={e => setLsb(Number(e.target.value))}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-center focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 mb-1">RSB (يمين)</label>
            <input
              type="number"
              value={rsb}
              onChange={e => setRsb(Number(e.target.value))}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-center focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100 pt-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-black text-zinc-800">أدلة أفقية إضافية</h4>
          <button 
            onClick={() => setExtraGuides([...extraGuides, baselineY - 100])}
            className="text-[10px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-2 py-1 rounded-full font-bold flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> إضافة دليل
          </button>
        </div>
        
        {extraGuides.length === 0 ? (
          <p className="text-[10px] text-zinc-400 text-center py-2">لا توجد أدلة إضافية حالياً</p>
        ) : (
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
            {extraGuides.map((g, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 font-bold shrink-0">دليل {idx + 1}</span>
                <input
                  type="number"
                  value={g}
                  onChange={e => {
                    const ng = [...extraGuides];
                    ng[idx] = Number(e.target.value);
                    setExtraGuides(ng);
                  }}
                  className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-1 text-xs text-center focus:outline-none"
                />
                <button 
                  onClick={() => {
                    const ng = [...extraGuides];
                    ng.splice(idx, 1);
                    setExtraGuides(ng);
                  }}
                  className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
