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

// ─── Types ────────────────────────────────────────────────────────────────────
type ToolMode = 'select' | 'move' | 'pen';
type DrawModeType = 'line' | 'curve';
type DrawCmd = {
  type: string; x: number; y: number;
  cx?: number; cy?: number;
  cx1?: number; cy1?: number;
  cx2?: number; cy2?: number;
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
  const [drawCharName, setDrawCharName] = useState('');
  const [drawGlyphType, setDrawGlyphType] = useState<'isolated' | 'initial' | 'medial' | 'final'>('isolated');
  const [drawingGlyphId, setDrawingGlyphId] = useState<string | null>(null);

  // Tool mode: select = pointer/select nodes, move = drag whole shape, pen = draw
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [drawMode, setDrawMode] = useState<DrawModeType>('line');

  const [drawCommands, setDrawCommands] = useState<DrawCmd[]>([]);
  const [undoStack, setUndoStack] = useState<DrawCmd[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawCmd[][]>([]);

  const [selectedNodeIndices, setSelectedNodeIndices] = useState<number[]>([]);
  const [isShapeSelected, setIsShapeSelected] = useState(false);

  // Cursor & control point (for pen tool preview)
  const [cursorX, setCursorX] = useState(500);
  const [cursorY, setCursorY] = useState(600);

  // View
  const [viewBox, setViewBox] = useState({ x: -100, y: -200, w: 1200, h: 1000 });
  const [showGrid, setShowGrid] = useState(true);

  // Drag state
  type DragType = 'node' | 'node-ctrl-quad' | 'node-ctrl-cubic-in' | 'node-ctrl-cubic-out' | 'node-ctrl-close-in' | 'node-ctrl-close-out' | 'shape' | 'pan' | 'selection' | 'cursor';
  const [dragging, setDragging] = useState<{ type: DragType; index?: number } | null>(null);
  const [panStart, setPanStart] = useState<{ mx: number; my: number; vbX: number; vbY: number } | null>(null);
  const [shapeDragStart, setShapeDragStart] = useState<{ mx: number; my: number; cmds: DrawCmd[] } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

  // Style
  const [fillColor, setFillColor] = useState('rgba(0,0,0,0.85)');
  const [strokeColor, setStrokeColor] = useState('none');
  const [hasMoved, setHasMoved] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── History helpers ──────────────────────────────────────────────────────────
  const pushCmds = (newCmds: DrawCmd[]) => {
    setUndoStack(s => [...s, drawCommands]);
    setRedoStack([]);
    setDrawCommands(newCmds);
  };

  const handleUndo = useCallback(() => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0,-1));
    setRedoStack(s => [...s, drawCommands]);
    setDrawCommands(prev);
  }, [undoStack, drawCommands]);

  const handleRedo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0,-1));
    setUndoStack(s => [...s, drawCommands]);
    setDrawCommands(next);
  }, [redoStack, drawCommands]);

  // ── SVG coordinate conversion ────────────────────────────────────────────────
  const getSvgPt = (e: React.MouseEvent<any> | React.TouchEvent<any>): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const svg = svgRef.current;
    let cx = 0, cy = 0;
    if ('touches' in e) {
      if (!e.touches.length) return null;
      cx = e.touches[0].clientX; cy = e.touches[0].clientY;
    } else {
      cx = (e as React.MouseEvent).clientX; cy = (e as React.MouseEvent).clientY;
    }
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(svgPt.x), y: Math.round(svgPt.y) };
  };

  const snap = (v: number, s = 5) => Math.round(v / s) * s;

  // ── Compile SVG path string ──────────────────────────────────────────────────
  const compilePath = (cmds: DrawCmd[] = drawCommands): string => {
    let d = '';
    let lastM = { x: 0, y: 0 };
    cmds.forEach((cmd, i) => {
      if (cmd.type === 'M') {
        d += `M${cmd.x} ${cmd.y} `;
        lastM = { x: cmd.x, y: cmd.y };
      } else if (cmd.type === 'L') {
        if (cmd.cx1 != null && cmd.cy1 != null && cmd.cx2 != null && cmd.cy2 != null)
          d += `C${cmd.cx1} ${cmd.cy1} ${cmd.cx2} ${cmd.cy2} ${cmd.x} ${cmd.y} `;
        else if (cmd.cx != null && cmd.cy != null)
          d += `Q${cmd.cx} ${cmd.cy} ${cmd.x} ${cmd.y} `;
        else d += `L${cmd.x} ${cmd.y} `;
      } else if (cmd.type === 'C') {
        if (cmd.cx1 != null && cmd.cy1 != null && cmd.cx2 != null && cmd.cy2 != null)
          d += `C${cmd.cx1} ${cmd.cy1} ${cmd.cx2} ${cmd.cy2} ${cmd.x} ${cmd.y} `;
        else d += `L${cmd.x} ${cmd.y} `;
      } else if (cmd.type === 'Q' && cmd.cx != null && cmd.cy != null) {
        d += `Q${cmd.cx} ${cmd.cy} ${cmd.x} ${cmd.y} `;
      } else if (cmd.type === 'Z') {
        if (cmd.cx1 != null && cmd.cy1 != null && cmd.cx2 != null && cmd.cy2 != null)
          d += `C${cmd.cx1} ${cmd.cy1} ${cmd.cx2} ${cmd.cy2} ${lastM.x} ${lastM.y} Z `;
        else d += 'Z ';
      }
    });
    return d.trim();
  };

  // ── Auto-center ──────────────────────────────────────────────────────────────
  const autoCenter = () => {
    if (!drawCommands.length) return;
    const b = calculateExactPathBounds(compilePath());
    if (!isFinite(b.x1)) return;
    const dx = 500 - (b.x1 + b.x2) / 2;
    pushCmds(drawCommands.map(c => ({
      ...c, x: c.x+dx,
      cx: c.cx != null ? c.cx+dx : undefined,
      cx1: c.cx1 != null ? c.cx1+dx : undefined,
      cx2: c.cx2 != null ? c.cx2+dx : undefined,
    })));
  };

  const scalePath = (f: number) => {
    if (!drawCommands.length) return;
    let mnX=Infinity, mxX=-Infinity, mnY=Infinity, mxY=-Infinity;
    drawCommands.forEach(c => { mnX=Math.min(mnX,c.x);mxX=Math.max(mxX,c.x);mnY=Math.min(mnY,c.y);mxY=Math.max(mxY,c.y); });
    const cx=(mnX+mxX)/2, cy=(mnY+mxY)/2;
    pushCmds(drawCommands.map(c => ({
      ...c, x: cx+(c.x-cx)*f, y: cy+(c.y-cy)*f,
      cx: c.cx != null ? cx+(c.cx-cx)*f : undefined,
      cy: c.cy != null ? cy+(c.cy-cy)*f : undefined,
      cx1: c.cx1 != null ? cx+(c.cx1-cx)*f : undefined,
      cy1: c.cy1 != null ? cy+(c.cy1-cy)*f : undefined,
      cx2: c.cx2 != null ? cx+(c.cx2-cx)*f : undefined,
      cy2: c.cy2 != null ? cy+(c.cy2-cy)*f : undefined,
    })));
  };

  const rotateShape = (deg: number) => {
    if (!drawCommands.length) return;
    let mnX=Infinity, mxX=-Infinity, mnY=Infinity, mxY=-Infinity;
    drawCommands.forEach(c => { if(c.type!=='Z'){mnX=Math.min(mnX,c.x);mxX=Math.max(mxX,c.x);mnY=Math.min(mnY,c.y);mxY=Math.max(mxY,c.y);} });
    if (!isFinite(mnX)) return;
    const cx=(mnX+mxX)/2, cy=(mnY+mxY)/2;
    const rad=deg*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
    const rot = (px:number, py:number) => ({
      x: Math.round(cx + (px-cx)*cos - (py-cy)*sin),
      y: Math.round(cy + (px-cx)*sin + (py-cy)*cos)
    });
    pushCmds(drawCommands.map(c => {
      if (c.type==='Z') return c;
      const m=rot(c.x,c.y);
      const nc: DrawCmd = { ...c, x:m.x, y:m.y };
      if(c.cx!=null&&c.cy!=null){const r=rot(c.cx,c.cy);nc.cx=r.x;nc.cy=r.y;}
      if(c.cx1!=null&&c.cy1!=null){const r=rot(c.cx1,c.cy1);nc.cx1=r.x;nc.cy1=r.y;}
      if(c.cx2!=null&&c.cy2!=null){const r=rot(c.cx2,c.cy2);nc.cx2=r.x;nc.cy2=r.y;}
      return nc;
    }));
    showSuccess(`دوران ${deg}°`);
  };

  const flipH = () => {
    if (!drawCommands.length) return;
    let mn=Infinity, mx=-Infinity;
    drawCommands.forEach(c => { if(c.type!=='Z'){mn=Math.min(mn,c.x);mx=Math.max(mx,c.x);} });
    if (!isFinite(mn)) return;
    const cx=(mn+mx)/2;
    pushCmds(drawCommands.map(c => {
      if(c.type==='Z') return c;
      const nc: DrawCmd = { ...c, x: Math.round(2*cx-c.x) };
      if(c.cx!=null) nc.cx=Math.round(2*cx-c.cx);
      if(c.cx1!=null) nc.cx1=Math.round(2*cx-c.cx1);
      if(c.cx2!=null) nc.cx2=Math.round(2*cx-c.cx2);
      return nc;
    }));
    showSuccess('قلب أفقي');
  };

  const flipV = () => {
    if (!drawCommands.length) return;
    let mn=Infinity, mx=-Infinity;
    drawCommands.forEach(c => { if(c.type!=='Z'){mn=Math.min(mn,c.y);mx=Math.max(mx,c.y);} });
    if (!isFinite(mn)) return;
    const cy=(mn+mx)/2;
    pushCmds(drawCommands.map(c => {
      if(c.type==='Z') return c;
      const nc: DrawCmd = { ...c, y: Math.round(2*cy-c.y) };
      if(c.cy!=null) nc.cy=Math.round(2*cy-c.cy);
      if(c.cy1!=null) nc.cy1=Math.round(2*cy-c.cy1);
      if(c.cy2!=null) nc.cy2=Math.round(2*cy-c.cy2);
      return nc;
    }));
    showSuccess('قلب عمودي');
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDrawingStudioOpen) return;
    const h = (e: KeyboardEvent) => {
      if (['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if ((e.ctrlKey||e.metaKey) && e.key==='z') { e.preventDefault(); e.shiftKey ? handleRedo() : handleUndo(); }
      if ((e.ctrlKey||e.metaKey) && e.key==='y') { e.preventDefault(); handleRedo(); }
      if ((e.ctrlKey||e.metaKey) && e.key==='a') { e.preventDefault(); setSelectedNodeIndices(drawCommands.map((_,i)=>i)); }
      if (e.key==='Delete'||e.key==='Backspace') {
        if (selectedNodeIndices.length) {
          e.preventDefault();
          pushCmds(drawCommands.filter((_,i)=>!selectedNodeIndices.includes(i)));
          setSelectedNodeIndices([]);
        }
      }
      if (e.key==='Escape') { setToolMode('select'); setSelectedNodeIndices([]); }
      if (e.key==='v'||e.key==='V') setToolMode('select');
      if (e.key==='g'||e.key==='G') setToolMode('move');
      if (e.key==='p'||e.key==='P') setToolMode('pen');
      
      // Nudge points
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && selectedNodeIndices.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key==='ArrowLeft'?-step : e.key==='ArrowRight'?step : 0;
        const dy = e.key==='ArrowUp'?-step : e.key==='ArrowDown'?step : 0;
        pushCmds(drawCommands.map((c,i) => {
          if(!selectedNodeIndices.includes(i)) return c;
          const nc = {...c, x:c.x+dx, y:c.y+dy};
          if(c.cx!=null)nc.cx=c.cx+dx; if(c.cy!=null)nc.cy=c.cy+dy;
          if(c.cx1!=null)nc.cx1=c.cx1+dx; if(c.cy1!=null)nc.cy1=c.cy1+dy;
          if(c.cx2!=null)nc.cx2=c.cx2+dx; if(c.cy2!=null)nc.cy2=c.cy2+dy;
          return nc;
        }));
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isDrawingStudioOpen, handleUndo, handleRedo, drawCommands, selectedNodeIndices]);

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  const zoom = (f: number) => {
    setViewBox(p => {
      const nw=p.w*f, nh=p.h*f;
      return { x: p.x+(p.w-nw)/2, y: p.y+(p.h-nh)/2, w: nw, h: nh };
    });
  };

  // ── Pointer event handlers ───────────────────────────────────────────────────
  const onPointerDown = (
    e: React.MouseEvent<any>|React.TouchEvent<any>,
    type: DragType,
    index?: number
  ) => {
    setHasMoved(false);
    e.stopPropagation();
    if (type==='node'||type.startsWith('node-ctrl')) {
      setUndoStack(s => [...s, drawCommands]);
      setRedoStack([]);
      if (index!=null && !selectedNodeIndices.includes(index))
        setSelectedNodeIndices([index]);
    }
    if (type==='pan') {
      let mx=0,my=0;
      if('touches' in e){mx=e.touches[0].clientX;my=e.touches[0].clientY;}
      else{mx=(e as React.MouseEvent).clientX;my=(e as React.MouseEvent).clientY;}
      setPanStart({mx,my,vbX:viewBox.x,vbY:viewBox.y});
    }
    if (type==='shape') {
      const pt=getSvgPt(e);
      if(pt){
        setShapeDragStart({mx:pt.x,my:pt.y,cmds:JSON.parse(JSON.stringify(drawCommands))});
        setUndoStack(s=>[...s,drawCommands]);
        setRedoStack([]);
      }
    }
    if (type==='selection') {
      const pt=getSvgPt(e);
      if(pt){setSelectionStart(pt);setSelectionEnd(pt);}
    }
    setDragging({type,index});
  };

  const onPointerMove = (e: React.MouseEvent<SVGSVGElement>|React.TouchEvent<SVGSVGElement>) => {
    if (!dragging) return;
    setHasMoved(true);

    // Pan mode
    if (dragging.type==='pan' && panStart && svgRef.current) {
      let mx=0,my=0;
      if('touches' in e){mx=e.touches[0].clientX;my=e.touches[0].clientY;}
      else{mx=(e as React.MouseEvent).clientX;my=(e as React.MouseEvent).clientY;}
      const ctm=svgRef.current.getScreenCTM();
      if(ctm){
        const dx=(mx-panStart.mx)/ctm.a, dy=(my-panStart.my)/ctm.d;
        setViewBox(v=>({...v,x:panStart.vbX-dx,y:panStart.vbY-dy}));
      }
      return;
    }

    const pt=getSvgPt(e);
    if(!pt) return;
    const x=pt.x, y=pt.y;

    if (dragging.type==='cursor') { setCursorX(x); setCursorY(y); return; }

    if (dragging.type==='shape' && shapeDragStart) {
      const dx=x-shapeDragStart.mx, dy=y-shapeDragStart.my;
      setDrawCommands(shapeDragStart.cmds.map(c => {
        const nc: DrawCmd = {...c, x:c.x+dx, y:c.y+dy};
        if(c.cx!=null)nc.cx=c.cx+dx; if(c.cy!=null)nc.cy=c.cy+dy;
        if(c.cx1!=null)nc.cx1=c.cx1+dx; if(c.cy1!=null)nc.cy1=c.cy1+dy;
        if(c.cx2!=null)nc.cx2=c.cx2+dx; if(c.cy2!=null)nc.cy2=c.cy2+dy;
        return nc;
      }));
      return;
    }

    if (dragging.type==='selection' && selectionStart) {
      setSelectionEnd({x,y});
      const mnX=Math.min(selectionStart.x,x), mxX=Math.max(selectionStart.x,x);
      const mnY=Math.min(selectionStart.y,y), mxY=Math.max(selectionStart.y,y);
      setSelectedNodeIndices(drawCommands.map((_,i)=>i).filter(i=>{
        const c=drawCommands[i];
        return c.type!=='Z' && c.x>=mnX && c.x<=mxX && c.y>=mnY && c.y<=mxY;
      }));
      return;
    }

    if (dragging.type==='node' && dragging.index!=null) {
      const idx=dragging.index;
      setDrawCommands(prev => {
        const old=prev[idx]; if(!old) return prev;
        const dx=x-old.x, dy=y-old.y;
        return prev.map((c,i) => {
          if (selectedNodeIndices.includes(i) && selectedNodeIndices.includes(idx)) {
            const nc: DrawCmd={...c,x:c.x+dx,y:c.y+dy};
            if(c.cx!=null)nc.cx=c.cx+dx; if(c.cy!=null)nc.cy=c.cy+dy;
            if(c.cx1!=null)nc.cx1=c.cx1+dx; if(c.cy1!=null)nc.cy1=c.cy1+dy;
            if(c.cx2!=null)nc.cx2=c.cx2+dx; if(c.cy2!=null)nc.cy2=c.cy2+dy;
            return nc;
          }
          if (i===idx) {
            const nc: DrawCmd={...c,x,y};
            if(c.cx2!=null)nc.cx2=c.cx2+dx; if(c.cy2!=null)nc.cy2=c.cy2+dy;
            return nc;
          }
          if (i===idx+1) {
            const nc={...c};
            if(nc.cx1!=null)nc.cx1+=dx; if(nc.cy1!=null)nc.cy1+=dy;
            return nc;
          }
          if (idx===0 && i===prev.length-1 && c.type==='Z') {
            const nc={...c};
            if(nc.cx2!=null)nc.cx2+=dx; if(nc.cy2!=null)nc.cy2+=dy;
            return nc;
          }
          return c;
        });
      });
      return;
    }

    // Quadratic control handle
    if (dragging.type==='node-ctrl-quad' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p=>p.map((c,ci)=>ci===i?{...c,cx:x,cy:y}:c));
      return;
    }
    // Cubic incoming handle (cx2/cy2 of cmd at index)
    if (dragging.type==='node-ctrl-cubic-in' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p=>p.map((c,ci)=>ci===i?{...c,cx2:x,cy2:y}:c));
      return;
    }
    // Cubic outgoing handle (cx1/cy1 of cmd at index, pointing from prev node)
    if (dragging.type==='node-ctrl-cubic-out' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p=>p.map((c,ci)=>ci===i?{...c,cx1:x,cy1:y}:c));
      return;
    }
    // Close path incoming handle
    if (dragging.type==='node-ctrl-close-in' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p=>p.map((c,ci)=>ci===i?{...c,cx2:x,cy2:y}:c));
    }
    if (dragging.type==='node-ctrl-close-out' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p=>p.map((c,ci)=>ci===i?{...c,cx1:x,cy1:y}:c));
    }
  };

  const onPointerUp = () => {
    setDragging(null); setPanStart(null); setShapeDragStart(null);
    setSelectionStart(null); setSelectionEnd(null);
  };

  // ── Canvas click (pen tool) ──────────────────────────────────────────────────
  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (hasMoved) return;
    if (toolMode !== 'pen') {
      setIsShapeSelected(false);
      setSelectedNodeIndices([]);
      return;
    }
    const pt=getSvgPt(e);
    if (!pt) return;
    const x=snap(pt.x), y=snap(pt.y);
    setCursorX(x); setCursorY(y);
    if (!drawCommands.length) {
      pushCmds([{type:'M',x,y}]);
    } else {
      if (drawMode==='line') {
        pushCmds([...drawCommands,{type:'L',x,y}]);
      } else {
        const last=drawCommands[drawCommands.length-1];
        pushCmds([...drawCommands,{
          type:'C', x, y,
          cx1: Math.round(last.x+(x-last.x)/3), cy1: Math.round(last.y+(y-last.y)/3),
          cx2: Math.round(last.x+2*(x-last.x)/3), cy2: Math.round(last.y+2*(y-last.y)/3),
        }]);
      }
    }
  };

  // ── Save drawn glyph ─────────────────────────────────────────────────────────
  const saveDrawnGlyph = () => {
    if (!drawCommands.length) { alert('الرجاء رسم مسار أولاً!'); return; }
    let name = drawCharName.trim();
    if (!name) {
      const p = window.prompt('اسم أو حرف المسار؟', 'أ');
      if (!p) return;
      name = p.trim() || '!';
      setDrawCharName(name);
    }
    const pathStr = compilePath();
    let bounds = { minX:100, maxX:500, minY:200, maxY:600 };
    try {
      const b = calculateExactPathBounds(pathStr);
      if (isFinite(b.x1)) bounds = { minX:Math.round(b.x1), maxX:Math.round(b.x2), minY:Math.round(b.y1), maxY:Math.round(b.y2) };
    } catch {}
    const lsb = Math.max(0, bounds.minX - 20);
    const rsb = bounds.maxX + 20;
    const id = drawingGlyphId || Date.now().toString();
    const glyph: Glyph = {
      id, char:name, pathData:pathStr, glyphType:drawGlyphType,
      metrics:{ascent:800,descent:-200},
      bounds, baselineY:600, rsb, lsb, extraGuides:[]
    };
    setGlyphs(prev => [...prev.filter(g=>g.id!==id && g.char!==name), glyph]);
    setDrawCharName(''); setDrawCommands([]); setDrawingGlyphId(null);
    setIsDrawingStudioOpen(false);
    showSuccess((drawingGlyphId ? 'تم تعديل' : 'تم حفظ') + ` "${name}"`);
  };

  // ── Open glyph for editing ───────────────────────────────────────────────────
  const parseCmdsFromPath = (d: string): DrawCmd[] => {
    const cmds: DrawCmd[] = [];
    if (!d) return cmds;
    const re = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
    let match; let cx=0,cy=0;
    while ((match=re.exec(d))!==null) {
      const t=match[1].toUpperCase(), rel=match[1]===match[1].toLowerCase();
      const nums=(match[2].trim().match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[]).map(Number);
      if (t==='M'){ for(let i=0;i<nums.length;i+=2){let x=nums[i],y=nums[i+1];if(rel){x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'M',x,y});} }
      else if(t==='L'){for(let i=0;i<nums.length;i+=2){let x=nums[i],y=nums[i+1];if(rel){x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'L',x,y});}}
      else if(t==='H'){for(let i=0;i<nums.length;i++){let x=nums[i];if(rel)x+=cx;cx=x;cmds.push({type:'L',x,y:cy});}}
      else if(t==='V'){for(let i=0;i<nums.length;i++){let y=nums[i];if(rel)y+=cy;cy=y;cmds.push({type:'L',x:cx,y});}}
      else if(t==='C'){for(let i=0;i<nums.length;i+=6){let[x1,y1,x2,y2,x,y]=[nums[i],nums[i+1],nums[i+2],nums[i+3],nums[i+4],nums[i+5]];if(rel){x1+=cx;y1+=cy;x2+=cx;y2+=cy;x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'C',x,y,cx1:Math.round(x1),cy1:Math.round(y1),cx2:Math.round(x2),cy2:Math.round(y2)});}}
      else if(t==='Q'){for(let i=0;i<nums.length;i+=4){let[qx,qy,x,y]=[nums[i],nums[i+1],nums[i+2],nums[i+3]];if(rel){qx+=cx;qy+=cy;x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'L',x,y,cx:Math.round(qx),cy:Math.round(qy)});}}
      else if(t==='Z'){cmds.push({type:'Z',x:0,y:0});}
    }
    return cmds;
  };

  const openGlyphInStudio = (glyph: Glyph) => {
    setDrawCharName(glyph.char==='!'?'':glyph.char);
    setDrawGlyphType(glyph.glyphType);
    setDrawingGlyphId(glyph.id);
    const cmds=parseCmdsFromPath(glyph.pathData);
    setDrawCommands(cmds);
    setUndoStack([]); setRedoStack([]);
    if (cmds.length) { setCursorX(cmds[0].x); setCursorY(cmds[0].y); }
    else { setCursorX(500); setCursorY(600); }
    setIsDrawingStudioOpen(true);
    setToolMode('select');
  };

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
                <button onClick={()=>{setEditingGlyphId(null);openGlyphInStudio(g);}} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2">
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
  const renderDrawingStudio=()=>{
    if(!isDrawingStudioOpen) return null;
    const dPath=compilePath();
    const isClosed=drawCommands.length>0&&drawCommands[drawCommands.length-1].type==='Z';
    const fillVal = isClosed ? fillColor : 'none';

    // Grid lines
    const gridX:number[]=[], gridY:number[]=[];
    for(let x=-5000;x<=5000;x+=50) gridX.push(x);
    for(let y=-5000;y<=5000;y+=50) gridY.push(y);

    const downloadSVG=()=>{
      if(!drawCommands.length){alert('لا يوجد مسار!');return;}
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -200 1000 1000"><path d="${dPath}" fill="rgba(0,0,0,0.8)" /></svg>`;
      const b=new Blob([svg],{type:'image/svg+xml'});
      const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${drawCharName||'glyph'}.svg`;a.click();
    };

    // ── Top bar left tools (vary by tool mode) ──────────────────────────────
    const moveSubPath = (direction: 'forward' | 'backward') => {
      if (selectedNodeIndices.length === 0) return;
      
      // Identify all indices in the sub-paths that contain selected nodes
      const pathIndices: number[][] = [];
      let currentPath: number[] = [];
      drawCommands.forEach((c, i) => {
        if (c.type === 'M' && currentPath.length > 0) {
          pathIndices.push(currentPath);
          currentPath = [];
        }
        currentPath.push(i);
      });
      if (currentPath.length > 0) pathIndices.push(currentPath);

      // Find which paths are "selected"
      const selectedPathIndices = pathIndices.filter(p => p.some(idx => selectedNodeIndices.includes(idx)));
      if (selectedPathIndices.length === 0) return;

      const newCmds = [...drawCommands];
      // This is a simple implementation: move the selected sub-paths to the front or back of the array
      const flatSelectedIndices = selectedPathIndices.flat();
      const selectedCmds = flatSelectedIndices.map(i => drawCommands[i]);
      const remainingCmds = drawCommands.filter((_, i) => !flatSelectedIndices.includes(i));

      if (direction === 'forward') {
        pushCmds([...remainingCmds, ...selectedCmds]);
        // Update selection indices
        const start = remainingCmds.length;
        setSelectedNodeIndices(selectedCmds.map((_, i) => start + i));
      } else {
        pushCmds([...selectedCmds, ...remainingCmds]);
        // Update selection indices
        setSelectedNodeIndices(selectedCmds.map((_, i) => i));
      }
    };

    const renderTopBarLeft=()=>{
      // 3 main tool buttons always visible
      const toolBtns=(
        <div className="flex bg-zinc-100 rounded-xl border border-zinc-200 p-1 gap-1 shrink-0">
          {([
            ['select','تحديد','S',MousePointer],
            ['move','تحريك','G',Hand],
            ['pen','قلم','P',PenTool],
          ] as [ToolMode,string,string,any][]).map(([mode,label,shortcut,Icon])=>(
            <button key={mode} onClick={()=>setToolMode(mode)}
              title={`${label} (${shortcut})`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${toolMode===mode?'bg-white text-zinc-900 shadow-sm':'text-zinc-500 hover:text-zinc-700'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      );

      // Context-specific tools after the 3 main ones
      let contextTools:React.ReactNode=null;
      if (toolMode==='select') {
        contextTools=(
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
            {/* Draw mode (line/curve) for adding points in select+click */}
            <div className="flex bg-zinc-100 rounded-lg border border-zinc-200 p-0.5 shrink-0">
              <button onClick={()=>setDrawMode('line')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${drawMode==='line'?'bg-white text-zinc-900 shadow-sm':'text-zinc-500 hover:text-zinc-700'}`}>مستقيم</button>
              <button onClick={()=>setDrawMode('curve')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${drawMode==='curve'?'bg-white text-zinc-900 shadow-sm':'text-zinc-500 hover:text-zinc-700'}`}>منحنى</button>
            </div>
            {selectedNodeIndices.length>0&&(
              <>
                <button onClick={()=>{
                  const nc=drawCommands.map((c,i)=>{
                    if(!selectedNodeIndices.includes(i)||c.type!=='L') return c;
                    const p=i>0?drawCommands[i-1]:{x:0,y:0};
                    return {...c,type:'C',cx1:Math.round(p.x+(c.x-p.x)/3),cy1:Math.round(p.y+(c.y-p.y)/3),cx2:Math.round(p.x+2*(c.x-p.x)/3),cy2:Math.round(p.y+2*(c.y-p.y)/3)};
                  });
                  pushCmds(nc);
                }} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium hover:bg-zinc-50 transition-all">→ منحنى</button>
                <button onClick={()=>{
                  const nc=drawCommands.map((c,i)=>(!selectedNodeIndices.includes(i)||(c.type!=='C'&&c.type!=='Q'))?c:{type:'L',x:c.x,y:c.y,layer:c.layer});
                  pushCmds(nc);
                }} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium hover:bg-zinc-50 transition-all">→ مستقيم</button>
                <button onClick={() => {
                  const nc = drawCommands.map((c, i) => {
                    if (!selectedNodeIndices.includes(i)) return c;
                    // If already has handles, just show them (already logic handles it)
                    // If L, convert to C with small handles
                    if (c.type === 'L') {
                      const prev = i > 0 ? drawCommands[i-1] : {x:c.x, y:c.y};
                      return {
                        ...c, type: 'C',
                        cx1: Math.round(prev.x + (c.x - prev.x) / 4), cy1: Math.round(prev.y + (c.y - prev.y) / 4),
                        cx2: Math.round(prev.x + 3 * (c.x - prev.x) / 4), cy2: Math.round(prev.y + 3 * (c.y - prev.y) / 4)
                      };
                    }
                    return c;
                  });
                  pushCmds(nc);
                }} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium hover:bg-zinc-50 transition-all" title="إظهار/تفعيل المقابض"> مقابض ∿</button>
                <button onClick={()=>{pushCmds(drawCommands.filter((_,i)=>!selectedNodeIndices.includes(i)));setSelectedNodeIndices([]);}} className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-all">حذف المحدد</button>
              </>
            )}
          </div>
        );
      } else if (toolMode==='move') {
        contextTools=(
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
            <button onClick={flipH} title="قلب أفقي" className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"><FlipHorizontal className="w-4 h-4 text-zinc-600" /></button>
            <button onClick={flipV} title="قلب عمودي" className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"><FlipVertical className="w-4 h-4 text-zinc-600" /></button>
            <button onClick={()=>rotateShape(-15)} title="دوران يسار ١٥°" className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"><RotateCcw className="w-4 h-4 text-zinc-600" /></button>
            <button onClick={()=>rotateShape(15)} title="دوران يمين ١٥°" className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"><RotateCw className="w-4 h-4 text-zinc-600" /></button>
            <button onClick={autoCenter} title="توسيط" className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 text-xs font-bold text-zinc-600">⊕</button>
            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
            <button onClick={()=>scalePath(0.9)} className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-bold hover:bg-zinc-50 text-zinc-700">−10%</button>
            <button onClick={()=>scalePath(1.1)} className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-bold hover:bg-zinc-50 text-zinc-700">+10%</button>
          </div>
        );
      } else if (toolMode==='pen') {
        contextTools=(
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
            <div className="flex bg-zinc-100 rounded-lg border border-zinc-200 p-0.5 shrink-0">
              <button onClick={()=>setDrawMode('line')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${drawMode==='line'?'bg-white text-zinc-900 shadow-sm':'text-zinc-500 hover:text-zinc-700'}`}>مستقيم</button>
              <button onClick={()=>setDrawMode('curve')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${drawMode==='curve'?'bg-white text-zinc-900 shadow-sm':'text-zinc-500 hover:text-zinc-700'}`}>منحنى</button>
            </div>
            <button onClick={()=>{
              if(!drawCommands.length) pushCmds([{type:'M',x:cursorX,y:cursorY}]);
              else if(drawMode==='line') pushCmds([...drawCommands,{type:'L',x:cursorX,y:cursorY}]);
              else {
                const last=drawCommands[drawCommands.length-1];
                pushCmds([...drawCommands,{type:'C',x:cursorX,y:cursorY,cx1:Math.round(last.x+(cursorX-last.x)/3),cy1:Math.round(last.y+(cursorY-last.y)/3),cx2:Math.round(last.x+2*(cursorX-last.x)/3),cy2:Math.round(last.y+2*(cursorY-last.y)/3)}]);
              }
            }} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />إضافة نقطة</button>
            <button onClick={()=>pushCmds([...drawCommands,{type:'M',x:cursorX,y:cursorY}])} className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium hover:bg-zinc-50">مسار جديد</button>
            <button onClick={()=>{if(drawCommands.length) pushCmds([...drawCommands,{type:'Z',x:0,y:0}]);}} disabled={!drawCommands.length} className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium hover:bg-zinc-50 disabled:opacity-40">إغلاق المسار</button>
          </div>
        );
      }
      return <>{toolBtns}{contextTools}</>;
    };

    return (
      <div className="fixed inset-0 z-[150] bg-white text-zinc-900 flex flex-col h-[100dvh] overflow-hidden select-none font-sans" dir="rtl">

        {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
        <header className="h-14 border-b border-zinc-200 bg-zinc-50 shrink-0 sticky top-0 z-[200]">
          <div className="h-full flex items-center gap-3 px-3 overflow-x-auto custom-scrollbar whitespace-nowrap overflow-y-visible">
            {/* Tools Area */}
            <div className="flex items-center gap-1.5 shrink-0">
              {renderTopBarLeft()}
            </div>

            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />

            {/* Actions Area */}
            <div className="flex items-center gap-2 shrink-0">
              <ColorPicker value={fillColor} onChange={setFillColor} label="تعبئة" />
              <div className="w-px h-6 bg-zinc-200 mx-1" />
              <button onClick={()=>setShowGrid(s=>!s)} className={`p-2 rounded-lg border transition-all ${showGrid?'bg-zinc-200 border-zinc-300':'bg-white border-zinc-200 hover:bg-zinc-50'}`} title="شبكة (G)">
                <Grid className={`w-4 h-4 ${showGrid?'text-zinc-900':'text-zinc-600'}`} />
              </button>
              <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5 shadow-sm">
                <button onClick={handleUndo} disabled={!undoStack.length} className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-md disabled:opacity-30 transition-all" title="تراجع (Ctrl+Z)"><Undo className="w-4 h-4" /></button>
                <button onClick={handleRedo} disabled={!redoStack.length} className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-md disabled:opacity-30 transition-all transform scale-x-[-1]" title="إعادة (Ctrl+Y)"><Undo className="w-4 h-4" /></button>
              </div>
              <div className="w-px h-6 bg-zinc-200" />
              <button onClick={downloadSVG} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-bold hover:bg-zinc-50 flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                <span>SVG</span>
              </button>
              <button onClick={()=>{if(drawCommands.length&&!confirm('خروج بدون حفظ؟'))return;setIsDrawingStudioOpen(false);}} className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50" title="إغلاق">
                <X className="w-4 h-4 text-zinc-600" />
              </button>
              <button onClick={saveDrawnGlyph} className="px-4 py-1.5 bg-zinc-950 hover:bg-zinc-900 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-2">
                <Save className="w-3.5 h-3.5" />
                <span>حفظ</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── CANVAS ───────────────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden bg-zinc-50">
          {/* Coord display */}
          <div className="absolute top-3 left-3 z-30 bg-white/90 border border-zinc-200 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-500 pointer-events-none shadow-sm">
            {cursorX}, {cursorY}
          </div>
          {/* Char name badge */}
          {drawCharName && (
            <div className="absolute top-3 right-3 z-30 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-xs font-bold text-teal-700 pointer-events-none shadow-sm">
              {drawCharName} — {drawGlyphType==='isolated'?'منفصل':drawGlyphType==='initial'?'بداية':drawGlyphType==='medial'?'وسط':'نهاية'}
            </div>
          )}

          <svg
            ref={svgRef}
            className={`w-full h-full touch-none ${toolMode==='move'&&!dragging?'cursor-grab':toolMode==='move'&&dragging?.type==='shape'?'cursor-grabbing':toolMode==='pen'?'cursor-crosshair':'cursor-default'}`}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            preserveAspectRatio="xMidYMid slice"
            onMouseDown={e=>{
              if(toolMode==='move') onPointerDown(e,'shape');
              else if(toolMode==='select') onPointerDown(e,'selection');
              // pen tool handled via onCanvasClick
            }}
            onTouchStart={e=>{
              if(toolMode==='move') onPointerDown(e,'shape');
              else if(toolMode==='select') onPointerDown(e,'selection');
            }}
            onMouseMove={onPointerMove}
            onTouchMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchEnd={onPointerUp}
            onWheel={e=>{e.preventDefault();zoom(e.deltaY>0?1.1:0.9);}}
            onClick={onCanvasClick}
          >
            {/* Grid */}
            {showGrid && (
              <g className="pointer-events-none">
                {gridX.map(x=><line key={`x${x}`} x1={x} y1="-5000" x2={x} y2="5000" stroke={x===0||x===500?'#94a3b8':'#e2e8f0'} strokeWidth={x===0||x===500?'1.5':'1'} opacity={x===0||x===500?0.6:0.5} />)}
                {gridY.map(y=><line key={`y${y}`} x1="-5000" y1={y} x2="5000" y2={y} stroke={y===0||y===600?'#94a3b8':'#e2e8f0'} strokeWidth={y===0||y===600?'1.5':'1'} opacity={y===0||y===600?0.6:0.5} />)}
                {/* Baseline label */}
                <text x={viewBox.x+10} y={600-8} fill="#94a3b8" fontSize="12" fontFamily="sans-serif" className="pointer-events-none">Baseline</text>
              </g>
            )}

            {/* Selection highlight */}
            {isShapeSelected && toolMode==='move' && (
              <path d={dPath} fill="none" stroke="#0ea5e9" strokeWidth="6" opacity="0.25" className="pointer-events-none" />
            )}

            {/* Main path */}
            <path
              d={dPath}
              fill={fillVal}
              stroke={strokeColor==='none'?'#18181b':strokeColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={toolMode==='move'?'cursor-grab':'pointer-events-none'}
              onMouseDown={e=>{if(toolMode==='move'){e.stopPropagation();setIsShapeSelected(true);onPointerDown(e,'shape');}}}
              onTouchStart={e=>{if(toolMode==='move'){e.stopPropagation();setIsShapeSelected(true);onPointerDown(e,'shape');}}}
            />

            {/* Node handles (select & pen tool) */}
            {(toolMode==='select'||toolMode==='pen') && drawCommands.map((cmd, i) => {
              if (cmd.type==='Z') {
                // Close-path handles
                const prev=i>0?drawCommands[i-1]:null;
                const first=drawCommands[0];
                return (
                  <g key={`z-${i}`}>
                    {cmd.cx1!=null&&cmd.cy1!=null&&prev&&(
                      <g>
                        <line x1={prev.x} y1={prev.y} x2={cmd.cx1} y2={cmd.cy1} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="3,3" className="pointer-events-none" />
                        <circle cx={cmd.cx1} cy={cmd.cy1} r="5" fill="#fff" stroke="#0ea5e9" strokeWidth="1.5" className="cursor-move"
                          onMouseDown={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-close-out',i);}}
                          onTouchStart={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-close-out',i);}} />
                      </g>
                    )}
                    {cmd.cx2!=null&&cmd.cy2!=null&&first&&(
                      <g>
                        <line x1={first.x} y1={first.y} x2={cmd.cx2} y2={cmd.cy2} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="3,3" className="pointer-events-none" />
                        <circle cx={cmd.cx2} cy={cmd.cy2} r="5" fill="#fff" stroke="#0ea5e9" strokeWidth="1.5" className="cursor-move"
                          onMouseDown={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-close-in',i);}}
                          onTouchStart={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-close-in',i);}} />
                      </g>
                    )}
                  </g>
                );
              }
              const isSel=selectedNodeIndices.includes(i);
              const prev=i>0?drawCommands[i-1]:null;
              return (
                <g key={`n-${i}`}>
                  {/* Cubic incoming handle (cx2,cy2 = handle arriving at this node) */}
                  {cmd.cx2!=null&&cmd.cy2!=null&&(
                    <g>
                      <line x1={cmd.x} y1={cmd.y} x2={cmd.cx2} y2={cmd.cy2} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="3,3" className="pointer-events-none" />
                      <circle cx={cmd.cx2} cy={cmd.cy2} r="5" fill="#fff" stroke="#0ea5e9" strokeWidth="1.5" className="cursor-move"
                        onMouseDown={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-cubic-in',i);}}
                        onTouchStart={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-cubic-in',i);}} />
                    </g>
                  )}
                  {/* Cubic outgoing handle (cx1,cy1 = handle leaving from previous node toward this node) */}
                  {cmd.cx1!=null&&cmd.cy1!=null&&prev&&(
                    <g>
                      <line x1={prev.x} y1={prev.y} x2={cmd.cx1} y2={cmd.cy1} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="3,3" className="pointer-events-none" />
                      <circle cx={cmd.cx1} cy={cmd.cy1} r="5" fill="#fff" stroke="#0ea5e9" strokeWidth="1.5" className="cursor-move"
                        onMouseDown={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-cubic-out',i);}}
                        onTouchStart={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-cubic-out',i);}} />
                    </g>
                  )}
                  {/* Quadratic handle */}
                  {cmd.cx!=null&&cmd.cy!=null&&(
                    <g>
                      <line x1={cmd.x} y1={cmd.y} x2={cmd.cx} y2={cmd.cy} stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" className="pointer-events-none" />
                      <circle cx={cmd.cx} cy={cmd.cy} r="5" fill="#fff" stroke="#10b981" strokeWidth="1.5" className="cursor-move"
                        onMouseDown={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-quad',i);}}
                        onTouchStart={e=>{e.stopPropagation();onPointerDown(e,'node-ctrl-quad',i);}} />
                    </g>
                  )}
                  {/* Node square */}
                  <rect x={cmd.x-6} y={cmd.y-6} width="12" height="12"
                    fill={isSel?'#0ea5e9':'#fff'}
                    stroke={isSel?'#0284c7':'#64748b'}
                    strokeWidth="1.5"
                    className="cursor-move"
                    onMouseDown={e=>{e.stopPropagation();onPointerDown(e,'node',i);}}
                    onTouchStart={e=>{e.stopPropagation();onPointerDown(e,'node',i);}}
                    onClick={e=>{e.stopPropagation();if(e.shiftKey)setSelectedNodeIndices(p=>p.includes(i)?p.filter(x=>x!==i):[...p,i]);else setSelectedNodeIndices([i]);}}
                  />
                </g>
              );
            })}

            {/* Selection box */}
            {toolMode==='select'&&selectionStart&&selectionEnd&&(
              <rect
                x={Math.min(selectionStart.x,selectionEnd.x)} y={Math.min(selectionStart.y,selectionEnd.y)}
                width={Math.abs(selectionEnd.x-selectionStart.x)} height={Math.abs(selectionEnd.y-selectionStart.y)}
                fill="rgba(14,165,233,0.08)" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4,4" className="pointer-events-none"
              />
            )}

            {/* Pen tool cursor */}
            {toolMode==='pen'&&(
              <rect x={cursorX-4} y={cursorY-4} width="8" height="8" fill="rgba(0,0,0,0.1)" stroke="#18181b" strokeWidth="1" strokeDasharray="2,2" className="pointer-events-none" />
            )}
          </svg>
        </div>

        {/* ── BOTTOM BAR ────────────────────────────────────────────────────── */}
        <footer className="h-12 border-t border-zinc-200 bg-white px-3 flex items-center gap-2 shrink-0 overflow-x-auto custom-scrollbar">
          {/* Zoom */}
          <div className="flex items-center gap-1 bg-zinc-100 rounded-lg border border-zinc-200 p-0.5 shrink-0">
            <button onClick={()=>zoom(0.8)} className="px-2.5 py-1 rounded-md text-xs font-bold text-zinc-600 hover:bg-white transition-all" title="تكبير (+)">+</button>
            <button onClick={()=>zoom(1.25)} className="px-2.5 py-1 rounded-md text-xs font-bold text-zinc-600 hover:bg-white transition-all" title="تصغير (−)">−</button>
            <button onClick={()=>setViewBox({x:-100,y:-200,w:1200,h:1000})} className="px-2.5 py-1 rounded-md text-[10px] font-bold text-zinc-500 hover:bg-white transition-all" title="إعادة الضبط">100%</button>
          </div>

          <div className="w-px h-5 bg-zinc-200 shrink-0" />

          {/* Layer selector replaced by Forward/Backward */}
          <div className="flex bg-zinc-100 rounded-lg border border-zinc-200 p-0.5 shrink-0">
            <button onClick={() => moveSubPath('forward')} className="px-3 py-1 rounded-md text-xs font-bold text-zinc-600 hover:bg-white transition-all flex items-center gap-1" title="للأمام">
              <ArrowUp className="w-3 h-3" /> للأمام
            </button>
            <button onClick={() => moveSubPath('backward')} className="px-3 py-1 rounded-md text-xs font-bold text-zinc-600 hover:bg-white transition-all flex items-center gap-1" title="للخلف">
              <ArrowDown className="w-3 h-3" /> للخلف
            </button>
          </div>

          <div className="w-px h-5 bg-zinc-200 shrink-0" />

          {/* Char name + type */}
          <input type="text" value={drawCharName} onChange={e=>setDrawCharName(e.target.value)} placeholder="اسم الحرف..." className="px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-zinc-400 w-28 shrink-0 text-right" dir="rtl" />
          <select value={drawGlyphType} onChange={e=>setDrawGlyphType(e.target.value as any)} className="px-2 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:outline-none shrink-0">
            <option value="isolated">منفصل</option><option value="initial">بداية</option>
            <option value="medial">وسط</option><option value="final">نهاية</option>
          </select>

          <div className="flex-1" />

          {/* Node count */}
          <span className="text-[10px] text-zinc-400 font-mono shrink-0">{drawCommands.filter(c=>c.type!=='Z').length} نقطة</span>
        </footer>
      </div>
    );
  };

  // ── Project editor ─────────────────────────────────────────────────────────
  if (!currentProjectId) return renderDashboard();

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      {renderConfirm()}
      <div ref={hiddenContainerRef} className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden" aria-hidden="true" />
      {renderGlyphEditor()}
      {renderDrawingStudio()}

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
              <button onClick={()=>{setDrawCharName(uploadChar||'');setDrawCommands([]);setDrawingGlyphId(null);setCursorX(500);setCursorY(600);setIsDrawingStudioOpen(true);setToolMode('pen');}} className="w-full py-3 bg-teal-600/10 hover:bg-teal-600/20 text-teal-600 border border-teal-500/20 rounded-2xl text-xs font-bold flex items-center justify-center gap-2" dir="rtl">
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
                      <button onClick={e=>{e.stopPropagation();openGlyphInStudio(g);}} className="absolute top-1 left-1 p-1 bg-teal-50 text-teal-500 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-teal-500 hover:text-white z-10"><PenTool className="w-3 h-3" /></button>
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