const fs = require('fs');
let code = fs.readFileSync('src/components/DrawingStudio.tsx', 'utf8');
code = code.replace(/initialGlyphType\?: 'isol' \| 'init' \| 'medi' \| 'fina';\n/g, '');
code = code.replace(/initialGlyphType,\n/g, '');
fs.writeFileSync('src/components/DrawingStudio.tsx', code);
