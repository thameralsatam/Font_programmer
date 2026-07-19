import React, { useState, useEffect } from 'react';
import { Glyph, Project } from './types';
import { saveProjectsToDb, loadProjectsFromDb } from './utils/indexedDb';
import { DrawingStudio } from './components/DrawingStudio';
import { HomePage } from './pages/HomePage';
import { ProjectPage } from './pages/ProjectPage';
import { normalizeType } from './features/preview/ArabicPreviewEngine';
import { ProjectLock } from './features/projectLock/ProjectLock';
import { RecoverySystem } from './features/recovery/RecoverySystem';

const safeLS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} }
};

function App() {
  // Project states
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [tabId] = useState(() => ProjectLock.generateTabId());
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [uploadChar, setUploadChar] = useState('');
  const [editingGlyphId, setEditingGlyphId] = useState<string | null>(null);
  const [emergencyState, setEmergencyState] = useState<any>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Duplication states
  const [duplicatingGlyph, setDuplicatingGlyph] = useState<Glyph | null>(null);
  const [duplicateChar, setDuplicateChar] = useState('');
  
  // Drawing Studio state
  const [isDrawingStudioOpen, setIsDrawingStudioOpen] = useState(false);
  const [studioInitialGlyph, setStudioInitialGlyph] = useState<Glyph | null>(null);
  const [studioFallbackCharName, setStudioFallbackCharName] = useState('');
  const [studioInitialGlyphType, setStudioInitialGlyphType] = useState('');
  
  const currentProject = projects.find(p => p.id === currentProjectId);
  const glyphs = currentProject?.glyphs ?? [];

  const setGlyphs = (updater: Glyph[] | ((prev: Glyph[]) => Glyph[])) => {
    if (!currentProjectId) return;
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      return { 
        ...p, 
        glyphs: typeof updater === 'function' ? updater(p.glyphs) : updater, 
        lastModified: Date.now() 
      };
    }));
  };

  // DB load/save
  useEffect(() => {
    loadProjectsFromDb().then(ps => {
      if (ps?.length) setProjects(ps);
      else {
        const old = safeLS.get('smart_font_glyphs');
        if (old) {
          try {
            const parsed = JSON.parse(old);
            setProjects([{
              id: Date.now().toString(), 
              name: 'مشروع سابق',
              glyphs: parsed.map((g: any) => ({
                ...g,
                template: g.template || 'flat',
                metrics: g.metrics || { ascent: 800, descent: -200 },
                lsb: g.lsb ?? g.leftGuide ?? g.bounds.minX,
                rsb: g.rsb ?? g.rightGuide ?? g.bounds.maxX,
                extraGuides: g.extraGuides || []
              })),
              lastModified: Date.now()
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

  // Load emergency state on startup
  useEffect(() => {
    const recovery = RecoverySystem.loadEmergencyState();
    if (recovery && recovery.state && recovery.state.drawCommands && recovery.state.drawCommands.length > 0) {
      setEmergencyState(recovery.state);
      setShowRecoveryModal(true);
    }
  }, []);

  const handleRecover = () => {
    if (!emergencyState) return;
    const state = emergencyState;
    setStudioFallbackCharName(state.drawCharName);
        
    const pathStr = state.drawCommands.map((c: any) => {
      if (c.type === 'M') return `M ${c.x} ${c.y}`;
      if (c.type === 'L') return `L ${c.x} ${c.y}`;
      if (c.type === 'C') return `C ${c.cx1} ${c.cy1}, ${c.cx2} ${c.cy2}, ${c.x} ${c.y}`;
      if (c.type === 'Z') return 'Z';
      return '';
    }).join(' ');

    const glyph: Glyph = {
      id: state.drawingGlyphId || Date.now().toString(),
      char: state.drawCharName,
      pathData: pathStr,
      color: state.fillColor || '#18181b',
      colors: state.drawCommands.map((c: any) => c.fillColor || state.fillColor || '#18181b'),
      glyphType: state.drawGlyphType,
      metrics: state.currentGlyphMetrics || { ascent: 800, descent: -200 },
      bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
      baselineY: state.currentGlyphBaselineY ?? 600,
      lsb: state.currentGlyphLsb ?? 50,
      rsb: state.currentGlyphRsb ?? 950,
      extraGuides: []
    };

    setStudioInitialGlyph(glyph);
    setIsDrawingStudioOpen(true);
    setShowRecoveryModal(false);
    RecoverySystem.clearEmergencyState();
  };

  const handleDiscardRecovery = () => {
    RecoverySystem.clearEmergencyState();
    setShowRecoveryModal(false);
    setEmergencyState(null);
  };

  // Project lock and heartbeat effect
  useEffect(() => {
    if (!currentProjectId) return;
    
    let isMounted = true;
    let heartbeatInterval: any;

    async function lockProject() {
      const success = await ProjectLock.acquireLock(currentProjectId, tabId);
      if (!isMounted) return;

      if (!success) {
        showError('عذراً، هذا المشروع مفتوح حالياً في علامة تبويب أخرى أو قفل التحرير نشط!');
        setCurrentProjectId(null);
        return;
      }

      // Initial heartbeat
      await ProjectLock.updateHeartbeat(currentProjectId, tabId);

      // Start heartbeat interval every 10 seconds (as per spec)
      heartbeatInterval = setInterval(async () => {
        await ProjectLock.updateHeartbeat(currentProjectId, tabId);
      }, 10000);
    }

    lockProject();

    return () => {
      isMounted = false;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      ProjectLock.releaseLock(currentProjectId, tabId);
    };
  }, [currentProjectId, tabId]);

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };
  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  const createProject = () => {
    if (!newProjectName.trim()) {
      showError('أدخل اسم المشروع');
      return;
    }
    const p: Project = { 
      id: Date.now().toString(), 
      name: newProjectName.trim(), 
      glyphs: [], 
      lastModified: Date.now() 
    };
    setProjects(ps => [p, ...ps]); 
    setNewProjectName(''); 
    setIsCreatingProject(false); 
    setCurrentProjectId(p.id);
  };

  // Confirm dialog Portal
  const renderConfirm = () => {
    if (!confirmDialog?.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/80 backdrop-blur-md p-4" dir="rtl">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
          <h3 className="text-base font-bold text-zinc-900 mb-2">تأكيد الإجراء</h3>
          <p className="text-xs text-zinc-600 mb-6 leading-relaxed">{confirmDialog.message}</p>
          <div className="flex flex-row gap-3 w-full">
            <button onClick={() => setConfirmDialog(null)} className="flex-1 sm:flex-none px-6 py-2.5 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-full font-bold hover:bg-zinc-200 transition-all text-xs">إلغاء</button>
            <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 sm:flex-none px-6 py-2.5 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-all text-xs">تأكيد</button>
          </div>
        </div>
      </div>
    );
  };

  const renderRecoveryModal = () => {
    if (!showRecoveryModal || !emergencyState) return null;
    return (
      <div className="fixed inset-0 z-[250] flex items-center justify-center bg-zinc-950/40 backdrop-blur-md p-4" dir="rtl">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-md w-full shadow-2xl">
          <h3 className="text-base font-bold text-zinc-900 mb-2">تم العثور على جلسة غير محفوظة</h3>
          <p className="text-xs text-zinc-600 mb-4 leading-relaxed">
            وجدت جلسة رسم غير محفوظة للحرف "{emergencyState.drawCharName}" ({emergencyState.drawGlyphType}). هل تود استعادتها ومواصلة الرسم؟
          </p>
          <div className="flex flex-row gap-3 w-full">
            <button 
              onClick={handleDiscardRecovery} 
              className="flex-1 sm:flex-none px-6 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-full font-bold transition-all text-xs"
            >
              تجاهل ومسح
            </button>
            <button 
              onClick={handleRecover} 
              className="flex-1 sm:flex-none px-6 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-full font-bold transition-all text-xs"
            >
              استعادة الجلسة
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!currentProjectId || !currentProject) {
    return (
      <>
        {renderConfirm()}
        {renderRecoveryModal()}
        <HomePage
          projects={projects}
          isCreatingProject={isCreatingProject}
          setIsCreatingProject={setIsCreatingProject}
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          createProject={createProject}
          setCurrentProjectId={setCurrentProjectId}
          setConfirmDialog={setConfirmDialog}
          setProjects={setProjects}
          currentProjectId={currentProjectId}
        />
      </>
    );
  }

  return (
    <>
      {renderConfirm()}
      {renderRecoveryModal()}
      <ProjectPage
        currentProject={currentProject}
        glyphs={glyphs}
        setGlyphs={setGlyphs}
        setCurrentProjectId={setCurrentProjectId}
        editingGlyphId={editingGlyphId}
        setEditingGlyphId={setEditingGlyphId}
        error={error}
        success={success}
        showSuccess={showSuccess}
        showError={showError}
        setConfirmDialog={setConfirmDialog}
        isDrawingStudioOpen={isDrawingStudioOpen}
        setIsDrawingStudioOpen={setIsDrawingStudioOpen}
        setStudioInitialGlyph={setStudioInitialGlyph}
        setStudioFallbackCharName={setStudioFallbackCharName}
                duplicatingGlyph={duplicatingGlyph}
        setDuplicatingGlyph={setDuplicatingGlyph}
        duplicateChar={duplicateChar}
        setDuplicateChar={setDuplicateChar}
                        uploadChar={uploadChar}
        setUploadChar={setUploadChar}
        inputText={inputText}
        setInputText={setInputText}
      />

      {isDrawingStudioOpen && (
        <DrawingStudio
          isOpen={isDrawingStudioOpen}
          initialGlyph={studioInitialGlyph}
          fallbackCharName={studioFallbackCharName}
          initialGlyphType={studioInitialGlyphType}
          onClose={() => setIsDrawingStudioOpen(false)}
          onSave={(data) => {
            const glyph: Glyph = {
              id: data.id || Date.now().toString(),
              char: data.char,
              pathData: data.pathData,
              color: data.color,
              colors: data.colors,
              glyphType: data.glyphType,
              metrics: data.metrics,
              bounds: data.bounds,
              baselineY: data.baselineY,
              lsb: data.lsb,
              rsb: data.rsb,
              extraGuides: data.extraGuides
            };
            setGlyphs(prev => [
              ...prev.filter(g => g.id !== glyph.id && !(g.char === glyph.char && normalizeType(g.glyphType || '') === normalizeType(glyph.glyphType || ''))),
              glyph
            ]);
            setIsDrawingStudioOpen(false);
            RecoverySystem.clearEmergencyState();
            setEmergencyState(null);
            showSuccess((data.id ? 'تم تعديل' : 'تم حفظ') + ` "${data.char}"`);
            setEditingGlyphId(glyph.id);
          }}
        />
      )}
    </>
  );
}

export default App;
