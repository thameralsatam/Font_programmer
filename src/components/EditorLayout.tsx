import React from 'react';

export const Sidebar: React.FC = () => (
  <aside className="w-64 border-r border-zinc-200 bg-white p-4">
    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Glyphs & Layers</h2>
    {/* Glyph/Layer list content will go here */}
  </aside>
);

export const Toolbar: React.FC = () => (
  <div className="h-14 border-b border-zinc-200 bg-white flex items-center px-4 gap-2">
    {/* Toolbar buttons will go here */}
    <h2 className="text-sm font-semibold text-zinc-900">Toolbar</h2>
  </div>
);

export const CanvasArea: React.FC = () => (
  <main className="flex-1 bg-zinc-100 p-4">
    <div className="w-full h-full bg-white rounded-lg shadow-inner border border-zinc-200">
      {/* Canvas content will go here */}
    </div>
  </main>
);

export const PropertiesPanel: React.FC = () => (
  <aside className="w-72 border-l border-zinc-200 bg-white p-4">
    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Properties</h2>
    {/* Properties panel content will go here */}
  </aside>
);
