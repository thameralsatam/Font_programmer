export interface Glyph {
  id: string;
  char: string;
  pathData: string;
  color?: string;
  colors?: string[];
  metrics: {
    ascent: number;
    descent: number;
  };
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  baselineY: number;
  rsb: number;
  lsb: number;
  extraGuides?: number[];
  template?: string;
  glyphType?: string;
}

export interface Project {
  id: string;
  name: string;
  glyphs: Glyph[];
  lastModified: number;
}

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
