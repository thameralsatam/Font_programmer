import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, Type, Download, Info, Trash2, Settings2, CheckCircle2,
  Keyboard, Save, Plus, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Edit2, PenTool, RefreshCw,
  HelpCircle, Undo, X, MousePointer, Grid, EyeOff, Copy, Scissors,
  Clipboard, ChevronDown, Unlock, Eye, Lock, Move, Hand, ZoomIn, ZoomOut,
  RotateCcw, RotateCw, FlipHorizontal, FlipVertical, AlignCenter,
  AlignHorizontalJustifyCenter, Layers, ChevronUp
} from 'lucide-react';
import { Glyph } from '../types';
import { calculateExactPathBounds } from '../Svgprocessor';
import { 
  parseCmdsFromPath, compilePath, getSubPaths, autoCenterCmds, 
  scalePathCmds, rotateShapeCmds, flipHCmds, flipVCmds, moveSubPathCmds
} from '../utils/svgPathUtils';

export interface DrawCmd {
  type: string;
  x: number;
  y: number;
  cx?: number;
  cy?: number;
  cx1?: number;
  cy1?: number;
  cx2?: number;
  cy2?: number;
  pointType?: 'corner' | 'smooth' | 'symmetric' | 'cusp';
  fillColor?: string;
  strokeColor?: string;
}

export type ToolMode = 'select' | 'move' | 'pen';
export type DrawModeType = 'line' | 'curve';
type DragType = 'node' | 'node-ctrl-quad' | 'node-ctrl-cubic-in' | 'node-ctrl-cubic-out' | 'node-ctrl-close-in' | 'node-ctrl-close-out' | 'shape' | 'pan' | 'selection' | 'cursor' | 'pen-drag';

export interface DrawingStudioProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (glyph: {
    id?: string;
    char: string;
    pathData: string;
    glyphType: 'isolated' | 'initial' | 'medial' | 'final';
    metrics: { ascent: number; descent: number };
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    baselineY: number;
    lsb: number;
    rsb: number;
    extraGuides: any[];
  }) => void;
  initialGlyph: Glyph | null;
  fallbackCharName?: string;
}

import { ColorPicker } from './ColorPicker';

