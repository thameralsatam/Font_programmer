import { Glyph } from '../../types';

export async function processUploadedSVG(
  file: File, 
  charName: string
): Promise<Glyph> {
  const name = charName.trim() || 'أ';
  
  // Return a completely simple mock glyph without any parsing or computation
  const glyph: Glyph = {
    id: Date.now().toString(),
    char: name,
    pathData: 'M 100 100 L 900 100 L 900 900 L 100 900 Z', // simple mock box path
    glyphType: 'isol',
    metrics: { ascent: 800, descent: -200 },
    bounds: { minX: 100, maxX: 900, minY: 100, maxY: 900 },
    baselineY: 600,
    rsb: 950,
    lsb: 50,
    extraGuides: [],
    template: 'flat'
  };

  return Promise.resolve(glyph);
}
