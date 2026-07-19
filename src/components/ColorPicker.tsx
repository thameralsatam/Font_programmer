import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface RGBAColor { r: number; g: number; b: number; a: number; }

function parseRGBA(val: string): RGBAColor {
  if (!val || val === 'none') return { r: 0, g: 0, b: 0, a: 0 };
  const m = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  if (val.startsWith('#')) {
    const hex = val.slice(1);
    if (hex.length === 3) return { r: parseInt(hex[0]+hex[0],16), g: parseInt(hex[1]+hex[1],16), b: parseInt(hex[2]+hex[2],16), a: 1 };
    return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), a: hex.length===8?parseInt(hex.slice(6,8),16)/255:1 };
  }
  return { r: 24, g: 24, b: 27, a: 1 };
}

function rgbaToStr({ r, g, b, a }: RGBAColor) {
  return a < 1 ? `rgba(${r},${g},${b},${a.toFixed(2)})` : `rgb(${r},${g},${b})`;
}

function HSVSquare({ hue, s, v, onChange }: { hue: number; s: number; v: number; onChange: (s: number, v: number) => void }) {
  const squareRef = useRef<HTMLDivElement>(null);
  
  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!squareRef.current) return;
    const rect = squareRef.current.getBoundingClientRect();
    const x = 'clientX' in e ? (e as MouseEvent).clientX : (e as TouchEvent).touches[0].clientX;
    const y = 'clientY' in e ? (e as MouseEvent).clientY : (e as TouchEvent).touches[0].clientY;
    
    const ns = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
    const nv = Math.max(0, Math.min(100, 100 - ((y - rect.top) / rect.height) * 100));
    onChange(ns, nv);
  }, [onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    handleMove(e.nativeEvent);
    const onMouseMove = (me: MouseEvent) => handleMove(me);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    handleMove(e.nativeEvent);
    const onTouchMove = (te: TouchEvent) => handleMove(te);
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  };

  return (
    <div 
      ref={squareRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className="relative w-full aspect-square rounded-xl cursor-crosshair overflow-hidden border border-zinc-200 shadow-inner mb-3"
      style={{
        backgroundColor: `hsl(${hue}, 100%, 50%)`,
        backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)'
      }}
    >
      <div 
        className="absolute w-3.5 h-3.5 border-2 border-white rounded-full shadow-lg -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${s}%`, top: `${100 - v}%` }}
      />
    </div>
  );
}

