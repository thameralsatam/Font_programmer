import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, Type, Download, Info, Trash2, Settings2, CheckCircle2,
  Keyboard, Save, Plus, ArrowRight, ArrowUp, ArrowDown, Edit2, PenTool, RefreshCw,
  HelpCircle, Undo, X, MousePointer, Grid, EyeOff, Copy, Scissors,
  Clipboard, ChevronDown, Unlock, Eye, Lock, Move, Hand, ZoomIn, ZoomOut,
  RotateCcw, RotateCw, FlipHorizontal, FlipVertical, AlignCenter,
  AlignHorizontalJustifyCenter, Layers, ChevronUp
} from 'lucide-react';
import opentype from 'opentype.js';
import { SVGPathData } from 'svg-pathdata';
import svgpath from 'svgpath';
import {
  extractAllPaths, svgToOpentype, calculateExactPathBounds,
  cleanAndNormalizePath, fileToSVGText, parseSVGStringToDoc
} from './Svgprocessor';
import { Glyph, Project } from './types';
import { saveProjectsToDb, loadProjectsFromDb } from './utils/indexedDb';
import { FONT_API_URL } from './config';
import { DrawingStudio } from './components/DrawingStudio';

// ─── Types ────────────────────────────────────────────────────────────────────
type ToolMode = 'select' | 'move' | 'pen';
type DrawModeType = 'line' | 'curve';
type DrawCmd = {
  type: string; x: number; y: number;
  cx?: number; cy?: number;
  cx1?: number; cy1?: number;
  cx2?: number; cy2?: number;
  pointType?: 'corner' | 'smooth' | 'symmetric' | 'cusp';
};

// ─── Safe localStorage ────────────────────────────────────────────────────────
const safeLS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} }
};

// ─── RGB Color Picker Component ───────────────────────────────────────────────
interface RGBAColor { r: number; g: number; b: number; a: number; }

