import React, { useState, useEffect, useRef } from 'react';
import { Upload, Type, Download, Info, Trash2, Settings2, CheckCircle2, Keyboard, Save, Plus, ArrowRight, Edit2 } from 'lucide-react';
import opentype from 'opentype.js';
import { SVGPathData } from 'svg-pathdata';
import svgpath from 'svgpath';
import { extractAllPaths, svgToOpentype, calculateExactPathBounds, cleanAndNormalizePath } from './Svgprocessor';
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

  // Load from IndexedDB on mount with fallback to migration
  useEffect(() => {
    loadProjectsFromDb().then((loadedProjects) => {
      if (loadedProjects && loadedProjects.length > 0) {
        setProjects(loadedProjects);
        setCurrentProjectId(loadedProjects[0].id);
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
            setCurrentProjectId(migratedProject.id);
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

  const processUploadedSVG = async (file: File, charName: string) => {
    if (!charName.trim()) {
      setError("الرجاء إدخال اسم/حرف للمحرف قبل الرفع.");
      return;
    }

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      if (!svgEl) {
        throw new Error("ملف SVG غير صالح.");
      }

      const viewBox = svgEl.getAttribute('viewBox') || '0 0 1920 1920';
      const vbParts = viewBox.split(/\s+/).map(Number);
      const vbWidth = vbParts[2] || 1920;
      const vbHeight = vbParts[3] || 1920;
      const scaleFactor = 1000 / vbHeight; // Map vertical design space to 1000 units, scaling X and Y proportionally without distortion

      const { combinedPath, redPaths } = extractAllPaths(doc, vbWidth, vbHeight);

      if (!combinedPath.trim()) {
        throw new Error("لم يتم العثور على مسارات صالحة في الملف. تأكد من أن الملف يحتوي على أشكال.");
      }
      
      const horizontalLines: any[] = [];
      const verticalLines: any[] = [];

      redPaths.forEach(rp => {
        try {
          const b = calculateExactPathBounds(rp.pathData);
          const line = {
            minX: b.x1, maxX: b.x2, minY: b.y1, maxY: b.y2,
            width: b.x2 - b.x1, height: b.y2 - b.y1,
            centerX: (b.x1 + b.x2) / 2, centerY: (b.y1 + b.y2) / 2
          };
          if (line.width > line.height) horizontalLines.push(line);
          else verticalLines.push(line);
        } catch (e) {}
      });

      // 4. Scale the combined path
      const scaledPathData = svgpath(combinedPath).scale(scaleFactor).toString();

      // 4. Calculate Bounds and Auto-Center
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

      // Auto-Centering: Zero out the path so it always starts at (0,0) in the local canvas
      const zeroedPathData = svgpath(scaledPathData)
        .translate(-minX, -minY)
        .toString();

      const newMaxX = Math.round(maxX - minX);
      const newMaxY = Math.round(maxY - minY);

      // Process metrics from red lines
      horizontalLines.sort((a, b) => a.centerY - b.centerY);
      verticalLines.sort((a, b) => a.centerX - b.centerX);

      let finalAscent = 800;
      let finalDescent = -200;
      let finalBaselineY = Math.max(50, Math.round(800 - minY));
      let finalLSB = 0;
      let finalRSB = newMaxX;

      if (horizontalLines.length >= 3) {
        const ascentLine = horizontalLines[0];
        const baselineLine = horizontalLines[1];
        const descentLine = horizontalLines[2];

        const scaledAscentY = ascentLine.centerY * scaleFactor;
        const scaledBaselineY = baselineLine.centerY * scaleFactor;
        const scaledDescentY = descentLine.centerY * scaleFactor;

        finalBaselineY = Math.round(scaledBaselineY - minY);
        finalAscent = Math.round(scaledBaselineY - scaledAscentY);
        finalDescent = Math.round(scaledBaselineY - scaledDescentY);
      } else if (horizontalLines.length === 1) {
         const baselineLine = horizontalLines[0];
         const scaledBaselineY = baselineLine.centerY * scaleFactor;
         finalBaselineY = Math.round(scaledBaselineY - minY);
      }

      if (verticalLines.length >= 2) {
        const lsbLine = verticalLines[0];
        const rsbLine = verticalLines[1];

        const scaledLSBX = lsbLine.centerX * scaleFactor;
        const scaledRSBX = rsbLine.centerX * scaleFactor;

        finalLSB = Math.round(scaledLSBX - minX);
        finalRSB = Math.round(scaledRSBX - minX);
      }

      const newGlyph: Glyph = {
        id: Date.now().toString(),
        char: charName.trim(),
        pathData: zeroedPathData,
        glyphType: 'isolated',
        metrics: {
          ascent: finalAscent,
          descent: finalDescent
        },
        bounds: { 
          minX: 0,
          maxX: newMaxX,
          minY: 0, 
          maxY: newMaxY 
        },
        baselineY: finalBaselineY,
        rsb: finalRSB,
        lsb: finalLSB,
        extraGuides: []
      };

      setGlyphs(prev => {
        // Replace if char already exists, otherwise add
        const filtered = prev.filter(g => g.char !== newGlyph.char);
        return [...filtered, newGlyph];
      });

      setUploadChar('');
      setError(null);
      showSuccess(`تمت إضافة المحرف "${charName}" بنجاح!`);

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

        const advanceWidth = Math.max(0, Math.round(glyph.rsb - glyph.lsb));

        payloadGlyphs.push({
          name: String(postScriptName),
          unicode: Math.round(assignedUnicode),
          pathData: String(transformedPath),
          advanceWidth: Math.round(advanceWidth)
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

      const advanceWidth = Math.max(0, Math.round(glyph.rsb - glyph.lsb));
      
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
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" dir="rtl">
        <div className="bg-black border border-white/20 rounded-[2rem] p-8 max-w-md w-full shadow-2xl">
          <h3 className="text-xl font-bold text-white mb-4">تأكيد الحذف</h3>
          <p className="text-gray-300 mb-8">{confirmDialog.message}</p>
          <div className="flex gap-4 justify-end">
            <button
              onClick={() => setConfirmDialog(null)}
              className="px-4 py-2 bg-transparent border border-white/20 text-white rounded-full font-bold hover:bg-white/10 transition-colors text-sm"
            >
              إلغاء
            </button>
            <button
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog(null);
              }}
              className="px-4 py-2 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-colors text-sm"
            >
              تأكيد الحذف
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
      <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30">
        {renderConfirmDialog()}
        <header className="border-b border-white/10 bg-black sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                <Type className="w-5 h-5 text-black" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Smart Font Aligner
                </h1>
                <p className="text-xs text-gray-400 font-medium tracking-wide">PRO EDITION</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-8" dir="rtl">
            <h2 className="text-2xl font-bold text-white">مشاريع الخطوط</h2>
            <div className="flex items-center gap-3">
              <label className="px-4 py-2 bg-white/10 text-white rounded-full font-bold hover:bg-white/20 transition-colors flex items-center gap-2 text-sm cursor-pointer">
                <Upload className="w-4 h-4" />
                استيراد
                <input type="file" accept=".json" onChange={importBackup} className="hidden" />
              </label>
              <button 
                onClick={exportBackup}
                className="px-4 py-2 bg-white/10 text-white rounded-full font-bold hover:bg-white/20 transition-colors flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                تصدير (نسخة احتياطية)
              </button>
              <button 
                onClick={() => setIsCreatingProject(true)}
                className="px-4 py-2 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                مشروع جديد
              </button>
            </div>
          </div>

          {isCreatingProject && (
            <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-[2rem] flex items-center gap-4" dir="rtl">
              <input 
                type="text" 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="اسم المشروع الجديد..."
                className="flex-1 bg-black border border-white/20 rounded-full px-4 py-2 text-white focus:outline-none focus:border-white transition-all text-right text-sm"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createNewProject()}
              />
              <button 
                onClick={createNewProject}
                className="px-4 py-2 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-colors text-sm"
              >
                إنشاء
              </button>
              <button 
                onClick={() => { setIsCreatingProject(false); setNewProjectName(''); }}
                className="px-4 py-2 bg-transparent border border-white/20 text-white rounded-full font-bold hover:bg-white/10 transition-colors text-sm"
              >
                إلغاء
              </button>
            </div>
          )}

          {projects.length === 0 && !isCreatingProject ? (
            <div className="text-center py-20 bg-white/5 border border-white/10 rounded-[2rem]">
              <Type className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">لا توجد مشاريع</h3>
              <p className="text-gray-400">قم بإنشاء مشروع جديد للبدء في تصميم خطك.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" dir="rtl">
              {projects.map(project => (
                <div key={project.id} className="bg-black border border-white/10 rounded-[2rem] p-6 hover:border-white/30 transition-colors group relative cursor-pointer flex flex-col" onClick={() => setCurrentProjectId(project.id)}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                    className="absolute top-4 left-4 p-2 bg-red-500/10 text-red-500 rounded-full opacity-50 hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-10"
                    title="حذف المشروع"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4">
                    <Type className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 text-right">{project.name}</h3>
                  <div className="flex items-center justify-start gap-4 text-sm text-gray-400 mb-6">
                    <span>{project.glyphs.length} محرف</span>
                    <span>•</span>
                    <span>آخر تعديل: {new Date(project.lastModified).toLocaleDateString('ar-SA')}</span>
                  </div>
                  <div className="mt-auto flex justify-end">
                    <div className="flex items-center gap-2 text-white text-sm font-bold group-hover:gap-3 transition-all">
                      <span>فتح المشروع</span>
                      <ArrowRight className="w-4 h-4 rotate-180" />
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
      <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 lg:p-8" dir="rtl">
        <div className="bg-black border border-white/20 rounded-[2rem] w-full max-w-6xl max-h-full flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-white">تعديل المحرف:</h2>
              <input
                type="text"
                value={glyph.char}
                onChange={(e) => updateGlyphChar(glyph.id, e.target.value)}
                className="bg-black border border-white/20 rounded px-3 py-1 text-xl font-bold text-white focus:outline-none focus:border-white w-20 text-center"
                dir="rtl"
                title="تعديل الحرف المرتبط"
              />
              <select 
                value={glyph.glyphType}
                onChange={(e) => updateGlyphType(glyph.id, e.target.value as any)}
                className="bg-black border border-white/20 text-white text-sm rounded-full px-4 py-1.5 focus:outline-none focus:border-white"
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
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-colors text-xs font-bold"
              >
                <Trash2 className="w-4 h-4" />
                حذف المحرف
              </button>
              <button 
                onClick={() => setEditingGlyphId(null)}
                className="w-8 h-8 flex items-center justify-center bg-white text-black rounded-full hover:bg-gray-200 transition-colors text-sm font-bold"
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
              <div className="bg-white/5 rounded-[2rem] p-4 flex items-center justify-center relative min-h-[400px] lg:min-h-[500px] border border-white/10 overflow-hidden">
                <svg viewBox={viewBox} className="w-full h-full">
                  {/* Grid Background for the whole preview area */}
                  <defs>
                    <pattern id="grid" width={vbW / 20} height={vbW / 20} patternUnits="userSpaceOnUse">
                      <path d={`M ${vbW / 20} 0 L 0 0 0 ${vbW / 20}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={vbW * 0.001} />
                    </pattern>
                  </defs>
                  <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#grid)" />

                  {/* The Actual Box (Metrics Box) - Dashed */}
                  <rect 
                    x={glyph.lsb} 
                    y={glyph.baselineY - glyph.metrics.ascent} 
                    width={metricsWidth} 
                    height={metricsHeight} 
                    fill="rgba(255,255,255,0.02)" 
                    stroke="rgba(255,255,255,0.4)" 
                    strokeWidth={Math.max(1, vbW * 0.003)} 
                    strokeDasharray={`${vbW * 0.01},${vbW * 0.01}`} 
                  />

                  {/* The Glyph */}
                  <path d={glyph.pathData} fill="currentColor" className="text-white" />
                  
                  {/* Ascent Line */}
                  <line x1={vbX} y1={glyph.baselineY - glyph.metrics.ascent} x2={vbX + vbW} y2={glyph.baselineY - glyph.metrics.ascent} stroke="#666" strokeWidth={Math.max(1, vbH * 0.002)} strokeDasharray="4,4" opacity="0.5" />
                  <text x={vbX + vbW * 0.02} y={glyph.baselineY - glyph.metrics.ascent - vbH * 0.02} fill="#666" fontSize={vbH * 0.03} fontFamily="sans-serif">Ascent</text>
                  
                  {/* Descent Line */}
                  <line x1={vbX} y1={glyph.baselineY - glyph.metrics.descent} x2={vbX + vbW} y2={glyph.baselineY - glyph.metrics.descent} stroke="#666" strokeWidth={Math.max(1, vbH * 0.002)} strokeDasharray="4,4" opacity="0.5" />
                  <text x={vbX + vbW * 0.02} y={glyph.baselineY - glyph.metrics.descent + vbH * 0.04} fill="#666" fontSize={vbH * 0.03} fontFamily="sans-serif">Descent</text>
                  
                  {/* Baseline */}
                  <line x1={vbX} y1={glyph.baselineY} x2={vbX + vbW} y2={glyph.baselineY} stroke="#3b82f6" strokeWidth={Math.max(1, vbH * 0.003)} opacity="0.8" />
                  <text x={vbX + vbW * 0.02} y={glyph.baselineY - vbH * 0.02} fill="#3b82f6" fontSize={vbH * 0.03} fontFamily="sans-serif">Baseline</text>
                  
                  {/* Right Guide (Start - RSB) */}
                  <line x1={glyph.rsb} y1={vbY} x2={glyph.rsb} y2={vbY + vbH} stroke="#22c55e" strokeWidth={Math.max(1, vbW * 0.003)} opacity="0.8" />
                  <text x={glyph.rsb + vbW * 0.01} y={vbY + vbH * 0.1} fill="#22c55e" fontSize={vbH * 0.03} fontFamily="sans-serif">RSB</text>
                  
                  {/* Left Guide (End - LSB) */}
                  <line x1={glyph.lsb} y1={vbY} x2={glyph.lsb} y2={vbY + vbH} stroke="#ef4444" strokeWidth={Math.max(1, vbW * 0.003)} opacity="0.8" />
                  <text x={glyph.lsb - vbW * 0.06} y={vbY + vbH * 0.1} fill="#ef4444" fontSize={vbH * 0.03} fontFamily="sans-serif">LSB</text>
                  
                  {/* Extra Guides */}
                  {(glyph.extraGuides || []).map((guide, idx) => (
                    <g key={idx}>
                      <line x1={vbX} y1={guide} x2={vbX + vbW} y2={guide} stroke="#a855f7" strokeWidth={Math.max(1, vbH * 0.002)} strokeDasharray="4,4" opacity="0.6" />
                      <text x={vbX + vbW * 0.02} y={guide - vbH * 0.01} fill="#a855f7" fontSize={vbH * 0.02} fontFamily="sans-serif">Guide {idx + 1}</text>
                    </g>
                  ))}
                </svg>
              </div>

              {/* Movement Controls */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-gray-400 mb-1">تحريك المحرف (Manual Translation)</span>
                <div className="grid grid-cols-3 gap-2 w-fit">
                  <div />
                  <button onClick={() => moveGlyph(glyph.id, 0, -10)} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors text-lg font-bold shadow-lg">↑</button>
                  <div />
                  <button onClick={() => moveGlyph(glyph.id, -10, 0)} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors text-lg font-bold shadow-lg">←</button>
                  <button onClick={() => moveGlyph(glyph.id, 0, 10)} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors text-lg font-bold shadow-lg">↓</button>
                  <button onClick={() => moveGlyph(glyph.id, 10, 0)} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors text-lg font-bold shadow-lg">→</button>
                </div>
              </div>
            </div>

            {/* Settings Area */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-white/5 border border-white/10 rounded-[2rem] p-6 space-y-4">
                <h3 className="text-white font-bold mb-4">المقاييس (Metrics)</h3>
                
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Ascent (الارتفاع)</label>
                  <input 
                    type="number" 
                    value={glyph.metrics.ascent}
                    onChange={(e) => updateMetric(glyph.id, 'ascent', Number(e.target.value))}
                    className="w-full bg-black border border-white/20 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Descent (النزول)</label>
                  <input 
                    type="number" 
                    value={glyph.metrics.descent}
                    onChange={(e) => updateMetric(glyph.id, 'descent', Number(e.target.value))}
                    className="w-full bg-black border border-white/20 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Baseline Y (خط السطر)</label>
                  <input 
                    type="number" 
                    value={glyph.baselineY}
                    onChange={(e) => updateGuide(glyph.id, 'baseline', Number(e.target.value))}
                    className="w-full bg-black border border-white/20 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">RSB (الحد الأيمن - البداية)</label>
                  <input 
                    type="number" 
                    value={glyph.rsb}
                    onChange={(e) => updateGuide(glyph.id, 'rsb', Number(e.target.value))}
                    className="w-full bg-black border border-white/20 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white text-center"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">LSB (الحد الأيسر - النهاية)</label>
                  <input 
                    type="number" 
                    value={glyph.lsb}
                    onChange={(e) => updateGuide(glyph.id, 'lsb', Number(e.target.value))}
                    className="w-full bg-black border border-white/20 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white text-center"
                    dir="ltr"
                  />
                </div>

                <div className="pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs text-gray-400">أدلة إضافية (Extra Guides)</label>
                    <button 
                      onClick={() => {
                        setGlyphs(prev => prev.map(g => {
                          if (g.id !== glyph.id) return g;
                          return { ...g, extraGuides: [...(g.extraGuides || []), glyph.baselineY - 100] };
                        }));
                      }}
                      className="text-[10px] bg-white text-black px-3 py-1.5 rounded-full font-bold hover:bg-gray-200 transition-colors"
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
                          className="w-full bg-black border border-white/20 rounded-full px-4 py-1.5 text-xs text-white focus:outline-none focus:border-white text-center"
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
                          className="p-1.5 bg-white text-black rounded-full hover:bg-red-500 hover:text-white transition-colors"
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

  if (!currentProjectId) {
    return renderDashboard();
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30">
      {renderConfirmDialog()}
      {/* Hidden container for measurements */}
      <div ref={hiddenContainerRef} className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden" aria-hidden="true" />

      {/* Modal */}
      {renderEditorModal()}

      {/* Header */}
      <header className="border-b border-white/10 bg-black sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <Type className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <input 
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={() => {
                      if (editNameValue.trim() && currentProjectId) {
                        renameProject(currentProjectId, editNameValue.trim());
                      }
                      setIsEditingName(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editNameValue.trim() && currentProjectId) {
                          renameProject(currentProjectId, editNameValue.trim());
                        }
                        setIsEditingName(false);
                      }
                    }}
                    className="bg-black border border-white/20 rounded px-2 py-1 text-xl font-bold text-white focus:outline-none focus:border-white"
                    autoFocus
                    dir="rtl"
                  />
                ) : (
                  <>
                    <h1 className="text-xl font-bold text-white">
                      {currentProject?.name || 'Smart Font Aligner'}
                    </h1>
                    <button 
                      onClick={() => {
                        setEditNameValue(currentProject?.name || '');
                        setIsEditingName(true);
                      }}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-400 font-medium tracking-wide">PRO EDITION</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setCurrentProjectId(null)}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white text-xs font-bold flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              العودة للمشاريع
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Upload & Library */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Upload Section */}
          <div className="bg-black border border-white/10 rounded-[2rem] p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-white" />
              إضافة محرف جديد
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">اسم المحرف (مثال: ك، م، كم)</label>
                <input 
                  type="text" 
                  value={uploadChar}
                  onChange={(e) => setUploadChar(e.target.value)}
                  placeholder="أدخل الحرف هنا..."
                  className="w-full bg-black border border-white/20 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all text-right"
                  dir="rtl"
                />
              </div>

              <div className="relative group">
                <input 
                  type="file" 
                  accept=".svg" 
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  title="اختر ملف SVG"
                />
                <div className="w-full border-2 border-dashed border-white/20 group-hover:border-white rounded-[2rem] p-8 flex flex-col items-center justify-center gap-3 transition-all bg-black group-hover:bg-white/5">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">اسحب الملف أو انقر للرفع</p>
                    <p className="text-xs text-gray-400 mt-1">SVG فقط</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-right px-6" dir="rtl">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center justify-end gap-2 px-6" dir="rtl">
                  <span>{success}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Library Section */}
          <div className="bg-black border border-white/10 rounded-[2rem] p-6 flex-1">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Save className="w-5 h-5 text-white" />
              مكتبة المحارف ({glyphs.length})
            </h2>
            
            {glyphs.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm border border-dashed border-white/10 rounded-[2rem]">
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
                      className="group relative bg-black border border-white/10 rounded-2xl p-3 flex flex-col items-center gap-2 hover:border-white/50 transition-all cursor-pointer hover:bg-white/5"
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
                        className="absolute top-1 right-1 p-1.5 bg-red-500/10 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-10"
                        title="حذف"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      
                      <div className="w-full aspect-square bg-white/5 rounded-xl flex items-center justify-center overflow-hidden border border-white/5">
                        <svg viewBox={viewBox} className="w-full h-full p-2">
                          <path d={glyph.pathData} fill="currentColor" className="text-white" />
                        </svg>
                      </div>
                      
                      <div className="text-center w-full">
                        <div className="text-white font-bold text-lg truncate" dir="rtl">{glyph.char}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
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
          <div className="bg-black border border-white/10 rounded-[2rem] p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-white" />
                المعاينة الحية (Live Preview)
              </h2>
              <button 
                onClick={exportToFont}
                className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-200 text-black rounded-full text-xs font-bold transition-colors border border-white"
              >
                <Download className="w-4 h-4" />
                تصدير كخط (TTF)
              </button>
            </div>

            <div className="space-y-6">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="اكتب هنا لتجربة المحارف المدموجة..."
                className="w-full bg-black border border-white/20 rounded-full px-4 py-3 text-xl text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all text-right placeholder:text-gray-600"
                dir="rtl"
              />

              <div className="w-full aspect-video bg-black border border-white/20 rounded-[2rem] relative overflow-hidden flex items-center justify-center p-8">
                {/* Grid Background */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]" />
                
                {/* Preview Content */}
                <div className="relative z-10 w-full h-full flex items-center justify-center text-white">
                  {inputText ? renderPreview() : (
                    <div className="text-gray-600 flex flex-col items-center gap-3">
                      <Type className="w-12 h-12 opacity-20" />
                      <p>اكتب في المربع أعلاه لرؤية النتيجة</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-black border border-white/10 rounded-[2rem] p-6">
            <h3 className="text-white font-medium flex items-center gap-2 mb-3">
              <Info className="w-5 h-5" />
              دليل المقاييس (Font Metrics)
            </h3>
            <ul className="text-sm text-gray-400 space-y-3 list-none" dir="rtl">
              <li><strong className="text-white">Baseline (خط السطر):</strong> السطر الذي تجلس عليه الحروف. (مثال: حرف الألف يجلس عليه، حرف الياء ينزل تحته).</li>
              <li><strong className="text-white">Ascent (الارتفاع الأعلى):</strong> أقصى ارتفاع مسموح للحرف (سقف الحرف).</li>
              <li><strong className="text-white">Descent (النزول الأسفل):</strong> أقصى نزول مسموح للحرف تحت السطر (قاع الحرف).</li>
              <li><strong className="text-white">RSB (الحد الأيمن):</strong> نقطة بداية الحرف من اليمين. في الحروف المتصلة، يجب أن تلامس نهاية الحرف السابق.</li>
              <li><strong className="text-white">LSB (الحد الأيسر):</strong> نقطة نهاية الحرف من اليسار. من هنا سيبدأ الحرف التالي.</li>
            </ul>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;
