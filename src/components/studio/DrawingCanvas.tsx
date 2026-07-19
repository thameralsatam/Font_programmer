import React from 'react';
import { DrawCmd } from '../../types';
import { compilePath, parseCmdsFromPath, getSubPaths } from '../../utils/svgPathUtils';

interface DrawingCanvasProps {
  boardWidth: number;
  boardHeight: number;
  viewBox: { x: number; y: number; w: number; h: number };
  showGrid: boolean;
  gridSize: number;
  drawCommands: DrawCmd[];
  selectedNodeIndices: number[];
  toolMode: 'select' | 'move' | 'pen';
  cursorX: number;
  cursorY: number;
  currentGlyphBaselineY: number;
  currentGlyphLsb: number;
  currentGlyphRsb: number;
  currentGlyphMetrics: { ascent: number; descent: number };
  extraGuides: number[];
  svgRef: React.RefObject<SVGSVGElement | null>;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  selectionStart: { x: number; y: number } | null;
  selectionEnd: { x: number; y: number } | null;
}

export function DrawingCanvas({
  boardWidth,
  boardHeight,
  viewBox,
  showGrid,
  gridSize,
  drawCommands,
  selectedNodeIndices,
  toolMode,
  cursorX,
  cursorY,
  currentGlyphBaselineY,
  currentGlyphLsb,
  currentGlyphRsb,
  currentGlyphMetrics,
  extraGuides,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  selectionStart,
  selectionEnd
}: DrawingCanvasProps) {
  const gridX: number[] = [];
  const gridY: number[] = [];
  const gSize = gridSize || 50;
  for (let x = 0; x <= boardWidth; x += gSize) gridX.push(x);
  for (let y = 0; y <= boardHeight; y += gSize) gridY.push(y);

  const getSubPathIndicesList = (): number[][] => {
    const list: number[][] = [];
    let current: number[] = [];
    drawCommands.forEach((cmd, idx) => {
      if (cmd.type === 'M') {
        if (current.length > 0) list.push(current);
        current = [idx];
      } else {
        current.push(idx);
      }
    });
    if (current.length > 0) list.push(current);
    return list;
  };

  const renderGlyphPaths = () => {
    const subPathsList = getSubPaths(drawCommands);
    return subPathsList.map((sub, sIdx) => {
      const d = compilePath(sub);
      const subColor = 'rgba(0,0,0,0.85)';
      return (
        <path
          key={sIdx}
          d={d}
          fill={subColor}
          stroke="none"
          opacity="0.85"
        />
      );
    });
  };

  return (
    <div className="flex-1 bg-zinc-100 flex items-center justify-center p-4 overflow-hidden relative select-none">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="w-full h-full bg-white border border-zinc-200 shadow-lg rounded-2xl touch-none"
      >
        {/* Grid lines */}
        {showGrid && (
          <g opacity="0.3">
            {gridX.map(x => (
              <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={boardHeight} stroke="#e4e4e7" strokeWidth="1" />
            ))}
            {gridY.map(y => (
              <line key={`y-${y}`} x1={0} y1={y} x2={boardWidth} y2={y} stroke="#e4e4e7" strokeWidth="1" />
            ))}
          </g>
        )}

        {/* Guides */}
        <line x1={0} y1={currentGlyphBaselineY} x2={boardWidth} y2={currentGlyphBaselineY} stroke="#3b82f6" strokeWidth="2" opacity="0.6" />
        <line x1={0} y1={currentGlyphBaselineY - currentGlyphMetrics.ascent} x2={boardWidth} y2={currentGlyphBaselineY - currentGlyphMetrics.ascent} stroke="#888" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
        <line x1={0} y1={currentGlyphBaselineY - currentGlyphMetrics.descent} x2={boardWidth} y2={currentGlyphBaselineY - currentGlyphMetrics.descent} stroke="#888" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
        <line x1={currentGlyphLsb} y1={0} x2={currentGlyphLsb} y2={boardHeight} stroke="#f43f5e" strokeWidth="2" opacity="0.6" />
        <line x1={currentGlyphRsb} y1={0} x2={currentGlyphRsb} y2={boardHeight} stroke="#10b981" strokeWidth="2" opacity="0.6" />

        {extraGuides.map((guide, idx) => (
          <line key={`extra-${idx}`} x1={0} y1={guide} x2={boardWidth} y2={guide} stroke="#a855f7" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
        ))}

        {/* Glyph paths */}
        {renderGlyphPaths()}

        {/* Draw node connection lines for curves & lines */}
        {toolMode === 'pen' && drawCommands.length > 0 && (
          <g>
            {drawCommands.map((cmd, idx) => {
              if (idx === 0 || cmd.type === 'M' || cmd.type === 'Z') return null;
              const prev = drawCommands[idx - 1];
              return (
                <line
                  key={`line-${idx}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={cmd.x}
                  y2={cmd.y}
                  stroke="#2563eb"
                  strokeWidth="1.5"
                  strokeDasharray="2,2"
                />
              );
            })}
          </g>
        )}

        {/* Draw interactive node points and control handles */}
        {drawCommands.map((cmd, idx) => {
          if (cmd.type === 'Z') return null;
          const isSelected = selectedNodeIndices.includes(idx);
          return (
            <g key={`node-group-${idx}`}>
              <circle
                cx={cmd.x}
                cy={cmd.y}
                r={isSelected ? 6 : 4}
                fill={isSelected ? '#2563eb' : '#ffffff'}
                stroke="#2563eb"
                strokeWidth={isSelected ? 3 : 2}
                className="cursor-pointer"
              />
              {/* If curve controls exist, draw handle lines and anchor circles */}
              {cmd.cx1 != null && cmd.cy1 != null && (
                <g>
                  <line x1={drawCommands[idx - 1]?.x} y1={drawCommands[idx - 1]?.y} x2={cmd.cx1} y2={cmd.cy1} stroke="#a1a1aa" strokeWidth="1" />
                  <circle cx={cmd.cx1} cy={cmd.cy1} r="3" fill="#a1a1aa" />
                </g>
              )}
              {cmd.cx2 != null && cmd.cy2 != null && (
                <g>
                  <line x1={cmd.x} y1={cmd.y} x2={cmd.cx2} y2={cmd.cy2} stroke="#a1a1aa" strokeWidth="1" />
                  <circle cx={cmd.cx2} cy={cmd.cy2} r="3" fill="#a1a1aa" />
                </g>
              )}
            </g>
          );
        })}

        {/* Multi-selection box overlay */}
        {selectionStart && selectionEnd && (
          <rect
            x={Math.min(selectionStart.x, selectionEnd.x)}
            y={Math.min(selectionStart.y, selectionEnd.y)}
            width={Math.abs(selectionStart.x - selectionEnd.x)}
            height={Math.abs(selectionStart.y - selectionEnd.y)}
            fill="rgba(37, 99, 235, 0.08)"
            stroke="#2563eb"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
        )}
      </svg>
    </div>
  );
}
