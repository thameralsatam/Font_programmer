import { DrawCmd } from '../types';

export function alignHorizontalAverage(drawCommands: DrawCmd[], selectedNodeIndices: number[]): DrawCmd[] {
  if (selectedNodeIndices.length < 2) return drawCommands;
  const selCmds = drawCommands.filter((_, i) => selectedNodeIndices.includes(i));
  const avgY = selCmds.reduce((sum, c) => sum + c.y, 0) / selCmds.length;
  return drawCommands.map((c, i) => {
    if (selectedNodeIndices.includes(i)) {
      return { 
        ...c, 
        y: avgY, 
        cy: c.cy != null ? avgY : undefined, 
        cy1: c.cy1 != null ? avgY : undefined, 
        cy2: c.cy2 != null ? avgY : undefined 
      };
    }
    return c;
  });
}

export function alignVerticalAverage(drawCommands: DrawCmd[], selectedNodeIndices: number[]): DrawCmd[] {
  if (selectedNodeIndices.length < 2) return drawCommands;
  const selCmds = drawCommands.filter((_, i) => selectedNodeIndices.includes(i));
  const avgX = selCmds.reduce((sum, c) => sum + c.x, 0) / selCmds.length;
  return drawCommands.map((c, i) => {
    if (selectedNodeIndices.includes(i)) {
      return { 
        ...c, 
        x: avgX, 
        cx: c.cx != null ? avgX : undefined, 
        cx1: c.cx1 != null ? avgX : undefined, 
        cx2: c.cx2 != null ? avgX : undefined 
      };
    }
    return c;
  });
}
