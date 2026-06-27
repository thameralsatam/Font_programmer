import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements: Record<string, string> = {
  'bg-zinc-950': 'bg-white',
  'bg-zinc-900': 'bg-zinc-50',
  'bg-zinc-850': 'bg-zinc-100',
  'border-zinc-900': 'border-zinc-200',
  'border-zinc-850': 'border-zinc-200',
  'border-zinc-800': 'border-zinc-300',
  'text-zinc-100': 'text-zinc-900',
  'text-zinc-200': 'text-zinc-800',
  'text-zinc-300': 'text-zinc-700',
  'text-zinc-400': 'text-zinc-600',
  'bg-zinc-800': 'bg-zinc-200',
  'bg-zinc-700': 'bg-zinc-300',
};

for (const [dark, light] of Object.entries(replacements)) {
  content = content.replaceAll(dark, light);
}

// Fix inverted icon
content = content.replaceAll('bg-zinc-100 flex items-center', 'bg-zinc-900 flex items-center');
content = content.replaceAll('text-zinc-950', 'text-white');

fs.writeFileSync('src/App.tsx', content);
console.log('Light mode applied');
