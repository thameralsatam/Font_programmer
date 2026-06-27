import fs from 'fs';

const file = fs.readFileSync('src/App.tsx', 'utf8');
const lines = file.split('\n');

let start = -1;
let end = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('return (') && lines[i+1]?.includes('className="fixed inset-0 z-[150] bg-zinc-950')) {
    start = i;
  }
  if (start !== -1 && lines[i].includes('if (!currentProjectId) {')) {
    end = i - 1;
    break;
  }
}

if (start !== -1 && end !== -1) {
  const newUI = `    return (
      <div className="fixed inset-0 z-[150] bg-white text-zinc-900 flex flex-col h-screen overflow-hidden select-none" dir="rtl">
        <div className="flex-1 h-0 flex relative bg-zinc-50 overflow-hidden">
          <div className="absolute top-4 right-4 z-50">
            <button onClick={() => setShowAdvancedTools(prev => !prev)} className="p-3 bg-white hover:bg-zinc-100 rounded-xl text-zinc-600 border border-zinc-200 shadow-sm transition-all"><Settings2 className="w-5 h-5" /></button>
            {showAdvancedTools && (
               <div className="absolute top-14 right-0 w-48 bg-white border border-zinc-200 p-2 rounded-xl shadow-xl flex flex-col gap-1 z-50">
                  <button onClick={() => { if (drawCommands.length > 0) { if (!confirm("هل تريد الخروج دون حفظ؟")) return; } setIsDrawingStudioOpen(false); }} className="flex items-center gap-2 text-red-600 hover:bg-red-50 p-2 rounded-lg text-sm w-full font-medium"><X className="w-4 h-4" /> خروج بدون حفظ</button>
               </div>
            )}
          </div>
          <div className="absolute top-4 left-4 z-30 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg shadow-sm text-xs font-mono text-zinc-500 pointer-events-none">
            {cursorX}, {cursorY}
          </div>
          <svg 
            ref={svgRef} className="w-full h-full cursor-crosshair touch-none" viewBox="-100 -200 1200 1000" preserveAspectRatio="xMidYMid meet"
            onMouseDown={(e) => handleSvgMouseDownOrTouchStart(e, isSelectionBoxActive ? 'selection' : 'cursor')}
            onTouchStart={(e) => handleSvgMouseDownOrTouchStart(e, isSelectionBoxActive ? 'selection' : 'cursor')}
            onMouseMove={handleSvgMouseMoveOrTouchMove} onTouchMove={handleSvgMouseMoveOrTouchMove}
            onMouseUp={handleSvgMouseUpOrTouchEnd} onTouchEnd={handleSvgMouseUpOrTouchEnd}
            onClick={handleCanvasClick}
          >
            {showGrid && (
              <g className="pointer-events-none">
                {gridLinesX.map(x => ( <line key={\`x-\${x}\`} x1={x} y1="-200" x2={x} y2="800" stroke={x === 500 ? "#cbd5e1" : "#f1f5f9"} strokeWidth={x === 500 ? 2 : 1} /> ))}
                {gridLinesY.map(y => ( <line key={\`y-\${y}\`} x1="0" y1={y} x2="1000" y2={y} stroke={y === 600 ? "#94a3b8" : "#f1f5f9"} strokeWidth={y === 600 ? 2 : 1} /> ))}
              </g>
            )}
            <path d={dPath} fill={drawCommands.length > 0 && drawCommands[drawCommands.length - 1].type === 'Z' ? 'rgba(0,0,0,0.8)' : 'none'} stroke="#18181b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none" />
            {drawCommands.map((cmd, i) => {
              const isSelected = selectedNodeIndices.includes(i);
              return (
                <g key={i}>
                  <rect x={cmd.x - 4} y={cmd.y - 4} width="8" height="8" fill={isSelected ? "#0ea5e9" : "#fff"} stroke={isSelected ? "#0284c7" : "#000"} strokeWidth="1.5" className="cursor-move" onMouseDown={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node', i); }} onTouchStart={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node', i); }} onClick={(e) => { e.stopPropagation(); if (e.shiftKey) { setSelectedNodeIndices(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]); } else { setSelectedNodeIndices([i]); } }} />
                  {cmd.cx !== undefined && cmd.cy !== undefined && (
                    <g>
                      <line x1={cmd.x} y1={cmd.y} x2={cmd.cx} y2={cmd.cy} stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" />
                      <circle cx={cmd.cx} cy={cmd.cy} r="4" fill="#fff" stroke="#10b981" strokeWidth="1.5" className="cursor-move" onMouseDown={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node-control', i); }} onTouchStart={(e) => { e.stopPropagation(); handleSvgMouseDownOrTouchStart(e, 'node-control', i); }} />
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
        <footer className="bg-white border-t border-zinc-200 p-3 z-40 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar min-w-max mx-auto px-2 justify-center">
            <button onClick={() => { const isAllSelected = selectedNodeIndices.length === drawCommands.length && drawCommands.length > 0; if (isAllSelected) setSelectedNodeIndices([]); else setSelectedNodeIndices(drawCommands.map((_, i) => i)); }} className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm">تحديد الكل</button>
            <button onClick={() => setIsSelectionBoxActive(prev => !prev)} className={\`px-4 py-2 border rounded-lg text-xs font-medium transition-all shadow-sm \${isSelectionBoxActive ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}\`}>تحديد (مربع)</button>
            <button onClick={() => setShowGrid(prev => !prev)} className={\`px-4 py-2 border rounded-lg text-xs font-medium transition-all shadow-sm \${showGrid ? 'bg-zinc-100 text-zinc-800 border-zinc-300' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}\`}>الشبكة</button>
            <div className="w-px h-6 bg-zinc-200 mx-1"></div>
            <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.map((cmd, i) => { if (selectedNodeIndices.includes(i) && cmd.type === 'L') { const prevCmd = i > 0 ? drawCommands[i - 1] : { x: 0, y: 0 }; return { ...cmd, type: 'Q', cx: (prevCmd.x + cmd.x) / 2, cy: (prevCmd.y + cmd.y) / 2 }; } if (selectedNodeIndices.includes(i) && cmd.type === 'Q') { return { type: 'L', x: cmd.x, y: cmd.y }; } return cmd; }); pushDrawCommands(newCmds); } }} className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-medium text-zinc-700 transition-all shadow-sm">منحنيات</button>
            <button onClick={() => { if (selectedNodeIndices.length > 0) { const newCmds = drawCommands.filter((_, i) => !selectedNodeIndices.includes(i)); pushDrawCommands(newCmds); setSelectedNodeIndices([]); } }} disabled={selectedNodeIndices.length === 0} className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-lg text-xs font-medium transition-all shadow-sm disabled:opacity-50">حذف النقطة</button>
            <div className="w-px h-6 bg-zinc-200 mx-1"></div>
            <button onClick={handleUndo} disabled={undoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center"><Undo className="w-4 h-4" /></button>
            <button onClick={handleRedo} disabled={redoStack.length === 0} className="px-3 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-700 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center transform scale-x-[-1]"><Undo className="w-4 h-4" /></button>
            <div className="w-px h-6 bg-zinc-200 mx-1"></div>
            <button onClick={saveDrawnGlyph} className="px-6 py-2 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-medium transition-all shadow-md flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> حفظ</button>
          </div>
        </footer>
      </div>
    );
  };
`;
  
  const newLines = [...lines.slice(0, start), newUI, ...lines.slice(end)];
  fs.writeFileSync('src/App.tsx', newLines.join('\n'));
  console.log('patched');
} else {
  console.log('not found', start, end);
}
