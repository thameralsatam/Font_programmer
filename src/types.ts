export interface Glyph {
  id: string;
  char: string;
  pathData: string;
  glyphType: 'isolated' | 'initial' | 'medial' | 'final';
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
}

export interface Project {
  id: string;
  name: string;
  glyphs: Glyph[];
  lastModified: number;
}
