const fs = require('fs');
let code = fs.readFileSync('src/pages/ProjectPage.tsx', 'utf8');

// Remove renderGlyphEditor definition
code = code.replace(/\/\/ ── Glyph Editor Modal ──[\s\S]*?\/\/ ── Duplicate Dialog ──/, '// ── Duplicate Dialog ──');

// Remove {renderGlyphEditor()}
code = code.replace(/\{renderGlyphEditor\(\)\}/, '');

// Update onClick of the glyph card to open DrawingStudio
code = code.replace(/onClick=\{\(\) => setEditingGlyphId\(g\.id\)\}/g, 'onClick={() => { setStudioInitialGlyph(g); setStudioFallbackCharName(g.char); setIsDrawingStudioOpen(true); }}');

fs.writeFileSync('src/pages/ProjectPage.tsx', code);
