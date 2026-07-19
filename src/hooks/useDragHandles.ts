import { Dispatch, SetStateAction } from 'react';
import { DrawCmd } from '../types';
import { updateCollinearHandles } from '../utils/handleGeometry';

export type DragType = 'node' | 'node-ctrl-quad' | 'node-ctrl-cubic-in' | 'node-ctrl-cubic-out' | 'node-ctrl-close-in' | 'node-ctrl-close-out' | 'shape' | 'pan' | 'selection' | 'cursor' | 'pen-drag';

export interface DragState {
    type: DragType;
    index?: number;
}

interface UseDragHandlesProps {
    dragging: DragState | null;
    setDragging: Dispatch<SetStateAction<DragState | null>>;
    drawCommands: DrawCmd[];
    setDrawCommands: Dispatch<SetStateAction<DrawCmd[]>>;
    selectedNodeIndices: number[];
    snapCoords: (x: number, y: number, skipIdx?: number) => { x: number, y: number };
}

export const useDragHandles = ({
    dragging,
    setDragging,
    drawCommands,
    setDrawCommands,
    selectedNodeIndices,
    snapCoords,
}: UseDragHandlesProps) => {

    const handlePointerMoveForHandles = (x: number, y: number) => {
        if (!dragging) return false;

        if (dragging.type === 'node' && dragging.index != null) {
            const idx = dragging.index;
            const snapped = snapCoords(x, y, idx);
            const nx = snapped.x;
            const ny = snapped.y;
            setDrawCommands(prev => {
                const old = prev[idx];
                if (!old) return prev;
                const dx = nx - old.x, dy = ny - old.y;

                const isMultiMove = selectedNodeIndices.includes(idx);

                return prev.map((c, i) => {
                    if (isMultiMove) {
                        let cx1Move = false;
                        let cx2Move = false;

                        const isISelected = selectedNodeIndices.includes(i);
                        
                        if (isISelected) {
                            cx2Move = true;
                        }

                        if (i > 0 && selectedNodeIndices.includes(i - 1)) {
                            cx1Move = true;
                        }

                        if (c.type === 'Z') {
                            let mIndex = -1;
                            for (let k = i; k >= 0; k--) {
                                if (prev[k].type === 'M') {
                                    mIndex = k;
                                    break;
                                }
                            }
                            if (mIndex !== -1 && selectedNodeIndices.includes(mIndex)) {
                                cx2Move = true;
                            }
                        }

                        const nc: DrawCmd = { ...c };
                        if (isISelected) {
                            nc.x = c.x + dx;
                            nc.y = c.y + dy;
                            if (c.cx != null) { nc.cx = c.cx + dx; nc.cy = c.cy + dy; }
                        }
                        if (cx1Move && c.cx1 != null) {
                            nc.cx1 = c.cx1 + dx;
                            nc.cy1 = c.cy1 + dy;
                        }
                        if (cx2Move && c.cx2 != null) {
                            nc.cx2 = c.cx2 + dx;
                            nc.cy2 = c.cy2 + dy;
                        }
                        return nc;
                    } else {
                        if (i === idx) {
                            const nc: DrawCmd = { ...c, x: nx, y: ny };
                            if (c.cx2 != null) { nc.cx2 = c.cx2 + dx; nc.cy2 = c.cy2 + dy; }
                            return nc;
                        }
                        if (i === idx + 1) {
                            const nc = { ...c };
                            if (nc.cx1 != null) { nc.cx1 += dx; nc.cy1 += dy; }
                            return nc;
                        }
                        if (idx === 0 && i === prev.length - 1 && c.type === 'Z') {
                            const nc = { ...c };
                            if (nc.cx2 != null) { nc.cx2 += dx; nc.cy2 += dy; }
                            return nc;
                        }
                        return c;
                    }
                });
            });
            return true;
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
            return true;
        }

        if (dragging.type === 'node-ctrl-quad' && dragging.index != null) {
            const i = dragging.index;
            setDrawCommands(p => p.map((c, ci) => ci === i ? { ...c, cx: x, cy: y } : c));
            return true;
        }

        if (dragging.type === 'node-ctrl-cubic-in' && dragging.index != null) {
            const i = dragging.index;
            setDrawCommands(p => updateCollinearHandles(p, i, true, x, y));
            return true;
        }

        if (dragging.type === 'node-ctrl-cubic-out' && dragging.index != null) {
            const i = dragging.index;
            setDrawCommands(p => updateCollinearHandles(p, i - 1, false, x, y));
            return true;
        }

        if (dragging.type === 'node-ctrl-close-in' && dragging.index != null) {
            const i = dragging.index;
            let mIndex = 0;
            for (let k = i; k >= 0; k--) {
                if (drawCommands[k].type === 'M') {
                    mIndex = k;
                    break;
                }
            }
            setDrawCommands(p => updateCollinearHandles(p, mIndex, true, x, y));
            return true;
        }

        if (dragging.type === 'node-ctrl-close-out' && dragging.index != null) {
            const i = dragging.index;
            setDrawCommands(p => updateCollinearHandles(p, i - 1, false, x, y));
            return true;
        }
        
        return false;
    };

    return { handlePointerMoveForHandles };
};