export function ColorPicker({ 
  value, 
  onChange, 
  label,
  isOpen,
  onToggle,
  isLocked = false
}: { 
  value: string; 
  onChange: (v: string) => void; 
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  isLocked?: boolean;
}) {
  const c = parseRGBA(value);
  const [r, setR] = useState(c.r);
  const [g, setG] = useState(c.g);
  const [b, setB] = useState(c.b);
  const [a, setA] = useState(c.a === 0 && value === 'none' ? 1 : c.a);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nc = parseRGBA(value);
    if (value !== 'none') {
      setR(nc.r); 
      setG(nc.g); 
      setB(nc.b); 
      setA(nc.a);
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      onToggle(); // Close it
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  const rgbToHsv = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
  };

  const hsvToRgb = (h: number, s: number, v: number) => {
    h /= 360; s /= 100; v /= 100;
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  };

  const initialHsv = rgbToHsv(r, g, b);
  const [h, setH] = useState(initialHsv.h);
  const [s, setS] = useState(initialHsv.s);
  const [v, setV] = useState(initialHsv.v);

  useEffect(() => {
    const nc = parseRGBA(value);
    if (value !== 'none') {
      const nh = rgbToHsv(nc.r, nc.g, nc.b);
      const currentRgb = hsvToRgb(h, s, v);
      if (currentRgb.r !== nc.r || currentRgb.g !== nc.g || currentRgb.b !== nc.b) {
        setH(nh.h);
        setS(nh.s);
        setV(nh.v);
      }
    }
  }, [value]);

  const emit = (nr = r, ng = g, nb = b, na = a) => {
    onChange(rgbaToStr({ r: nr, g: ng, b: nb, a: na }));
  };

  const updateHsv = (nh: number, ns: number, nv: number) => {
    setH(nh); 
    setS(ns); 
    setV(nv);
    const nr = hsvToRgb(nh, ns, nv);
    setR(nr.r); 
    setG(nr.g); 
    setB(nr.b);
    emit(nr.r, nr.g, nr.b, a);
  };

  const presets = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff', '#18181b'];

  return (
    <div className="relative inline-block text-right" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-xl shadow-sm hover:bg-zinc-50 transition-all ${
          isOpen ? 'ring-2 ring-zinc-950 border-transparent' : ''
        }`}
        title={label || "لون التعبئة"}
      >
        <div 
          className="w-4 h-4 rounded-md border border-zinc-300 shadow-inner" 
          style={{ 
            background: value === 'none' 
              ? 'repeating-linear-gradient(45deg, #ef4444 0, #ef4444 1px, transparent 1px, transparent 4px)' 
              : value 
          }} 
        />
        <span className="text-[11px] text-zinc-600 font-bold">{label || "اللون"}</span>
        <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[9990]" 
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          />
          <div 
            className="fixed bottom-14 left-4 bg-white border border-zinc-200 rounded-2xl shadow-2xl p-3 w-56 z-[9995] animate-in slide-in-from-bottom-2 duration-150 overflow-hidden"
            dir="rtl"
          >
            {isLocked && (
              <div className="absolute inset-0 z-50 bg-white/75 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center select-none">
                <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 mb-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <p className="text-[10px] font-black text-zinc-800 leading-normal">
                  حدد نقطة أو أكثر من المسار الذي تريد تغيير لونه لفتح تغيير اللون
                </p>
              </div>
            )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-zinc-700">منتقي الألوان HSV</span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onChange('none');
              }}
              className="px-2 py-0.5 bg-red-50 hover:bg-red-100 rounded text-[9px] font-bold text-red-600 transition-colors"
            >
              شفاف
            </button>
          </div>

          <div className="space-y-2.5">
            {/* HSV Canvas */}
            <HSVSquare hue={h} s={s} v={v} onChange={(ns, nv) => updateHsv(h, ns, nv)} />

            {/* Hue Slider (360°) */}
            <div className="flex items-center gap-1.5" dir="ltr">
              <span className="text-[9px] w-6 text-left text-zinc-500 font-mono font-bold">{h}°</span>
              <input 
                type="range" min={0} max={360} value={h} 
                onChange={e => updateHsv(+e.target.value, s, v)} 
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)', direction: 'ltr' }}
              />
              <span className="text-[9px] font-bold text-zinc-400 w-12 shrink-0 text-right" dir="rtl">اللون</span>
            </div>

            {/* Alpha Slider */}
            <div className="flex items-center gap-1.5" dir="ltr">
              <span className="text-[9px] w-6 text-left text-zinc-500 font-mono font-bold">{(a * 100).toFixed(0)}%</span>
              <div className="flex-1 relative h-1.5 flex items-center">
                <div 
                  className="absolute inset-0 rounded-full" 
                  style={{ background: `linear-gradient(to right, transparent, ${rgbaToStr({ r, g, b, a: 1 })})` }} 
                />
                <input 
                  type="range" min={0} max={1} step={0.01} value={a} 
                  onChange={e => { setA(+e.target.value); emit(r, g, b, +e.target.value); }} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  style={{ direction: 'ltr' }}
                />
                <div className="h-1.5 rounded-full bg-transparent w-full border border-zinc-100 pointer-events-none" />
                <div 
                  className="absolute h-2.5 w-2.5 bg-white border border-zinc-800 rounded-full pointer-events-none shadow-sm"
                  style={{ left: `${a * 100}%`, transform: 'translateX(-50%)' }}
                />
              </div>
              <span className="text-[9px] font-bold text-zinc-400 w-12 shrink-0 text-right" dir="rtl">الشفافية</span>
            </div>
          </div>

          {/* Selected Color Preview */}
          <div className="mt-2.5 mb-2.5 flex items-center gap-2 p-1.5 bg-zinc-50 rounded-xl border border-zinc-100">
            <div 
              className="w-7 h-7 rounded-lg border border-zinc-200 shadow-inner shrink-0" 
              style={{ 
                background: value === 'none' 
                  ? 'repeating-linear-gradient(45deg, #ef4444 0, #ef4444 1px, transparent 1px, transparent 4px)' 
                  : rgbaToStr({ r, g, b, a }) 
              }} 
            />
            <div className="flex flex-col overflow-hidden text-right">
              <span className="text-[8px] font-mono text-zinc-600 font-bold truncate">
                {value === 'none' ? 'شفاف / بلا لون' : rgbaToStr({ r, g, b, a })}
              </span>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1 justify-center border-t border-zinc-100 pt-2">
            {presets.map(p => (
              <button 
                key={p} 
                onClick={(e) => {
                  e.stopPropagation();
                  const nc = parseRGBA(p);
                  setR(nc.r); setG(nc.g); setB(nc.b); setA(1);
                  onChange(rgbaToStr({ r: nc.r, g: nc.g, b: nc.b, a: 1 }));
                }}
                className="w-5 h-5 rounded-md border border-zinc-200 hover:scale-115 transition-transform shadow-sm shrink-0"
                style={{ background: p }} 
                title={p}
              />
            ))}
          </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
