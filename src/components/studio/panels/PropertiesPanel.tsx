import React, { useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { DrawCmd } from '../../../types';
import { ColorPicker } from '../../ColorPicker';

interface PropertiesPanelProps {
  selectedNodeIndices: number[];
  drawCommands: DrawCmd[];
  updateNodePosition: (index: number, x: number, y: number) => void;
  convertSelectedNodesToType: (type: 'corner' | 'smooth' | 'symmetric' | 'cusp') => void;
  fillColor: string;
  setFillColor: (c: string) => void;
  strokeColor: string;
  setStrokeColor: (c: string) => void;
}

export function PropertiesPanel({
  selectedNodeIndices,
  drawCommands,
  updateNodePosition,
  convertSelectedNodesToType,
  fillColor,
  setFillColor,
  strokeColor,
  setStrokeColor
}: PropertiesPanelProps) {
  const isSingleNode = selectedNodeIndices.length === 1;
  const singleCmdIndex = isSingleNode ? selectedNodeIndices[0] : -1;
  const singleCmd = singleCmdIndex >= 0 ? drawCommands[singleCmdIndex] : null;

  const [isFillOpen, setIsFillOpen] = useState(false);
  const [isStrokeOpen, setIsStrokeOpen] = useState(false);

  return (
    <div className="bg-white border border-zinc-200 rounded-3xl p-5 space-y-4" dir="rtl">
      <div>
        <h4 className="text-xs font-black text-zinc-800 border-b border-zinc-100 pb-2 mb-3">خصائص النقاط المحددة</h4>
        {selectedNodeIndices.length === 0 ? (
          <p className="text-[10px] text-zinc-400 text-center py-4">حدد نقطة على اللوحة لرؤية وتعديل خصائصها</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500">النقاط المحددة:</span>
              <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full">{selectedNodeIndices.length} نقاط</span>
            </div>

            {singleCmd && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1">الموقع الأفقي (X)</label>
                  <input
                    type="number"
                    value={Math.round(singleCmd.x)}
                    onChange={e => updateNodePosition(singleCmdIndex, Number(e.target.value), singleCmd.y)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-center focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-1">الموقع العمودي (Y)</label>
                  <input
                    type="number"
                    value={Math.round(singleCmd.y)}
                    onChange={e => updateNodePosition(singleCmdIndex, singleCmd.x, Number(e.target.value))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-center focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <label className="block text-[10px] font-bold text-zinc-500 mb-1.5">نوع النقطة والمنحنى</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'corner', label: 'زاوية حادة' },
                  { id: 'smooth', label: 'منحنى ناعم' },
                  { id: 'symmetric', label: 'منحنى متناظر' },
                  { id: 'cusp', label: 'منحنى حر (Cusp)' }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => convertSelectedNodesToType(item.id as any)}
                    className="py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-xl text-[10px] font-bold text-zinc-700 text-center transition-all"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 pt-3">
        <h4 className="text-xs font-black text-zinc-800 mb-3">الألوان والتعبئة</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 mb-1.5">لون التعبئة الأساسي (Fill)</label>
            <ColorPicker 
              value={fillColor} 
              onChange={setFillColor} 
              label="تعبئة" 
              isOpen={isFillOpen} 
              onToggle={() => {
                setIsFillOpen(!isFillOpen);
                setIsStrokeOpen(false);
              }} 
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 mb-1.5">لون الإطار الخارجي (Stroke)</label>
            <ColorPicker 
              value={strokeColor} 
              onChange={setStrokeColor} 
              label="إطار" 
              isOpen={isStrokeOpen} 
              onToggle={() => {
                setIsStrokeOpen(!isStrokeOpen);
                setIsFillOpen(false);
              }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
