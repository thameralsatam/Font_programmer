const fs = require('fs');
let code = fs.readFileSync('src/pages/ProjectPage.tsx', 'utf8');

// Button: "حذف" inside editor
code = code.replace(/className="flex items-center gap-1\.5 px-4 py-2 text-red-400 hover:bg-red-500 hover:text-white rounded-full transition-all text-xs font-semibold border border-red-200 shrink-0"/g, 'className="flex items-center gap-2 px-6 py-2 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-xl transition-all text-xs font-bold shrink-0"');

// Close button inside editor
code = code.replace(/className="w-8 h-8 flex items-center justify-center bg-zinc-50 text-zinc-600 border border-zinc-200 rounded-full hover:bg-zinc-200 transition-all font-bold shrink-0"/g, 'className="w-10 h-10 flex items-center justify-center bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-all font-bold shrink-0"');

// Move buttons
code = code.replace(/className="w-10 h-10 bg-zinc-50 border border-zinc-200 rounded-full flex items-center justify-center hover:bg-zinc-200 text-xs font-bold"/g, 'className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center hover:bg-zinc-200 text-xs font-bold transition-all"');

// Scale buttons
code = code.replace(/className="flex-1 bg-white border border-zinc-200 py-1\.5 rounded-xl text-\[11px\] font-bold hover:bg-zinc-100 transition-all"/g, 'className="flex-1 bg-zinc-100 py-2 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all"');

// Add guide button
code = code.replace(/className="text-\[10px\] px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-full font-bold hover:bg-zinc-200"/g, 'className="text-xs px-4 py-2 bg-zinc-100 rounded-xl font-bold hover:bg-zinc-200 transition-all"');

// Cancel duplicate button
code = code.replace(/className="flex-1 px-4 py-2\.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"/g, 'className="flex-1 px-4 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"');

// Confirm duplicate button
code = code.replace(/className="flex-1 px-4 py-2\.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all"/g, 'className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all"');

// Header buttons
code = code.replace(/className="px-4 py-2 bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-full font-bold hover:bg-zinc-100 transition-colors flex items-center justify-center gap-2 text-xs flex-1 sm:flex-none whitespace-nowrap"/g, 'className="px-6 py-2.5 bg-zinc-100 text-zinc-700 rounded-xl font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 text-xs w-full sm:w-auto"');
code = code.replace(/className="px-4 py-2 bg-zinc-50 text-zinc-800 border border-zinc-200 rounded-full font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 text-xs flex-1 sm:flex-none whitespace-nowrap"/g, 'className="px-6 py-2.5 bg-zinc-100 text-zinc-800 rounded-xl font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 text-xs w-full sm:w-auto"');

fs.writeFileSync('src/pages/ProjectPage.tsx', code);
