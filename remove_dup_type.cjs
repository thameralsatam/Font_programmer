const fs = require('fs');
let code = fs.readFileSync('src/pages/ProjectPage.tsx', 'utf8');

// remove lines with duplicateType
code = code.replace(/duplicateType: 'isol' \| 'init' \| 'medi' \| 'fina';\n?/g, '');
code = code.replace(/duplicateType,\n?/g, '');
code = code.replace(/showSuccess\(`تم تكرار المحرف بنجاح كـ "\$\{duplicateChar\}" \(\$\{duplicateType\}\)`\);/g, 'showSuccess(`تم تكرار المحرف بنجاح كـ "${duplicateChar}"`);');

// Remove the whole block for "موضع الحرف الجديد"
code = code.replace(/<div[^>]*>\s*<label[^>]*>موضع الحرف الجديد:<\/label>[\s\S]*?<\/div>\s*<\/div>/g, '');

fs.writeFileSync('src/pages/ProjectPage.tsx', code);
