import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Type, Download, Info, Trash2, Settings2, CheckCircle2, Keyboard, Save, Plus, ArrowRight, Edit2, PenTool, RefreshCw, HelpCircle, Undo, X, MousePointer } from 'lucide-react';
import { EditorLayout } from './components/editor/EditorLayout';
import opentype from 'opentype.js';
import { SVGPathData } from 'svg-pathdata';
import svgpath from 'svgpath';
import { extractAllPaths, svgToOpentype, calculateExactPathBounds, cleanAndNormalizePath, fileToSVGText, parseSVGStringToDoc } from './Svgprocessor';
import { Glyph, Project } from './types';
import { saveProjectsToDb, loadProjectsFromDb } from './utils/indexedDb';
import { FONT_API_URL } from './config';

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage is not available:", e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("localStorage is not available:", e);
    }
  }
};

function App() {
  const [projects, setProjects] = useState<Project[]>([]);

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const currentProject = projects.find(p => p.id === currentProjectId);
  const glyphs = currentProject ? currentProject.glyphs : [];

  const setGlyphs = (updater: Glyph[] | ((prev: Glyph[]) => Glyph[])) => {
    if (!currentProjectId) return;
    setProjects(prevProjects => prevProjects.map(p => {
      if (p.id === currentProjectId) {
        const newGlyphs = typeof updater === 'function' ? updater(p.glyphs) : updater;
        return { ...p, glyphs: newGlyphs, lastModified: Date.now() };
      }
      return p;
    }));
  };

  const [inputText, setInputText] = useState('');
  const [uploadChar, setUploadChar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingGlyphId, setEditingGlyphId] = useState<string | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);

  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, message: string, onConfirm: () => void } | null>(null);

  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Drawing Studio States
  const [isDrawingStudioOpen, setIsDrawingStudioOpen] = useState(false);
  const [isAddingBetween, setIsAddingBetween] = useState(false);
  const [drawCharName, setDrawCharName] = useState('');
  const [drawGlyphType, setDrawGlyphType] = useState<'isolated' | 'initial' | 'medial' | 'final'>('isolated');
  const [cursorX, setCursorX] = useState(500);
  const [cursorY, setCursorY] = useState(600); // starts on baseline
  const [controlX, setControlX] = useState(500);
  const [controlY, setControlY] = useState(500);
  const [stepSize, setStepSize] = useState(50);
  const [drawMode, setDrawMode] = useState<'line' | 'curve'>('line');
  const [activeLayer, setActiveLayer] = useState(0);
  const [activeTarget, setActiveTarget] = useState<'cursor' | 'control'>('cursor');
  const [areHandlesLinked, setAreHandlesLinked] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);
  
  // list of path commands: { type, x, y, cx?, cy?, cx1?, cy1?, cx2?, cy2?, layer: number }
  const [drawCommands, setDrawCommands] = useState<{ type: string, x: number, y: number, cx?: number, cy?: number, cx1?: number, cy1?: number, cx2?: number, cy2?: number, layer: number }[]>([]);
  
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [showCurves, setShowCurves] = useState(false);
  const [isSelectionBoxActive, setIsSelectionBoxActive] = useState(false);
  const [isPanModeActive, setIsPanModeActive] = useState(false);
  const [viewBox, setViewBox] = useState({ x: -100, y: -200, w: 1200, h: 1000 });
  const [panStart, setPanStart] = useState<{ x: number, y: number, vbX: number, vbY: number } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number, y: number } | null>(null);
  const [selectedNodeIndices, setSelectedNodeIndices] = useState<number[]>([]);

  const [angleInput, setAngleInput] = useState('45');
  const [lengthInput, setLengthInput] = useState('100');
  const [autoAddOnClick, setAutoAddOnClick] = useState(false);
  const [undoStack, setUndoStack] = useState<{ type: string, x: number, y: number, cx?: number, cy?: number, cx1?: number, cy1?: number, cx2?: number, cy2?: number }[][]>([]);
  const [redoStack, setRedoStack] = useState<{ type: string, x: number, y: number, cx?: number, cy?: number, cx1?: number, cy1?: number, cx2?: number, cy2?: number }[][]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);

  const [draggingPoint, setDraggingPoint] = useState<{ type: 'cursor' | 'control' | 'node' | 'node-control' | 'selection' | 'pan'; index?: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const pushDrawCommands = (newCmds: typeof drawCommands) => {
    setUndoStack(prev => [...prev, drawCommands]);
    setRedoStack([]);
    
    // Ensure all commands have a layer property
    const taggedCmds = newCmds.map(cmd => ({ ...cmd, layer: cmd.layer ?? activeLayer }));
    
    setDrawCommands(taggedCmds);
  };

  const autoCenter = () => {
    if (drawCommands.length === 0) return;
    const pathString = compiledDrawingPath();
    const bounds = calculateExactPathBounds(pathString);
    if (!isFinite(bounds.x1)) return;

    const centerX = (bounds.x1 + bounds.x2) / 2;
    const deltaX = 500 - centerX;

    const newCmds = drawCommands.map(cmd => ({
      ...cmd,
      x: cmd.x + deltaX,
      cx: cmd.cx !== undefined ? cmd.cx + deltaX : undefined,
      cx1: cmd.cx1 !== undefined ? cmd.cx1 + deltaX : undefined,
      cx2: cmd.cx2 !== undefined ? cmd.cx2 + deltaX : undefined,
    }));
    pushDrawCommands(newCmds);
  };

  const scalePath = (factor: number) => {
    // Find bounds first
    if (drawCommands.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    drawCommands.forEach(cmd => {
      minX = Math.min(minX, cmd.x);
      maxX = Math.max(maxX, cmd.x);
      minY = Math.min(minY, cmd.y);
      maxY = Math.max(maxY, cmd.y);
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setDrawCommands(prev => prev.map(cmd => ({
        ...cmd,
        x: centerX + (cmd.x - centerX) * factor,
        y: centerY + (cmd.y - centerY) * factor,
        cx: cmd.cx !== undefined ? centerX + (cmd.cx - centerX) * factor : undefined,
        cy: cmd.cy !== undefined ? centerY + (cmd.cy - centerY) * factor : undefined,
        cx1: cmd.cx1 !== undefined ? centerX + (cmd.cx1 - centerX) * factor : undefined,
        cy1: cmd.cy1 !== undefined ? centerY + (cmd.cy1 - centerY) * factor : undefined,
        cx2: cmd.cx2 !== undefined ? centerX + (cmd.cx2 - centerX) * factor : undefined,
        cy2: cmd.cy2 !== undefined ? centerY + (cmd.cy2 - centerY) * factor : undefined,
    })));
  };

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevCmds = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, drawCommands]);
    setDrawCommands(prevCmds);
  }, [undoStack, drawCommands]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextCmds = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, drawCommands]);
    setDrawCommands(nextCmds);
  }, [redoStack, drawCommands]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedNodeIndices(drawCommands.map((_, i) => i));
      } else if (e.key === 'Delete') {
        if (selectedNodeIndices.length > 0) {
          const newCmds = drawCommands.filter((_, i) => !selectedNodeIndices.includes(i));
          pushDrawCommands(newCmds);
          setSelectedNodeIndices([]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleZoom = (factor: number) => {
    setViewBox(prev => {
      const w = prev.w * factor;
      const h = prev.h * factor;
      const dx = (prev.w - w) / 2;
      const dy = (prev.h - h) / 2;
      return { ...prev, x: prev.x + dx, y: prev.y + dy, w, h };
    });
  };

  // Keyboard drawing helper
  useEffect(() => {
    if (!isDrawingStudioOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input or select
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') {
        return;
      }
      
      const multiplier = e.shiftKey ? 2 : 1;
      const currentStep = stepSize * multiplier;
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeTarget === 'cursor') {
          setCursorY(prev => Math.max(-400, prev - currentStep));
        } else {
          setControlY(prev => Math.max(-400, prev - currentStep));
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (activeTarget === 'cursor') {
          setCursorY(prev => Math.min(1200, prev + currentStep));
        } else {
          setControlY(prev => Math.min(1200, prev + currentStep));
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (activeTarget === 'cursor') {
          setCursorX(prev => Math.max(-200, prev - currentStep));
        } else {
          setControlX(prev => Math.max(-200, prev - currentStep));
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (activeTarget === 'cursor') {
          setCursorX(prev => Math.min(1200, prev + currentStep));
        } else {
          setControlX(prev => Math.min(1200, prev + currentStep));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (drawCommands.length === 0) {
          pushDrawCommands([{ type: 'M', x: cursorX, y: cursorY }]);
        } else {
          pushDrawCommands([...drawCommands, { type: 'L', x: cursorX, y: cursorY }]);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsDrawingStudioOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingStudioOpen, cursorX, cursorY, controlX, controlY, stepSize, drawMode, activeTarget, drawCommands]);

  // Load from IndexedDB on mount with fallback to migration
  useEffect(() => {
    loadProjectsFromDb().then((loadedProjects) => {
      if (loadedProjects && loadedProjects.length > 0) {
        setProjects(loadedProjects);
        // Do not auto-set currentProjectId
      } else {
        // Migrate old data if exists
        const oldSaved = safeLocalStorage.getItem('smart_font_glyphs');
        if (oldSaved) {
          try {
            const parsed = JSON.parse(oldSaved);
            const migratedProject: Project = {
              id: Date.now().toString(),
              name: 'مشروع سابق',
              glyphs: parsed.map((g: any) => ({
                ...g,
                template: g.template || 'flat',
                metrics: g.metrics || { ascent: 800, descent: -200 },
                lsb: g.lsb !== undefined ? g.lsb : (g.leftGuide !== undefined ? g.leftGuide : g.bounds.minX),
                rsb: g.rsb !== undefined ? g.rsb : (g.rightGuide !== undefined ? g.rightGuide : g.bounds.maxX),
                extraGuides: g.extraGuides || [],
              })),
              lastModified: Date.now()
            };
            setProjects([migratedProject]);
            // Do not auto-set currentProjectId
          } catch (e) {
            console.error("Failed to migrate old glyphs", e);
          }
        }
      }
      setIsDbLoaded(true);
    }).catch(err => {
      console.error("Failed to load projects from IndexedDB:", err);
      setIsDbLoaded(true);
    });
  }, []);

  // Save to IndexedDB whenever projects change (only after database is loaded to prevent overwriting)
  useEffect(() => {
    if (isDbLoaded) {
      saveProjectsToDb(projects);
    }
  }, [projects, isDbLoaded]);

  const createNewProject = () => {
    if (!newProjectName.trim()) {
      setError("الرجاء إدخال اسم المشروع");
      return;
    }
    const newProject: Project = {
      id: Date.now().toString(),
      name: newProjectName.trim(),
      glyphs: [],
      lastModified: Date.now()
    };
    setProjects(prev => [newProject, ...prev]);
    setNewProjectName('');
    setIsCreatingProject(false);
    setCurrentProjectId(newProject.id);
  };

  const deleteProject = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      message: "هل أنت متأكد من حذف هذا المشروع بالكامل؟ لا يمكن التراجع عن هذا الإجراء.",
      onConfirm: () => {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (currentProjectId === id) {
          setCurrentProjectId(null);
        }
      }
    });
  };

  const renameProject = (id: string, newName: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, name: newName, lastModified: Date.now() };
      }
      return p;
    }));
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const compiledDrawingPath = () => {
    if (drawCommands.length === 0) return '';
    let d = '';
    drawCommands.forEach(cmd => {
      if (cmd.type === 'M') d += `M ${cmd.x} ${cmd.y} `;
      else if (cmd.type === 'L') {
        if (cmd.cx1 !== undefined && cmd.cy1 !== undefined && cmd.cx2 !== undefined && cmd.cy2 !== undefined) {
          d += `C ${cmd.cx1} ${cmd.cy1}, ${cmd.cx2} ${cmd.cy2}, ${cmd.x} ${cmd.y} `;
        } else if (cmd.cx !== undefined && cmd.cy !== undefined) {
          d += `Q ${cmd.cx} ${cmd.cy}, ${cmd.x} ${cmd.y} `;
        } else {
          d += `L ${cmd.x} ${cmd.y} `;
        }
      }
      else if (cmd.type === 'Q' && cmd.cx !== undefined && cmd.cy !== undefined) {
        d += `Q ${cmd.cx} ${cmd.cy}, ${cmd.x} ${cmd.y} `;
      } else if (cmd.type === 'Z') d += `Z `;
    });
    return d.trim();
  };

  const autoPlaceControlPoint = () => {
    if (drawCommands.length === 0) {
      setControlX(cursorX);
      setControlY(cursorY);
    } else {
      const lastCmd = drawCommands[drawCommands.length - 1];
      setControlX(Math.round((lastCmd.x + cursorX) / 2));
      setControlY(Math.round((lastCmd.y + cursorY) / 2));
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    
    const clickX = ((e.clientX - rect.left) / rect.width) * 1000;
    const clickY = ((e.clientY - rect.top) / rect.height) * 1000 - 200;
    
    const snappedX = Math.round(clickX / 5) * 5;
    const snappedY = Math.round(clickY / 5) * 5;
    
    if (activeTarget === 'cursor') {
      setCursorX(snappedX);
      setCursorY(snappedY);
      
      if (autoAddOnClick) {
        if (drawCommands.length === 0) {
          setDrawCommands([{ type: 'M', x: snappedX, y: snappedY }]);
        } else {
          if (drawMode === 'line') {
            setDrawCommands(prev => [...prev, { type: 'L', x: snappedX, y: snappedY }]);
          } else {
            setDrawCommands(prev => [...prev, { type: 'Q', x: snappedX, y: snappedY, cx: controlX, cy: controlY }]);
          }
        }
      } else {
        // Auto-update control point to be midpoint of new cursor pos and last node
        if (drawCommands.length > 0) {
          const lastCmd = drawCommands[drawCommands.length - 1];
          setControlX(Math.round((lastCmd.x + snappedX) / 2));
          setControlY(Math.round((lastCmd.y + snappedY) / 2));
        } else {
          setControlX(snappedX);
          setControlY(snappedY);
        }
      }
    } else {
      setControlX(snappedX);
      setControlY(snappedY);
    }
  };

  const drawVectorAtAngle = () => {
    const angle = Number(angleInput);
    const length = Number(lengthInput);
    if (isNaN(angle) || isNaN(length)) return;
    
    const rad = (angle * Math.PI) / 180;
    const dx = Math.round(Math.cos(rad) * length);
    const dy = Math.round(-Math.sin(rad) * length);
    
    const newX = cursorX + dx;
    const newY = cursorY + dy;
    
    setCursorX(newX);
    setCursorY(newY);
    
    if (drawCommands.length === 0) {
      setDrawCommands([{ type: 'M', x: newX, y: newY }]);
    } else {
      if (drawMode === 'line') {
        setDrawCommands(prev => [...prev, { type: 'L', x: newX, y: newY }]);
      } else {
        setDrawCommands(prev => [...prev, { type: 'Q', x: newX, y: newY, cx: controlX, cy: controlY }]);
      }
    }
  };

  const processUploadedSVG = async (file: File, charName: string) => {
    const finalCharName = charName.trim() || '!';

    try {
      const text = await fileToSVGText(file);
      const doc = parseSVGStringToDoc(text);
      const svgEl = doc.querySelector('svg');

      if (!svgEl) {
        throw new Error("ملف SVG غير صالح.");
      }

      const viewBox = svgEl.getAttribute('viewBox') || '0 0 1920 1920';
      const vbParts = viewBox.split(/\s+/).map(Number);
      const vbWidth = vbParts[2] || 1920;
      const vbHeight = vbParts[3] || 1920;
      const scaleX = 1000 / vbWidth;
      const scaleY = 1000 / vbHeight;

      const { combinedPath } = extractAllPaths(doc, vbWidth, vbHeight);

      if (!combinedPath.trim()) {
        throw new Error("لم يتم العثور على مسارات صالحة في الملف. تأكد من أن الملف يحتوي على أشكال رسم.");
      }

      // Scale the combined path to our internal 1000x1000 coordinate system
      const scaledPathData = svgpath(combinedPath).scale(scaleX, scaleY).toString();

      // Calculate Bounds
      let minX = 0, maxX = 1000, minY = 0, maxY = 1000;
      try {
        const bounds = calculateExactPathBounds(scaledPathData);
        minX = bounds.x1;
        maxX = bounds.x2;
        minY = bounds.y1;
        maxY = bounds.y2;
      } catch (e) {
        console.warn("Could not parse path for bounds", e);
      }

      // Auto-Centering horizontally: Shift path so it starts at X = 0, keep Y unchanged
      const zeroedPathData = svgpath(scaledPathData)
        .translate(-minX, 0)
        .toString();

      const newMaxX = Math.round(maxX - minX);

      // Clean default metrics
      const finalAscent = 800;
      const finalDescent = -200;
      const finalBaselineY = 600; // Standard baseline
      const finalLSB = Math.max(0, Math.round(30)); // slightly padded left-side bearing
      const finalRSB = Math.round(newMaxX + 30); // slightly padded right-side bearing

      const newGlyph: Glyph = {
        id: Date.now().toString(),
        char: finalCharName,
        pathData: zeroedPathData,
        glyphType: 'isolated',
        metrics: {
          ascent: finalAscent,
          descent: finalDescent
        },
        bounds: { 
          minX: 0,
          maxX: newMaxX,
          minY: Math.round(minY), 
          maxY: Math.round(maxY) 
        },
        baselineY: finalBaselineY,
        rsb: finalRSB,
        lsb: finalLSB,
        extraGuides: []
      };

      setGlyphs(prev => {
        const filtered = prev.filter(g => g.char !== newGlyph.char);
        return [...filtered, newGlyph];
      });

      setUploadChar('');
      setError(null);
      showSuccess(`تمت إضافة المحرف "${finalCharName}" بنجاح!`);

    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء معالجة الملف.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedSVG(file, uploadChar);
    }
    // Reset input
    e.target.value = '';
  };

  const deleteGlyph = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      message: "هل أنت متأكد من حذف هذا المحرف؟",
      onConfirm: () => {
        setGlyphs(prev => prev.filter(g => g.id !== id));
      }
    });
  };

  const updateGlyphChar = (id: string, newChar: string) => {
    setGlyphs(prev => prev.map(g => {
      if (g.id !== id) return g;
      return { ...g, char: newChar };
    }));
  };

  const updateGuide = (id: string, side: 'rsb' | 'lsb' | 'baseline', value: number) => {
    setGlyphs(prev => prev.map(g => {
      if (g.id !== id) return g;
      if (side === 'rsb') return { ...g, rsb: value };
      if (side === 'lsb') return { ...g, lsb: value };
      if (side === 'baseline') return { ...g, baselineY: value };
      return g;
    }));
  };

  const updateMetric = (id: string, metric: 'ascent' | 'descent', value: number) => {
    setGlyphs(prev => prev.map(g => {
      if (g.id !== id) return g;
      return { ...g, metrics: { ...g.metrics, [metric]: value } };
    }));
  };

  const updateGlyphType = (id: string, type: 'isolated' | 'initial' | 'medial' | 'final') => {
    setGlyphs(prev => prev.map(g => {
      if (g.id !== id) return g;
      return { ...g, glyphType: type };
    }));
  };

  const moveGlyph = (id: string, dx: number, dy: number) => {
    setGlyphs(prev => prev.map(g => {
      if (g.id !== id) return g;
      const newPathData = svgpath(g.pathData).translate(dx, dy).toString();
      return {
        ...g,
        pathData: newPathData,
        bounds: {
          minX: g.bounds.minX + dx,
          maxX: g.bounds.maxX + dx,
          minY: g.bounds.minY + dy,
          maxY: g.bounds.maxY + dy,
        }
      };
    }));
  };

  const exportToFont = async () => {
    if (glyphs.length === 0) {
      setError("لا توجد محارف للتصدير. قم بإضافة محارف أولاً.");
      return;
    }

    try {
      showSuccess("جاري تجهيز الخط وإرساله للسيرفر الخارجي...");
      
      const usedUnicodes = new Set<number>();
      usedUnicodes.add(0);
      let puaCode = 0xE000;

      const payloadGlyphs = [];

      for (const glyph of glyphs) {
        // 1. Translate so LSB is at X=0, baselineY is at Y=0
        // 2. Flip Y so above baseline is positive and below is negative
        const rawTransformed = svgpath(glyph.pathData)
          .translate(-glyph.lsb, -glyph.baselineY)
          .scale(1, -1)
          .toString();

        const transformedPath = cleanAndNormalizePath(rawTransformed);

        let unicode = glyph.char.codePointAt(0) || 0;
        
        const hexUnicodes = Array.from(glyph.char as string).map((c: string) => (c.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0'));
        let postScriptName = `uni${hexUnicodes.join('_')}`;
        
        if (glyph.glyphType === 'initial') postScriptName += '.init';
        else if (glyph.glyphType === 'medial') postScriptName += '.medi';
        else if (glyph.glyphType === 'final') postScriptName += '.fina';
        
        let assignedUnicode = unicode;
        if (glyph.glyphType !== 'isolated') {
           assignedUnicode = puaCode++;
        } else {
           if (usedUnicodes.has(unicode)) {
             assignedUnicode = puaCode++;
           } else {
             usedUnicodes.add(unicode);
           }
        }

        let advanceWidth = Math.round(glyph.rsb - glyph.lsb);
        if (advanceWidth <= 0) {
          // If rsb <= lsb, fallback to character visual bounds width (min 100) to prevent letters from stacking
          advanceWidth = Math.max(100, Math.round(glyph.bounds.maxX - glyph.bounds.minX));
        }

        payloadGlyphs.push({
          name: String(postScriptName),
          unicode: Math.round(assignedUnicode),
          pathData: String(transformedPath),
          advanceWidth: Math.round(advanceWidth),
          ascent: glyph.metrics.ascent ? Math.round(glyph.metrics.ascent) : undefined,
          descent: glyph.metrics.descent ? Math.round(glyph.metrics.descent) : undefined
        });
      }
      
      const projectName = currentProject?.name ? currentProject.name.replace(/[^a-zA-Z0-9_\u0600-\u06FF\s-]/g, '').trim() : 'SmartArabicFont';
      
      const response = await fetch(FONT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fontName: projectName || 'SmartArabicFont',
          glyphs: payloadGlyphs
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "فشل توليد الخط من الخادم");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName || 'SmartArabicFont'}.ttf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showSuccess("تم تصدير الخط باحترافية من السيرفر!");

    } catch (err: any) {
      console.error(err);
      setError("حدث خطأ أثناء تصدير الخط: " + err.message);
    }
  };

  // --- Live Preview Rendering ---
  const NON_JOINING_CHARS = ['ا', 'أ', 'إ', 'آ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ة', 'ى', 'ء'];

  const isDiacritic = (char: string): boolean => {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return (code >= 0x064B && code <= 0x065F) || code === 0x0670;
  };

  const isArabicLetter = (char: string): boolean => {
    if (!char) return false;
    const code = char.charCodeAt(0);
    if (code < 0x0600 || code > 0x06FF) return false;
    if (isDiacritic(char)) return false;
    
    // Exclude common punctuation and digits
    const puncAndNumbers = [
      0x060C, // Arabic comma
      0x061B, // Arabic semicolon
      0x061F, // Arabic question mark
      0x0660, 0x0661, 0x0662, 0x0663, 0x0664, 0x0665, 0x0666, 0x0667, 0x0668, 0x0669 // Arabic digits
    ];
    if (puncAndNumbers.includes(code)) return false;
    return true;
  };

  const getArabicShapes = (text: string) => {
    const result: { char: string, position: 'isolated' | 'initial' | 'medial' | 'final' }[] = [];
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (char === ' ' || !isArabicLetter(char)) {
        result.push({ char, position: 'isolated' });
        continue;
      }
      
      // Get neighbors skipping diacritics
      let prevChar: string | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (isDiacritic(text[j])) continue;
        prevChar = text[j];
        break;
      }
      
      let nextChar: string | null = null;
      for (let j = i + 1; j < text.length; j++) {
        if (isDiacritic(text[j])) continue;
        nextChar = text[j];
        break;
      }
      
      // Determine if it can join with previous
      const joinsWithPrev = char !== 'ء' && 
                            prevChar && 
                            isArabicLetter(prevChar) && 
                            !NON_JOINING_CHARS.includes(prevChar) && 
                            prevChar !== 'ء';
                            
      // Determine if it can join with next
      const joinsWithNext = char !== 'ء' && 
                            !NON_JOINING_CHARS.includes(char) && 
                            nextChar && 
                            isArabicLetter(nextChar) && 
                            nextChar !== 'ء';
                            
      let position: 'isolated' | 'initial' | 'medial' | 'final' = 'isolated';
      
      if (joinsWithPrev && joinsWithNext) {
        position = 'medial';
      } else if (joinsWithPrev && !joinsWithNext) {
        position = 'final';
      } else if (!joinsWithPrev && joinsWithNext) {
        position = 'initial';
      } else {
        position = 'isolated';
      }
      
      result.push({ char, position });
    }
    
    return result;
  };

  const renderPreview = () => {
    if (!inputText) return null;

    const shapedChars = getArabicShapes(inputText);
    const matchedGlyphs: (Glyph | { isSpace: true, advanceWidth: number })[] = [];

    let i = 0;
    while (i < shapedChars.length) {
      // Try to find longest ligature first
      let foundLigature = false;
      for (let len = Math.min(5, shapedChars.length - i); len > 1; len--) {
        const subStr = shapedChars.slice(i, i + len).map(s => s.char).join('');
        const ligGlyph = glyphs.find(g => g.char === subStr);
        if (ligGlyph) {
          matchedGlyphs.push(ligGlyph);
          i += len;
          foundLigature = true;
          break;
        }
      }
      if (foundLigature) continue;

      const { char, position } = shapedChars[i];
      if (char === ' ') {
        matchedGlyphs.push({ isSpace: true, advanceWidth: 300 });
        i++;
        continue;
      }
      
      let glyph = glyphs.find(g => g.char === char && g.glyphType === position);
      if (!glyph) glyph = glyphs.find(g => g.char === char && g.glyphType === 'isolated');
      if (!glyph) glyph = glyphs.find(g => g.char === char);
      
      if (glyph) matchedGlyphs.push(glyph);
      i++;
    }

    if (matchedGlyphs.length === 0) return null;

    const renderItems = [];
    let cursorX = 0; // Start at 0
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < matchedGlyphs.length; i++) {
      const glyph = matchedGlyphs[i];
      
      if ('isSpace' in glyph) {
        cursorX -= glyph.advanceWidth;
        continue;
      }

      let advanceWidth = Math.round(glyph.rsb - glyph.lsb);
      if (advanceWidth <= 0) {
        // Fallback for visual preview to prevent overlapping
        advanceWidth = Math.max(100, Math.round(glyph.bounds.maxX - glyph.bounds.minX));
      }
      
      renderItems.push(
        <g key={`${glyph.id}-${i}`} transform={`translate(${cursorX}, 0)`}>
          <g transform={`translate(${-glyph.rsb}, ${-glyph.baselineY})`}>
            <path d={glyph.pathData} fill="currentColor" opacity="0.9" />
            {/* Visual indicators for debugging */}
            <line x1={glyph.rsb} y1={glyph.bounds.minY - 1000} x2={glyph.rsb} y2={glyph.bounds.maxY + 1000} stroke="#22c55e" strokeWidth={Math.max(1, (glyph.bounds.maxX - glyph.bounds.minX) * 0.01)} strokeDasharray="4,4" />
            <line x1={glyph.lsb} y1={glyph.bounds.minY - 1000} x2={glyph.lsb} y2={glyph.bounds.maxY + 1000} stroke="#ef4444" strokeWidth={Math.max(1, (glyph.bounds.maxX - glyph.bounds.minX) * 0.01)} strokeDasharray="4,4" />
          </g>
        </g>
      );
      
      // Update bounds for viewBox
      // transformed bounds
      const tMinX = glyph.bounds.minX - glyph.rsb;
      const tMaxX = glyph.bounds.maxX - glyph.rsb;
      const tMinY = glyph.bounds.minY - glyph.baselineY; // NOT flipped
      const tMaxY = glyph.bounds.maxY - glyph.baselineY; // NOT flipped

      minX = Math.min(minX, cursorX + tMinX);
      maxX = Math.max(maxX, cursorX + tMaxX);
      minY = Math.min(minY, tMinY);
      maxY = Math.max(maxY, tMaxY);

      // Move cursor left for the next character
      cursorX -= advanceWidth;
    }

    const padding = 100;
    const viewBox = `${minX - padding} ${minY - padding} ${(maxX - minX) + padding * 2} ${(maxY - minY) + padding * 2}`;

    return (
      <svg 
        viewBox={viewBox} 
        className="w-full h-full max-h-[400px] drop-shadow-2xl"
      >
        {/* Baseline indicator at Y=0 */}
        <line x1={minX - padding} y1={0} x2={maxX + padding} y2={0} stroke="#3b82f6" strokeWidth="2" strokeDasharray="10,10" opacity="0.5" />
        {renderItems}
      </svg>
    );
  };

  const renderConfirmDialog = () => {
    if (!confirmDialog?.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/80 backdrop-blur-md p-4" dir="rtl">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
          <h3 className="text-base font-bold text-zinc-900 mb-2">تأكيد الإجراء</h3>
          <p className="text-xs text-zinc-600 mb-6 leading-relaxed">{confirmDialog.message}</p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setConfirmDialog(null)}
              className="px-4 py-2 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full font-bold hover:bg-zinc-200 hover:text-zinc-900 transition-all text-xs"
            >
              إلغاء
            </button>
            <button
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog(null);
              }}
              className="px-4 py-2 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-all text-xs"
            >
              تأكيد
            </button>
          </div>
        </div>
      </div>
    );
  };

  const exportBackup = () => {
    const dataStr = JSON.stringify(projects);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smart_font_backup.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          setProjects(data);
          showSuccess("تم استيراد النسخة الاحتياطية بنجاح!");
        } else {
          throw new Error("Invalid format");
        }
      } catch (err) {
        setError("ملف النسخة الاحتياطية غير صالح.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderDashboard = () => {
    return (
      <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-white/20">
        {renderConfirmDialog()}
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center">
                <Type className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                  مُحاذي الخطوط الذكي
                </h1>
                <p className="text-[10px] text-zinc-600 font-medium tracking-wide">أداة ضبط ومحاذاة الحروف العربية</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-8" dir="rtl">
            <h2 className="text-xl font-bold text-zinc-900">مشاريع الخطوط</h2>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsCreatingProject(true)}
                className="px-4 py-2 bg-zinc-900 text-white rounded-full font-bold hover:bg-black transition-colors flex items-center gap-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                مشروع جديد
              </button>
            </div>
          </div>

          {isCreatingProject && (
            <div className="mb-8 p-6 bg-zinc-50/60 border border-zinc-300/60 rounded-3xl flex items-center gap-4" dir="rtl">
              <input 
                type="text" 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="اسم المشروع الجديد..."
                className="flex-1 bg-white border border-zinc-300/80 rounded-full px-5 py-2.5 text-zinc-900 focus:outline-none focus:border-zinc-500 transition-all text-right text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createNewProject()}
              />
              <button 
                onClick={createNewProject}
                className="px-5 py-2.5 bg-zinc-900 text-white rounded-full font-bold hover:bg-black transition-colors text-xs"
              >
                إنشاء
              </button>
              <button 
                onClick={() => { setIsCreatingProject(false); setNewProjectName(''); }}
                className="px-5 py-2.5 bg-transparent border border-zinc-300 text-zinc-600 rounded-full font-semibold hover:bg-zinc-50 transition-colors text-xs"
              >
                إلغاء
              </button>
            </div>
          )}

          {projects.length === 0 && !isCreatingProject ? (
            <div className="text-center py-20 bg-zinc-50/30 border border-zinc-200/80 rounded-3xl">
              <Type className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-zinc-800 mb-2">لا توجد مشاريع</h3>
              <p className="text-zinc-500 text-sm">قم بإنشاء مشروع جديد للبدء في تصميم خطك.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" dir="rtl">
              {projects.map(project => (
                <div key={project.id} className="bg-zinc-50/30 border border-zinc-200/60 rounded-3xl p-6 hover:border-zinc-300 hover:bg-zinc-50/50 transition-all group relative cursor-pointer flex flex-col" onClick={() => setCurrentProjectId(project.id)}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                    className="absolute top-4 left-4 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/25 rounded-xl transition-all z-10 flex items-center gap-1.5 text-[10px] font-bold"
                    title="حذف المشروع"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                  <div className="w-11 h-11 bg-zinc-200/40 rounded-2xl flex items-center justify-center mb-4 border border-zinc-300/20">
                    <Type className="w-5 h-5 text-zinc-700" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 mb-2 text-right">{project.name}</h3>
                  <div className="flex items-center justify-start gap-3 text-xs text-zinc-600 mb-6">
                    <span>{project.glyphs.length} محرف</span>
                    <span className="text-zinc-800">•</span>
                    <span>آخر تعديل: {new Date(project.lastModified).toLocaleDateString('ar-SA')}</span>
                  </div>
                  <div className="mt-auto flex justify-end">
                    <div className="flex items-center gap-1.5 text-zinc-700 text-xs font-semibold group-hover:gap-2.5 transition-all">
                      <span>فتح المشروع</span>
                      <ArrowRight className="w-3.5 h-3.5 rotate-180 text-zinc-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  };

  const renderEditorModal = () => {
    if (!editingGlyphId) return null;
    const glyph = glyphs.find(g => g.id === editingGlyphId);
    if (!glyph) return null;

    const metricsWidth = Math.max(1, glyph.rsb - glyph.lsb);
    const metricsHeight = Math.max(1, glyph.metrics.ascent - glyph.metrics.descent);
    
    // Calculate a viewBox that encompasses the metrics box plus some padding
    const padding = Math.max(metricsWidth, metricsHeight) * 0.3; // 30% padding
    
    // We also need to ensure the glyph's actual bounds are visible if they exceed the metrics box
    const minX = Math.min(glyph.bounds.minX, glyph.lsb) - padding;
    const maxX = Math.max(glyph.bounds.maxX, glyph.rsb) + padding;
    const minY = Math.min(glyph.bounds.minY, glyph.baselineY - glyph.metrics.ascent) - padding;
    const maxY = Math.max(glyph.bounds.maxY, glyph.baselineY - glyph.metrics.descent) + padding;
    
    const vbX = minX;
    const vbY = minY;
    const vbW = Math.max(1, maxX - minX);
    const vbH = Math.max(1, maxY - minY);
    const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

    return (
      <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-md flex items-center justify-center p-4 lg:p-8" dir="rtl">
        <div className="bg-white border border-zinc-200 rounded-3xl w-full max-w-6xl max-h-full flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-zinc-200 bg-white">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-zinc-700">المحرف:</h2>
              <input
                type="text"
                value={glyph.char}
                onChange={(e) => updateGlyphChar(glyph.id, e.target.value)}
                className="bg-zinc-50 border border-zinc-300 rounded-xl px-2.5 py-1 text-sm font-semibold text-zinc-900 focus:outline-none focus:border-zinc-500 w-16 text-center"
                dir="rtl"
                title="تعديل الحرف المرتبط"
              />
              <select 
                value={glyph.glyphType}
                onChange={(e) => updateGlyphType(glyph.id, e.target.value as any)}
                className="bg-zinc-50 border border-zinc-300 text-zinc-700 text-xs rounded-full px-4 py-1.5 focus:outline-none focus:border-zinc-500"
                dir="rtl"
              >
                <option value="isolated">منفصل</option>
                <option value="initial">بداية</option>
                <option value="medial">وسط</option>
                <option value="final">نهاية</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    message: "هل أنت متأكد من حذف هذا المحرف؟",
                    onConfirm: () => {
                      setGlyphs(prev => prev.filter(g => g.id !== glyph.id));
                      setEditingGlyphId(null);
                    }
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/5 text-red-400 hover:bg-red-500 hover:text-white rounded-full transition-all text-xs font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                حذف المحرف
              </button>
              <button 
                onClick={() => setEditingGlyphId(null)}
                className="w-8 h-8 flex items-center justify-center bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-full hover:bg-zinc-200 hover:text-zinc-900 transition-all text-xs font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 custom-scrollbar">
            {/* Editor Area */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {/* Outer Container (Big Box) */}
              <div className="bg-zinc-50/20 rounded-3xl p-4 flex items-center justify-center relative min-h-[400px] lg:min-h-[500px] border border-zinc-200 overflow-hidden">
                <svg viewBox={viewBox} className="w-full h-full">
                  {/* Grid Background for the whole preview area */}
                  <defs>
                    <pattern id="grid" width={vbW / 20} height={vbW / 20} patternUnits="userSpaceOnUse">
                      <path d={`M ${vbW / 20} 0 L 0 0 0 ${vbW / 20}`} fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth={vbW * 0.001} />
                    </pattern>
                  </defs>
                  <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#grid)" />Transmission

                  {/* The Actual Box (Metrics Box) - Dashed */}
                  <rect 
                    x={glyph.lsb} 
                    y={glyph.baselineY - glyph.metrics.ascent} 
                    width={metricsWidth} 
                    height={metricsHeight} 
                    fill="rgba(255,255,255,0.01)" 
                    stroke="rgba(255,255,255,0.2)" 
                    strokeWidth={Math.max(1, vbW * 0.002)} 
                    strokeDasharray={`${vbW * 0.01},${vbW * 0.01}`} 
                  />

                  {/* The Glyph */}
                  <path d={glyph.pathData} fill="currentColor" className="text-zinc-900" />
                  
                  {/* Ascent Line */}
                  <line x1={vbX} y1={glyph.baselineY - glyph.metrics.ascent} x2={vbX + vbW} y2={glyph.baselineY - glyph.metrics.ascent} stroke="#444" strokeWidth={Math.max(1, vbH * 0.0015)} strokeDasharray="4,4" opacity="0.4" />
                  <text x={vbX + vbW * 0.02} y={glyph.baselineY - glyph.metrics.ascent - vbH * 0.02} fill="#444" fontSize={vbH * 0.025} fontFamily="sans-serif">Ascent</text>
                  
                  {/* Descent Line */}
                  <line x1={vbX} y1={glyph.baselineY - glyph.metrics.descent} x2={vbX + vbW} y2={glyph.baselineY - glyph.metrics.descent} stroke="#444" strokeWidth={Math.max(1, vbH * 0.0015)} strokeDasharray="4,4" opacity="0.4" />
                  <text x={vbX + vbW * 0.02} y={glyph.baselineY - glyph.metrics.descent + vbH * 0.04} fill="#444" fontSize={vbH * 0.025} fontFamily="sans-serif">Descent</text>
                  
                  {/* Baseline */}
                  <line x1={vbX} y1={glyph.baselineY} x2={vbX + vbW} y2={glyph.baselineY} stroke="#3b82f6" strokeWidth={Math.max(1, vbH * 0.002)} opacity="0.6" />
                  <text x={vbX + vbW * 0.02} y={glyph.baselineY - vbH * 0.02} fill="#3b82f6" fontSize={vbH * 0.025} fontFamily="sans-serif">Baseline</text>
                  
                  {/* Right Guide (Start - RSB) */}
                  <line x1={glyph.rsb} y1={vbY} x2={glyph.rsb} y2={vbY + vbH} stroke="#10b981" strokeWidth={Math.max(1, vbW * 0.002)} opacity="0.6" />
                  <text x={glyph.rsb + vbW * 0.01} y={vbY + vbH * 0.1} fill="#10b981" fontSize={vbH * 0.025} fontFamily="sans-serif">RSB</text>
                  
                  {/* Left Guide (End - LSB) */}
                  <line x1={glyph.lsb} y1={vbY} x2={glyph.lsb} y2={vbY + vbH} stroke="#f43f5e" strokeWidth={Math.max(1, vbW * 0.002)} opacity="0.6" />
                  <text x={glyph.lsb - vbW * 0.06} y={vbY + vbH * 0.1} fill="#f43f5e" fontSize={vbH * 0.025} fontFamily="sans-serif">LSB</text>
                  
                  {/* Extra Guides */}
                  {(glyph.extraGuides || []).map((guide, idx) => (
                    <g key={idx}>
                      <line x1={vbX} y1={guide} x2={vbX + vbW} y2={guide} stroke="#a855f7" strokeWidth={Math.max(1, vbH * 0.0015)} strokeDasharray="4,4" opacity="0.4" />
                      <text x={vbX + vbW * 0.02} y={guide - vbH * 0.01} fill="#a855f7" fontSize={vbH * 0.02} fontFamily="sans-serif">Guide {idx + 1}</text>
                    </g>
                  ))}
                </svg>
              </div>

              {/* Movement Controls */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-zinc-500 font-semibold mb-1" dir="rtl">تحريك المحرف (Manual Translation)</span>
                <div className="grid grid-cols-3 gap-2 w-fit">
                  <div />
                  <button onClick={() => moveGlyph(glyph.id, 0, -10)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-all text-xs font-bold shadow-lg">↑</button>
                  <div />
                  <button onClick={() => moveGlyph(glyph.id, -10, 0)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-all text-xs font-bold shadow-lg">←</button>
                  <button onClick={() => moveGlyph(glyph.id, 0, 10)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-all text-xs font-bold shadow-lg">↓</button>
                  <button onClick={() => moveGlyph(glyph.id, 10, 0)} className="w-10 h-10 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-all text-xs font-bold shadow-lg">→</button>
                </div>
              </div>
            </div>

            {/* Settings Area */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-zinc-50/30 border border-zinc-200 rounded-3xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-zinc-800 mb-4" dir="rtl">المقاييس (Metrics)</h3>
                
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1" dir="rtl">Ascent (الارتفاع)</label>
                  <input 
                    type="number" 
                    value={glyph.metrics.ascent}
                    onChange={(e) => updateMetric(glyph.id, 'ascent', Number(e.target.value))}
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-2 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500 text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1" dir="rtl">Descent (النزول)</label>
                  <input 
                    type="number" 
                    value={glyph.metrics.descent}
                    onChange={(e) => updateMetric(glyph.id, 'descent', Number(e.target.value))}
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-2 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500 text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1" dir="rtl">Baseline Y (خط السطر)</label>
                  <input 
                    type="number" 
                    value={glyph.baselineY}
                    onChange={(e) => updateGuide(glyph.id, 'baseline', Number(e.target.value))}
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-2 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500 text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1" dir="rtl">RSB (الحد الأيمن - البداية)</label>
                  <input 
                    type="number" 
                    value={glyph.rsb}
                    onChange={(e) => updateGuide(glyph.id, 'rsb', Number(e.target.value))}
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-2 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500 text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 block mb-1" dir="rtl">LSB (الحد الأيسر - النهاية)</label>
                  <input 
                    type="number" 
                    value={glyph.lsb}
                    onChange={(e) => updateGuide(glyph.id, 'lsb', Number(e.target.value))}
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-2 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500 text-center"
                    dir="ltr"
                  />
                </div>

                {glyph.rsb <= glyph.lsb && (
                  <div className="bg-amber-500/5 border border-amber-500/10 text-amber-400 p-3.5 rounded-2xl text-xs space-y-1 leading-relaxed" dir="rtl">
                    <p className="font-bold text-[11px]">⚠️ تنبيه: الحد الأيمن (RSB) أصغر أو يساوي الأيسر (LSB)</p>
                    <p className="text-zinc-600 text-[10px]">يؤدي ذلك لمسافة تباعد (Advance Width) صفر أو سالبة وتراكم الحروف. تم تطبيق قيمة افتراضية تلقائياً للتباعد.</p>
                  </div>
                )}

                <div className="pt-4 border-t border-zinc-200">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] font-semibold text-zinc-500" dir="rtl">أدلة إضافية (Extra Guides)</label>
                    <button 
                      onClick={() => {
                        setGlyphs(prev => prev.map(g => {
                          if (g.id !== glyph.id) return g;
                          return { ...g, extraGuides: [...(g.extraGuides || []), glyph.baselineY - 100] };
                        }));
                      }}
                      className="text-[10px] bg-zinc-50 border border-zinc-200 text-zinc-700 px-3 py-1.5 rounded-full font-bold hover:bg-zinc-200 hover:text-zinc-900 transition-all"
                    >
                      + إضافة دليل
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(glyph.extraGuides || []).map((guide, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input 
                          type="number" 
                          value={guide}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setGlyphs(prev => prev.map(g => {
                              if (g.id !== glyph.id) return g;
                              const newGuides = [...(g.extraGuides || [])];
                              newGuides[idx] = val;
                              return { ...g, extraGuides: newGuides };
                            }));
                          }}
                          className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500 text-center"
                          dir="ltr"
                        />
                        <button 
                          onClick={() => {
                            setGlyphs(prev => prev.map(g => {
                              if (g.id !== glyph.id) return g;
                              const newGuides = [...(g.extraGuides || [])];
                              newGuides.splice(idx, 1);
                              return { ...g, extraGuides: newGuides };
                            }));
                          }}
                          className="p-1.5 bg-zinc-50 border border-zinc-200 text-zinc-600 rounded-full hover:bg-red-500 hover:text-white transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDrawingStudio = () => {
    if (!isDrawingStudioOpen) return null;
    
    const dPath = compiledDrawingPath();
    
    const gridLinesX = [];
    for (let x = 0; x <= 1000; x += 50) {
      gridLinesX.push(x);
    }
    const gridLinesY = [];
    for (let y = -200; y <= 800; y += 50) {
      gridLinesY.push(y);
    }

    const downloadSVG = () => {
      if (drawCommands.length === 0) {
        alert("لا يوجد مسار للتحميل!");
        return;
      }
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -200 1000 1000">
  <path d="${dPath}" fill="rgba(0,0,0,0.8)" />
</svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${drawCharName || 'glyph'}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const saveDrawnGlyph = () => {
      if (drawCommands.length === 0) {
        alert("الرجاء رسم مسار واحد على الأقل قبل الحفظ!");
        return;
      }
      
      const charName = drawCharName.trim() || '!';
      const pathString = dPath;
      let bounds = { minX: 100, maxX: 500, minY: 200, maxY: 600 };
      let rsb = 600;
      let lsb = 100;
      try {
        const b = calculateExactPathBounds(pathString);
        if (isFinite(b.x1) && isFinite(b.x2)) {
          bounds = {
            minX: Math.round(b.x1),
            maxX: Math.round(b.x2),
            minY: Math.round(b.y1),
            maxY: Math.round(b.y2)
          };
          lsb = Math.max(0, Math.round(b.x1 - 20));
          rsb = Math.round(b.x2 + 20);
        }
      } catch (e) {
        console.error("Error calculating bounds:", e);
      }
      
      const newGlyph: Glyph = {
        id: Date.now().toString(),
        char: charName,
        pathData: pathString,
        glyphType: drawGlyphType,
        metrics: {
          ascent: 800,
          descent: -200
        },
        bounds,
        baselineY: 600,
        rsb,
        lsb,
        extraGuides: []
      };
      
      setGlyphs(prev => {
        const filtered = prev.filter(g => g.char !== newGlyph.char);
        return [...filtered, newGlyph];
      });
      
      setDrawCharName('');
      setDrawCommands([]);
      setIsDrawingStudioOpen(false);
      showSuccess(`تم حفظ المحرف "${newGlyph.char}" المخطط بنجاح!`);
    };

    // Helper to extract clean SVG coordinates from Mouse or Touch events
    const getSvgCoords = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (!svgRef.current) return null;
      
      let clientX = 0;
      let clientY = 0;
      
      if ('touches' in e) {
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      
      const point = svgRef.current.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return null;
      
      const svgP = point.matrixTransform(ctm.inverse());
      
      return {
        x: Math.round(svgP.x),
        y: Math.round(svgP.y)
      };
    };

    const handleSvgMouseDownOrTouchStart = (
      e: React.MouseEvent<any> | React.TouchEvent<any>,
      type: 'cursor' | 'control' | 'node' | 'node-control' | 'node-control-prev' | 'node-control-next' | 'selection' | 'pan',
      index?: number
    ) => {
      e.stopPropagation();
      if (type === 'cursor') setActiveTarget('cursor');
      if (type === 'control') setActiveTarget('control');
      if (type.startsWith('node')) {
        setUndoStack(prev => [...prev, drawCommands]);
        setRedoStack([]);
        if (index !== undefined && !selectedNodeIndices.includes(index)) {
          setSelectedNodeIndices([index]);
        }
      }
      if (type === 'selection') {
        const coords = getSvgCoords(e);
        if (coords) {
          setSelectionStart(coords);
          setSelectionEnd(coords);
        }
      }
      if (type === 'pan') {
        let clientX = 0, clientY = 0;
        if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }
        setPanStart({ x: clientX, y: clientY, vbX: viewBox.x, vbY: viewBox.y });
      }
      setDraggingPoint({ type, index });
    };

    const handleSvgMouseMoveOrTouchMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (!draggingPoint) return;
      
      const coords = getSvgCoords(e);
      if (!coords) return;
      
      // Clamp coordinates to keep them fully within viewBox 1000x1000 (-200 to 800 on Y)
      const clampedX = Math.round(Math.max(0, Math.min(1000, coords.x)));
      const clampedY = Math.round(Math.max(-200, Math.min(800, coords.y)));
      
      if (draggingPoint.type === 'cursor') {
        setCursorX(clampedX);
        setCursorY(clampedY);
      } else if (draggingPoint.type === 'control') {
        setControlX(clampedX);
        setControlY(clampedY);
      } else if (draggingPoint.type === 'pan' && panStart) {
        let clientX = 0, clientY = 0;
        if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
        }
        
        const dx = clientX - panStart.x;
        const dy = clientY - panStart.y;
        
        const svgElement = svgRef.current;
        if (svgElement) {
          const { width, height } = svgElement.getBoundingClientRect();
          const scaleX = viewBox.w / width;
          const scaleY = viewBox.h / height;
          
          setViewBox({
            ...viewBox,
            x: panStart.vbX - (dx * scaleX),
            y: panStart.vbY - (dy * scaleY)
          });
        }
      } else if (draggingPoint.type === 'node' && draggingPoint.index !== undefined) {
        const idx = draggingPoint.index;
        
        // Define if we should move the selection
        const isDraggingSelection = selectedNodeIndices.includes(idx);
        
        setDrawCommands(prev => {
          const oldCmd = prev[idx];
          if (!oldCmd) return prev;
          
          const dx = clampedX - oldCmd.x;
          const dy = clampedY - oldCmd.y;
          
          return prev.map((cmd, i) => {
            if (isDraggingSelection && selectedNodeIndices.includes(i)) {
                // Move selected
                const updated = { ...cmd, x: cmd.x + dx, y: cmd.y + dy };
                if (updated.cx !== undefined) updated.cx += dx;
                if (updated.cy !== undefined) updated.cy += dy;
                if (updated.cx1 !== undefined) updated.cx1 += dx;
                if (updated.cy1 !== undefined) updated.cy1 += dy;
                if (updated.cx2 !== undefined) updated.cx2 += dx;
                if (updated.cy2 !== undefined) updated.cy2 += dy;
                return updated;
            } else if (i === idx) {
              // Move only node
              const updated = { ...cmd, x: clampedX, y: clampedY };
              if (updated.cx2 !== undefined) updated.cx2 += dx;
              if (updated.cy2 !== undefined) updated.cy2 += dy;
              return updated;
            }
            if (i === idx + 1) {
              const updated = { ...cmd };
              if (updated.cx1 !== undefined) updated.cx1 += dx;
              if (updated.cy1 !== undefined) updated.cy1 += dy;
              return updated;
            }
            return cmd;
          });
        });
      } else if (draggingPoint.type === 'node-control' && draggingPoint.index !== undefined) {
        const idx = draggingPoint.index;
        setDrawCommands(prev => prev.map((cmd, i) => {
          if (i === idx) {
            let nextCmd = { ...cmd, cx: clampedX, cy: clampedY };
            if (areHandlesLinked && cmd.cx2 !== undefined && cmd.cy2 !== undefined) {
                const dx = cmd.x - clampedX;
                const dy = cmd.y - clampedY;
                nextCmd.cx2 = cmd.x + dx;
                nextCmd.cy2 = cmd.y + dy;
            }
            return nextCmd;
          }
          return cmd;
        }));
      } else if (draggingPoint.type === 'node-control-prev' && draggingPoint.index !== undefined) {
        const idx = draggingPoint.index;
        setDrawCommands(prev => prev.map((cmd, i) => {
          if (i === idx) {
            let nextCmd = { ...cmd, cx2: clampedX, cy2: clampedY };
            if (areHandlesLinked && cmd.cx !== undefined && cmd.cy !== undefined) {
                const dx = cmd.x - clampedX;
                const dy = cmd.y - clampedY;
                nextCmd.cx = cmd.x + dx;
                nextCmd.cy = cmd.y + dy;
            }
            return nextCmd;
          }
          return cmd;
        }));
      } else if (draggingPoint.type === 'node-control-next' && draggingPoint.index !== undefined) {
        const idx = draggingPoint.index;
        setDrawCommands(prev => prev.map((cmd, i) => {
          if (i === idx) {
            return { ...cmd, cx1: clampedX, cy1: clampedY };
          }
          return cmd;
        }));
      } else if ((draggingPoint.type as any) === 'selection' && selectionStart) {
        setSelectionEnd({ x: clampedX, y: clampedY });
        const x1 = Math.min(selectionStart.x, clampedX);
        const x2 = Math.max(selectionStart.x, clampedX);
        const y1 = Math.min(selectionStart.y, clampedY);
        const y2 = Math.max(selectionStart.y, clampedY);
        
        const selected: number[] = [];
        drawCommands.forEach((cmd, idx) => {
          if (cmd.type !== 'Z' && cmd.x >= x1 && cmd.x <= x2 && cmd.y >= y1 && cmd.y <= y2) {
            selected.push(idx);
          }
        });
        setSelectedNodeIndices(selected);
      }
    };

    const handleSvgMouseUpOrTouchEnd = () => {
      setDraggingPoint(null);
      setSelectionStart(null);
      setSelectionEnd(null);
      setPanStart(null);
    };

    const drawVectorAtAngle = () => {
      const angle = Number(angleInput);
      const length = Number(lengthInput);
      if (isNaN(angle) || isNaN(length)) return;
      
      const rad = (angle * Math.PI) / 180;
      const dx = Math.round(Math.cos(rad) * length);
      const dy = Math.round(-Math.sin(rad) * length);
      
      const newX = cursorX + dx;
      const newY = cursorY + dy;
      
      setCursorX(newX);
      setCursorY(newY);
      
      if (drawCommands.length === 0) {
        pushDrawCommands([{ type: 'M', x: newX, y: newY }]);
      } else {
        pushDrawCommands([...drawCommands, { type: 'L', x: newX, y: newY }]);
      }
    };

    const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
      // Only handle clicks if we aren't dragging
      if (draggingPoint) return;
      if (isSelectionBoxActive) return;

      // Clear selections when clicking empty space
      const coords = getSvgCoords(e);
      if (!coords) return;
      
      // Snap to nearest 5 units on simple clicks for cleaner paths
      const snappedX = Math.round(coords.x / 5) * 5;
      const snappedY = Math.round(coords.y / 5) * 5;
      
      if (activeTarget === 'cursor') {
        setCursorX(snappedX);
        setCursorY(snappedY);
        
        if (isAddingBetween && selectedNodeIndices.length === 2) {
          const sortedIndices = [...selectedNodeIndices].sort((a, b) => a - b);
          const newCmd = { type: 'L', x: snappedX, y: snappedY };
          const newCmds = [...drawCommands];
          newCmds.splice(sortedIndices[0] + 1, 0, newCmd);
          pushDrawCommands(newCmds);
          return;
        }
      }

      // Clear selections when clicking empty space
      setSelectedNodeIndices([]);
      setSelectedNodeIndex(null);
      
      if (activeTarget === 'cursor') {
        setCursorX(snappedX);
        setCursorY(snappedY);

        if (autoAddOnClick) {
          if (drawCommands.length === 0) {
            pushDrawCommands([{ type: 'M', x: snappedX, y: snappedY }]);
          } else {
            pushDrawCommands([...drawCommands, { type: 'L', x: snappedX, y: snappedY }]);
          }
        } else {
          // Auto-update control point to midpoint
          if (drawCommands.length > 0) {
            const lastCmd = drawCommands[drawCommands.length - 1];
            setControlX(Math.round((lastCmd.x + snappedX) / 2));
            setControlY(Math.round((lastCmd.y + snappedY) / 2));
          } else {
            setControlX(snappedX);
            setControlY(snappedY);
          }
        }
      } else {
        setControlX(snappedX);
        setControlY(snappedY);
      }
    };

    return (
      <div className="fixed inset-0 z-[150] bg-white text-zinc-900 flex flex-col h-[100dvh] overflow-hidden select-none" dir="rtl">
        <div className="flex-1 h-0 flex relative bg-zinc-50 overflow-hidden">
          <div className="absolute top-4 left-4 z-50">
            <button onClick={() => setShowAdvancedTools(prev => !prev)} className="p-3 bg-white hover:bg-zinc-100 rounded-xl text-zinc-600 border border-zinc-200 shadow-sm transition-all"><Settings2 className="w-5 h-5" /></button>
            {showAdvancedTools && (
               <div className="absolute top-14 left-0 w-48 bg-white border border-zinc-200 p-2 rounded-xl shadow-xl flex flex-col gap-1 z-50">
                  <button onClick={() => { const isAllSelected = selectedNodeIndices.length === drawCommands.length && drawCommands.length > 0; if (isAllSelected) setSelectedNodeIndices([]); else setSelectedNodeIndices(drawCommands.map((_, i) => i)); setShowAdvancedTools(false); }} className="flex items-center gap-2 text-zinc-700 hover:bg-zinc-100 p-2 rounded-lg text-sm w-full font-medium">تحديد الكل</button>
                  <button onClick={() => { setIsSelectionBoxActive(prev => !prev); setIsPanModeActive(false); setShowAdvancedTools(false); }} className={`flex items-center gap-2 p-2 rounded-lg text-sm w-full font-medium ${isSelectionBoxActive ? 'bg-sky-50 text-sky-600' : 'text-zinc-700 hover:bg-zinc-100'}`}>تحديد (مربع)</button>
                  <button onClick={() => { setShowGrid(prev => !prev); setShowAdvancedTools(false); }} className={`flex items-center gap-2 p-2 rounded-lg text-sm w-full font-medium ${showGrid ? 'bg-zinc-100 text-zinc-800' : 'text-zinc-700 hover:bg-zinc-100'}`}>إظهار الشبكة</button>
                  <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.map((cmd, i) => { if (selectedNodeIndices.includes(i) && cmd.type === 'L') { const prevCmd = i > 0 ? drawCommands[i - 1] : { x: 0, y: 0 }; return { ...cmd, type: 'Q', cx: (prevCmd.x + cmd.x) / 2, cy: (prevCmd.y + cmd.y) / 2 }; } if (selectedNodeIndices.includes(i) && cmd.type === 'Q') { return { type: 'L', x: cmd.x, y: cmd.y }; } return cmd; }); pushDrawCommands(newCmds); setShowAdvancedTools(false); } }} className="flex items-center gap-2 text-zinc-700 hover:bg-zinc-100 p-2 rounded-lg text-sm w-full font-medium">تحويل لمنحنيات</button>
                  <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.map((cmd, i) => { if (selectedNodeIndices.includes(i) && cmd.type === 'Q') { return { type: 'L', x: cmd.x, y: cmd.y }; } return cmd; }); pushDrawCommands(newCmds); setShowAdvancedTools(false); } }} className="flex items-center gap-2 text-zinc-700 hover:bg-zinc-100 p-2 rounded-lg text-sm w-full font-medium">تحويل لزوايا</button>
                  <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.filter((_, i) => !selectedNodeIndices.includes(i)); pushDrawCommands(newCmds); setSelectedNodeIndices([]); setShowAdvancedTools(false); } }} disabled={selectedNodeIndices.length === 0} className="flex items-center gap-2 text-red-600 hover:bg-red-50 p-2 rounded-lg text-sm w-full font-medium disabled:opacity-50">حذف النقاط المحددة</button>
                  <div className="h-px bg-zinc-200 my-1 w-full"></div>
                  <button onClick={() => { if (drawCommands.length > 0) { if (!confirm("هل تريد الخروج دون حفظ؟")) return; } setIsDrawingStudioOpen(false); }} className="flex items-center gap-2 text-red-600 hover:bg-red-50 p-2 rounded-lg text-sm w-full font-medium"><X className="w-4 h-4" /> خروج بدون حفظ</button>
               </div>
            )}
          </div>
          <svg 
            ref={svgRef} className={`w-full h-full touch-none ${isPanModeActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="xMidYMid slice"
            onMouseDown={(e) => handleSvgMouseDownOrTouchStart(e, isPanModeActive ? 'pan' : isSelectionBoxActive ? 'selection' : 'cursor')}
            onTouchStart={(e) => handleSvgMouseDownOrTouchStart(e, isPanModeActive ? 'pan' : isSelectionBoxActive ? 'selection' : 'cursor')}
            onMouseMove={handleSvgMouseMoveOrTouchMove} onTouchMove={handleSvgMouseMoveOrTouchMove}
            onMouseUp={handleSvgMouseUpOrTouchEnd} onTouchEnd={handleSvgMouseUpOrTouchEnd}
            onWheel={(e) => {
              e.preventDefault();
              handleZoom(e.deltaY > 0 ? 1.1 : 0.9);
            }}
            onClick={handleCanvasClick}
          >
            {showGrid && (
              <g className="pointer-events-none">
                {gridLinesX.map(x => ( <line key={`x-${x}`} x1={x} y1="-2000" x2={x} y2="2000" stroke="#f1f5f9" strokeWidth="1" /> ))}
                {gridLinesY.map(y => ( <line key={`y-${y}`} x1="-2000" y1={y} x2="2000" y2={y} stroke="#f1f5f9" strokeWidth="1" /> ))}
              </g>
            )}
            <path d={dPath} fill={drawCommands.length > 0 && drawCommands[drawCommands.length - 1].type === 'Z' ? 'rgba(0,0,0,0.8)' : 'none'} stroke="#18181b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none" />
            {drawCommands.map((cmd, i) => {
              const isSelected = selectedNodeIndices.includes(i);
              return (
                <g key={i}>
                  <rect x={cmd.x - 6} y={cmd.y - 6} width="12" height="12" fill={isSelected ? "#0ea5e9" : "#fff"} stroke={isSelected ? "#0284c7" : "#000"} strokeWidth="1.5" className="cursor-move" onMouseDown={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node', i); }} onTouchStart={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node', i); }} onClick={(e) => { e.stopPropagation(); if (e.shiftKey) { setSelectedNodeIndices(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]); } else { setSelectedNodeIndices([i]); } }} />
                  {cmd.cx !== undefined && cmd.cy !== undefined && (
                    <g>
                      <line x1={cmd.x} y1={cmd.y} x2={cmd.cx} y2={cmd.cy} stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" />
                      <circle cx={cmd.cx} cy={cmd.cy} r="6" fill="#fff" stroke="#10b981" strokeWidth="1.5" className="cursor-move" onMouseDown={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node-control', i); }} onTouchStart={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node-control', i); }} />
                    </g>
                  )}
                </g>
              );
            })}
            {isSelectionBoxActive && selectionStart && selectionEnd && (
              <rect x={Math.min(selectionStart.x, selectionEnd.x)} y={Math.min(selectionStart.y, selectionEnd.y)} width={Math.abs(selectionEnd.x - selectionStart.x)} height={Math.abs(selectionEnd.y - selectionStart.y)} fill="rgba(14, 165, 233, 0.1)" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4,4" className="pointer-events-none" />
            )}
            <rect x={cursorX - 4} y={cursorY - 4} width="8" height="8" fill="rgba(0,0,0,0.1)" stroke="#000" strokeWidth="1" strokeDasharray="2,2" className="pointer-events-none" />
          </svg>
        </div>
        <footer className="bg-white border-t border-zinc-200 p-3 z-40 shrink-0 w-full overflow-hidden">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto w-full px-2 pb-2 custom-scrollbar justify-start">
            
            <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-500 flex items-center shadow-inner min-w-fit justify-center whitespace-nowrap">
              {cursorX}, {cursorY}
            </div>

            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>

            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-inner items-center gap-1 shrink-0">
               <button onClick={() => { setIsPanModeActive(prev => !prev); setIsSelectionBoxActive(false); }} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${isPanModeActive ? 'bg-white text-amber-600 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}>تحريك</button>
               <button onClick={() => handleZoom(0.8)} className="px-2 py-1.5 rounded-md text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 transition-all" title="تكبير">+</button>
               <button onClick={() => handleZoom(1.25)} className="px-2 py-1.5 rounded-md text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 transition-all" title="تصغير">-</button>
            </div>

            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>

            {/* Draw Mode */}
            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-inner shrink-0">
              <button onClick={() => setDrawMode('line')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${drawMode === 'line' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>مستقيم</button>
              <button onClick={() => setDrawMode('curve')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${drawMode === 'curve' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>منحنى</button>
            </div>

            {/* Layer Switcher */}
            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-inner shrink-0">
              {[0, 1, 2].map(l => (
                <button key={l} onClick={() => setActiveLayer(l)} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeLayer === l ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>ط {l+1}</button>
              ))}
            </div>
            <button onClick={() => setDrawCommands(drawCommands.map(c => ({...c, layer: 0})))} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm shrink-0 whitespace-nowrap">دمج</button>

            <button onClick={() => { if (drawCommands.length === 0) { pushDrawCommands([{ type: 'M', x: cursorX, y: cursorY }]); } else { if (drawMode === 'line') { pushDrawCommands([...drawCommands, { type: 'L', x: cursorX, y: cursorY }]); } else { pushDrawCommands([...drawCommands, { type: 'Q', x: cursorX, y: cursorY, cx: controlX, cy: controlY }]); } } }} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap"><Plus className="w-4 h-4" /> إضافة نقطة</button>

            <button onClick={() => pushDrawCommands([...drawCommands, { type: 'M', x: cursorX, y: cursorY }])} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm shrink-0 whitespace-nowrap" title="جزء منفصل">مسار جديد</button>
            <button onClick={() => setIsAddingBetween(prev => !prev)} className={`px-3 py-2 border rounded-lg text-xs font-medium transition-all shadow-sm ${isAddingBetween ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}>تعديل المسار</button>
            <button onClick={() => { if (drawCommands.length > 0) pushDrawCommands([...drawCommands, { type: 'Z', x: 0, y: 0 }]); }} disabled={drawCommands.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm disabled:opacity-50 shrink-0 whitespace-nowrap">إغلاق المسار</button>
            <button onClick={autoCenter} disabled={drawCommands.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm disabled:opacity-50 shrink-0 whitespace-nowrap">توسيط تلقائي</button>
            <button onClick={() => setAreHandlesLinked(!areHandlesLinked)} className={`px-3 py-2 border rounded-lg text-xs font-medium transition-all shadow-sm ${areHandlesLinked ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}>ربط المقابض</button>
            <div className="flex items-center gap-2 px-2">
              <button onClick={() => scalePath(0.9)} className="px-2 py-1 bg-white border border-zinc-200 rounded text-xs">-</button>
              <span className="text-xs text-zinc-500">حجم</span>
              <button onClick={() => scalePath(1.1)} className="px-2 py-1 bg-white border border-zinc-200 rounded text-xs">+</button>
            </div>

            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>

            <button onClick={handleUndo} disabled={undoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center shrink-0"><Undo className="w-4 h-4" /></button>
            <button onClick={handleRedo} disabled={redoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center transform scale-x-[-1] shrink-0"><Undo className="w-4 h-4" /></button>
            
            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>
            <button onClick={downloadSVG} className="px-5 py-2 bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-200 rounded-lg text-xs font-medium transition-all shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap"><Download className="w-3.5 h-3.5" /> تنزيل SVG</button>
            <button onClick={saveDrawnGlyph} className="px-6 py-2 bg-black hover:bg-zinc-800 text-white rounded-lg text-xs font-medium transition-all shadow-md flex items-center gap-1.5 shrink-0 whitespace-nowrap"><Save className="w-3.5 h-3.5" /> حفظ</button>
          </div>
        </footer>
      </div>
    );
  };


  if (!currentProjectId) {
    return renderDashboard();
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-white/20">
      {renderConfirmDialog()}
      {/* Hidden container for measurements */}
      <div ref={hiddenContainerRef} className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden" aria-hidden="true" />
      {/* Modal */}
      {renderEditorModal()}
      {renderDrawingStudio()}
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center">
              <Type className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-base font-bold text-zinc-900">
                {currentProject?.name || 'Smart Font Aligner'}
              </h1>
              <p className="text-[10px] text-zinc-600 font-medium tracking-wide">أداة ضبط ومحاذاة الحروف العربية</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setCurrentProjectId(null)}
              className="px-4 py-2 bg-zinc-50 text-zinc-800 border border-zinc-200 rounded-full font-bold hover:bg-zinc-200 transition-colors flex items-center gap-2 text-xs"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              العودة للمشاريع
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Upload & Library */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Upload Section */}
          <div className="bg-zinc-50/30 border border-zinc-200/80 rounded-3xl p-6">
            <h2 className="text-base font-bold text-zinc-900 mb-4 flex items-center gap-2" dir="rtl">
              <Upload className="w-4 h-4 text-zinc-600" />
              إضافة محرف جديد
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5" dir="rtl">اسم المحرف (مثال: ك، م، كم)</label>
                <input 
                  type="text" 
                  value={uploadChar}
                  onChange={(e) => setUploadChar(e.target.value)}
                  placeholder="أدخل الحرف هنا..."
                  className="w-full bg-white border border-zinc-300 rounded-2xl px-4 py-2.5 text-xs text-zinc-900 focus:outline-none focus:border-zinc-500 transition-all text-right"
                  dir="rtl"
                />
              </div>

              <div className="relative group">
                <input 
                  type="file" 
                  accept=".svg,.svgz" 
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  title="اختر ملف SVG أو SVGZ"
                />
                <div className="w-full border border-dashed border-zinc-300 group-hover:border-zinc-500 rounded-3xl p-6 flex flex-col items-center justify-center gap-2.5 transition-all bg-white/40 group-hover:bg-zinc-50/40">
                  <div className="w-10 h-10 rounded-xl bg-zinc-200/40 border border-zinc-700/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-4 h-4 text-zinc-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-zinc-700">اسحب الملف أو انقر للرفع</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">ملفات SVG أو SVGZ</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs text-right px-4" dir="rtl">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 rounded-2xl bg-green-500/5 border border-green-500/10 text-green-400 text-xs flex items-center justify-end gap-2 px-4" dir="rtl">
                  <span>{success}</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              )}

              <div className="relative flex items-center justify-center py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200/60"></div>
                </div>
                <span className="relative px-3 bg-white text-[10px] text-zinc-500 font-bold">أو ارسمه هندسياً</span>
              </div>

              <button
                onClick={() => {
                  setDrawCharName(uploadChar || '');
                  setDrawCommands([]);
                  setCursorX(500);
                  setCursorY(600);
                  setIsDrawingStudioOpen(true);
                }}
                className="w-full py-3 bg-teal-600/10 hover:bg-teal-600/20 text-teal-400 hover:text-indigo-300 border border-teal-500/15 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                dir="rtl"
              >
                <PenTool className="w-3.5 h-3.5" />
                استوديو الرسم المباشر (Direct Studio)
              </button>
            </div>
          </div>

          {/* Library Section */}
          <div className="bg-zinc-50/30 border border-zinc-200/80 rounded-3xl p-6 flex-1">
            <h2 className="text-base font-bold text-zinc-900 mb-4 flex items-center gap-2" dir="rtl">
              <Save className="w-4 h-4 text-zinc-600" />
              مكتبة المحارف ({glyphs.length})
            </h2>
            
            {glyphs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs border border-dashed border-zinc-300/60 rounded-3xl" dir="rtl">
                لا توجد محارف محفوظة.<br/>قم برفع محرف للبدء.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {glyphs.map(glyph => {
                  const metricsWidth = Math.max(1, glyph.rsb - glyph.lsb);
                  const metricsHeight = Math.max(1, glyph.metrics.ascent - glyph.metrics.descent);
                  const padding = Math.max(metricsWidth, metricsHeight) * 0.3;
                  
                  const minX = Math.min(glyph.bounds.minX, glyph.lsb) - padding;
                  const maxX = Math.max(glyph.bounds.maxX, glyph.rsb) + padding;
                  const minY = Math.min(glyph.bounds.minY, glyph.baselineY - glyph.metrics.ascent) - padding;
                  const maxY = Math.max(glyph.bounds.maxY, glyph.baselineY - glyph.metrics.descent) + padding;
                  
                  const vbX = minX;
                  const vbY = minY;
                  const vbW = Math.max(1, maxX - minX);
                  const vbH = Math.max(1, maxY - minY);
                  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;
                  
                  return (
                    <div 
                      key={glyph.id} 
                      onClick={() => setEditingGlyphId(glyph.id)}
                      className="group relative bg-white border border-zinc-200 rounded-2xl p-3 flex flex-col items-center gap-2 hover:border-zinc-200 hover:bg-zinc-50/20 transition-all cursor-pointer"
                    >
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({
                            isOpen: true,
                            message: "هل أنت متأكد من حذف هذا المحرف؟",
                            onConfirm: () => {
                              setGlyphs(prev => prev.filter(g => g.id !== glyph.id));
                            }
                          });
                        }}
                        className="absolute top-1 right-1 p-1.5 bg-red-500/5 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white z-10"
                        title="حذف"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      
                      <div className="w-full aspect-square bg-zinc-50/60 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-200 relative">
                        {glyph.char === '!' && (
                          <div className="absolute top-1 left-1 bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-sm" title="غير معرف">!</div>
                        )}
                        <svg viewBox={viewBox} className="w-full h-full p-2">
                          <path d={glyph.pathData} fill="currentColor" className="text-zinc-900" />
                        </svg>
                      </div>
                      
                      <div className="text-center w-full">
                        <div className={`font-bold text-sm truncate ${glyph.char === '!' ? 'text-amber-500' : 'text-zinc-800'}`} dir="rtl">{glyph.char === '!' ? 'غير معرف' : glyph.char}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {glyph.glyphType === 'isolated' && 'منفصل'}
                          {glyph.glyphType === 'initial' && 'بداية'}
                          {glyph.glyphType === 'medial' && 'وسط'}
                          {glyph.glyphType === 'final' && 'نهاية'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Live Preview & Export */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Live Typing Area */}
          <div className="bg-zinc-50/30 border border-zinc-200/80 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2" dir="rtl">
                <Keyboard className="w-4 h-4 text-zinc-600" />
                المعاينة الحية (Live Preview)
              </h2>
              <button 
                onClick={exportToFont}
                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-black text-white rounded-full text-xs font-bold transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير كخط (TTF)
              </button>
            </div>

            <div className="space-y-6">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="اكتب هنا لتجربة المحارف المدموجة..."
                className="w-full bg-white border border-zinc-200 rounded-2xl px-5 py-3.5 text-lg text-zinc-900 focus:outline-none focus:border-zinc-500 transition-all text-right placeholder:text-zinc-600"
                dir="rtl"
              />

              <div className="w-full aspect-video bg-white border border-zinc-200 rounded-3xl relative overflow-hidden flex items-center justify-center p-8">
                {/* Grid Background */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000006_1px,transparent_1px),linear-gradient(to_bottom,#00000006_1px,transparent_1px)] bg-[size:40px_40px]" />
                
                {/* Preview Content */}
                <div className="relative z-10 w-full h-full flex items-center justify-center text-zinc-900">
                  {inputText ? renderPreview() : (
                    <div className="text-zinc-400 flex flex-col items-center gap-2.5">
                      <Type className="w-10 h-10 opacity-40" />
                      <p className="text-xs">اكتب في المربع أعلاه لرؤية النتيجة</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-zinc-50/10 border border-zinc-200/40 rounded-3xl p-6">
            <h3 className="text-zinc-700 font-bold text-sm flex items-center gap-2 mb-3" dir="rtl">
              <Info className="w-4 h-4 text-zinc-500" />
              دليل المقاييس (Font Metrics)
            </h3>
            <ul className="text-xs text-zinc-600 space-y-3.5 list-none leading-relaxed" dir="rtl">
              <li><strong className="text-zinc-800 font-semibold">Baseline (خط السطر):</strong> السطر الذي تجلس عليه الحروف. (مثال: حرف الألف يجلس عليه، حرف الياء ينزل تحته).</li>
              <li><strong className="text-zinc-800 font-semibold">Ascent (الارتفاع الأعلى):</strong> أقصى ارتفاع مسموح للحرف (سقف الحرف).</li>
              <li><strong className="text-zinc-800 font-semibold">Descent (النزول الأسفل):</strong> أقصى نزول مسموح للحرف تحت السطر (قاع الحرف).</li>
              <li><strong className="text-zinc-800 font-semibold">RSB (الحد الأيمن):</strong> نقطة بداية الحرف من اليمين. في الحروف المتصلة، يجب أن تلامس نهاية الحرف السابق.</li>
              <li><strong className="text-zinc-800 font-semibold">LSB (الحد الأيسر):</strong> نقطة نهاية الحرف من اليسار. من هنا سيبدأ الحرف التالي.</li>
            </ul>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;
