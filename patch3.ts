import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace settings menu
const oldSettingsMenu = `            {showAdvancedTools && (
               <div className="absolute top-14 left-0 w-48 bg-white border border-zinc-200 p-2 rounded-xl shadow-xl flex flex-col gap-1 z-50">
                  <button onClick={() => { if (drawCommands.length > 0) { if (!confirm("هل تريد الخروج دون حفظ؟")) return; } setIsDrawingStudioOpen(false); }} className="flex items-center gap-2 text-red-600 hover:bg-red-50 p-2 rounded-lg text-sm w-full font-medium"><X className="w-4 h-4" /> خروج بدون حفظ</button>
               </div>
            )}`;

const newSettingsMenu = `            {showAdvancedTools && (
               <div className="absolute top-14 left-0 w-48 bg-white border border-zinc-200 p-2 rounded-xl shadow-xl flex flex-col gap-1 z-50">
                  <button onClick={() => { const isAllSelected = selectedNodeIndices.length === drawCommands.length && drawCommands.length > 0; if (isAllSelected) setSelectedNodeIndices([]); else setSelectedNodeIndices(drawCommands.map((_, i) => i)); setShowAdvancedTools(false); }} className="flex items-center gap-2 text-zinc-700 hover:bg-zinc-100 p-2 rounded-lg text-sm w-full font-medium">تحديد الكل</button>
                  <button onClick={() => { setIsSelectionBoxActive(prev => !prev); setIsPanModeActive(false); setShowAdvancedTools(false); }} className={\`flex items-center gap-2 p-2 rounded-lg text-sm w-full font-medium \${isSelectionBoxActive ? 'bg-sky-50 text-sky-600' : 'text-zinc-700 hover:bg-zinc-100'}\`}>تحديد (مربع)</button>
                  <button onClick={() => { setShowGrid(prev => !prev); setShowAdvancedTools(false); }} className={\`flex items-center gap-2 p-2 rounded-lg text-sm w-full font-medium \${showGrid ? 'bg-zinc-100 text-zinc-800' : 'text-zinc-700 hover:bg-zinc-100'}\`}>إظهار الشبكة</button>
                  <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.map((cmd, i) => { if (selectedNodeIndices.includes(i) && cmd.type === 'L') { const prevCmd = i > 0 ? drawCommands[i - 1] : { x: 0, y: 0 }; return { ...cmd, type: 'Q', cx: (prevCmd.x + cmd.x) / 2, cy: (prevCmd.y + cmd.y) / 2 }; } if (selectedNodeIndices.includes(i) && cmd.type === 'Q') { return { type: 'L', x: cmd.x, y: cmd.y }; } return cmd; }); pushDrawCommands(newCmds); setShowAdvancedTools(false); } }} className="flex items-center gap-2 text-zinc-700 hover:bg-zinc-100 p-2 rounded-lg text-sm w-full font-medium">تحويل لمنحنيات</button>
                  <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.filter((_, i) => !selectedNodeIndices.includes(i)); pushDrawCommands(newCmds); setSelectedNodeIndices([]); setShowAdvancedTools(false); } }} disabled={selectedNodeIndices.length === 0} className="flex items-center gap-2 text-red-600 hover:bg-red-50 p-2 rounded-lg text-sm w-full font-medium disabled:opacity-50">حذف النقاط المحددة</button>
                  <div className="h-px bg-zinc-200 my-1 w-full"></div>
                  <button onClick={() => { if (drawCommands.length > 0) { if (!confirm("هل تريد الخروج دون حفظ؟")) return; } setIsDrawingStudioOpen(false); }} className="flex items-center gap-2 text-red-600 hover:bg-red-50 p-2 rounded-lg text-sm w-full font-medium"><X className="w-4 h-4" /> خروج بدون حفظ</button>
               </div>
            )}`;

content = content.replace(oldSettingsMenu, newSettingsMenu);

