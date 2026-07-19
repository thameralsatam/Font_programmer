import React from 'react';
import { MousePointer, Hand, PenTool, RefreshCw, ChevronUp, ArrowRight, Layers, Settings2, Trash2, Plus, CheckCircle2, GripHorizontal, Copy, RotateCw, FlipHorizontal, ZoomIn, ZoomOut, Save, X, Move, AlignHorizontalJustifyCenter, Undo } from 'lucide-react';
import { ColorPicker } from './ColorPicker'; // Assuming it's in the same directory

interface DrawingToolbarProps {
  children?: React.ReactNode;
  toolMode: string;
  setToolMode: (mode: string) => void;
  setActiveStudioDropdown: (id: string | null) => void;
  selectedNodeIndices: number[];
  setSelectedNodeIndices: React.Dispatch<React.SetStateAction<number[]>>;
  drawCommands: any[];
  pushCmds: (cmds: any[]) => void;
  drawMode: string;
  setIsPathFinished: (finished: boolean) => void;
  showSuccess: (msg: string) => void;
  cursorX: number;
  cursorY: number;
  renderStudioDropdown: (id: string, label: string, icon: any, items: any[], disabled?: boolean) => React.ReactNode;
  setSelectSubMode: (mode: string) => void;
  selectSubMode: string;
  convertSelectedNodesToType: (type: string) => void;
  getPointType: (cmd: any) => string;
  deleteSelectedNodes: () => void;
  duplicateSelected: () => void;
  activeBottomPopover: string | null;
  setActiveBottomPopover: (popover: string | null) => void;
  rotationAngle: number;
  setRotationAngle: (angle: number) => void;
  rotationStartCmdsRef: React.MutableRefObject<any[] | null>;
  setUndoStack: React.Dispatch<React.SetStateAction<any[][]>>;
  setRedoStack: React.Dispatch<React.SetStateAction<any[][]>>;
  setDrawCommands: React.Dispatch<React.SetStateAction<any[]>>;
  handleRotationSliderChange: (angle: number) => void;
  flipH: () => void;
  flipV: () => void;
  scaleFactor: number;
  setScaleFactor: (factor: number) => void;
  scaleStartCmdsRef: React.MutableRefObject<any[] | null>;
  handleScaleSliderChange: (factor: number) => void;
  fillColor: string;
  handleColorChange: (color: string) => void;
  zoom: (factor: number) => void;
  zoomPercentage: number;
  fitBoardToScreen: () => void;
  renderViewExportDropdown: () => React.ReactNode;
  renderGridSettingsDropdown: () => React.ReactNode;
  handleUndo: () => void;
  handleRedo: () => void;
  undoStack: any[][];
  redoStack: any[][];
  saveDrawnGlyph: () => void;
  onClose: () => void;
  setShowExitConfirmModal: (show: boolean) => void;
  closeCurrentPath: () => void;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = (props) => {
  const {
    children,
    toolMode, setToolMode, setActiveStudioDropdown, selectedNodeIndices,
    setSelectedNodeIndices, drawCommands, pushCmds, drawMode,
    setIsPathFinished, showSuccess, cursorX, cursorY,
    renderStudioDropdown, setSelectSubMode, selectSubMode,
    convertSelectedNodesToType, getPointType, deleteSelectedNodes,
    duplicateSelected, activeBottomPopover, setActiveBottomPopover,
    rotationAngle, setRotationAngle, rotationStartCmdsRef,
    setUndoStack, setRedoStack, setDrawCommands,
    handleRotationSliderChange, flipH, flipV, scaleFactor,
    setScaleFactor, scaleStartCmdsRef, handleScaleSliderChange, fillColor, handleColorChange, zoom, fitBoardToScreen, zoomPercentage,
    renderViewExportDropdown, renderGridSettingsDropdown, handleUndo,
    handleRedo, undoStack, redoStack, saveDrawnGlyph, onClose,
    setShowExitConfirmModal, closeCurrentPath,
  } = props;

  const renderTopBarLeft = () => {
    const toolBtns = (
      <div className="flex bg-zinc-100 rounded-xl border border-zinc-200 p-1 gap-1 shrink-0">
        {[
          ['select','تحديد','V',MousePointer],
          ['move','تحريك','G',Hand],
          ['pen','قلم','P',PenTool],
        ].map(([mode,label,shortcut,Icon]: any)=>(
          <button key={mode} onClick={()=>{setToolMode(mode); setActiveStudioDropdown(null);}}
            title={`${label} (${shortcut})`}
            className={`flex items-center justify-center p-2 rounded-lg text-xs font-bold transition-all ${toolMode===mode?'bg-white text-zinc-900 shadow-sm':'text-zinc-500 hover:text-zinc-700'}`}>
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    );

    let contextTools: React.ReactNode = null;
    if (toolMode === 'select') {
      const hasSelection = selectedNodeIndices.length > 0;
      contextTools = (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
          <div className="flex bg-zinc-100 rounded-xl border border-zinc-200 p-0.5 gap-0.5 shrink-0">
            <button onClick={() => setSelectSubMode('replace')} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${selectSubMode === 'replace' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`} title="تحديد جديد مستبدل">تحديد عادي</button>
            <button onClick={() => setSelectSubMode('add')} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${selectSubMode === 'add' ? 'bg-white text-teal-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`} title="إضافة نقاط جديدة للتحديد الحالي"><span>إضافة (+)</span></button>
            <button onClick={() => setSelectSubMode('remove')} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${selectSubMode === 'remove' ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`} title="طرح وإزالة نقاط من التحديد الحالي"><span>طرح (-)</span></button>
          </div>
          <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
          {renderStudioDropdown(
            'segmentConvert',
            'تحويل المسار',
            RefreshCw,
            [
              { label: 'تحويل الجزء إلى منحنى', sublabel: 'Convert segment to Curve', icon: ChevronUp, onClick: () => { /* ... logic ... */ } },
              { label: 'تحويل الجزء إلى مستقيم', sublabel: 'Convert segment to Straight', icon: ArrowRight, onClick: () => { /* ... logic ... */ } },
              { label: 'تفعيل مقابض التحكم ∿', sublabel: 'Show & Edit Handles', icon: Layers, onClick: () => { /* ... logic ... */ } }
            ],
            !hasSelection
          )}
          {renderStudioDropdown(
            'nodePointType',
            'نوع النقطة',
            Settings2,
            [
              { label: 'زاوية حادة', icon: MousePointer, onClick: () => convertSelectedNodesToType('corner') },
              { label: 'ربط المقابض: Smooth', icon: PenTool, onClick: () => convertSelectedNodesToType('smooth') },
              { label: 'ربط المقابض: Symmetric', icon: Layers, onClick: () => convertSelectedNodesToType('symmetric') },
              { label: 'زاوية منحنية (Cusp)', icon: Settings2, onClick: () => convertSelectedNodesToType('cusp') }
            ],
            !hasSelection
          )}
          {hasSelection && (
            <button onClick={deleteSelectedNodes} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm" title="حذف النقاط المحددة">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      );
    } else if (toolMode === 'pen') {
      contextTools = (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
          {renderStudioDropdown(
            'penActions',
            'إجراءات المسار',
            PenTool,
            [
              { label: 'إضافة نقطة', icon: Plus, onClick: () => { setToolMode('pen'); showSuccess("أداة القلم نشطة لإضافة النقاط بالضغط"); } },
              { label: 'بدء مسار فرعي جديد', icon: Layers, onClick: () => { setIsPathFinished(true); showSuccess("جاهز لبدء مسار فرعي جديد (اضغط في أي مكان للبدء)"); } },
              { label: 'إغلاق المسار المفتوح', icon: CheckCircle2, onClick: () => { closeCurrentPath(); } }
            ]
          )}
          <button onClick={() => { setIsPathFinished(true); showSuccess("تم إنهاء المسار بنجاح"); }} title="إنهاء المسار" className="flex items-center justify-center p-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition-colors">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      );
    }
    return <>{toolBtns}{contextTools}</>;
  };

  // ... (top bar code remains) ...

  const renderBottomBar = () => {
    return (
      <footer 
        className="h-14 border-t border-zinc-200 bg-zinc-50 shrink-0 sticky bottom-0 z-[200] overflow-x-auto custom-scrollbar whitespace-nowrap w-full" 
        dir="rtl"
      >
        <div className="h-full flex items-center gap-1.5 md:gap-2 px-3 min-w-max">
          <button onClick={deleteSelectedNodes} disabled={!selectedNodeIndices.length} className="p-2 bg-red-50 hover:bg-red-100 disabled:opacity-30 disabled:bg-transparent text-red-600 rounded-xl transition-all flex items-center justify-center shrink-0" title="حذف العناصر المحددة (Delete)"><Trash2 className="w-4 h-4" /></button>
          <button onClick={duplicateSelected} className="p-2 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 rounded-xl transition-all flex items-center justify-center shrink-0" title="تكرار العنصر أو المسار المحدد (Ctrl+D)"><Copy className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-zinc-200 shrink-0" />
          <button onClick={() => setActiveBottomPopover(activeBottomPopover === 'rotate' ? null : 'rotate')} className={`p-2 rounded-xl transition-all flex items-center justify-center ${activeBottomPopover === 'rotate' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`} title="تدوير العنصر 360°"><RotateCw className="w-4 h-4" /></button>
          <button onClick={() => setActiveBottomPopover(activeBottomPopover === 'flip' ? null : 'flip')} className={`p-2 rounded-xl transition-all flex items-center justify-center ${activeBottomPopover === 'flip' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`} title="قلب وانعكاس في الجهات الأربع"><FlipHorizontal className="w-4 h-4" /></button>
          <button onClick={() => setActiveBottomPopover(activeBottomPopover === 'scale' ? null : 'scale')} className={`p-2 rounded-xl transition-all flex items-center justify-center ${activeBottomPopover === 'scale' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`} title="تغيير مقاس وحجم العنصر"><ZoomIn className="w-4 h-4" /></button>
          <div className="shrink-0 flex items-center relative">
            <ColorPicker value={fillColor} onChange={handleColorChange} label="اللون" isOpen={activeBottomPopover === 'color'} onToggle={() => setActiveBottomPopover(activeBottomPopover === 'color' ? null : 'color')} isLocked={selectedNodeIndices.length === 0} />
          </div>
          <div className="w-px h-5 bg-zinc-200 shrink-0" />
          <button onClick={() => setActiveBottomPopover(activeBottomPopover === 'dpad' ? null : 'dpad')} className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 ${activeBottomPopover === 'dpad' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`} title="أزرار التحكم بالاتجاهات (D-Pad)"><Move className="w-4 h-4" /></button>
          <button onClick={() => setActiveBottomPopover(activeBottomPopover === 'align' ? null : 'align')} className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 ${activeBottomPopover === 'align' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`} title="محاذاة العناصر المحددة"><AlignHorizontalJustifyCenter className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-zinc-200 shrink-0" />
          <div className="flex bg-zinc-100 rounded-xl border border-zinc-200 p-0.5 shrink-0">
             {/* ... layer move buttons ... */}
          </div>
          <div className="w-px h-5 bg-zinc-200 shrink-0" />
          <div className="flex items-center gap-0.5 bg-zinc-100 rounded-xl border border-zinc-200 p-0.5 shrink-0">
            <button onClick={() => zoom(0.85)} className="p-1.5 rounded-lg hover:bg-white text-zinc-600 hover:text-zinc-900 transition-all" title="تكبير"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button onClick={() => zoom(1.15)} className="p-1.5 rounded-lg hover:bg-white text-zinc-600 hover:text-zinc-900 transition-all" title="تصغير"><ZoomOut className="w-3.5 h-3.5" /></button>
            <button onClick={fitBoardToScreen} className="px-2 py-1 text-[9px] font-bold text-zinc-500 hover:bg-white rounded-lg transition-all" title="إعادة تعيين">{zoomPercentage}%</button>
          </div>
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded-xl text-[10px] font-mono text-zinc-500 shrink-0 select-none">
            <span>X:{cursorX} Y:{cursorY}</span>
          </div>
        </div>
      </footer>
    );
  };

  return (
    <>
      <header className="h-14 border-b border-zinc-200 bg-zinc-50 shrink-0 sticky top-0 z-[200] overflow-x-auto custom-scrollbar whitespace-nowrap">
        <div className="h-full flex items-center gap-3 px-3 min-w-max">
          {renderTopBarLeft()}
          <div className="w-px h-6 bg-zinc-200 shrink-0" />
          {renderViewExportDropdown()}
          <div className="w-px h-6 bg-zinc-200 shrink-0" />
          {renderGridSettingsDropdown()}
          <div className="w-px h-6 bg-zinc-200 shrink-0" />
          <div className="flex items-center gap-0.5 bg-white border border-zinc-200 rounded-xl p-0.5 shadow-sm shrink-0">
            <button onClick={handleUndo} disabled={!undoStack.length} className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg disabled:opacity-30 transition-all" title="تراجع"><Undo className="w-3.5 h-3.5" /></button>
            <button onClick={handleRedo} disabled={!redoStack.length} className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg disabled:opacity-30 transition-all transform scale-x-[-1]" title="إعادة"><Undo className="w-3.5 h-3.5" /></button>
          </div>
          <div className="w-px h-6 bg-zinc-200 shrink-0" />
          <button onClick={saveDrawnGlyph} className="p-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center shrink-0" title="حفظ">
            <Save className="w-4 h-4" />
          </button>
          <button onClick={() => setShowExitConfirmModal(true)} className="p-1.5 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 shrink-0" title="إغلاق">
            <X className="w-3.5 h-3.5 text-zinc-600" />
          </button>
        </div>
      </header>
      {children}
      {renderBottomBar()}
    </>
  );
};