// ─── Drawing Studio Component ────────────────────────────────────────────────
export function DrawingStudio({ isOpen, onClose, onSave, initialGlyph, fallbackCharName = '' }: DrawingStudioProps) {
  if (!isOpen) return null;

  // ─── Helper: Parse SVG Path ────────────────────────────────────────────────

  // ─── Drawing Studio Local States ───────────────────────────────────────────
  const [drawCharName, setDrawCharName] = useState(initialGlyph?.char || fallbackCharName);
  const [drawGlyphType, setDrawGlyphType] = useState<'isolated' | 'initial' | 'medial' | 'final'>(initialGlyph?.glyphType || 'isolated');
  const [drawingGlyphId, setDrawingGlyphId] = useState<string | null>(initialGlyph?.id || null);

  const [drawCommands, setDrawCommands] = useState<DrawCmd[]>(() => {
    return initialGlyph ? parseCmdsFromPath(initialGlyph.pathData) : [];
  });
  const [undoStack, setUndoStack] = useState<DrawCmd[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawCmd[][]>([]);

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [drawMode, setDrawMode] = useState<DrawModeType>('line');
  const [isPathFinished, setIsPathFinished] = useState<boolean>(false);
  const [joinProposal, setJoinProposal] = useState<{ activeEndIdx: number; targetPointIdx: number; targetSubpathStart: boolean } | null>(null);

  const [activeStudioDropdown, setActiveStudioDropdown] = useState<string | null>(null);
  const [studioDropdownPos, setStudioDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [gridSize, setGridSize] = useState<number>(50);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [snapToPoints, setSnapToPoints] = useState<boolean>(true);
  const [strokeWidth, setStrokeWidth] = useState<number>(2);

  const [currentGlyphMetrics, setCurrentGlyphMetrics] = useState(() => {
    return initialGlyph?.metrics || { ascent: 800, descent: -200 };
  });
  const [currentGlyphBaselineY, setCurrentGlyphBaselineY] = useState(initialGlyph?.baselineY ?? 600);
  const [currentGlyphLsb, setCurrentGlyphLsb] = useState(initialGlyph?.lsb ?? 50);
  const [currentGlyphRsb, setCurrentGlyphRsb] = useState(initialGlyph?.rsb ?? 950);

  const [selectedNodeIndices, setSelectedNodeIndices] = useState<number[]>([]);
  const [isShapeSelected, setIsShapeSelected] = useState(false);

  const [cursorX, setCursorX] = useState(() => {
    const firstCmd = initialGlyph ? parseCmdsFromPath(initialGlyph.pathData)[0] : null;
    return firstCmd ? firstCmd.x : 500;
  });
  const [cursorY, setCursorY] = useState(() => {
    const firstCmd = initialGlyph ? parseCmdsFromPath(initialGlyph.pathData)[0] : null;
    return firstCmd ? firstCmd.y : 600;
  });

  const [viewBox, setViewBox] = useState({ x: -100, y: -200, w: 1200, h: 1000 });
  const [showGrid, setShowGrid] = useState(true);

  const [dragging, setDragging] = useState<{ type: DragType; index?: number } | null>(null);
  const [panStart, setPanStart] = useState<{ mx: number; my: number; vbX: number; vbY: number } | null>(null);
  const [shapeDragStart, setShapeDragStart] = useState<{ mx: number; my: number; cmds: DrawCmd[] } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

  const [fillColor, setFillColor] = useState('rgba(0,0,0,0.85)');
  const [strokeColor, setStrokeColor] = useState('none');
  const [hasMoved, setHasMoved] = useState(false);

  // Custom board states and initial setup
  const [boardWidth, setBoardWidth] = useState<number>(1000);
  const [boardHeight, setBoardHeight] = useState<number>(1000);
  const [showInitialSetupModal, setShowInitialSetupModal] = useState<boolean>(!initialGlyph);
  const [customWidth, setCustomWidth] = useState<number>(1000);
  const [customHeight, setCustomHeight] = useState<number>(1000);
  const [selectedPreset, setSelectedPreset] = useState<string>('1:1');

  // Coloring piece states
  const [isSelectingForColor, setIsSelectingForColor] = useState<boolean>(false);
  const [coloringMIndex, setColoringMIndex] = useState<number | null>(null);
  const [showGridSettingsPanel, setShowGridSettingsPanel] = useState<boolean>(false);
  const [bottomPopoverPos, setBottomPopoverPos] = useState<{ bottom: number; left: number } | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Real-time Slider states for bottom toolbar
  const [rotationAngle, setRotationAngle] = useState(0);
  const [scaleFactor, setScaleFactor] = useState(100); // 100%
  const [activeBottomPopover, setActiveBottomPopover] = useState<'rotate' | 'scale' | 'flip' | 'dpad' | 'align' | 'color' | null>(null);
  
  const [selectSubMode, setSelectSubMode] = useState<'replace' | 'add' | 'remove'>('replace');
  const selectionDragStartIndicesRef = useRef<number[]>([]);

  const getSubPathIndicesList = (): number[][] => {
    const list: number[][] = [];
    let current: number[] = [];
    drawCommands.forEach((cmd, idx) => {
      if (cmd.type === 'M') {
        if (current.length > 0) {
          list.push(current);
        }
        current = [idx];
      } else {
        current.push(idx);
      }
    });
    if (current.length > 0) {
      list.push(current);
    }
    return list;
  };

  const [nudgeAmount, setNudgeAmount] = useState(10);
  const moveSubMode = 'pan';

  const fitBoardToScreen = useCallback(() => {
    if (!svgRef.current) return;
    const containerWidth = svgRef.current.clientWidth;
    const containerHeight = svgRef.current.clientHeight;
    if (!containerWidth || !containerHeight) return;

    const bWidth = boardWidth;
    const bHeight = boardHeight;
    const boardCenterX = Math.round(bWidth / 2);
    const boardCenterY = Math.round(bHeight * 0.3); // center around upper-middle portion

    const containerAspect = containerWidth / containerHeight;
    const boardAspect = bWidth / bHeight;

    let vx, vy, vw, vh;

    if (containerAspect < boardAspect) {
      // Screen is narrower (vertical, like phone)
      vw = bWidth;
      const scale = containerWidth / bWidth;
      vh = containerHeight / scale;
      vx = boardCenterX - vw / 2;
      vy = boardCenterY - vh / 2;
    } else {
      // Screen is wider (horizontal, like desktop)
      vh = bHeight;
      const scale = containerHeight / bHeight;
      vw = containerWidth / scale;
      vy = boardCenterY - vh / 2;
      vx = boardCenterX - vw / 2;
    }

    setViewBox({ x: Math.round(vx), y: Math.round(vy), w: Math.round(vw), h: Math.round(vh) });
  }, [boardWidth, boardHeight]);

  // Fit board automatically when mounting and when resized
  useEffect(() => {
    fitBoardToScreen();
    const element = svgRef.current;
    if (!element) return;
    
    const observer = new ResizeObserver(() => {
      fitBoardToScreen();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [fitBoardToScreen]);

  const rotationStartCmdsRef = useRef<DrawCmd[] | null>(null);
  const scaleStartCmdsRef = useRef<DrawCmd[] | null>(null);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const dPath = (() => {
    return compilePath(drawCommands);
  })();
  const isClosed = drawCommands.length > 0 && drawCommands[drawCommands.length - 1].type === 'Z';
  const fillVal = isClosed ? fillColor : 'none';

  const gridX: number[] = [];
  const gridY: number[] = [];
  const gSize = gridSize || 50;
  for (let x = -3000; x <= 3000; x += gSize) gridX.push(x);
  for (let y = -3000; y <= 3000; y += gSize) gridY.push(y);




  interface SubpathDetails {
    startIndex: number;
    endIndex: number;
    isOpen: boolean;
    points: { index: number; x: number; y: number; isStart: boolean; isEnd: boolean }[];
  }

  const getSubpathsInfo = (cmds: DrawCmd[]): SubpathDetails[] => {
    const list: SubpathDetails[] = [];
    let current: SubpathDetails | null = null;
    
    cmds.forEach((cmd, idx) => {
      if (cmd.type === 'M') {
        if (current) {
          list.push(current);
        }
        current = {
          startIndex: idx,
          endIndex: idx,
          isOpen: true,
          points: [{ index: idx, x: cmd.x, y: cmd.y, isStart: true, isEnd: false }]
        };
      } else if (cmd.type === 'Z') {
        if (current) {
          current.isOpen = false;
          current.endIndex = idx;
          list.push(current);
          current = null;
        }
      } else {
        if (current) {
          current.endIndex = idx;
          current.points[current.points.length - 1].isEnd = false;
          current.points.push({ index: idx, x: cmd.x, y: cmd.y, isStart: false, isEnd: true });
        }
      }
    });
    if (current) {
      list.push(current);
    }
    return list;
  };

  const getDistanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  // ─── Node Handles Helpers ──────────────────────────────────────────────────
  interface HandleRef {
    cmdIndex: number;
    propX: 'cx1' | 'cx2' | 'cx';
    propY: 'cy1' | 'cy2' | 'cy';
  }

  const getIncomingHandleRef = (cmds: DrawCmd[], i: number): HandleRef | null => {
    if (i < 0 || i >= cmds.length) return null;
    const cmd = cmds[i];
    if (cmd.type === 'M') {
      let zIndex = -1;
      for (let k = i + 1; k < cmds.length; k++) {
        if (cmds[k].type === 'M') break;
        if (cmds[k].type === 'Z') {
          zIndex = k;
          break;
        }
      }
      if (zIndex !== -1) {
        return { cmdIndex: zIndex, propX: 'cx2', propY: 'cy2' };
      }
      if (i === 0 && cmds.length === 1) {
        return { cmdIndex: 0, propX: 'cx2', propY: 'cy2' };
      }
      return null;
    }
    if (cmd.type === 'C' || cmd.type === 'L') {
      return { cmdIndex: i, propX: 'cx2', propY: 'cy2' };
    }
    if (cmd.type === 'Q') {
      return { cmdIndex: i, propX: 'cx', propY: 'cy' };
    }
    return null;
  };

  const getOutgoingHandleRef = (cmds: DrawCmd[], i: number): HandleRef | null => {
    if (i < 0 || i >= cmds.length) return null;
    if (i + 1 < cmds.length) {
      const nextCmd = cmds[i + 1];
      if (nextCmd.type !== 'M') {
        if (nextCmd.type === 'C' || nextCmd.type === 'L' || nextCmd.type === 'Z') {
          return { cmdIndex: i + 1, propX: 'cx1', propY: 'cy1' };
        }
      }
    } else if (i === 0 && cmds.length === 1) {
      return { cmdIndex: 0, propX: 'cx1', propY: 'cy1' };
    }
    return null;
  };

  const getPointType = (cmd: DrawCmd | undefined): 'corner' | 'smooth' | 'symmetric' | 'cusp' => {
    if (!cmd) return 'corner';
    return cmd.pointType || 'corner';
  };

  const updateCollinearHandles = (cmds: DrawCmd[], anchorIdx: number, isIncomingHandle: boolean, hX: number, hY: number): DrawCmd[] => {
    const updated = [...cmds];
    const anchor = updated[anchorIdx];
    if (!anchor) return cmds;

    const refIn = getIncomingHandleRef(updated, anchorIdx);
    const refOut = getOutgoingHandleRef(updated, anchorIdx);

    const type = getPointType(anchor);

    if (isIncomingHandle && refIn) {
      const cmdIn = updated[refIn.cmdIndex];
      cmdIn[refIn.propX] = hX;
      cmdIn[refIn.propY] = hY;

      if (type === 'smooth' && refOut) {
        const cmdOut = updated[refOut.cmdIndex];
        const dx = hX - anchor.x;
        const dy = hY - anchor.y;
        const currentLen = Math.hypot((cmdOut[refOut.propX] as number) - anchor.x, (cmdOut[refOut.propY] as number) - anchor.y) || 50;
        const incomingLen = Math.hypot(dx, dy) || 1;
        cmdOut[refOut.propX] = Math.round(anchor.x - (dx / incomingLen) * currentLen);
        cmdOut[refOut.propY] = Math.round(anchor.y - (dy / incomingLen) * currentLen);
      } else if (type === 'symmetric' && refOut) {
        const cmdOut = updated[refOut.cmdIndex];
        const dx = hX - anchor.x;
        const dy = hY - anchor.y;
        cmdOut[refOut.propX] = anchor.x - dx;
        cmdOut[refOut.propY] = anchor.y - dy;
      }
    } else if (!isIncomingHandle && refOut) {
      const cmdOut = updated[refOut.cmdIndex];
      cmdOut[refOut.propX] = hX;
      cmdOut[refOut.propY] = hY;

      if (type === 'smooth' && refIn) {
        const cmdIn = updated[refIn.cmdIndex];
        const dx = hX - anchor.x;
        const dy = hY - anchor.y;
        const currentLen = Math.hypot((cmdIn[refIn.propX] as number) - anchor.x, (cmdIn[refIn.propY] as number) - anchor.y) || 50;
        const outgoingLen = Math.hypot(dx, dy) || 1;
        cmdIn[refIn.propX] = Math.round(anchor.x - (dx / outgoingLen) * currentLen);
        cmdIn[refIn.propY] = Math.round(anchor.y - (dy / outgoingLen) * currentLen);
      } else if (type === 'symmetric' && refIn) {
        const cmdIn = updated[refIn.cmdIndex];
        const dx = hX - anchor.x;
        const dy = hY - anchor.y;
        cmdIn[refIn.propX] = anchor.x - dx;
        cmdIn[refIn.propY] = anchor.y - dy;
      }
    }

    return updated;
  };

  const convertSelectedNodesToType = (type: 'corner' | 'smooth' | 'symmetric' | 'cusp') => {
    if (!selectedNodeIndices.length) return;
    setUndoStack(s => [...s, drawCommands]);
    setRedoStack([]);

    const updated = drawCommands.map((c, i) => {
      if (!selectedNodeIndices.includes(i)) return c;
      const nc = { ...c, pointType: type };

      const refIn = getIncomingHandleRef(drawCommands, i);
      const refOut = getOutgoingHandleRef(drawCommands, i);

      const prev = i > 0 ? drawCommands[i - 1] : { x: c.x - 50, y: c.y };
      const next = (i + 1 < drawCommands.length) ? drawCommands[i + 1] : { x: c.x + 50, y: c.y };

      if (type === 'symmetric' || type === 'smooth') {
        const dIn = (refIn && drawCommands[refIn.cmdIndex][refIn.propX] != null) ? Math.hypot((drawCommands[refIn.cmdIndex][refIn.propX] as number) - c.x, (drawCommands[refIn.cmdIndex][refIn.propY] as number) - c.y) : 50;
        const dOut = (i + 1 < drawCommands.length && drawCommands[i+1].cx1 != null) ? Math.hypot((drawCommands[i+1].cx1 as number) - c.x, (drawCommands[i+1].cy1 as number) - c.y) : 50;

        let tangentX = next.x - prev.x;
        let tangentY = next.y - prev.y;
        const len = Math.hypot(tangentX, tangentY) || 1;
        tangentX /= len;
        tangentY /= len;

        const lenIn = type === 'symmetric' ? (dIn + dOut) / 2 : dIn;
        const lenOut = type === 'symmetric' ? (dIn + dOut) / 2 : dOut;

        if (i === 0) {
          nc.cx1 = Math.round(c.x + tangentX * lenOut);
          nc.cy1 = Math.round(c.y + tangentY * lenOut);
        } else {
          if (refIn) {
            const cmdIn = drawCommands[refIn.cmdIndex];
            cmdIn[refIn.propX] = Math.round(c.x - tangentX * lenIn);
            cmdIn[refIn.propY] = Math.round(c.y - tangentY * lenIn);
          }
          if (refOut) {
            const cmdOut = drawCommands[refOut.cmdIndex];
            cmdOut[refOut.propX] = Math.round(c.x + tangentX * lenOut);
            cmdOut[refOut.propY] = Math.round(c.y + tangentY * lenOut);
          }
        }
      }

      return nc;
    });

    setDrawCommands(updated);
    showSuccess(`تم تحويل النقاط المحددة إلى: ${type === 'corner' ? 'زاوية حادة' : type === 'smooth' ? 'منحنى ناعم' : type === 'symmetric' ? 'منحنى متناظر' : 'زاوية منحنية (Cusp)'}`);
  };

  const pushCmds = (cmds: DrawCmd[]) => {
    setUndoStack(s => [...s, drawCommands]);
    setRedoStack([]);
    setDrawCommands(cmds);
    rotationStartCmdsRef.current = null;
    scaleStartCmdsRef.current = null;
    setRotationAngle(0);
    setScaleFactor(100);
  };

  const handleUndo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(s => [...s, drawCommands]);
    setDrawCommands(prev);
    rotationStartCmdsRef.current = null;
    scaleStartCmdsRef.current = null;
    setRotationAngle(0);
    setScaleFactor(100);
  };

  const handleRedo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0, -1));
    setUndoStack(s => [...s, drawCommands]);
    setDrawCommands(next);
    rotationStartCmdsRef.current = null;
    scaleStartCmdsRef.current = null;
    setRotationAngle(0);
    setScaleFactor(100);
  };

  // ─── Actions: Align, scale, rotate, flip ────────────────────────────────────
  const autoCenter = () => {
    pushCmds(autoCenterCmds(drawCommands));
    showSuccess("تم التوسيط في مساحة العمل");
  };

  const scalePath = (f: number) => {
    pushCmds(scalePathCmds(drawCommands, f));
    showSuccess(`${f > 1 ? 'تكبير' : 'تصغير'} ${Math.round(f * 100)}%`);
  };

  const rotateShape = (deg: number) => {
    pushCmds(rotateShapeCmds(drawCommands, deg));
    showSuccess(`دوران ${deg}°`);
  };

  const flipH = () => {
    pushCmds(flipHCmds(drawCommands));
    showSuccess('قلب أفقي');
  };

  const flipV = () => {
    pushCmds(flipVCmds(drawCommands));
    showSuccess('قلب عمودي');
  };

  const moveSubPath = (direction: 'forward' | 'backward') => {
    setDrawCommands(moveSubPathCmds(drawCommands, selectedNodeIndices, direction));
  };

  const getSvgPt = (e: React.MouseEvent<any> | React.TouchEvent<any>) => {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    if ('touches' in e) {
      pt.x = e.touches[0].clientX;
      pt.y = e.touches[0].clientY;
    } else {
      pt.x = (e as React.MouseEvent).clientX;
      pt.y = (e as React.MouseEvent).clientY;
    }
    return pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
  };

  const snap = (v: number) => {
    return snapToGrid ? Math.round(v / gridSize) * gridSize : v;
  };

  const snapCoords = (x: number, y: number, skipIdx?: number) => {
    // We ignore skipIdx for now to avoid re-implementing point snapping fully
    return { x: snap(x), y: snap(y) };
  };

  const deleteSelectedNodes = () => {
    if (!selectedNodeIndices.length) return;
    
    // Group commands into original subpaths
    let currentSubpath: { index: number; cmd: DrawCmd }[] = [];
    const subpaths: { index: number; cmd: DrawCmd }[][] = [];
    
    drawCommands.forEach((cmd, i) => {
      if (cmd.type === 'M') {
        if (currentSubpath.length > 0) {
          subpaths.push(currentSubpath);
        }
        currentSubpath = [{ index: i, cmd }];
      } else {
        currentSubpath.push({ index: i, cmd });
      }
    });
    if (currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
    }
    
    const updatedSubpaths: DrawCmd[][] = [];
    
    subpaths.forEach(sub => {
      // Find kept items
      const kept = sub.filter(item => !selectedNodeIndices.includes(item.index));
      if (kept.length === 0) return; // Entire subpath deleted
      
      // Group contiguous items (items whose original indices are consecutive)
      const groups: { index: number; cmd: DrawCmd }[][] = [];
      let currentGroup: { index: number; cmd: DrawCmd }[] = [];
      
      kept.forEach(item => {
        if (currentGroup.length === 0) {
          currentGroup.push(item);
        } else {
          const lastItem = currentGroup[currentGroup.length - 1];
          if (item.index === lastItem.index + 1) {
            currentGroup.push(item);
          } else {
            groups.push(currentGroup);
            currentGroup = [item];
          }
        }
      });
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      
      // Process each group as an independent subpath
      groups.forEach(group => {
        const subcmds: DrawCmd[] = [];
        const firstItem = group[0];
        
        // Force the first kept command of any subpath group to be 'M' (Move To)
        if (firstItem.cmd.type !== 'M' && firstItem.cmd.type !== 'Z') {
          subcmds.push({
            ...firstItem.cmd,
            type: 'M',
            cx1: undefined,
            cy1: undefined,
            cx2: undefined,
            cy2: undefined,
            pointType: firstItem.cmd.pointType || 'corner'
          });
        } else {
          subcmds.push({ ...firstItem.cmd });
        }
        
        for (let j = 1; j < group.length; j++) {
          subcmds.push({ ...group[j].cmd });
        }
        
        // Skip subpaths that only have 'Z'
        if (subcmds.length === 1 && subcmds[0].type === 'Z') {
          return;
        }
        
        updatedSubpaths.push(subcmds);
      });
    });
    
    const finalCmds = updatedSubpaths.flat();
    pushCmds(finalCmds);
    setSelectedNodeIndices([]);
  };

  const executeJoinPaths = () => {
    if (!joinProposal) return;
    const { activeEndIdx, targetPointIdx, targetSubpathStart } = joinProposal;
    const cmds = [...drawCommands];
    
    // Simplistic join implementation for restoration purposes
    // A proper join handles subpath merging and handle preservation
    cmds[targetPointIdx].type = 'L'; 
    cmds.splice(activeEndIdx, 1);
    
    pushCmds(cmds);
    setJoinProposal(null);
    showSuccess("تم دمج المسارات بنجاح");
  };

  const getSubpathContainingIndex = (cmdIndex: number) => {
    let currentSubpathIndices: number[] = [];
    for (let i = 0; i < drawCommands.length; i++) {
      if (drawCommands[i].type === 'M') {
        if (currentSubpathIndices.includes(cmdIndex)) {
          return currentSubpathIndices;
        }
        currentSubpathIndices = [i];
      } else {
        currentSubpathIndices.push(i);
      }
    }
    if (currentSubpathIndices.includes(cmdIndex)) {
      return currentSubpathIndices;
    }
    return null;
  };

  const getSelectedBounds = () => {
    let targetCmds = drawCommands;
    if (selectedNodeIndices.length > 0) {
      targetCmds = drawCommands.filter((_, idx) => selectedNodeIndices.includes(idx));
    }
    
    if (!targetCmds.length) return null;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    targetCmds.forEach(c => {
      if (c.type !== 'Z') {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
      }
    });
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  };

  const translateSelected = (dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    setUndoStack(s => [...s, drawCommands]);
    setRedoStack([]);
    
    const updated = drawCommands.map((c, idx) => {
      if (selectedNodeIndices.length > 0 && !selectedNodeIndices.includes(idx)) {
        return c;
      }
      return {
        ...c,
        x: c.x + dx,
        y: c.y + dy,
        cx: c.cx != null ? c.cx + dx : undefined,
        cy: c.cy != null ? c.cy + dy : undefined,
        cx1: c.cx1 != null ? c.cx1 + dx : undefined,
        cy1: c.cy1 != null ? c.cy1 + dy : undefined,
        cx2: c.cx2 != null ? c.cx2 + dx : undefined,
        cy2: c.cy2 != null ? c.cy2 + dy : undefined,
      };
    });
    setDrawCommands(updated);
  };

  const nudgeSelected = (dx: number, dy: number) => {
    translateSelected(dx, dy);
  };

  const duplicateSelected = () => {
    if (!drawCommands.length) return;
    setUndoStack(s => [...s, drawCommands]);
    setRedoStack([]);

    let duplicated: DrawCmd[] = [];
    const offset = 40;

    if (selectedNodeIndices.length > 0) {
      const indicesToDuplicate = new Set<number>();
      selectedNodeIndices.forEach(idx => {
        const subpathIndices = getSubpathContainingIndex(idx);
        if (subpathIndices) {
          subpathIndices.forEach(i => indicesToDuplicate.add(i));
        }
      });

      if (indicesToDuplicate.size > 0) {
        const cmdCopies = Array.from(indicesToDuplicate).sort((a,b)=>a-b).map(i => {
          const c = drawCommands[i];
          const copy = { ...c };
          copy.x += offset;
          copy.y += offset;
          if (copy.cx != null) copy.cx += offset;
          if (copy.cy != null) copy.cy += offset;
          if (copy.cx1 != null) copy.cx1 += offset;
          if (copy.cy1 != null) copy.cy1 += offset;
          if (copy.cx2 != null) copy.cx2 += offset;
          if (copy.cy2 != null) copy.cy2 += offset;
          return copy;
        });

        const originalLength = drawCommands.length;
        setDrawCommands([...drawCommands, ...cmdCopies]);
        setSelectedNodeIndices(Array.from({ length: cmdCopies.length }, (_, idx) => originalLength + idx));
        showSuccess("تم تكرار الجزء المحدد بنجاح");
        return;
      }
    }

    const cmdCopies = drawCommands.map(c => {
      const copy = { ...c };
      copy.x += offset;
      copy.y += offset;
      if (copy.cx != null) copy.cx += offset;
      if (copy.cy != null) copy.cy += offset;
      if (copy.cx1 != null) copy.cx1 += offset;
      if (copy.cy1 != null) copy.cy1 += offset;
      if (copy.cx2 != null) copy.cx2 += offset;
      if (copy.cy2 != null) copy.cy2 += offset;
      return copy;
    });

    const originalLength = drawCommands.length;
    setDrawCommands([...drawCommands, ...cmdCopies]);
    setSelectedNodeIndices(Array.from({ length: cmdCopies.length }, (_, idx) => originalLength + idx));
    showSuccess("تم تكرار الشكل بالكامل بنجاح");
  };

  const handleRotationSliderChange = (newAngle: number) => {
    if (!rotationStartCmdsRef.current) {
      rotationStartCmdsRef.current = drawCommands;
    }
    const rotated = rotateShapeCmds(rotationStartCmdsRef.current, newAngle);
    setDrawCommands(rotated);
  };

  const handleScaleSliderChange = (newScale: number) => {
    if (!scaleStartCmdsRef.current) {
      scaleStartCmdsRef.current = drawCommands;
    }
    const scaled = scalePathCmds(scaleStartCmdsRef.current, newScale);
    setDrawCommands(scaled);
  };

  const zoom = (f: number) => {
    const cx = viewBox.x + viewBox.w / 2;
    const cy = viewBox.y + viewBox.h / 2;
    const nw = viewBox.w * f;
    const nh = viewBox.h * f;
    setViewBox({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
  };
  const onPointerDown = (
    e: React.MouseEvent<any>|React.TouchEvent<any>,
    type: DragType,
    index?: number
  ) => {
    setHasMoved(false);
    e.stopPropagation();
    if (e.type === 'touchstart') {
      if (e.cancelable !== false) {
        e.preventDefault();
      }
    }
    if (type==='node'||type.startsWith('node-ctrl')) {
      setUndoStack(s => [...s, drawCommands]);
      setRedoStack([]);
      if (index!=null) {
        if (!selectedNodeIndices.includes(index)) {
          if (selectSubMode === 'add') {
            setSelectedNodeIndices(p => [...p, index]);
          } else if (selectSubMode === 'remove') {
            setSelectedNodeIndices(p => p.filter(x => x !== index));
          } else {
            setSelectedNodeIndices([index]);
          }
        } else if (selectSubMode === 'remove') {
          setSelectedNodeIndices(p => p.filter(x => x !== index));
        }
      }
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
      if(pt){
        setSelectionStart(pt);
        setSelectionEnd(pt);
        selectionDragStartIndicesRef.current = selectedNodeIndices;
      }
    }
    if (type === 'pen-drag') {
      const pt = getSvgPt(e);
      if (pt) {
        const x = snap(pt.x);
        const y = snap(pt.y);
        
        setUndoStack(s => [...s, drawCommands]);
        setRedoStack([]);

        const subpaths = getSubpathsInfo(drawCommands);
        const activeSubpath = subpaths.length > 0 ? subpaths[subpaths.length - 1] : null;
        
        // 1. Clicked near the first point of the active subpath (Close Path)
        if (activeSubpath && activeSubpath.isOpen && activeSubpath.points.length >= 2) {
          const firstPt = activeSubpath.points[0];
          const dist = Math.hypot(x - firstPt.x, y - firstPt.y);
          if (dist < 14) {
            const last = drawCommands[drawCommands.length - 1];
            const first = drawCommands[firstPt.index];
            const hasHandles = last.cx1 != null || first.cx2 != null;
            
            const updatedCmds = [...drawCommands];
            if (hasHandles) {
              const cx1 = last.cx1 != null ? last.cx1 : Math.round(last.x + (first.x - last.x) / 3);
              const cy1 = last.cy1 != null ? last.cy1 : Math.round(last.y + (first.y - last.y) / 3);
              const cx2 = first.cx2 != null ? first.cx2 : Math.round(last.x + 2 * (first.x - last.x) / 3);
              const cy2 = first.cy2 != null ? first.cy2 : Math.round(last.y + 2 * (first.y - last.y) / 3);
              
              updatedCmds.push({ type: 'Z', x: 0, y: 0, cx1, cy1, cx2, cy2 });
            } else {
              updatedCmds.push({ type: 'Z', x: 0, y: 0 });
            }
            
            setDrawCommands(updatedCmds);
            setIsPathFinished(true);
            showSuccess("تم ربط النهاية بالبداية وإغلاق المسار بنجاح");
            return;
          }
        }
        
        // 2. Clicked near open endpoint of another subpath (Join)
        if (activeSubpath && activeSubpath.isOpen) {
          for (const sub of subpaths) {
            if (sub === activeSubpath || !sub.isOpen) continue;
            for (const endPt of sub.points) {
              if (endPt.isStart || endPt.isEnd) {
                const dist = Math.hypot(x - endPt.x, y - endPt.y);
                if (dist < 18) {
                  setJoinProposal({
                    activeEndIdx: drawCommands.length - 1,
                    targetPointIdx: endPt.index,
                    targetSubpathStart: endPt.isStart
                  });
                  return;
                }
              }
            }
          }
        }

        // 3. Normal point placement
        let updatedCmds = [...drawCommands];
        if (!drawCommands.length || isPathFinished || (drawCommands.length > 0 && drawCommands[drawCommands.length - 1].type === 'Z')) {
          updatedCmds.push({ type: 'M', x, y, pointType: 'corner' });
          setIsPathFinished(false);
        } else {
          const last = drawCommands[drawCommands.length - 1];
          if (last.cx1 != null || drawMode === 'curve') {
            const cx1 = last.cx1 != null ? last.cx1 : Math.round(last.x + (x - last.x) / 3);
            const cy1 = last.cy1 != null ? last.cy1 : Math.round(last.y + (y - last.y) / 3);
            const cx2 = Math.round(last.x + 2 * (x - last.x) / 3);
            const cy2 = Math.round(last.y + 2 * (y - last.y) / 3);
            
            updatedCmds.push({
              type: 'C', x, y,
              cx1, cy1, cx2, cy2,
              pointType: 'corner'
            });
          } else {
            updatedCmds.push({ type: 'L', x, y, pointType: 'corner' });
          }
        }
        
        setDrawCommands(updatedCmds);
        setDragging({ type: 'pen-drag', index: updatedCmds.length - 1 });
      }
      return;
    }
    setDragging({type,index});
  };

  const onPointerMove = (e: React.MouseEvent<SVGSVGElement>|React.TouchEvent<SVGSVGElement>) => {
    if (!dragging) return;
    setHasMoved(true);

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
      const boxIndices = drawCommands.map((_,i)=>i).filter(i=>{
        const c=drawCommands[i];
        return c.type!=='Z' && c.x>=mnX && c.x<=mxX && c.y>=mnY && c.y<=mxY;
      });
      if (selectSubMode === 'add') {
        setSelectedNodeIndices([...new Set([...selectionDragStartIndicesRef.current, ...boxIndices])]);
      } else if (selectSubMode === 'remove') {
        setSelectedNodeIndices(selectionDragStartIndicesRef.current.filter(i => !boxIndices.includes(i)));
      } else {
        setSelectedNodeIndices(boxIndices);
      }
      return;
    }

    if (dragging.type==='node' && dragging.index!=null) {
      const idx=dragging.index;
      const snapped = snapCoords(x, y, idx);
      const nx = snapped.x;
      const ny = snapped.y;
      setDrawCommands(prev => {
        const old=prev[idx]; if(!old) return prev;
        const dx=nx-old.x, dy=ny-old.y;
        return prev.map((c,i) => {
          if (selectedNodeIndices.includes(i) && selectedNodeIndices.includes(idx)) {
            const nc: DrawCmd={...c,x:c.x+dx,y:c.y+dy};
            if(c.cx!=null)nc.cx=c.cx+dx; if(c.cy!=null)nc.cy=c.cy+dy;
            if(c.cx1!=null)nc.cx1=c.cx1+dx; if(c.cy1!=null)nc.cy1=c.cy1+dy;
            if(c.cx2!=null)nc.cx2=c.cx2+dx; if(c.cy2!=null)nc.cy2=c.cy2+dy;
            return nc;
          }
          if (i===idx) {
            const nc: DrawCmd={...c,x:nx,y:ny};
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

    if (dragging.type === 'pen-drag' && dragging.index != null) {
      const idx = dragging.index;
      const cmd = drawCommands[idx];
      if (cmd) {
        const px = cmd.x;
        const py = cmd.y;
        
        const hOutX = x;
        const hOutY = y;
        const hInX = 2 * px - x;
        const hInY = 2 * py - y;

        setDrawCommands(prev => prev.map((c, i) => {
          if (i === idx) {
            const nc = { ...c, pointType: 'smooth' as const };
            nc.cx1 = hOutX;
            nc.cy1 = hOutY;
            nc.cx2 = hInX;
            nc.cy2 = hInY;
            
            if (nc.type === 'L') {
              nc.type = 'C';
            }
            return nc;
          }
          return c;
        }));
      }
      return;
    }

    if (dragging.type==='node-ctrl-quad' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p=>p.map((c,ci)=>ci===i?{...c,cx:x,cy:y}:c));
      return;
    }

    if (dragging.type==='node-ctrl-cubic-in' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p => updateCollinearHandles(p, i, true, x, y));
      return;
    }

    if (dragging.type==='node-ctrl-cubic-out' && dragging.index!=null) {
      const i=dragging.index;
      const anchorIdx = i === 0 ? 0 : i - 1;
      setDrawCommands(p => updateCollinearHandles(p, anchorIdx, false, x, y));
      return;
    }

    if (dragging.type==='node-ctrl-close-in' && dragging.index!=null) {
      const i=dragging.index;
      let mIndex = 0;
      for (let k = i; k >= 0; k--) {
        if (drawCommands[k].type === 'M') {
          mIndex = k;
          break;
        }
      }
      setDrawCommands(p => updateCollinearHandles(p, mIndex, true, x, y));
      return;
    }

    if (dragging.type==='node-ctrl-close-out' && dragging.index!=null) {
      const i=dragging.index;
      setDrawCommands(p => updateCollinearHandles(p, i - 1, false, x, y));
      return;
    }
  };

  const onPointerUp = () => {
    setDragging(null); setPanStart(null); setShapeDragStart(null);
    setSelectionStart(null); setSelectionEnd(null);
  };

  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (hasMoved) return;
    if (toolMode === 'pen') return;
    
    const pt = getSvgPt(e);
    if (!pt) return;
    const x = snap(pt.x);
    const y = snap(pt.y);
    setCursorX(x);
    setCursorY(y);

    if (toolMode !== 'pen') {
      if (toolMode === 'select') {
        let minDist = Infinity;
        let insertIndex = -1;
        let parentCmd: DrawCmd | null = null;
        
        for (let i = 1; i < drawCommands.length; i++) {
          const prev = drawCommands[i - 1];
          const curr = drawCommands[i];
          if (curr.type === 'M' || curr.type === 'Z' || prev.type === 'Z') continue;
          
          const d = getDistanceToSegment(pt.x, pt.y, prev.x, prev.y, curr.x, curr.y);
          if (d < minDist) {
            minDist = d;
            insertIndex = i;
            parentCmd = curr;
          }
        }
        
        if (insertIndex !== -1 && minDist < 20 && parentCmd) {
          setUndoStack(s => [...s, drawCommands]);
          setRedoStack([]);
          
          const newCmd: DrawCmd = {
            type: parentCmd.type === 'C' ? 'C' : 'L',
            x: x,
            y: y,
          };
          
          if (parentCmd.type === 'C') {
            const prev = drawCommands[insertIndex - 1];
            newCmd.cx1 = Math.round(prev.x + (x - prev.x) / 3);
            newCmd.cy1 = Math.round(prev.y + (y - prev.y) / 3);
            newCmd.cx2 = Math.round(prev.x + 2 * (x - prev.x) / 3);
            newCmd.cy2 = Math.round(prev.y + 2 * (y - prev.y) / 3);
          }
          
          const updatedCmds = [...drawCommands];
          updatedCmds.splice(insertIndex, 0, newCmd);
          setDrawCommands(updatedCmds);
          setSelectedNodeIndices([insertIndex]);
          showSuccess("تم تقسيم المسار وإضافة النقطة بدقة");
          return;
        }
      }
      setIsShapeSelected(false);
      setSelectedNodeIndices([]);
      return;
    }

    const subpaths = getSubpathsInfo(drawCommands);
    const activeSubpath = subpaths.length > 0 ? subpaths[subpaths.length - 1] : null;
    
    if (activeSubpath && activeSubpath.isOpen && activeSubpath.points.length > 0) {
      const firstPt = activeSubpath.points[0];
      const dist = Math.hypot(x - firstPt.x, y - firstPt.y);
      if (dist < 18) {
        pushCmds([...drawCommands, { type: 'Z', x: 0, y: 0 }]);
        setIsPathFinished(true);
        showSuccess("تم ربط النهاية بالبداية وإغلاق المسار بنجاح");
        return;
      }
    }
    
    if (activeSubpath && activeSubpath.isOpen) {
      for (const sub of subpaths) {
        if (sub === activeSubpath || !sub.isOpen) continue;
        for (const endPt of sub.points) {
          if (endPt.isStart || endPt.isEnd) {
            const dist = Math.hypot(x - endPt.x, y - endPt.y);
            if (dist < 18) {
              setJoinProposal({
                activeEndIdx: drawCommands.length - 1,
                targetPointIdx: endPt.index,
                targetSubpathStart: endPt.isStart
              });
              return;
            }
          }
        }
      }
    }

    if (!drawCommands.length || isPathFinished || (drawCommands.length > 0 && drawCommands[drawCommands.length - 1].type === 'Z')) {
      pushCmds([...drawCommands, { type: 'M', x, y }]);
      setIsPathFinished(false);
    } else {
      const last = drawCommands[drawCommands.length - 1];
      if (drawMode === 'line') {
        pushCmds([...drawCommands, { type: 'L', x, y }]);
      } else {
        pushCmds([...drawCommands, {
          type: 'C', x, y,
          cx1: Math.round(last.x + (x - last.x) / 3),
          cy1: Math.round(last.y + (y - last.y) / 3),
          cx2: Math.round(last.x + 2 * (x - last.x) / 3),
          cy2: Math.round(last.y + 2 * (y - last.y) / 3),
        }]);
      }
    }
  };

  // ─── Save & Download ───────────────────────────────────────────────────────
  const saveDrawnGlyph = () => {
    if (!drawCommands.length) { alert('الرجاء رسم مسار أولاً!'); return; }
    let name = drawCharName.trim();
    
    // Prompt the user to enter the character name on save
    const promptName = prompt("الرجاء إدخال اسم الحرف أو الرمز لهذا الرسم:", name === 'حرف_جديد' ? '' : name);
    if (promptName === null) return; // User cancelled
    
    name = promptName.trim();
    if (!name) {
      name = 'حرف_جديد';
    }
    setDrawCharName(name);
    
    const pathStr = compilePath(drawCommands);
    let bounds = { minX: 100, maxX: 500, minY: 200, maxY: 600 };
    try {
      const b = calculateExactPathBounds(pathStr);
      if (isFinite(b.x1)) {
        bounds = { minX: Math.round(b.x1), maxX: Math.round(b.x2), minY: Math.round(b.y1), maxY: Math.round(b.y2) };
      }
    } catch {}
    
    onSave({
      id: drawingGlyphId || undefined,
      char: name,
      pathData: pathStr,
      glyphType: drawGlyphType,
      metrics: currentGlyphMetrics,
      bounds,
      baselineY: currentGlyphBaselineY,
      lsb: currentGlyphLsb,
      rsb: currentGlyphRsb,
      extraGuides: []
    });
  };

  const downloadSVG = () => {
    if (!drawCommands.length) { alert('لا يوجد مسار!'); return; }
    const pathStr = compilePath(drawCommands);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -200 1000 1000"><path d="${pathStr}" fill="rgba(0,0,0,0.8)" /></svg>`;
    const b = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${drawCharName || 'glyph'}.svg`;
    a.click();
  };

  // ─── Dropdowns & Renders ───────────────────────────────────────────────────
  const renderStudioDropdown = (
    id: string,
    label: string,
    IconComponent: any,
    items: {
      label: string;
      sublabel?: string;
      icon?: any;
      onClick: () => void;
      disabled?: boolean;
      active?: boolean;
    }[],
    disabled: boolean = false
  ) => {
    const isOpen = activeStudioDropdown === id;
    return (
      <div className="relative inline-block text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setStudioDropdownPos({
              top: rect.bottom + 8,
              left: Math.max(8, Math.min(window.innerWidth - 248, rect.left))
            });
            setActiveStudioDropdown(isOpen ? null : id);
          }}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            isOpen
              ? 'bg-zinc-100 border-zinc-300 text-zinc-900 shadow-sm'
              : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700'
          } disabled:opacity-45 disabled:pointer-events-none`}
        >
          <IconComponent className="w-3.5 h-3.5 text-zinc-500" />
          <span>{label}</span>
          <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && studioDropdownPos && createPortal(
          <>
            <div
              className="fixed inset-0 z-[9990]"
              onClick={(e) => {
                e.stopPropagation();
                setActiveStudioDropdown(null);
              }}
            />
            <div
              className="fixed bg-white border border-zinc-200 shadow-2xl rounded-2xl p-1.5 z-[9995] flex flex-col gap-0.5 text-right animate-in fade-in slide-in-from-top-1 duration-100 w-60"
              style={{
                top: studioDropdownPos.top,
                left: studioDropdownPos.left
              }}
              dir="rtl"
            >
              {items.map((item, idx) => (
                <button
                  key={idx}
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    item.onClick();
                    setActiveStudioDropdown(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-right ${
                    item.active 
                      ? 'bg-teal-50 text-teal-800 font-bold' 
                      : item.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.icon && (
                      <item.icon className={`w-3.5 h-3.5 ${item.active ? 'text-teal-600' : 'text-zinc-400'}`} />
                    )}
                    <div className="flex flex-col text-right">
                      <span className="text-xs font-bold">{item.label}</span>
                      {item.sublabel && (
                        <span className="text-[9px] text-zinc-400 font-mono mt-0.5 font-normal">{item.sublabel}</span>
                      )}
                    </div>
                  </div>
                  {item.active && <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  const renderViewExportDropdown = () => {
    const isOpen = activeStudioDropdown === 'viewExport';
    return (
      <div className="relative inline-block text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setStudioDropdownPos({
              top: rect.bottom + 8,
              left: Math.max(8, Math.min(window.innerWidth - 248, rect.left))
            });
            setActiveStudioDropdown(isOpen ? null : 'viewExport');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            isOpen
              ? 'bg-zinc-100 border-zinc-300 text-zinc-900 shadow-sm'
              : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700'
          }`}
        >
          <Eye className="w-3.5 h-3.5 text-zinc-500" />
          <span className="hidden sm:inline">عرض وتصدير</span>
          <span className="inline sm:hidden">عرض</span>
          <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && studioDropdownPos && createPortal(
          <>
            <div
              className="fixed inset-0 z-[9990]"
              onClick={(e) => {
                e.stopPropagation();
                setActiveStudioDropdown(null);
              }}
            />
            <div
              className="fixed bg-white border border-zinc-200 shadow-2xl rounded-2xl p-1.5 z-[9995] flex flex-col gap-0.5 text-right animate-in fade-in slide-in-from-top-1 duration-100 w-60"
              style={{
                top: studioDropdownPos.top,
                left: studioDropdownPos.left
              }}
              dir="rtl"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadSVG();
                  setActiveStudioDropdown(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 text-zinc-700 text-right transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold">تحميل ملف SVG مستقل</span>
                  <span className="text-[9px] text-zinc-400 font-mono mt-0.5 font-normal">Download SVG</span>
                </div>
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  const renderGridSettingsDropdown = () => {
    const isOpen = activeStudioDropdown === 'gridSettings';
    return (
      <div className="relative inline-block text-right">
        {/* Main Grid Dropdown Trigger */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setStudioDropdownPos({
              top: rect.bottom + 8,
              left: Math.max(8, Math.min(window.innerWidth - 248, rect.left))
            });
            setActiveStudioDropdown(isOpen ? null : 'gridSettings');
          }}
          className={`px-3 py-1.5 rounded-xl border border-zinc-200 bg-white shadow-sm text-xs font-bold transition-all flex items-center gap-1.5 ${
            isOpen ? 'bg-zinc-100 border-zinc-300' : 'text-zinc-600 hover:bg-zinc-50'
          }`}
          title="الشبكة والوضع"
        >
          <Grid className="w-4 h-4 text-zinc-500" />
          <span className="text-[11px]">الشبكة</span>
        </button>

        {isOpen && studioDropdownPos && createPortal(
          <>
            <div
              className="fixed inset-0 z-[9990]"
              onClick={(e) => {
                e.stopPropagation();
                setActiveStudioDropdown(null);
              }}
            />
            <div
              className="fixed bg-white border border-zinc-200 shadow-2xl rounded-2xl p-3 z-[9995] flex flex-col gap-2.5 text-right animate-in fade-in slide-in-from-top-1 duration-100 w-56"
              style={{
                top: studioDropdownPos.top,
                left: studioDropdownPos.left
              }}
              dir="rtl"
            >
              {/* Option 1: Free Mode */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSnapToGrid(false);
                  setShowGrid(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all text-right border ${
                  !showGrid && !snapToGrid 
                    ? 'bg-teal-50 text-teal-800 border-teal-100 font-bold' 
                    : 'hover:bg-zinc-50 border-transparent text-zinc-700'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${!showGrid && !snapToGrid ? 'border-teal-500 bg-teal-500 text-white' : 'border-zinc-300 bg-white'}`}>
                  {!showGrid && !snapToGrid && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-xs">وضع حر (رسم حر)</span>
              </button>

              {/* Option 2: Helper Grid */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSnapToGrid(true);
                    setShowGrid(true);
                  }}
                  className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all text-right border ${
                    showGrid && snapToGrid 
                      ? 'bg-teal-50 text-teal-800 border-teal-100 font-bold' 
                      : 'hover:bg-zinc-50 border-transparent text-zinc-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${showGrid && snapToGrid ? 'border-teal-500 bg-teal-500 text-white' : 'border-zinc-300 bg-white'}`}>
                    {showGrid && snapToGrid && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs">الشبكة المساعدة</span>
                </button>

                {/* Settings Gear Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGridSettingsPanel(s => !s);
                  }}
                  className={`p-2 rounded-xl border transition-all ${
                    showGridSettingsPanel 
                      ? 'bg-zinc-100 border-zinc-300 text-zinc-800' 
                      : 'border-zinc-200 hover:bg-zinc-50 text-zinc-500'
                  }`}
                  title="إعدادات الشبكة"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Spacing Settings Panel */}
              {showGridSettingsPanel && (
                <div className="border-t border-zinc-100 pt-2.5 mt-1 space-y-2 animate-in fade-in duration-100">
                  <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500">
                    <span>تباعد الشبكة:</span>
                    <span className="font-mono bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded">{gridSize}px</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" 
                      min={10} 
                      max={150} 
                      step={5}
                      value={gridSize} 
                      onChange={e => setGridSize(+e.target.value)}
                      className="flex-1 h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                    />
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGridSize(50);
                    }}
                    className="w-full text-center py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-[10px] font-bold transition-all"
                  >
                    إعادة تعيين (50px)
                  </button>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  const renderTopBarLeft = () => {
    const toolBtns = (
      <div className="flex bg-zinc-100 rounded-xl border border-zinc-200 p-1 gap-1 shrink-0">
        {([
          ['select','تحديد','V',MousePointer],
          ['move','تحريك','G',Hand],
          ['pen','قلم','P',PenTool],
        ] as [ToolMode,string,string,any][]).map(([mode,label,shortcut,Icon])=>(
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
          
          {/* Segmented Control for selection submodes */}
          <div className="flex bg-zinc-100 rounded-xl border border-zinc-200 p-0.5 gap-0.5 shrink-0">
            <button
              onClick={() => setSelectSubMode('replace')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectSubMode === 'replace'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="تحديد جديد مستبدل"
            >
              تحديد عادي
            </button>
            <button
              onClick={() => setSelectSubMode('add')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                selectSubMode === 'add'
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="إضافة نقاط جديدة للتحديد الحالي"
            >
              <span>إضافة (+)</span>
            </button>
            <button
              onClick={() => setSelectSubMode('remove')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                selectSubMode === 'remove'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="طرح وإزالة نقاط من التحديد الحالي"
            >
              <span>طرح (-)</span>
            </button>
          </div>

          <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
          
          {renderStudioDropdown(
            'segmentConvert',
            'تحويل المسار',
            RefreshCw,
            [
              {
                label: 'تحويل الجزء إلى منحنى',
                sublabel: 'Convert segment to Curve',
                icon: ChevronUp,
                onClick: () => {
                  const nc=drawCommands.map((c,i)=>{
                    if(!selectedNodeIndices.includes(i)||c.type!=='L') return c;
                    const p=i>0?drawCommands[i-1]:{x:0,y:0};
                    return {...c,type:'C',cx1:Math.round(p.x+(c.x-p.x)/3),cy1:Math.round(p.y+(c.y-p.y)/3),cx2:Math.round(p.x+2*(c.x-p.x)/3),cy2:Math.round(p.y+2*(c.y-p.y)/3)};
                  });
                  pushCmds(nc);
                }
              },
              {
                label: 'تحويل الجزء إلى مستقيم',
                sublabel: 'Convert segment to Straight',
                icon: ArrowRight,
                onClick: () => {
                  const nc=drawCommands.map((c,i)=>(!selectedNodeIndices.includes(i)||(c.type!=='C'&&c.type!=='Q'))?c:{type:'L',x:c.x,y:c.y});
                  pushCmds(nc);
                }
              },
              {
                label: 'تفعيل مقابض التحكم ∿',
                sublabel: 'Show & Edit Handles',
                icon: Layers,
                onClick: () => {
                  const nc = drawCommands.map((c, i) => {
                    if (!selectedNodeIndices.includes(i)) return c;
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
                }
              }
            ],
            !hasSelection
          )}

          {renderStudioDropdown(
            'nodePointType',
            'نوع النقطة',
            Settings2,
            [
              {
                label: 'زاوية حادة (مقبضان مستقلان)',
                sublabel: 'Point type: Corner',
                icon: MousePointer,
                onClick: () => convertSelectedNodesToType('corner'),
                active: hasSelection && selectedNodeIndices.every(i => getPointType(drawCommands[i]) === 'corner')
              },
              {
                label: 'ربط المقابض: مقابل بعض وطول حر (Smooth)',
                sublabel: 'Point type: Smooth',
                icon: PenTool,
                onClick: () => convertSelectedNodesToType('smooth'),
                active: hasSelection && selectedNodeIndices.every(i => getPointType(drawCommands[i]) === 'smooth')
              },
              {
                label: 'ربط المقابض: مقابل بعض وبنفس الطول (Symmetric)',
                sublabel: 'Point type: Symmetric',
                icon: Layers,
                onClick: () => convertSelectedNodesToType('symmetric'),
                active: hasSelection && selectedNodeIndices.every(i => getPointType(drawCommands[i]) === 'symmetric')
              },
              {
                label: 'زاوية منحنية (حرة / Cusp)',
                sublabel: 'Point type: Cusp',
                icon: Settings2,
                onClick: () => convertSelectedNodesToType('cusp'),
                active: hasSelection && selectedNodeIndices.every(i => getPointType(drawCommands[i]) === 'cusp')
              }
            ],
            !hasSelection
          )}

          {hasSelection && (
            <button
              onClick={deleteSelectedNodes}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm animate-in zoom-in-95 duration-100"
              title="حذف النقاط المحددة"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">حذف المحدد</span>
            </button>
          )}
        </div>
      );
    } else if (toolMode === 'move') {
      contextTools = null;
    } else if (toolMode === 'pen') {
      contextTools = (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-px h-6 bg-zinc-200 mx-1 shrink-0" />
          
          {renderStudioDropdown(
            'penActions',
            'إجراءات المسار',
            PenTool,
            [
              {
                label: 'إضافة نقطة عند المؤشر',
                sublabel: 'Place node at cursor coordinate',
                icon: Plus,
                onClick: () => {
                  if(!drawCommands.length) pushCmds([{type:'M',x:cursorX,y:cursorY}]);
                  else if(drawMode==='line') pushCmds([...drawCommands,{type:'L',x:cursorX,y:cursorY}]);
                  else {
                    const last=drawCommands[drawCommands.length-1];
                    pushCmds([...drawCommands,{type:'C',x:cursorX,y:cursorY,cx1:Math.round(last.x+(cursorX-last.x)/3),cy1:Math.round(last.y+(cursorY-last.y)/3),cx2:Math.round(last.x+2*(cursorX-last.x)/3),cy2:Math.round(last.y+2*(cursorY-last.y)/3)}]);
                  }
                }
              },
              {
                label: 'بدء مسار فرعي جديد',
                sublabel: 'Start new subpath (M)',
                icon: Layers,
                onClick: () => {
                  pushCmds([...drawCommands,{type:'M',x:cursorX,y:cursorY}]); 
                  setIsPathFinished(false);
                  showSuccess("بدء مسار مستقل وجديد");
                }
              },
              {
                label: 'إغلاق المسار الحالي',
                sublabel: 'Close path to start (Z)',
                icon: CheckCircle2,
                disabled: !drawCommands.length,
                onClick: () => {
                  if(drawCommands.length) {
                    pushCmds([...drawCommands,{type:'Z',x:0,y:0}]); 
                    setIsPathFinished(true);
                    showSuccess("تم إغلاق المسار الحالي");
                  }
                }
              }
            ]
          )}

          <button
            onClick={() => {
              setIsPathFinished(true);
              showSuccess("تم إنهاء المسار بنجاح");
            }}
            title="إنهاء المسار الحالي للرسم (Enter)"
            className="flex items-center justify-center p-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      );
    }
    return <>{toolBtns}{contextTools}</>;
  };

  return (
    <div className="fixed inset-0 z-[150] bg-white text-zinc-900 flex flex-col h-[100dvh] overflow-hidden select-none font-sans" dir="rtl">
      
      {/* ─── TOAST NOTIFICATION ───────────────────────────────────────────────── */}
      {success && (
        <div className="fixed bottom-16 right-6 z-[999] bg-zinc-900 text-white rounded-2xl px-5 py-3 shadow-2xl border border-zinc-800 flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-teal-400" />
          <span>{success}</span>
        </div>
      )}

      {/* ─── TOP BAR ─────────────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-zinc-200 bg-zinc-50 shrink-0 sticky top-0 z-[200] overflow-x-auto custom-scrollbar whitespace-nowrap">
        <div className="h-full flex items-center gap-3 px-3 min-w-max">
          {renderTopBarLeft()}

          <div className="w-px h-6 bg-zinc-200 shrink-0" />

          {renderViewExportDropdown()}

          <div className="w-px h-6 bg-zinc-200 shrink-0" />

          {renderGridSettingsDropdown()}

          <div className="w-px h-6 bg-zinc-200 shrink-0" />

          <div className="flex items-center gap-0.5 bg-white border border-zinc-200 rounded-xl p-0.5 shadow-sm shrink-0">
            <button onClick={handleUndo} disabled={!undoStack.length} className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg disabled:opacity-30 transition-all" title="تراجع (Ctrl+Z)"><Undo className="w-3.5 h-3.5" /></button>
            <button onClick={handleRedo} disabled={!redoStack.length} className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg disabled:opacity-30 transition-all transform scale-x-[-1]" title="إعادة (Ctrl+Y)"><Undo className="w-3.5 h-3.5" /></button>
          </div>
          
          <div className="w-px h-6 bg-zinc-200 shrink-0" />

          <button onClick={saveDrawnGlyph} className="p-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center shrink-0" title="حفظ في المشروع">
            <Save className="w-4 h-4" />
          </button>

          <button onClick={()=>{if(drawCommands.length&&!confirm('خروج بدون حفظ؟'))return;onClose();}} className="p-1.5 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 shrink-0" title="إغلاق">
            <X className="w-3.5 h-3.5 text-zinc-600" />
          </button>
        </div>
      </header>

      {/* ─── CENTRAL AREA: Left Canvas ────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden bg-zinc-50 relative">
        
        <div className="flex-1 flex flex-col relative overflow-hidden h-full">
          
          {/* Join Proposal Notification */}
          {joinProposal && (
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 bg-teal-600 text-white rounded-2xl px-6 py-3.5 shadow-xl flex items-center gap-4 animate-bounce max-w-md" dir="rtl">
              <div className="text-right">
                <p className="text-xs font-bold">اكتشاف نقطة طرفية قريبة!</p>
                <p className="text-[10px] opacity-90">هل تريد دمج المسارات وتوصيلهما معاً تلقائياً؟</p>
              </div>
              <div className="flex gap-2">
                <button onClick={executeJoinPaths} className="bg-white text-teal-700 px-3 py-1 rounded-full text-[10px] font-bold hover:bg-teal-50 transition-colors">نعم، دمج (Enter)</button>
                <button onClick={() => setJoinProposal(null)} className="bg-teal-700/50 text-white px-2.5 py-1 rounded-full text-[10px] hover:bg-teal-700 transition-colors">تجاهل (Esc)</button>
              </div>
            </div>
          )}

          {/* SVG Interactive Canvas */}
          <svg
            ref={svgRef}
            className={`w-full h-full touch-none ${toolMode==='move'&&!dragging?'cursor-grab':toolMode==='move'&&dragging?.type==='shape'?'cursor-grabbing':toolMode==='pen'?'cursor-crosshair':'cursor-default'}`}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            preserveAspectRatio="xMidYMid slice"
            onMouseDown={e=>{
              if(toolMode==='move') onPointerDown(e, 'pan');
              else if(toolMode==='select') onPointerDown(e,'selection');
              else if(toolMode==='pen') onPointerDown(e,'pen-drag');
            }}
            onTouchStart={e=>{
              if(toolMode==='move') onPointerDown(e, 'pan');
              else if(toolMode==='select') onPointerDown(e,'selection');
              else if(toolMode==='pen') onPointerDown(e,'pen-drag');
            }}
            onMouseMove={onPointerMove}
            onTouchMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchEnd={onPointerUp}
            onWheel={e=>{e.preventDefault();zoom(e.deltaY>0?1.1:0.9);}}
            onClick={onCanvasClick}
          >
            {/* Dynamic Grid */}
            {showGrid && (
              <g className="pointer-events-none">
                {gridX.map(x=><line key={`x${x}`} x1={x} y1="-5000" x2={x} y2="5000" stroke={x===0||x===500?'#cbd5e1':'#f1f5f9'} strokeWidth={x===0||x===500?'1.5':'1'} opacity={x===0||x===500?0.5:0.4} />)}
                {gridY.map(y=><line key={`y${y}`} x1="-5000" y1={y} x2="5000" y2={y} stroke={y===0||y===600?'#cbd5e1':'#f1f5f9'} strokeWidth={y===0||y===600?'1.5':'1'} opacity={y===0||y===600?0.5:0.4} />)}
              </g>
            )}

            {/* Selection highlight */}
            {isShapeSelected && toolMode==='move' && (
              <path d={dPath} fill="none" stroke="#0ea5e9" strokeWidth="6" opacity="0.25" className="pointer-events-none" />
            )}

            {/* Main paths split by subpath */}
            {getSubPaths(drawCommands).map((subPath, subIdx) => {
              const subClosed = subPath.length > 0 && subPath[subPath.length - 1].type === 'Z';
              const subFillVal = subClosed ? fillColor : 'none';
              const subDPath = compilePath(subPath);
              const subIndices = getSubPathIndicesList()[subIdx] || [];
              return (
                <path
                  key={`subpath-${subIdx}`}
                  d={subDPath}
                  fill={subFillVal}
                  stroke={strokeColor==='none'?'#18181b':strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={toolMode === 'select' ? 'cursor-move' : 'pointer-events-none'}
                  onMouseDown={e=>{
                    if (toolMode === 'select') {
                      e.stopPropagation();
                      if (selectSubMode === 'add') {
                        setSelectedNodeIndices(p => [...new Set([...p, ...subIndices])]);
                      } else if (selectSubMode === 'remove') {
                        setSelectedNodeIndices(p => p.filter(i => !subIndices.includes(i)));
                      } else {
                        setSelectedNodeIndices(subIndices);
                      }
                      setIsShapeSelected(true);
                      onPointerDown(e, 'shape');
                    }
                  }}
                  onTouchStart={e=>{
                    if (toolMode === 'select') {
                      e.stopPropagation();
                      if (selectSubMode === 'add') {
                        setSelectedNodeIndices(p => [...new Set([...p, ...subIndices])]);
                      } else if (selectSubMode === 'remove') {
                        setSelectedNodeIndices(p => p.filter(i => !subIndices.includes(i)));
                      } else {
                        setSelectedNodeIndices(subIndices);
                      }
                      setIsShapeSelected(true);
                      onPointerDown(e, 'shape');
                    }
                  }}
                />
              );
            })}

            {/* Node handles (select & pen tool) */}
            {(toolMode==='select'||toolMode==='pen') && drawCommands.map((cmd, i) => {
              if (cmd.type==='Z') {
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
                  {/* Cubic outgoing handle (cx1,cy1 = handle leaving from this node or previous node) */}
                  {cmd.cx1!=null&&cmd.cy1!=null&&(
                    <g>
                      <line x1={prev ? prev.x : cmd.x} y1={prev ? prev.y : cmd.y} x2={cmd.cx1} y2={cmd.cy1} stroke="#0ea5e9" strokeWidth="1" strokeDasharray="3,3" className="pointer-events-none" />
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

      </div>

      {/* ─── BOTTOM BAR ──────────────────────────────────────────────────────── */}
      <footer className="h-12 border-t border-zinc-200 bg-white px-3 flex items-center justify-between md:justify-start gap-1 md:gap-2 shrink-0 relative z-[210] overflow-visible" dir="rtl">
        
        {/* 1. حذف (Delete) */}
        <button 
          onClick={deleteSelectedNodes}
          disabled={!selectedNodeIndices.length}
          className="p-2 bg-red-50 hover:bg-red-100 disabled:opacity-30 disabled:bg-transparent text-red-600 rounded-xl transition-all flex items-center justify-center shrink-0"
          title="حذف العناصر المحددة (Delete)"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* 2. تكرار (Duplicate) */}
        <button 
          onClick={duplicateSelected}
          className="p-2 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 rounded-xl transition-all flex items-center justify-center shrink-0"
          title="تكرار العنصر أو المسار المحدد (Ctrl+D)"
        >
          <Copy className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-zinc-200 shrink-0" />

        {/* 3. زر تدوير 360° (Rotate) */}
        <div className="relative shrink-0">
          <button 
            onClick={() => {
              if (activeBottomPopover === 'rotate') {
                setActiveBottomPopover(null);
                rotationStartCmdsRef.current = null;
              } else {
                setActiveBottomPopover('rotate');
                setRotationAngle(0);
                rotationStartCmdsRef.current = drawCommands;
              }
            }}
            className={`p-2 rounded-xl transition-all flex items-center justify-center ${activeBottomPopover === 'rotate' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title="تدوير العنصر 360°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          
          {activeBottomPopover === 'rotate' && (
            <div className="absolute bottom-14 right-0 bg-white border border-zinc-200 p-4 rounded-2xl shadow-xl w-64 z-[220] animate-in slide-in-from-bottom-2 duration-150">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-zinc-700">تدوير العنصر المحدد 360°</span>
                <span className="text-[10px] font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600">{rotationAngle}°</span>
              </div>
              <input 
                type="range" 
                min={-180} 
                max={180} 
                value={rotationAngle} 
                onChange={e => {
                  const val = +e.target.value;
                  setRotationAngle(val);
                  handleRotationSliderChange(val);
                }}
                className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800"
              />
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => {
                    if (rotationStartCmdsRef.current) {
                      setUndoStack(s => [...s, rotationStartCmdsRef.current!]);
                      setRedoStack([]);
                    }
                    setActiveBottomPopover(null);
                    rotationStartCmdsRef.current = null;
                    showSuccess("تم تأكيد التدوير");
                  }} 
                  className="flex-1 bg-zinc-950 text-white text-[10px] py-1.5 rounded-lg hover:bg-black transition-colors"
                >
                  تأكيد
                </button>
                <button 
                  onClick={() => {
                    if (rotationStartCmdsRef.current) {
                      setDrawCommands(rotationStartCmdsRef.current);
                    }
                    setActiveBottomPopover(null);
                    rotationStartCmdsRef.current = null;
                  }} 
                  className="flex-1 bg-zinc-100 text-zinc-600 text-[10px] py-1.5 rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. أربعة أزرار قلب في الأربع جهات داخل زر واحد (Flip 4-way) */}
        <div className="relative shrink-0">
          <button 
            onClick={() => setActiveBottomPopover(activeBottomPopover === 'flip' ? null : 'flip')}
            className={`p-2 rounded-xl transition-all flex items-center justify-center ${activeBottomPopover === 'flip' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title="قلب وانعكاس في الجهات الأربع"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>

          {activeBottomPopover === 'flip' && (
            <div className="absolute bottom-14 right-0 bg-white border border-zinc-200 p-2.5 rounded-2xl shadow-xl w-48 z-[220] animate-in slide-in-from-bottom-2 duration-150">
              <span className="text-[9px] font-bold text-zinc-400 block mb-2 px-1 text-right">انعكاس في 4 اتجاهات</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button 
                  onClick={() => { flipH(); setActiveBottomPopover(null); }}
                  className="flex items-center gap-1.5 p-2 bg-zinc-50 hover:bg-zinc-100 rounded-lg text-[10px] font-bold text-zinc-700"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
                  <span>انعكاس يميناً</span>
                </button>
                <button 
                  onClick={() => { flipH(); setActiveBottomPopover(null); }}
                  className="flex items-center gap-1.5 p-2 bg-zinc-50 hover:bg-zinc-100 rounded-lg text-[10px] font-bold text-zinc-700"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500 rotate-180" />
                  <span>انعكاس يساراً</span>
                </button>
                <button 
                  onClick={() => { flipV(); setActiveBottomPopover(null); }}
                  className="flex items-center gap-1.5 p-2 bg-zinc-50 hover:bg-zinc-100 rounded-lg text-[10px] font-bold text-zinc-700"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-zinc-500" />
                  <span>انعكاس لأعلى</span>
                </button>
                <button 
                  onClick={() => { flipV(); setActiveBottomPopover(null); }}
                  className="flex items-center gap-1.5 p-2 bg-zinc-50 hover:bg-zinc-100 rounded-lg text-[10px] font-bold text-zinc-700"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-zinc-500" />
                  <span>انعكاس لأسفل</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 5. زر حجم العنصر (Scale Slider) */}
        <div className="relative shrink-0">
          <button 
            onClick={() => {
              if (activeBottomPopover === 'scale') {
                setActiveBottomPopover(null);
                scaleStartCmdsRef.current = null;
              } else {
                setActiveBottomPopover('scale');
                setScaleFactor(100);
                scaleStartCmdsRef.current = drawCommands;
              }
            }}
            className={`p-2 rounded-xl transition-all flex items-center justify-center ${activeBottomPopover === 'scale' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title="تغيير مقاس وحجم العنصر"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {activeBottomPopover === 'scale' && (
            <div className="absolute bottom-14 right-0 bg-white border border-zinc-200 p-4 rounded-2xl shadow-xl w-64 z-[220] animate-in slide-in-from-bottom-2 duration-150">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-zinc-700">تغيير الحجم والنسبة</span>
                <span className="text-[10px] font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600">{scaleFactor}%</span>
              </div>
              <input 
                type="range" 
                min={10} 
                max={300} 
                value={scaleFactor} 
                onChange={e => {
                  const val = +e.target.value;
                  setScaleFactor(val);
                  handleScaleSliderChange(val / 100);
                }}
                className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800"
              />
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => {
                    if (scaleStartCmdsRef.current) {
                      setUndoStack(s => [...s, scaleStartCmdsRef.current!]);
                      setRedoStack([]);
                    }
                    setActiveBottomPopover(null);
                    scaleStartCmdsRef.current = null;
                    showSuccess("تم تغيير الحجم");
                  }} 
                  className="flex-1 bg-zinc-950 text-white text-[10px] py-1.5 rounded-lg hover:bg-black transition-colors"
                >
                  تأكيد
                </button>
                <button 
                  onClick={() => {
                    if (scaleStartCmdsRef.current) {
                      setDrawCommands(scaleStartCmdsRef.current);
                    }
                    setActiveBottomPopover(null);
                    scaleStartCmdsRef.current = null;
                  }} 
                  className="flex-1 bg-zinc-100 text-zinc-600 text-[10px] py-1.5 rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 6. زر اللون (Color Picker) */}
        <div className="shrink-0 flex items-center relative">
          <ColorPicker 
            value={fillColor} 
            onChange={setFillColor} 
            label="اللون" 
            isOpen={activeBottomPopover === 'color'}
            onToggle={() => {
              setActiveBottomPopover(activeBottomPopover === 'color' ? null : 'color');
            }}
          />
        </div>

        <div className="w-px h-5 bg-zinc-200 shrink-0" />

        {/* 7. أزرار التحكم فوق تحت يمين يسار (D-Pad Toggler) */}
        <div className="relative shrink-0">
          <button 
            onClick={() => {
              setActiveBottomPopover(activeBottomPopover === 'dpad' ? null : 'dpad');
            }}
            className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 ${activeBottomPopover === 'dpad' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title="أزرار التحكم بالاتجاهات (D-Pad)"
          >
            <Move className="w-4 h-4" />
          </button>

          {activeBottomPopover === 'dpad' && (
            <div className="absolute bottom-14 left-0 bg-white border border-zinc-200 p-3.5 rounded-2xl shadow-xl w-48 z-[220] animate-in slide-in-from-bottom-2 duration-150 flex flex-col items-center gap-3" dir="rtl">
              <div className="flex items-center justify-between w-full pb-1.5 border-b border-zinc-100">
                <span className="text-[10px] font-bold text-zinc-700">أزرار تحريك المسار</span>
              </div>
              
              <div className="relative" dir="ltr">
                <div className="grid grid-cols-3 grid-rows-3 w-28 h-28 bg-zinc-200 rounded-2xl overflow-hidden border border-zinc-300">
                  <div className="bg-zinc-50" />
                  <button 
                    onClick={() => nudgeSelected(0, -nudgeAmount)}
                    className="bg-zinc-900 text-white flex items-center justify-center hover:bg-black active:scale-95 transition-all border-b border-zinc-850"
                    title="تحريك لأعلى"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <div className="bg-zinc-50" />

                  <button 
                    onClick={() => nudgeSelected(-nudgeAmount, 0)}
                    className="bg-zinc-900 text-white flex items-center justify-center hover:bg-black active:scale-95 transition-all border-r border-zinc-850"
                    title="تحريك ليسار"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="bg-zinc-100 flex flex-col items-center justify-center select-none">
                    <span className="text-[10px] font-mono font-bold text-zinc-700 leading-none">{nudgeAmount}</span>
                    <span className="text-[6px] text-zinc-400 font-bold leading-none mt-0.5">PX</span>
                  </div>
                  <button 
                    onClick={() => nudgeSelected(nudgeAmount, 0)}
                    className="bg-zinc-900 text-white flex items-center justify-center hover:bg-black active:scale-95 transition-all border-l border-zinc-850"
                    title="تحريك ليمين"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="bg-zinc-50" />
                  <button 
                    onClick={() => nudgeSelected(0, nudgeAmount)}
                    className="bg-zinc-900 text-white flex items-center justify-center hover:bg-black active:scale-95 transition-all border-t border-zinc-850"
                    title="تحريك لأسفل"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <div className="bg-zinc-50" />
                </div>
              </div>

              <div className="w-full space-y-1">
                <div className="flex justify-between text-[9px] font-bold text-zinc-400">
                  <span>خطوة التحريك</span>
                  <span className="font-mono text-zinc-600">{nudgeAmount}px</span>
                </div>
                <input 
                  type="range" 
                  min={1} 
                  max={100} 
                  step={1} 
                  value={nudgeAmount} 
                  onChange={e => setNudgeAmount(+e.target.value)}
                  className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* 8. زر محاذاة يفتح منه الأزرار فوق طبقة الأستوديو (Align Toggler) */}
        <div className="relative shrink-0">
          <button 
            onClick={() => {
              setActiveBottomPopover(activeBottomPopover === 'align' ? null : 'align');
            }}
            className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 ${activeBottomPopover === 'align' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title="محاذاة العناصر المحددة"
          >
            <AlignHorizontalJustifyCenter className="w-4 h-4" />
          </button>

          {activeBottomPopover === 'align' && (
            <div className="absolute bottom-14 left-0 bg-white border border-zinc-200 p-3.5 rounded-2xl shadow-xl w-72 z-[220] animate-in slide-in-from-bottom-2 duration-150 flex flex-col gap-2.5" dir="rtl">
              <div className="flex items-center gap-1.5 border-b border-zinc-100 pb-1.5">
                <span className="text-[10px] font-bold text-zinc-500">محاذاة العناصر المحددة (اللوحة)</span>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => {
                    const bounds = getSelectedBounds();
                    if (bounds) {
                      const targetY = 300; // Exact drawing board center Y
                      const currentY = bounds.minY + bounds.height / 2;
                      translateSelected(0, Math.round(targetY - currentY));
                      showSuccess("محاذاة في المنتصف عمودياً");
                    } else {
                      showSuccess("تنبيه: حدد نقاطاً أو عناصر أولاً للمحاذاة");
                    }
                  }}
                  className="p-1.5 hover:bg-zinc-50 border border-zinc-100 rounded-xl transition-all flex flex-col items-center gap-1.5 text-zinc-600 hover:text-zinc-900"
                  title="محاذاة في المنتصف عمودياً"
                >
                  <AlignCenter className="w-4 h-4 rotate-90 text-zinc-500" />
                  <span className="text-[8px] font-bold">منتصف عمودي</span>
                </button>

                <button 
                  onClick={() => {
                    const bounds = getSelectedBounds();
                    if (bounds) {
                      const targetX = 500; // Exact drawing board center X
                      const currentX = bounds.minX + bounds.width / 2;
                      translateSelected(Math.round(targetX - currentX), 0);
                      showSuccess("محاذاة في المنتصف أفقياً");
                    } else {
                      showSuccess("تنبيه: حدد نقاطاً أو عناصر أولاً للمحاذاة");
                    }
                  }}
                  className="p-1.5 hover:bg-zinc-50 border border-zinc-100 rounded-xl transition-all flex flex-col items-center gap-1.5 text-zinc-600 hover:text-zinc-900"
                  title="محاذاة في المنتصف أفقياً"
                >
                  <AlignHorizontalJustifyCenter className="w-4 h-4 text-zinc-500" />
                  <span className="text-[8px] font-bold">منتصف أفقي</span>
                </button>

                <button 
                  onClick={() => {
                    const bounds = getSelectedBounds();
                    if (bounds) {
                      translateSelected(Math.round(1000 - bounds.maxX), 0);
                      showSuccess("محاذاة لأقصى اليمين");
                    } else {
                      showSuccess("تنبيه: حدد نقاطاً أو عناصر أولاً للمحاذاة");
                    }
                  }}
                  className="p-1.5 hover:bg-zinc-50 border border-zinc-100 rounded-xl transition-all flex flex-col items-center gap-1.5 text-zinc-600 hover:text-zinc-900"
                  title="محاذاة لأقصى اليمين"
                >
                  <ArrowRight className="w-4 h-4 text-zinc-500" />
                  <span className="text-[8px] font-bold">أقصى اليمين</span>
                </button>

                <button 
                  onClick={() => {
                    const bounds = getSelectedBounds();
                    if (bounds) {
                      translateSelected(Math.round(0 - bounds.minX), 0);
                      showSuccess("محاذاة لأقصى اليسار");
                    } else {
                      showSuccess("تنبيه: حدد نقاطاً أو عناصر أولاً للمحاذاة");
                    }
                  }}
                  className="p-1.5 hover:bg-zinc-50 border border-zinc-100 rounded-xl transition-all flex flex-col items-center gap-1.5 text-zinc-600 hover:text-zinc-900"
                  title="محاذاة لأقصى اليسار"
                >
                  <ArrowRight className="w-4 h-4 rotate-180 text-zinc-500" />
                  <span className="text-[8px] font-bold">أقصى اليسار</span>
                </button>

                <button 
                  onClick={() => {
                    const bounds = getSelectedBounds();
                    if (bounds) {
                      const targetY = -200; // Exact drawing board top Y
                      translateSelected(0, Math.round(targetY - bounds.minY));
                      showSuccess("محاذاة لأقصى العلو");
                    } else {
                      showSuccess("تنبيه: حدد نقاطاً أو عناصر أولاً للمحاذاة");
                    }
                  }}
                  className="p-1.5 hover:bg-zinc-50 border border-zinc-100 rounded-xl transition-all flex flex-col items-center gap-1.5 text-zinc-600 hover:text-zinc-900"
                  title="محاذاة لأقصى العلو"
                >
                  <ArrowUp className="w-4 h-4 text-zinc-500" />
                  <span className="text-[8px] font-bold">أقصى العلو</span>
                </button>

                <button 
                  onClick={() => {
                    const bounds = getSelectedBounds();
                    if (bounds) {
                      const targetY = 800; // Exact drawing board bottom Y
                      translateSelected(0, Math.round(targetY - bounds.maxY));
                      showSuccess("محاذاة لأقصى السفلي");
                    } else {
                      showSuccess("تنبيه: حدد نقاطاً أو عناصر أولاً للمحاذاة");
                    }
                  }}
                  className="p-1.5 hover:bg-zinc-50 border border-zinc-100 rounded-xl transition-all flex flex-col items-center gap-1.5 text-zinc-600 hover:text-zinc-900"
                  title="محاذاة لأقصى السفلي"
                >
                  <ArrowDown className="w-4 h-4 text-zinc-500" />
                  <span className="text-[8px] font-bold">أقصى السفلي</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-zinc-200 shrink-0" />

        {/* 9. أزرار طبقة لفوق ولتحت (Layer Up/Down) */}
        <div className="flex bg-zinc-100 rounded-xl border border-zinc-200 p-0.5 shrink-0">
          <button 
            onClick={() => moveSubPath('forward')} 
            className="p-1.5 rounded-lg hover:bg-white text-zinc-600 hover:text-zinc-900 transition-all flex items-center justify-center" 
            title="طبقة لفوق"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              {/* Bottom layer (dashed/dotted border) */}
              <path d="M2 10L8 7L14 10L8 13L2 10Z" strokeWidth="1.2" strokeDasharray="1.5,1.5" />
              {/* Top layer (solid fill) */}
              <path d="M2 6L8 3L14 6L8 9L2 6Z" fill="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button 
            onClick={() => moveSubPath('backward')} 
            className="p-1.5 rounded-lg hover:bg-white text-zinc-600 hover:text-zinc-900 transition-all flex items-center justify-center" 
            title="طبقة لتحت"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              {/* Bottom layer (solid fill) */}
              <path d="M2 10L8 7L14 10L8 13L2 10Z" fill="currentColor" strokeWidth="1.2" />
              {/* Top layer (dashed/dotted border) */}
              <path d="M2 6L8 3L14 6L8 9L2 6Z" strokeWidth="1.2" strokeDasharray="1.5,1.5" />
            </svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-200 shrink-0" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 bg-zinc-100 rounded-xl border border-zinc-200 p-0.5 shrink-0">
          <button onClick={() => zoom(0.85)} className="p-1.5 rounded-lg hover:bg-white text-zinc-600 hover:text-zinc-900 transition-all" title="تكبير"><ZoomIn className="w-3.5 h-3.5" /></button>
          <button onClick={() => zoom(1.15)} className="p-1.5 rounded-lg hover:bg-white text-zinc-600 hover:text-zinc-900 transition-all" title="تصغير"><ZoomOut className="w-3.5 h-3.5" /></button>
          <button onClick={fitBoardToScreen} className="px-2 py-1 text-[9px] font-bold text-zinc-500 hover:bg-white rounded-lg transition-all" title="إعادة تعيين المنظور">100%</button>
        </div>

        {/* Coordinate Display */}
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded-xl text-[10px] font-mono text-zinc-500 shrink-0 select-none">
          <span>X:{cursorX} Y:{cursorY}</span>
        </div>
      </footer>
    </div>
  );
}
