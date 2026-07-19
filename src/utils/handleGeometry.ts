import { DrawCmd } from '../types';

export interface HandleRef {
    cmdIndex: number;
    propX: 'cx1' | 'cx2' | 'cx';
    propY: 'cy1' | 'cy2' | 'cy';
}

export const getDistanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

export const getIncomingHandleRef = (cmds: DrawCmd[], i: number): HandleRef | null => {
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

export const getOutgoingHandleRef = (cmds: DrawCmd[], i: number): HandleRef | null => {
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

export const getPointType = (cmd: DrawCmd | undefined): 'corner' | 'smooth' | 'symmetric' | 'cusp' => {
    if (!cmd) return 'corner';
    return cmd.pointType || 'corner';
};

export const updateCollinearHandles = (cmds: DrawCmd[], anchorIdx: number, isIncomingHandle: boolean, hX: number, hY: number): DrawCmd[] => {
    const updated = cmds.map(c => ({ ...c }));
    const anchor = updated[anchorIdx];
    if (!anchor) return cmds;

    const refIn = getIncomingHandleRef(updated, anchorIdx);
    const refOut = getOutgoingHandleRef(updated, anchorIdx);

    const type = getPointType(anchor);

    if (isIncomingHandle && refIn) {
      const cmdIn = updated[refIn.cmdIndex];
      cmdIn[refIn.propX] = hX;
      cmdIn[refIn.propY] = hY;

      if (refOut) {
        const cmdOut = updated[refOut.cmdIndex];
        const dx = hX - anchor.x;
        const dy = hY - anchor.y;

        if (type === 'symmetric') {
          cmdOut[refOut.propX] = Math.round(anchor.x - dx);
          cmdOut[refOut.propY] = Math.round(anchor.y - dy);
        } else if (type === 'smooth') {
          const currentLen = Math.hypot((cmdOut[refOut.propX] as number) - anchor.x, (cmdOut[refOut.propY] as number) - anchor.y) || 50;
          const incomingLen = Math.hypot(dx, dy) || 1;
          cmdOut[refOut.propX] = Math.round(anchor.x - (dx / incomingLen) * currentLen);
          cmdOut[refOut.propY] = Math.round(anchor.y - (dy / incomingLen) * currentLen);
        }
      }
    } else if (!isIncomingHandle && refOut) {
      const cmdOut = updated[refOut.cmdIndex];
      cmdOut[refOut.propX] = hX;
      cmdOut[refOut.propY] = hY;

      if (refIn) {
        const cmdIn = updated[refIn.cmdIndex];
        const dx = hX - anchor.x;
        const dy = hY - anchor.y;

        if (type === 'symmetric') {
          cmdIn[refIn.propX] = Math.round(anchor.x - dx);
          cmdIn[refIn.propY] = Math.round(anchor.y - dy);
        } else if (type === 'smooth') {
          const currentLen = Math.hypot((cmdIn[refIn.propX] as number) - anchor.x, (cmdIn[refIn.propY] as number) - anchor.y) || 50;
          const outgoingLen = Math.hypot(dx, dy) || 1;
          cmdIn[refIn.propX] = Math.round(anchor.x - (dx / outgoingLen) * currentLen);
          cmdIn[refIn.propY] = Math.round(anchor.y - (dy / outgoingLen) * currentLen);
        }
      }
    }

    return updated;
};
