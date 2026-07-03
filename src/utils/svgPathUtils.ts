import { DrawCmd } from '../components/DrawingStudio';

// Helper to calculate bounds of a path string
import { calculateExactPathBounds } from '../Svgprocessor';

export function parseCmdsFromPath(d: string): DrawCmd[] {
  const cmds: DrawCmd[] = [];
  if (!d) return cmds;
  const re = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let match; let cx=0,cy=0;
  while ((match=re.exec(d))!==null) {
    const t=match[1].toUpperCase(), rel=match[1]===match[1].toLowerCase();
    const nums=(match[2].trim().match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[]).map(Number);
    if (t==='M'){ for(let i=0;i<nums.length;i+=2){let x=nums[i],y=nums[i+1];if(rel){x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'M',x,y});} }
    else if(t==='L'){for(let i=0;i<nums.length;i+=2){let x=nums[i],y=nums[i+1];if(rel){x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'L',x,y});}}
    else if(t==='H'){for(let i=0;i<nums.length;i++){let x=nums[i];if(rel)x+=cx;cx=x;cmds.push({type:'L',x,y:cy});}}
    else if(t==='V'){for(let i=0;i<nums.length;i++){let y=nums[i];if(rel)y+=cy;cy=y;cmds.push({type:'L',x:cx,y});}}
    else if(t==='C'){for(let i=0;i<nums.length;i+=6){let[x1,y1,x2,y2,x,y]=[nums[i],nums[i+1],nums[i+2],nums[i+3],nums[i+4],nums[i+5]];if(rel){x1+=cx;y1+=cy;x2+=cx;y2+=cy;x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'C',x,y,cx1:Math.round(x1),cy1:Math.round(y1),cx2:Math.round(x2),cy2:Math.round(y2)});}}
    else if(t==='Q'){for(let i=0;i<nums.length;i+=4){let[qx,qy,x,y]=[nums[i],nums[i+1],nums[i+2],nums[i+3]];if(rel){qx+=cx;qy+=cy;x+=cx;y+=cy;}cx=x;cy=y;cmds.push({type:'L',x,y,cx:Math.round(qx),cy:Math.round(qy)});}}
    else if(t==='Z'){cmds.push({type:'Z',x:0,y:0});}
  }
  return cmds;
}

export function compilePath(cmds: DrawCmd[]): string {
  let d = '';
  let lastM = { x: 0, y: 0 };
  cmds.forEach((cmd, i) => {
    if (cmd.type === 'M') {
      d += `M${cmd.x} ${cmd.y} `;
      lastM = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === 'L') {
      if (cmd.cx1 != null && cmd.cy1 != null && cmd.cx2 != null && cmd.cy2 != null)
        d += `C${cmd.cx1} ${cmd.cy1} ${cmd.cx2} ${cmd.cy2} ${cmd.x} ${cmd.y} `;
      else if (cmd.cx != null && cmd.cy != null)
        d += `Q${cmd.cx} ${cmd.cy} ${cmd.x} ${cmd.y} `;
      else d += `L${cmd.x} ${cmd.y} `;
    } else if (cmd.type === 'C') {
      if (cmd.cx1 != null && cmd.cy1 != null && cmd.cx2 != null && cmd.cy2 != null)
        d += `C${cmd.cx1} ${cmd.cy1} ${cmd.cx2} ${cmd.cy2} ${cmd.x} ${cmd.y} `;
      else d += `L${cmd.x} ${cmd.y} `;
    } else if (cmd.type === 'Q' && cmd.cx != null && cmd.cy != null) {
      d += `Q${cmd.cx} ${cmd.cy} ${cmd.x} ${cmd.y} `;
    } else if (cmd.type === 'Z') {
      if (cmd.cx1 != null && cmd.cy1 != null && cmd.cx2 != null && cmd.cy2 != null)
        d += `C${cmd.cx1} ${cmd.cy1} ${cmd.cx2} ${cmd.cy2} ${lastM.x} ${lastM.y} Z `;
      else d += 'Z ';
    }
  });
  return d.trim();
}

export function getSubPaths(cmds: DrawCmd[]): DrawCmd[][] {
  const subPaths: DrawCmd[][] = [];
  let current: DrawCmd[] = [];
  cmds.forEach(cmd => {
    if (cmd.type === 'M') {
      if (current.length > 0) {
        subPaths.push(current);
      }
      current = [cmd];
    } else {
      current.push(cmd);
    }
  });
  if (current.length > 0) {
    subPaths.push(current);
  }
  return subPaths;
}

export function autoCenterCmds(drawCommands: DrawCmd[]): DrawCmd[] {
  if (!drawCommands.length) return drawCommands;
  const b = calculateExactPathBounds(compilePath(drawCommands));
  const cx = b.x1 + (b.x2 - b.x1) / 2;
  const cy = b.y1 + (b.y2 - b.y1) / 2;
  const dx = Math.round(500 - cx);
  const dy = Math.round(500 - cy);
  return drawCommands.map(c => ({
    ...c,
    x: c.x + dx, y: c.y + dy,
    cx1: c.cx1 != null ? c.cx1 + dx : undefined,
    cy1: c.cy1 != null ? c.cy1 + dy : undefined,
    cx2: c.cx2 != null ? c.cx2 + dx : undefined,
    cy2: c.cy2 != null ? c.cy2 + dy : undefined,
    cx: c.cx != null ? c.cx + dx : undefined,
    cy: c.cy != null ? c.cy + dy : undefined
  }));
}