function parseRGBA(val: string): RGBAColor {
  if (!val) return { r: 24, g: 24, b: 27, a: 1 };
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

function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'rgb' | 'hsv'>('rgb');
  const c = parseRGBA(value);
  const [r, setR] = useState(c.r);
  const [g, setG] = useState(c.g);
  const [b, setB] = useState(c.b);
  const [a, setA] = useState(c.a);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const nc = parseRGBA(value);
    setR(nc.r); setG(nc.g); setB(nc.b); setA(nc.a);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Check if click was inside the button OR inside the dropdown portal
      if (ref.current && ref.current.contains(e.target as Node)) return;
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const hsv = rgbToHsv(r, g, b);
  const [h, setH] = useState(hsv.h);
  const [s, setS] = useState(hsv.s);
  const [v, setV] = useState(hsv.v);

  useEffect(() => {
    if (mode === 'hsv') {
      const nh = rgbToHsv(r, g, b);
      setH(nh.h); setS(nh.s); setV(nh.v);
    }
  }, [r, g, b, mode]);

  const emit = (nr=r, ng=g, nb=b, na=a) => onChange(rgbaToStr({ r: nr, g: ng, b: nb, a: na }));

  const updateHsv = (nh: number, ns: number, nv: number) => {
    setH(nh); setS(ns); setV(nv);
    const nr = hsvToRgb(nh, ns, nv);
    setR(nr.r); setG(nr.g); setB(nr.b);
    emit(nr.r, nr.g, nr.b, a);
  };

  const toggleOpen = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const dropdownWidth = 240;
      // In RTL, we prefer aligning right edges.
      // rect.right is the x coordinate of the right edge of the button.
      let left = rect.right - dropdownWidth;
      
      // Safety check for left edge
      if (left < 8) {
        left = 8;
      }
      // Safety check for right edge
      if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - dropdownWidth - 8;
      }
      
      setDropdownPos({ top: rect.bottom + 8, left });
    }
    setOpen(!open);
  };

  const presets = ['#18181b','#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#ffffff','#000000'];

  const dropdown = open ? createPortal(
    <div 
      ref={dropdownRef}
      className="fixed z-[9999] bg-white border border-zinc-200 rounded-xl shadow-2xl p-4 w-60"
      style={{ top: dropdownPos.top, left: dropdownPos.left }}
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-zinc-700">{label}</div>
        <button 
          onClick={() => setMode(m => m === 'rgb' ? 'hsv' : 'rgb')}
          className="px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded text-[10px] font-bold text-zinc-600 transition-colors"
        >
          {mode === 'rgb' ? 'HSV' : 'RGB'}
        </button>
      </div>

      <div className="space-y-3 mb-4">
        {mode === 'rgb' ? (
          [['R', r, setR, '#ef4444'], ['G', g, setG, '#22c55e'], ['B', b, setB, '#3b82f6']].map(([lbl, val, set, color]: any) => (
            <div key={lbl} className="flex items-center gap-2">
              <span className="text-[10px] w-4 font-bold text-zinc-500">{lbl}</span>
              <input 
                type="range" min={0} max={255} value={val} 
                onChange={e => { set(+e.target.value); emit(lbl==='R'?+e.target.value:r, lbl==='G'?+e.target.value:g, lbl==='B'?+e.target.value:b, a); }} 
                className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-100 accent-zinc-800 cursor-pointer"
                style={{ background: `linear-gradient(to right, #000, ${color})` }}
              />
              <span className="text-[10px] w-8 text-right text-zinc-600 font-mono font-bold">{val}</span>
            </div>
          ))
        ) : (
          <div className="space-y-3">
            <HSVSquare hue={h} s={s} v={v} onChange={(ns, nv) => updateHsv(h, ns, nv)} />
            
            <div className="flex items-center gap-2">
              <span className="text-[10px] w-4 font-bold text-zinc-500">H</span>
              <input 
                type="range" min={0} max={360} value={h} 
                onChange={e => updateHsv(+e.target.value, s, v)} 
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
              />
              <span className="text-[10px] w-8 text-right text-zinc-600 font-mono font-bold">{h}°</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] w-4 font-bold text-zinc-500">S</span>
              <input 
                type="range" min={0} max={100} value={s} 
                onChange={e => updateHsv(h, +e.target.value, v)} 
                className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-100 accent-zinc-800 cursor-pointer"
                style={{ background: `linear-gradient(to right, #ccc, ${rgbaToStr({r:hsvToRgb(h,100,100).r, g:hsvToRgb(h,100,100).g, b:hsvToRgb(h,100,100).b, a:1})})` }}
              />
              <span className="text-[10px] w-8 text-right text-zinc-600 font-mono font-bold">{s}%</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] w-4 font-bold text-zinc-500">V</span>
              <input 
                type="range" min={0} max={100} value={v} 
                onChange={e => updateHsv(h, s, +e.target.value)} 
                className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-100 accent-zinc-800 cursor-pointer"
                style={{ background: 'linear-gradient(to right, #000, #fff)' }}
              />
              <span className="text-[10px] w-8 text-right text-zinc-600 font-mono font-bold">{v}%</span>
            </div>
          </div>
        )}
        
      <div className="flex items-center gap-2">
        <span className="text-[10px] w-4 font-bold text-zinc-500">A</span>
        <div className="flex-1 relative h-1.5 flex items-center">
          <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, transparent, ${rgbaToStr({r,g,b,a:1})})` }} />
          <input 
            type="range" min={0} max={1} step={0.01} value={a} 
            onChange={e => { setA(+e.target.value); emit(r,g,b,+e.target.value); }} 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="h-1.5 rounded-full bg-transparent w-full border border-zinc-200 pointer-events-none" />
          <div 
            className="absolute h-3 w-3 bg-white border-2 border-zinc-800 rounded-full pointer-events-none shadow-sm"
            style={{ left: `${a * 100}%`, transform: 'translateX(-50%)' }}
          />
        </div>
        <span className="text-[10px] w-8 text-right text-zinc-600 font-mono font-bold">{(a*100).toFixed(0)}%</span>
      </div>
      </div>

      <div className="mb-4 flex items-center gap-3 p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
        <div className="w-10 h-10 rounded-lg border border-zinc-200 shadow-inner" style={{ background: rgbaToStr({r,g,b,a}) }} />
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-zinc-600 font-bold">{rgbaToStr({r,g,b,a})}</span>
          <span className="text-[9px] text-zinc-400 mt-0.5">{mode.toUpperCase()} MODE</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map(p => (
          <button key={p} onClick={() => { const nc=parseRGBA(p); setR(nc.r);setG(nc.g);setB(nc.b);setA(1); onChange(rgbaToStr({r:nc.r,g:nc.g,b:nc.b,a:1})); }}
            className="w-7 h-7 rounded-lg border border-zinc-200 hover:scale-110 transition-transform shadow-sm"
            style={{ background: p }} title={p}
          />
        ))}
        <button onClick={() => onChange('none')} className="w-7 h-7 rounded-lg border border-zinc-200 hover:scale-110 transition-transform text-[10px] font-bold text-zinc-500 bg-white flex items-center justify-center" title="بلا تعبئة">∅</button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleOpen}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm hover:bg-zinc-50 transition-all"
        title={label}
      >
        <div className="w-5 h-5 rounded border border-zinc-300 shadow-inner" style={{ background: value === 'none' ? 'repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 8px)' : value }} />
        <span className="text-xs text-zinc-600 font-medium">{label}</span>
        <ChevronDown className="w-3 h-3 text-zinc-400" />
      </button>
      {dropdown}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [uploadChar, setUploadChar] = useState('');
  const [editingGlyphId, setEditingGlyphId] = useState<string | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);

  const currentProject = projects.find(p => p.id === currentProjectId);
  const glyphs = currentProject?.glyphs ?? [];

  const setGlyphs = (updater: Glyph[] | ((prev: Glyph[]) => Glyph[])) => {
    if (!currentProjectId) return;
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      return { ...p, glyphs: typeof updater === 'function' ? updater(p.glyphs) : updater, lastModified: Date.now() };
    }));
  };

  // Drawing Studio state
  const [isDrawingStudioOpen, setIsDrawingStudioOpen] = useState(false);
  const [studioInitialGlyph, setStudioInitialGlyph] = useState<Glyph | null>(null);
  const [studioFallbackCharName, setStudioFallbackCharName] = useState('');

  // Dropdown & Settings states
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [measureUnit, setMeasureUnit] = useState<'px' | 'pt' | 'em'>('px');
  const [isBgLocked, setIsBgLocked] = useState<boolean>(false);
  const [isBgHidden, setIsBgHidden] = useState<boolean>(false);
  const [isTemplateHidden, setIsTemplateHidden] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<DrawCmd[] | null>(null);



  // ── DB load/save ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadProjectsFromDb().then(ps => {
      if (ps?.length) setProjects(ps);
      else {
        const old=safeLS.get('smart_font_glyphs');
        if (old) {
          try {
            const parsed=JSON.parse(old);
            setProjects([{
              id:Date.now().toString(), name:'مشروع سابق',
              glyphs:parsed.map((g:any)=>({...g,template:g.template||'flat',metrics:g.metrics||{ascent:800,descent:-200},lsb:g.lsb??g.leftGuide??g.bounds.minX,rsb:g.rsb??g.rightGuide??g.bounds.maxX,extraGuides:g.extraGuides||[]})),
              lastModified:Date.now()
            }]);
          } catch {}
        }
      }
      setIsDbLoaded(true);
    }).catch(() => setIsDbLoaded(true));
  }, []);

  useEffect(() => {
    if (isDbLoaded) saveProjectsToDb(projects);
  }, [projects, isDbLoaded]);

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(()=>setSuccess(null),3000); };
  const showError = (msg: string) => { setError(msg); setTimeout(()=>setError(null),5000); };

  // ── SVG upload ───────────────────────────────────────────────────────────────
  const processUploadedSVG = async (file: File, charName: string) => {
    const name = charName.trim() || '!';
    try {
      const text = await fileToSVGText(file);
      const doc = parseSVGStringToDoc(text);
      const svgEl = doc.querySelector('svg');
      if (!svgEl) throw new Error('ملف SVG غير صالح');
      const vb=(svgEl.getAttribute('viewBox')||'0 0 1920 1920').split(/\s+/).map(Number);
      const vbW=vb[2]||1920, vbH=vb[3]||1920;
      const {combinedPath} = extractAllPaths(doc, vbW, vbH);
      if (!combinedPath.trim()) throw new Error('لم تُعثر على مسارات صالحة في الملف');
      const scaled = svgpath(combinedPath).scale(1000/vbW, 1000/vbH).toString();
      const b = calculateExactPathBounds(scaled);
      const zeroed = svgpath(scaled).translate(-b.x1, 0).toString();
      const newMaxX = Math.round(b.x2-b.x1);
      const glyph: Glyph = {
        id:Date.now().toString(), char:name, pathData:zeroed, glyphType:'isolated',
        metrics:{ascent:800,descent:-200},
        bounds:{minX:0,maxX:newMaxX,minY:Math.round(b.y1),maxY:Math.round(b.y2)},
        baselineY:600, rsb:newMaxX+30, lsb:30, extraGuides:[]
      };
      setGlyphs(prev=>[...prev.filter(g=>g.char!==glyph.char),glyph]);
      setUploadChar('');
      showSuccess(`تمت إضافة "${name}"`);
    } catch(err:any) { showError(err.message||'خطأ أثناء معالجة الملف'); }
  };

  // ── Glyph helpers ────────────────────────────────────────────────────────────
  const moveGlyph = (id:string, dx:number, dy:number) => {
    setGlyphs(prev=>prev.map(g=>{
      if(g.id!==id) return g;
      return {...g, pathData:svgpath(g.pathData).translate(dx,dy).toString(),
        bounds:{minX:g.bounds.minX+dx,maxX:g.bounds.maxX+dx,minY:g.bounds.minY+dy,maxY:g.bounds.maxY+dy}};
    }));
  };

  const scaleGlyph = (id:string, f:number) => {
    setGlyphs(prev=>prev.map(g=>{
      if(g.id!==id) return g;
      const midX=(g.bounds.minX+g.bounds.maxX)/2, midY=(g.bounds.minY+g.bounds.maxY)/2;
      const np=svgpath(g.pathData).translate(-midX,-midY).scale(f).translate(midX,midY).toString();
      let b=g.bounds;
      try{const bb=calculateExactPathBounds(np);b={minX:Math.round(bb.x1),maxX:Math.round(bb.x2),minY:Math.round(bb.y1),maxY:Math.round(bb.y2)};}catch{}
      return {...g,pathData:np,bounds:b};
    }));
  };

  const updateGlyph = (id:string, update:Partial<Glyph>) => {
    setGlyphs(prev=>prev.map(g=>g.id===id?{...g,...update}:g));
  };

  // ── Export font ──────────────────────────────────────────────────────────────
  const exportToFont = async () => {
    if (!glyphs.length) { showError('لا توجد محارف للتصدير'); return; }
    try {
      showSuccess('جاري تجهيز الخط...');
      const usedUni=new Set([0]); let pua=0xE000;
      const payloadGlyphs=glyphs.map(g=>{
        const raw=svgpath(g.pathData).translate(-g.lsb,-g.baselineY).scale(1,-1).toString();
        const path=cleanAndNormalizePath(raw);
        const uni=g.char.codePointAt(0)||0;
        const hexes=Array.from(g.char).map((c:string)=>(c.codePointAt(0)||0).toString(16).toUpperCase().padStart(4,'0'));
        let ps=`uni${hexes.join('_')}`;
        if(g.glyphType==='initial') ps+='.init';
        else if(g.glyphType==='medial') ps+='.medi';
        else if(g.glyphType==='final') ps+='.fina';
        let assignedUni=uni;
        if(g.glyphType!=='isolated') assignedUni=pua++;
        else if(usedUni.has(uni)) assignedUni=pua++;
        else usedUni.add(uni);
        let aw=Math.round(g.rsb-g.lsb);
        if(aw<=0) aw=Math.max(100,Math.round(g.bounds.maxX-g.bounds.minX));
        return {name:ps,unicode:Math.round(assignedUni),pathData:path,advanceWidth:Math.round(aw),ascent:g.metrics.ascent,descent:g.metrics.descent};
      });
      const name=(currentProject?.name||'SmartArabicFont').replace(/[^a-zA-Z0-9_\u0600-\u06FF\s-]/g,'').trim();
      const res=await fetch(FONT_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fontName:name||'SmartArabicFont',glyphs:payloadGlyphs})});
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||'فشل توليد الخط');}
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=`${name||'SmartArabicFont'}.ttf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      showSuccess('تم تصدير الخط بنجاح!');
    } catch(err:any) { showError('خطأ: '+err.message); }
  };

  // ── Arabic shaping ───────────────────────────────────────────────────────────
  const NON_JOIN=['ا','أ','إ','آ','د','ذ','ر','ز','و','ؤ','ة','ى','ء'];
  const isDia=(c:string)=>{const code=c?.charCodeAt(0)||0;return(code>=0x064B&&code<=0x065F)||code===0x0670;};
  const isAL=(c:string)=>{
    if(!c) return false; const code=c.charCodeAt(0);
    if(code<0x0600||code>0x06FF||isDia(c)) return false;
    const exc=[0x060C,0x061B,0x061F,0x0660,0x0661,0x0662,0x0663,0x0664,0x0665,0x0666,0x0667,0x0668,0x0669];
    return !exc.includes(code);
  };

  const getShapes=(text:string)=>{
    const res:{char:string;pos:'isolated'|'initial'|'medial'|'final'}[]=[];
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c===' '||!isAL(c)){res.push({char:c,pos:'isolated'});continue;}
      let prev:string|null=null;
      for(let j=i-1;j>=0;j--){if(!isDia(text[j])){prev=text[j];break;}}
      let next:string|null=null;
      for(let j=i+1;j<text.length;j++){if(!isDia(text[j])){next=text[j];break;}}
      const jp=c!=='ء'&&prev&&isAL(prev)&&!NON_JOIN.includes(prev)&&prev!=='ء';
      const jn=c!=='ء'&&!NON_JOIN.includes(c)&&next&&isAL(next)&&next!=='ء';
      let pos:'isolated'|'initial'|'medial'|'final'='isolated';
      if(jp&&jn)pos='medial'; else if(jp)pos='final'; else if(jn)pos='initial';
      res.push({char:c,pos});
    }
    return res;
  };

  const renderPreview=()=>{
    if(!inputText) return null;
    const shaped=getShapes(inputText);
    const matched:(Glyph|{isSpace:true,aw:number})[]=[];
    let i=0;
    while(i<shaped.length){
      let found=false;
      for(let len=Math.min(5,shaped.length-i);len>1;len--){
        const sub=shaped.slice(i,i+len).map(s=>s.char).join('');
        const lg=glyphs.find(g=>g.char===sub);
        if(lg){matched.push(lg);i+=len;found=true;break;}
      }
      if(found) continue;
      const {char,pos}=shaped[i];
      if(char===' '){matched.push({isSpace:true,aw:300});i++;continue;}
      let g=glyphs.find(g=>g.char===char&&g.glyphType===pos)
        ||glyphs.find(g=>g.char===char&&g.glyphType==='isolated')
        ||glyphs.find(g=>g.char===char);
      if(g) matched.push(g);
      i++;
    }
    if(!matched.length) return null;
    let cx=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    const items=matched.map((g,idx)=>{
      if('isSpace' in g){cx-=g.aw;return null;}
      let aw=Math.round(g.rsb-g.lsb);
      if(aw<=0) aw=Math.max(100,Math.round(g.bounds.maxX-g.bounds.minX));
      const el=(
        <g key={`${g.id}-${idx}`} transform={`translate(${cx},0)`}>
          <g transform={`translate(${-g.rsb},${-g.baselineY})`}>
            <path d={g.pathData} fill="currentColor" opacity="0.9" />
          </g>
        </g>
      );
      const tMinX=g.bounds.minX-g.rsb,tMaxX=g.bounds.maxX-g.rsb;
      const tMinY=g.bounds.minY-g.baselineY,tMaxY=g.bounds.maxY-g.baselineY;
      minX=Math.min(minX,cx+tMinX);maxX=Math.max(maxX,cx+tMaxX);
      minY=Math.min(minY,tMinY);maxY=Math.max(maxY,tMaxY);
      cx-=aw;
      return el;
    });
    const pad=100;
    const vb=`${minX-pad} ${minY-pad} ${(maxX-minX)+pad*2} ${(maxY-minY)+pad*2}`;
    return (
      <svg viewBox={vb} className="w-full h-full max-h-[400px]">
        <line x1={minX-pad} y1={0} x2={maxX+pad} y2={0} stroke="#3b82f6" strokeWidth="2" strokeDasharray="10,10" opacity="0.5" />
        {items}
      </svg>
    );
  };

  // ── Confirm dialog ────────────────────────────────────────────────────────────
  const renderConfirm=()=>{
    if(!confirmDialog?.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/80 backdrop-blur-md p-4" dir="rtl">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
          <h3 className="text-base font-bold text-zinc-900 mb-2">تأكيد الإجراء</h3>
          <p className="text-xs text-zinc-600 mb-6 leading-relaxed">{confirmDialog.message}</p>
          <div className="flex gap-3 justify-end">
            <button onClick={()=>setConfirmDialog(null)} className="px-4 py-2 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full font-bold hover:bg-zinc-200 transition-all text-xs">إلغاء</button>
            <button onClick={()=>{confirmDialog.onConfirm();setConfirmDialog(null);}} className="px-4 py-2 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-all text-xs">تأكيد</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  const renderDashboard=()=>(
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      {renderConfirm()}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center">
            <Type className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">مُحاذي الخطوط الذكي</h1>
            <p className="text-[10px] text-zinc-500 font-medium">أداة ضبط ومحاذاة الحروف العربية</p>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8" dir="rtl">
          <h2 className="text-xl font-bold">مشاريع الخطوط</h2>
          <button onClick={()=>setIsCreatingProject(true)} className="px-4 py-2 bg-zinc-900 text-white rounded-full font-bold hover:bg-black transition-colors flex items-center gap-2 text-xs">
            <Plus className="w-3.5 h-3.5" /> مشروع جديد
          </button>
        </div>
        {isCreatingProject && (
          <div className="mb-8 p-6 bg-zinc-50 border border-zinc-200 rounded-3xl flex items-center gap-4" dir="rtl">
            <input type="text" value={newProjectName} onChange={e=>setNewProjectName(e.target.value)} placeholder="اسم المشروع..." autoFocus onKeyDown={e=>e.key==='Enter'&&createProject()} className="flex-1 bg-white border border-zinc-300 rounded-full px-5 py-2.5 text-sm focus:outline-none focus:border-zinc-500 text-right" />
            <button onClick={createProject} className="px-5 py-2.5 bg-zinc-900 text-white rounded-full font-bold text-xs hover:bg-black">إنشاء</button>
            <button onClick={()=>{setIsCreatingProject(false);setNewProjectName('');}} className="px-5 py-2.5 border border-zinc-300 text-zinc-600 rounded-full font-semibold text-xs hover:bg-zinc-50">إلغاء</button>
          </div>
        )}
        {!projects.length && !isCreatingProject ? (
          <div className="text-center py-20 bg-zinc-50 border border-zinc-200 rounded-3xl" dir="rtl">
            <Type className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-zinc-700 mb-2">لا توجد مشاريع</h3>
            <p className="text-zinc-500 text-sm">أنشئ مشروعاً جديداً للبدء.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" dir="rtl">
            {projects.map(p=>(
              <div key={p.id} onClick={()=>setCurrentProjectId(p.id)} className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6 hover:border-zinc-400 transition-all group relative cursor-pointer flex flex-col">
                <button onClick={e=>{e.stopPropagation();setConfirmDialog({isOpen:true,message:'حذف المشروع نهائياً؟',onConfirm:()=>{setProjects(ps=>ps.filter(x=>x.id!==p.id));if(currentProjectId===p.id)setCurrentProjectId(null);}});}} className="absolute top-4 left-4 px-2.5 py-1.5 bg-red-50 hover:bg-red-500 text-red-400 hover:text-white border border-red-200 rounded-xl transition-all z-10 flex items-center gap-1.5 text-[10px] font-bold">
                  <Trash2 className="w-3.5 h-3.5" /><span>حذف</span>
                </button>
                <div className="w-11 h-11 bg-zinc-200 rounded-2xl flex items-center justify-center mb-4">
                  <Type className="w-5 h-5 text-zinc-600" />
                </div>
                <h3 className="text-lg font-bold mb-2">{p.name}</h3>
                <div className="flex gap-3 text-xs text-zinc-500 mb-6">
                  <span>{p.glyphs.length} محرف</span><span>•</span>
                  <span>{new Date(p.lastModified).toLocaleDateString('ar-SA')}</span>
                </div>
                <div className="mt-auto flex justify-end items-center gap-1.5 text-xs font-semibold text-zinc-600 group-hover:gap-2.5 transition-all">
                  <span>فتح</span><ArrowRight className="w-3.5 h-3.5 rotate-180" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );

  const createProject=()=>{
    if(!newProjectName.trim()){showError('أدخل اسم المشروع');return;}
    const p:Project={id:Date.now().toString(),name:newProjectName.trim(),glyphs:[],lastModified:Date.now()};
    setProjects(ps=>[p,...ps]); setNewProjectName(''); setIsCreatingProject(false); setCurrentProjectId(p.id);
  };

  // ── Glyph Editor Modal ────────────────────────────────────────────────────────
  const renderGlyphEditor=()=>{
    if(!editingGlyphId) return null;
    const g=glyphs.find(x=>x.id===editingGlyphId); if(!g) return null;
    const mW=Math.max(1,g.rsb-g.lsb), mH=Math.max(1,g.metrics.ascent-g.metrics.descent);
    const pad=Math.max(mW,mH)*0.3;
    const vbX=Math.min(g.bounds.minX,g.lsb)-pad, vbY=Math.min(g.bounds.minY,g.baselineY-g.metrics.ascent)-pad;
    const vbW=Math.max(1,Math.max(g.bounds.maxX,g.rsb)+pad-vbX);
    const vbH=Math.max(1,Math.max(g.bounds.maxY,g.baselineY-g.metrics.descent)+pad-vbY);
    const vb=`${vbX} ${vbY} ${vbW} ${vbH}`;
    return (
      <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-md flex items-center justify-center p-4 lg:p-8" dir="rtl">
        <div className="bg-white border border-zinc-200 rounded-3xl w-full max-w-6xl max-h-full flex flex-col shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-zinc-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-zinc-700">المحرف:</span>
              <input type="text" value={g.char} onChange={e=>updateGlyph(g.id,{char:e.target.value})} className="bg-zinc-50 border border-zinc-300 rounded-xl px-2.5 py-1 text-sm font-semibold focus:outline-none w-16 text-center" />
              <select value={g.glyphType} onChange={e=>updateGlyph(g.id,{glyphType:e.target.value as any})} className="bg-zinc-50 border border-zinc-300 text-xs rounded-full px-4 py-1.5 focus:outline-none">
                <option value="isolated">منفصل</option><option value="initial">بداية</option>
                <option value="medial">وسط</option><option value="final">نهاية</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={()=>setConfirmDialog({isOpen:true,message:'حذف المحرف؟',onConfirm:()=>{setGlyphs(p=>p.filter(x=>x.id!==g.id));setEditingGlyphId(null);}})} className="flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:bg-red-500 hover:text-white rounded-full transition-all text-xs font-semibold border border-red-200">
                <Trash2 className="w-3.5 h-3.5" /> حذف
              </button>
              <button onClick={()=>setEditingGlyphId(null)} className="w-8 h-8 flex items-center justify-center bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-full hover:bg-zinc-200 transition-all font-bold">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="bg-zinc-50 rounded-3xl p-4 flex items-center justify-center min-h-[400px] border border-zinc-200 overflow-hidden">
                <svg viewBox={vb} className="w-full h-full">
                  <line x1={vbX} y1={g.baselineY-g.metrics.ascent} x2={vbX+vbW} y2={g.baselineY-g.metrics.ascent} stroke="#888" strokeWidth={Math.max(1,vbH*0.0015)} strokeDasharray="4,4" opacity="0.4" />
                  <text x={vbX+vbW*0.02} y={g.baselineY-g.metrics.ascent-vbH*0.02} fill="#888" fontSize={vbH*0.025} fontFamily="sans-serif">Ascent</text>
                  <line x1={vbX} y1={g.baselineY-g.metrics.descent} x2={vbX+vbW} y2={g.baselineY-g.metrics.descent} stroke="#888" strokeWidth={Math.max(1,vbH*0.0015)} strokeDasharray="4,4" opacity="0.4" />
                  <text x={vbX+vbW*0.02} y={g.baselineY-g.metrics.descent+vbH*0.04} fill="#888" fontSize={vbH*0.025} fontFamily="sans-serif">Descent</text>
                  <line x1={vbX} y1={g.baselineY} x2={vbX+vbW} y2={g.baselineY} stroke="#3b82f6" strokeWidth={Math.max(1,vbH*0.002)} opacity="0.6" />
                  <text x={vbX+vbW*0.02} y={g.baselineY-vbH*0.02} fill="#3b82f6" fontSize={vbH*0.025} fontFamily="sans-serif">Baseline</text>
                  <line x1={g.rsb} y1={vbY} x2={g.rsb} y2={vbY+vbH} stroke="#10b981" strokeWidth={Math.max(1,vbW*0.002)} opacity="0.6" />
                  <text x={g.rsb+vbW*0.01} y={vbY+vbH*0.1} fill="#10b981" fontSize={vbH*0.025} fontFamily="sans-serif">RSB</text>
                  <line x1={g.lsb} y1={vbY} x2={g.lsb} y2={vbY+vbH} stroke="#f43f5e" strokeWidth={Math.max(1,vbW*0.002)} opacity="0.6" />
                  <text x={g.lsb-vbW*0.06} y={vbY+vbH*0.1} fill="#f43f5e" fontSize={vbH*0.025} fontFamily="sans-serif">LSB</text>
                  <rect x={g.lsb} y={g.baselineY-g.metrics.ascent} width={mW} height={mH} fill="rgba(0,0,0,0.02)" stroke="rgba(0,0,0,0.15)" strokeWidth={Math.max(1,vbW*0.002)} strokeDasharray={`${vbW*0.01},${vbW*0.01}`} />
                  <path d={g.pathData} fill="currentColor" className="text-zinc-900" />
                  {(g.extraGuides||[]).map((guide,idx)=>(
                    <g key={idx}>
                      <line x1={vbX} y1={guide} x2={vbX+vbW} y2={guide} stroke="#a855f7" strokeWidth={Math.max(1,vbH*0.0015)} strokeDasharray="4,4" opacity="0.4" />
                      <text x={vbX+vbW*0.02} y={guide-vbH*0.01} fill="#a855f7" fontSize={vbH*0.02} fontFamily="sans-serif">دليل {idx+1}</text>
                    </g>
                  ))}
                </svg>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-zinc-500 font-semibold" dir="rtl">تحريك المحرف</span>
                <div className="grid grid-cols-3 gap-2 w-fit">
                  <div/><button onClick={()=>moveGlyph(g.id,0,-10)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-200 text-xs font-bold">↑</button><div/>
                  <button onClick={()=>moveGlyph(g.id,-10,0)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-200 text-xs font-bold">←</button>
                  <button onClick={()=>moveGlyph(g.id,0,10)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-200 text-xs font-bold">↓</button>
                  <button onClick={()=>moveGlyph(g.id,10,0)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-200 text-xs font-bold">→</button>
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-zinc-800 mb-2" dir="rtl">المقاييس</h3>
                {([['Ascent','ascent'],['Descent','descent']] as [string,keyof Glyph['metrics']][]).map(([lbl,k])=>(
                  <div key={k}>
                    <label className="text-[10px] font-semibold text-zinc-500 block mb-1">{lbl}</label>
                    <input type="number" value={g.metrics[k]} onChange={e=>updateGlyph(g.id,{metrics:{...g.metrics,[k]:Number(e.target.value)}})} className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs focus:outline-none text-center" />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1">Baseline Y</label>
                  <input type="number" value={g.baselineY} onChange={e=>updateGlyph(g.id,{baselineY:Number(e.target.value)})} className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs focus:outline-none text-center" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1">RSB (يمين)</label>
                  <input type="number" value={g.rsb} onChange={e=>updateGlyph(g.id,{rsb:Number(e.target.value)})} className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs focus:outline-none text-center" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1">LSB (يسار)</label>
                  <input type="number" value={g.lsb} onChange={e=>updateGlyph(g.id,{lsb:Number(e.target.value)})} className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs focus:outline-none text-center" />
                </div>
                {g.rsb<=g.lsb && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-xs" dir="rtl">⚠️ RSB أصغر من LSB — سيُستخدم عرض تلقائي.</div>
                )}
                <div className="flex gap-2 pt-2">
                  <button onClick={()=>scaleGlyph(g.id,0.9)} className="flex-1 bg-white border border-zinc-200 py-1.5 rounded-xl text-[11px] font-bold hover:bg-zinc-100 transition-all">تصغير −10%</button>
                  <button onClick={()=>scaleGlyph(g.id,1.1)} className="flex-1 bg-white border border-zinc-200 py-1.5 rounded-xl text-[11px] font-bold hover:bg-zinc-100 transition-all">تكبير +10%</button>
                </div>
                <div className="pt-3 border-t border-zinc-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-zinc-500">أدلة إضافية</span>
                    <button onClick={()=>updateGlyph(g.id,{extraGuides:[...(g.extraGuides||[]),g.baselineY-100]})} className="text-[10px] px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-full font-bold hover:bg-zinc-200">+ إضافة</button>
                  </div>
                  {(g.extraGuides||[]).map((guide,idx)=>(
                    <div key={idx} className="flex items-center gap-2 mb-1.5">
                      <input type="number" value={guide} onChange={e=>{const ng=[...(g.extraGuides||[])];ng[idx]=Number(e.target.value);updateGlyph(g.id,{extraGuides:ng});}} className="flex-1 bg-white border border-zinc-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none text-center" />
                      <button onClick={()=>{const ng=[...(g.extraGuides||[])];ng.splice(idx,1);updateGlyph(g.id,{extraGuides:ng});}} className="p-1.5 bg-zinc-50 border border-zinc-200 rounded-full hover:bg-red-500 hover:text-white transition-all"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>{setEditingGlyphId(null);setStudioInitialGlyph(g); setStudioFallbackCharName(g.char); setIsDrawingStudioOpen(true);}} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2">
                  <PenTool className="w-4 h-4" /> تعديل في استوديو الرسم
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Drawing Studio ────────────────────────────────────────────────────────────

  // ── Project editor ─────────────────────────────────────────────────────────
  if (!currentProjectId) return renderDashboard();

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      {renderConfirm()}
      <div ref={hiddenContainerRef} className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden" aria-hidden="true" />
      {renderGlyphEditor()}
      {isDrawingStudioOpen && (
        <DrawingStudio
          isOpen={isDrawingStudioOpen}
          initialGlyph={studioInitialGlyph}
          fallbackCharName={studioFallbackCharName}
          onClose={() => setIsDrawingStudioOpen(false)}
          onSave={(data) => {
            const glyph: Glyph = {
              id: data.id || Date.now().toString(),
              char: data.char,
              pathData: data.pathData,
              glyphType: data.glyphType,
              metrics: data.metrics,
              bounds: data.bounds,
              baselineY: data.baselineY,
              lsb: data.lsb,
              rsb: data.rsb,
              extraGuides: data.extraGuides
            };
            setGlyphs(prev => [...prev.filter(g => g.id !== glyph.id && g.char !== glyph.char), glyph]);
            setIsDrawingStudioOpen(false);
            showSuccess((data.id ? 'تم تعديل' : 'تم حفظ') + ` "${data.char}"`);
            setEditingGlyphId(glyph.id);
          }}
        />
      )}

      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center">
              <Type className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-zinc-900">{currentProject?.name||'Smart Font Aligner'}</h1>
              <p className="text-[10px] text-zinc-500 font-medium">أداة ضبط ومحاذاة الحروف العربية</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {error&&<div className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-full text-xs">{error}</div>}
            {success&&<div className="px-3 py-1.5 bg-green-50 border border-green-200 text-green-600 rounded-full text-xs flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{success}</div>}
            <button onClick={()=>setCurrentProjectId(null)} className="px-4 py-2 bg-zinc-50 text-zinc-800 border border-zinc-200 rounded-full font-bold hover:bg-zinc-200 transition-colors flex items-center gap-2 text-xs">
              <ArrowRight className="w-3.5 h-3.5" /> المشاريع
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left col */}
        <div className="lg:col-span-4 space-y-6">
          {/* Upload */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6">
            <h2 className="text-base font-bold mb-4 flex items-center gap-2" dir="rtl">
              <Upload className="w-4 h-4 text-zinc-500" /> إضافة محرف جديد
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5" dir="rtl">اسم المحرف</label>
                <input type="text" value={uploadChar} onChange={e=>setUploadChar(e.target.value)} placeholder="أدخل الحرف..." className="w-full bg-white border border-zinc-300 rounded-2xl px-4 py-2.5 text-xs focus:outline-none focus:border-zinc-500 transition-all text-right" dir="rtl" />
              </div>
              <div className="relative group">
                <input type="file" accept=".svg,.svgz" onChange={e=>{const f=e.target.files?.[0];if(f)processUploadedSVG(f,uploadChar);e.target.value='';}} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
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
              <button onClick={()=>{
                setStudioInitialGlyph(null);
                setStudioFallbackCharName(uploadChar || '');
                setIsDrawingStudioOpen(true);
              }} className="w-full py-3 bg-teal-600/10 hover:bg-teal-600/20 text-teal-600 border border-teal-500/20 rounded-2xl text-xs font-bold flex items-center justify-center gap-2" dir="rtl">
                <PenTool className="w-3.5 h-3.5" /> استوديو الرسم المباشر
              </button>
            </div>
          </div>

          {/* Glyph library */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6">
            <h2 className="text-base font-bold mb-4 flex items-center gap-2" dir="rtl">
              <Save className="w-4 h-4 text-zinc-500" /> مكتبة المحارف ({glyphs.length})
            </h2>
            {!glyphs.length ? (
              <div className="text-center py-12 text-zinc-400 text-xs border-2 border-dashed border-zinc-200 rounded-3xl" dir="rtl">لا توجد محارف. أضف محرفاً للبدء.</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                {glyphs.map(g=>{
                  const mW=Math.max(1,g.rsb-g.lsb), mH=Math.max(1,g.metrics.ascent-g.metrics.descent);
                  const pad=Math.max(mW,mH)*0.3;
                  const vb=`${g.lsb-pad} ${g.baselineY-g.metrics.ascent-pad} ${mW+pad*2} ${mH+pad*2}`;
                  return (
                    <div key={g.id} onClick={()=>setEditingGlyphId(g.id)} className="group relative bg-white border border-zinc-200 rounded-2xl p-2.5 flex flex-col items-center gap-1.5 hover:border-zinc-400 transition-all cursor-pointer">
                      <button onClick={e=>{e.stopPropagation();setConfirmDialog({isOpen:true,message:'حذف المحرف؟',onConfirm:()=>setGlyphs(p=>p.filter(x=>x.id!==g.id))});}} className="absolute top-1 right-1 p-1 bg-red-50 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white z-10"><Trash2 className="w-3 h-3" /></button>
                      <button onClick={e=>{e.stopPropagation();setStudioInitialGlyph(g); setStudioFallbackCharName(g.char); setIsDrawingStudioOpen(true);}} className="absolute top-1 left-1 p-1 bg-teal-50 text-teal-500 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-teal-500 hover:text-white z-10"><PenTool className="w-3 h-3" /></button>
                      <div className="w-full aspect-square bg-zinc-50 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-100">
                        <svg viewBox={vb} className="w-full h-full p-2">
                          <path d={g.pathData} fill="currentColor" className="text-zinc-900" />
                        </svg>
                      </div>
                      <div className="text-center w-full">
                        <div className="font-bold text-sm truncate text-zinc-800" dir="rtl">{g.char==='!'?'؟':g.char}</div>
                        <div className="text-[9px] text-zinc-400">{g.glyphType==='isolated'?'منفصل':g.glyphType==='initial'?'بداية':g.glyphType==='medial'?'وسط':'نهاية'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right col */}
        <div className="lg:col-span-8 space-y-6">
          {/* Preview */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold flex items-center gap-2" dir="rtl">
                <Keyboard className="w-4 h-4 text-zinc-500" /> معاينة حية
              </h2>
              <button onClick={exportToFont} className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-black text-white rounded-full text-xs font-bold transition-all">
                <Download className="w-3.5 h-3.5" /> تصدير TTF
              </button>
            </div>
            <input type="text" value={inputText} onChange={e=>setInputText(e.target.value)} placeholder="اكتب هنا لمعاينة الخط..." className="w-full bg-white border border-zinc-200 rounded-2xl px-5 py-3.5 text-lg focus:outline-none focus:border-zinc-400 transition-all text-right mb-5" dir="rtl" />
            <div className="w-full aspect-video bg-white border border-zinc-200 rounded-3xl relative overflow-hidden flex items-center justify-center p-8">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000005_1px,transparent_1px),linear-gradient(to_bottom,#00000005_1px,transparent_1px)] bg-[size:40px_40px]" />
              <div className="relative z-10 w-full h-full flex items-center justify-center text-zinc-900">
                {inputText ? renderPreview() : (
                  <div className="text-zinc-400 flex flex-col items-center gap-2.5">
                    <Type className="w-10 h-10 opacity-30" />
                    <p className="text-xs">اكتب لرؤية النتيجة</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Guide */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6">
            <h3 className="text-zinc-700 font-bold text-sm flex items-center gap-2 mb-3" dir="rtl">
              <Info className="w-4 h-4 text-zinc-500" /> دليل المقاييس
            </h3>
            <ul className="text-xs text-zinc-600 space-y-2.5 leading-relaxed" dir="rtl">
              <li><strong className="text-zinc-800">Baseline:</strong> السطر الذي تجلس عليه الحروف.</li>
              <li><strong className="text-zinc-800">Ascent:</strong> أقصى ارتفاع مسموح (سقف الحرف).</li>
              <li><strong className="text-zinc-800">Descent:</strong> أقصى نزول مسموح تحت السطر.</li>
              <li><strong className="text-zinc-800">RSB:</strong> نقطة بداية الحرف من اليمين.</li>
              <li><strong className="text-zinc-800">LSB:</strong> نقطة نهاية الحرف من اليسار.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;