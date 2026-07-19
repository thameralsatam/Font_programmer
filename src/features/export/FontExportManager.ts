import { Glyph } from '../../types';

export const ARABIC_AGL_MAP: Record<string, string> = {};

export async function exportToFont(
  glyphs: Glyph[],
  projectName: string,
  onSuccess: (msg: string) => void,
  onError: (msg: string) => void
) {
  // Functional logic deleted as requested by user.
  onSuccess('تمت محاكاة تصدير الخط بنجاح (المنطق معطل)!');
}
