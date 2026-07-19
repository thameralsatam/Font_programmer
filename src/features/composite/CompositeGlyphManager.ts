import { Glyph } from '../../types';

export class CompositeGlyphManager {
  static getCompositeGlyphs(glyphs: Glyph[]) {
    // To be implemented: returns composite glyphs (e.g. Lam-Alef) with live reference updates
    return [];
  }

  static hasConflicts(glyph: Glyph, otherGlyphs: Glyph[]) {
    return false;
  }
}
