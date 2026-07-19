import React from 'react';

export function MetricsWindow() {
  return (
    <div className="p-10 bg-zinc-50 border border-zinc-200 rounded-[32px] text-center max-w-2xl mx-auto my-12" dir="rtl">
      <h2 className="text-lg font-black text-zinc-800">نافذة مقاييس الحروف المستقلة (Metrics Window)</h2>
      <p className="text-sm text-zinc-500 mt-3 leading-relaxed">
        ستضم هذه النافذة المستقلة لوحة التحكم الكاملة بـ Kerning وSide Bearings وAdvance Width مع محاكاة فورية للجمل الطويلة في المراحل المتقدمة.
      </p>
    </div>
  );
}
