import React from 'react';
import { Glyph } from '../../types';
import { parseCmdsFromPath, compilePath, getSubPaths } from '../../utils/svgPathUtils';

export const renderGlyphPaths = (g: Glyph, fallbackColorClass: string = "text-zinc-900") => {
  const parsedCmds = parseCmdsFromPath(g.pathData);
  const subPaths = getSubPaths(parsedCmds);
  return subPaths.map((sub, sIdx) => {
    const d = compilePath(sub);
    const subColor = g.colors && g.colors[sIdx] ? g.colors[sIdx] : (g.color || 'currentColor');
    return (
      <path 
        key={sIdx} 
        d={d} 
        fill={subColor} 
        className={g.color || g.colors ? '' : fallbackColorClass} 
      />
    );
  });
};

export const normalizeType = (t: string) => {
  if (t === 'isolated' || t === 'isol') return 'isol';
  if (t === 'initial' || t === 'init') return 'init';
  if (t === 'medial' || t === 'medi') return 'medi';
  if (t === 'final' || t === 'fina') return 'fina';
  return 'isol';
};

interface ArabicPreviewEngineProps {
  inputText: string;
  glyphs: Glyph[];
}

export function ArabicPreviewEngine({ inputText, glyphs }: ArabicPreviewEngineProps) {
  if (!inputText) return null;

  const matched: (Glyph | { isSpace: true; aw: number })[] = [];
  let i = 0;
  while (i < inputText.length) {
    let found = false;
    for (let len = Math.min(5, inputText.length - i); len > 1; len--) {
      const sub = inputText.slice(i, i + len);
      const lg = glyphs.find(g => g.char === sub);
      if (lg) {
        matched.push(lg);
        i += len;
        found = true;
        break;
      }
    }
    if (found) continue;

    const char = inputText[i];
    if (char === ' ') {
      matched.push({ isSpace: true, aw: 300 });
      i++;
      continue;
    }

    let g = glyphs.find(g => g.char === char);
    if (g) matched.push(g);
    i++;
  }

  if (!matched.length) return null;

  let cx = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const items = matched.map((g, idx) => {
    if ('isSpace' in g) {
      cx -= g.aw;
      return null;
    }
    let aw = Math.round(g.rsb - g.lsb);
    if (aw <= 0) aw = Math.max(100, Math.round(g.bounds.maxX - g.bounds.minX));

    const el = (
      <g key={`${g.id}-${idx}`} transform={`translate(${cx},0)`}>
        <g transform={`translate(${-g.rsb},${-g.baselineY})`}>
          {renderGlyphPaths(g)}
        </g>
      </g>
    );

    const tMinX = g.bounds.minX - g.rsb;
    const tMaxX = g.bounds.maxX - g.rsb;
    const tMinY = g.bounds.minY - g.baselineY;
    const tMaxY = g.bounds.maxY - g.baselineY;

    minX = Math.min(minX, cx + tMinX);
    maxX = Math.max(maxX, cx + tMaxX);
    minY = Math.min(minY, tMinY);
    maxY = Math.max(maxY, tMaxY);

    cx -= aw;
    return el;
  });

  const pad = 100;
  const vb = `${minX - pad} ${minY - pad} ${(maxX - minX) + pad * 2} ${(maxY - minY) + pad * 2}`;

  return (
    <svg viewBox={vb} className="w-full h-full max-h-[400px]">
      <line x1={minX - pad} y1={0} x2={maxX + pad} y2={0} stroke="#3b82f6" strokeWidth="2" strokeDasharray="10,10" opacity="0.5" />
      {items}
    </svg>
  );
}
