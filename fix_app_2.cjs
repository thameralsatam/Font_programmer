const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/const \[studioInitialGlyphType, setStudioInitialGlyphType\] = useState.*?\n/g, '');
code = code.replace(/setStudioInitialGlyphType\(state\.drawGlyphType\);\n/g, '');
code = code.replace(/setStudioInitialGlyphType=\{setStudioInitialGlyphType\}\n/g, '');
code = code.replace(/studioInitialGlyphType=\{studioInitialGlyphType\}\n/g, '');
fs.writeFileSync('src/App.tsx', code);

let code2 = fs.readFileSync('src/pages/ProjectPage.tsx', 'utf8');
code2 = code2.replace(/setStudioInitialGlyphType: \(t: any\) => void;\n/g, '');
code2 = code2.replace(/setStudioInitialGlyphType,\n/g, '');
fs.writeFileSync('src/pages/ProjectPage.tsx', code2);

let code3 = fs.readFileSync('src/features/studio/DrawingStudio.tsx', 'utf8');
code3 = code3.replace(/initialGlyphType\?: 'isol' \| 'init' \| 'medi' \| 'fina';\n/g, '');
code3 = code3.replace(/initialGlyphType,\n/g, '');
fs.writeFileSync('src/features/studio/DrawingStudio.tsx', code3);

