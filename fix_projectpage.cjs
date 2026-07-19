const fs = require('fs');
let code = fs.readFileSync('src/pages/ProjectPage.tsx', 'utf8');

// 1. Remove normalizeType usage in filter
code = code.replace(/g\.char === glyph\.char && normalizeType\(g\.glyphType\) === normalizeType\(glyph\.glyphType\)/g, 'g.char === glyph.char');

// 2. Remove the select for glyphType
code = code.replace(/<select[\s\S]*?<\/select>/g, '');

// 3. Remove setStudioInitialGlyphType and normalizeType
code = code.replace(/setStudioInitialGlyphType\(normalizeType\(g\.glyphType\)\);/g, '');

// 4. In Duplicate Dialog
code = code.replace(/normalizeType\(g\.glyphType\) === normalizeType\(duplicateType\)/g, 'g.char === duplicateChar');
code = code.replace(/glyphType: duplicateType,/g, '');
code = code.replace(/setDuplicateType\(normalizeType\(g\.glyphType\)\);/g, '');

// 5. Remove the <div> showing glyphType string
code = code.replace(/<div className="text-\[9px\] text-zinc-400 font-mono">[\s\S]*?<\/div>/g, '');

// 6. Fix button texts and layouts (like "تعديل في استوديو الرسم") to be responsive
code = code.replace(/className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2"/g, 'className="w-full sm:w-auto px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"');

code = code.replace(/className="w-full sm:w-auto flex items-center justify-center gap-1\.5 px-6 py-2\.5 bg-zinc-900 hover:bg-black text-white rounded-full text-xs font-bold transition-all"/g, 'className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all"');

fs.writeFileSync('src/pages/ProjectPage.tsx', code);