const oldFooter = `        <footer className="bg-white border-t border-zinc-200 p-3 z-40 shrink-0">
          <div className="flex flex-wrap items-center gap-2 overflow-y-auto max-h-[30vh] justify-center mx-auto px-2">
            
            <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-500 flex items-center shadow-inner min-w-[70px] justify-center">
              {cursorX}, {cursorY}
            </div>

            <div className="w-px h-6 bg-zinc-200 mx-1"></div>

            {/* Draw Mode */}
            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-inner">
              <button onClick={() => setDrawMode('line')} className={\`px-4 py-1.5 rounded-md text-xs font-bold transition-all \${drawMode === 'line' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}\`}>مستقيم</button>
              <button onClick={() => setDrawMode('curve')} className={\`px-4 py-1.5 rounded-md text-xs font-bold transition-all \${drawMode === 'curve' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}\`}>منحنى</button>
            </div>

            <button onClick={() => { if (drawCommands.length === 0) { pushDrawCommands([{ type: 'M', x: cursorX, y: cursorY }]); } else { if (drawMode === 'line') { pushDrawCommands([...drawCommands, { type: 'L', x: cursorX, y: cursorY }]); } else { pushDrawCommands([...drawCommands, { type: 'Q', x: cursorX, y: cursorY, cx: controlX, cy: controlY }]); } } }} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> إضافة نقطة</button>

            <button onClick={() => pushDrawCommands([...drawCommands, { type: 'M', x: cursorX, y: cursorY }])} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm" title="جزء منفصل">مسار جديد</button>
            <button onClick={() => { if (drawCommands.length > 0) pushDrawCommands([...drawCommands, { type: 'Z', x: 0, y: 0 }]); }} disabled={drawCommands.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm disabled:opacity-50">إغلاق المسار</button>

            <div className="w-px h-6 bg-zinc-200 mx-1"></div>

            <button onClick={() => { const isAllSelected = selectedNodeIndices.length === drawCommands.length && drawCommands.length > 0; if (isAllSelected) setSelectedNodeIndices([]); else setSelectedNodeIndices(drawCommands.map((_, i) => i)); }} className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm">تحديد الكل</button>
            <button onClick={() => { setIsSelectionBoxActive(prev => !prev); setIsPanModeActive(false); }} className={\`px-4 py-2 border rounded-lg text-xs font-medium transition-all shadow-sm \${isSelectionBoxActive ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}\`}>تحديد (مربع)</button>
            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-inner items-center gap-1">
               <button onClick={() => { setIsPanModeActive(prev => !prev); setIsSelectionBoxActive(false); }} className={\`px-3 py-1.5 rounded-md text-xs font-bold transition-all \${isPanModeActive ? 'bg-white text-amber-600 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}\`}>تحريك</button>
               <button onClick={() => handleZoom(0.8)} className="px-2 py-1.5 rounded-md text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 transition-all" title="تكبير">+</button>
               <button onClick={() => handleZoom(1.25)} className="px-2 py-1.5 rounded-md text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 transition-all" title="تصغير">-</button>
            </div>
            <button onClick={() => setShowGrid(prev => !prev)} className={\`px-4 py-2 border rounded-lg text-xs font-medium transition-all shadow-sm \${showGrid ? 'bg-zinc-100 text-zinc-800 border-zinc-300' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}\`}>الشبكة</button>
            <div className="w-px h-6 bg-zinc-200 mx-1"></div>
            <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.map((cmd, i) => { if (selectedNodeIndices.includes(i) && cmd.type === 'L') { const prevCmd = i > 0 ? drawCommands[i - 1] : { x: 0, y: 0 }; return { ...cmd, type: 'Q', cx: (prevCmd.x + cmd.x) / 2, cy: (prevCmd.y + cmd.y) / 2 }; } if (selectedNodeIndices.includes(i) && cmd.type === 'Q') { return { type: 'L', x: cmd.x, y: cmd.y }; } return cmd; }); pushDrawCommands(newCmds); } }} className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm">منحنيات</button>
            <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.filter((_, i) => !selectedNodeIndices.includes(i)); pushDrawCommands(newCmds); setSelectedNodeIndices([]); } }} disabled={selectedNodeIndices.length === 0} className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-lg text-xs font-medium transition-all shadow-sm disabled:opacity-50">حذف النقطة</button>
            <div className="w-px h-6 bg-zinc-200 mx-1"></div>
            <button onClick={handleUndo} disabled={undoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center"><Undo className="w-4 h-4" /></button>
            <button onClick={handleRedo} disabled={redoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center transform scale-x-[-1]"><Undo className="w-4 h-4" /></button>
            <div className="w-px h-6 bg-zinc-200 mx-1"></div>
            <button onClick={saveDrawnGlyph} className="px-6 py-2 bg-zinc-50 hover:bg-black text-white rounded-lg text-xs font-medium transition-all shadow-md flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> حفظ</button>
          </div>
        </footer>`;

