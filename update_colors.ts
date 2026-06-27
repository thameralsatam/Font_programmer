import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace indigo with teal
content = content.replaceAll('indigo-600', 'teal-600');
content = content.replaceAll('indigo-500', 'teal-500');
content = content.replaceAll('indigo-700', 'teal-700');
content = content.replaceAll('indigo-400', 'teal-400');
content = content.replaceAll('indigo-50', 'teal-50');

fs.writeFileSync('src/App.tsx', content);
console.log('Colors updated');