export function scalePathCmds(drawCommands: DrawCmd[], f: number): DrawCmd[] {
  if (!drawCommands.length) return drawCommands;
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  drawCommands.forEach(c => {
    mnX = Math.min(mnX, c.x); mxX = Math.max(mxX, c.x);
    mnY = Math.min(mnY, c.y); mxY = Math.max(mxY, c.y);
  });
  const cx = mnX + (mxX - mnX) / 2;
  const cy = mnY + (mxY - mnY) / 2;
  return drawCommands.map(c => ({
    ...c,
    x: Math.round(cx + (c.x - cx) * f),
    y: Math.round(cy + (c.y - cy) * f),
    cx1: c.cx1 != null ? Math.round(cx + (c.cx1 - cx) * f) : undefined,
    cy1: c.cy1 != null ? Math.round(cy + (c.cy1 - cy) * f) : undefined,
    cx2: c.cx2 != null ? Math.round(cx + (c.cx2 - cx) * f) : undefined,
    cy2: c.cy2 != null ? Math.round(cy + (c.cy2 - cy) * f) : undefined,
    cx: c.cx != null ? Math.round(cx + (c.cx - cx) * f) : undefined,
    cy: c.cy != null ? Math.round(cy + (c.cy - cy) * f) : undefined
  }));
}

export function rotateShapeCmds(drawCommands: DrawCmd[], deg: number): DrawCmd[] {
  if (!drawCommands.length) return drawCommands;
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  drawCommands.forEach(c => {
    if (c.type !== 'Z') { mnX = Math.min(mnX, c.x); mxX = Math.max(mxX, c.x); mnY = Math.min(mnY, c.y); mxY = Math.max(mxY, c.y); }
  });
  const cx = mnX + (mxX - mnX) / 2;
  const cy = mnY + (mxY - mnY) / 2;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rot = (px: number, py: number) => ({
    x: Math.round(cx + (px - cx) * cos - (py - cy) * sin),
    y: Math.round(cy + (px - cx) * sin + (py - cy) * cos)
  });
  return drawCommands.map(c => {
    if (c.type === 'Z') return c;
    const p = rot(c.x, c.y);
    const p1 = c.cx1 != null ? rot(c.cx1, c.cy1!) : { x: undefined, y: undefined };
    const p2 = c.cx2 != null ? rot(c.cx2, c.cy2!) : { x: undefined, y: undefined };
    const p3 = c.cx != null ? rot(c.cx, c.cy!) : { x: undefined, y: undefined };
    return { ...c, x: p.x, y: p.y, cx1: p1.x, cy1: p1.y, cx2: p2.x, cy2: p2.y, cx: p3.x, cy: p3.y };
  });
}

export function flipHCmds(drawCommands: DrawCmd[]): DrawCmd[] {
  if (!drawCommands.length) return drawCommands;
  let mn = Infinity, mx = -Infinity;
  drawCommands.forEach(c => { if (c.type !== 'Z') { mn = Math.min(mn, c.x); mx = Math.max(mx, c.x); } });
  const cx = mn + (mx - mn) / 2;
  return drawCommands.map(c => {
    if (c.type === 'Z') return c;
    return {
      ...c, x: Math.round(cx - (c.x - cx)),
      cx1: c.cx1 != null ? Math.round(cx - (c.cx1 - cx)) : undefined,
      cx2: c.cx2 != null ? Math.round(cx - (c.cx2 - cx)) : undefined,
      cx: c.cx != null ? Math.round(cx - (c.cx - cx)) : undefined
    };
  });
}

export function flipVCmds(drawCommands: DrawCmd[]): DrawCmd[] {
  if (!drawCommands.length) return drawCommands;
  let mn = Infinity, mx = -Infinity;
  drawCommands.forEach(c => { if (c.type !== 'Z') { mn = Math.min(mn, c.y); mx = Math.max(mx, c.y); } });
  const cy = mn + (mx - mn) / 2;
  return drawCommands.map(c => {
    if (c.type === 'Z') return c;
    return {
      ...c, y: Math.round(cy - (c.y - cy)),
      cy1: c.cy1 != null ? Math.round(cy - (c.cy1 - cy)) : undefined,
      cy2: c.cy2 != null ? Math.round(cy - (c.cy2 - cy)) : undefined,
      cy: c.cy != null ? Math.round(cy - (c.cy - cy)) : undefined
    };
  });
}

export function moveSubPathCmds(drawCommands: DrawCmd[], selectedNodeIndices: number[], direction: 'forward' | 'backward'): DrawCmd[] {
  if (!selectedNodeIndices.length) return drawCommands;
  const subPaths = getSubPaths(drawCommands);
  const selectedSubPathIndices = Array.from(new Set(selectedNodeIndices.map(idx => {
    let count = 0;
    for (let i = 0; i < subPaths.length; i++) {
      if (idx >= count && idx < count + subPaths[i].length) return i;
      count += subPaths[i].length;
    }
    return -1;
  }))).filter(i => i !== -1);
  if (selectedSubPathIndices.length !== 1) return drawCommands; // Only move one subpath at a time
  const spIdx = selectedSubPathIndices[0];
  if (direction === 'forward' && spIdx === subPaths.length - 1) return drawCommands;
  if (direction === 'backward' && spIdx === 0) return drawCommands;

  const newSubPaths = [...subPaths];
  const swapIdx = direction === 'forward' ? spIdx + 1 : spIdx - 1;
  [newSubPaths[spIdx], newSubPaths[swapIdx]] = [newSubPaths[swapIdx], newSubPaths[spIdx]];
  return newSubPaths.flat();
}
