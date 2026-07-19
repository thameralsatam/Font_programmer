const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/const \[duplicateType, setDuplicateType\] = useState<'isol' \| 'init' \| 'medi' \| 'fina'>\('isol'\);\n/g, '');
code = code.replace(/duplicateType=\{duplicateType\}\n/g, '');
code = code.replace(/setDuplicateType=\{setDuplicateType\}\n/g, '');
fs.writeFileSync('src/App.tsx', code);