const newFooter = `        <footer className="bg-white border-t border-zinc-200 p-3 z-40 shrink-0 w-full overflow-hidden">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto w-full px-2 pb-2 custom-scrollbar justify-start md:justify-center">
            
            <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-500 flex items-center shadow-inner min-w-fit justify-center whitespace-nowrap">
              {cursorX}, {cursorY}
            </div>

            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>

            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-inner items-center gap-1 shrink-0">
               <button onClick={() => { setIsPanModeActive(prev => !prev); setIsSelectionBoxActive(false); }} className={\`px-3 py-1.5 rounded-md text-xs font-bold transition-all \${isPanModeActive ? 'bg-white text-amber-600 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}\`}>تحريك</button>
               <button onClick={() => handleZoom(0.8)} className="px-2 py-1.5 rounded-md text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 transition-all" title="تكبير">+</button>
               <button onClick={() => handleZoom(1.25)} className="px-2 py-1.5 rounded-md text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 transition-all" title="تصغير">-</button>
            </div>

            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>

            {/* Draw Mode */}
            <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-inner shrink-0">
              <button onClick={() => setDrawMode('line')} className={\`px-4 py-1.5 rounded-md text-xs font-bold transition-all \${drawMode === 'line' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}\`}>مستقيم</button>
              <button onClick={() => setDrawMode('curve')} className={\`px-4 py-1.5 rounded-md text-xs font-bold transition-all \${drawMode === 'curve' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}\`}>منحنى</button>
            </div>

            <button onClick={() => { if (drawCommands.length === 0) { pushDrawCommands([{ type: 'M', x: cursorX, y: cursorY }]); } else { if (drawMode === 'line') { pushDrawCommands([...drawCommands, { type: 'L', x: cursorX, y: cursorY }]); } else { pushDrawCommands([...drawCommands, { type: 'Q', x: cursorX, y: cursorY, cx: controlX, cy: controlY }]); } } }} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap"><Plus className="w-4 h-4" /> إضافة نقطة</button>

            <button onClick={() => pushDrawCommands([...drawCommands, { type: 'M', x: cursorX, y: cursorY }])} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm shrink-0 whitespace-nowrap" title="جزء منفصل">مسار جديد</button>
            <button onClick={() => { if (drawCommands.length > 0) pushDrawCommands([...drawCommands, { type: 'Z', x: 0, y: 0 }]); }} disabled={drawCommands.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm disabled:opacity-50 shrink-0 whitespace-nowrap">إغلاق المسار</button>

            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>

            <button onClick={handleUndo} disabled={undoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center shrink-0"><Undo className="w-4 h-4" /></button>
            <button onClick={handleRedo} disabled={redoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center transform scale-x-[-1] shrink-0"><Undo className="w-4 h-4" /></button>
            
            <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0"></div>
            <button onClick={saveDrawnGlyph} className="px-6 py-2 bg-zinc-50 hover:bg-black text-white rounded-lg text-xs font-medium transition-all shadow-md flex items-center gap-1.5 shrink-0 whitespace-nowrap"><Save className="w-3.5 h-3.5" /> حفظ</button>
          </div>
        </footer>`;

content = content.replace(oldFooter, newFooter);

fs.writeFileSync('src/App.tsx', content);
console.log('patched');
