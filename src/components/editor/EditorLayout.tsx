import React from 'react';
import { Toolbar } from './Toolbar';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './PropertiesPanel';
import { CanvasArea } from './Canvas';

export const EditorLayout = () => {
  return (
    <div className="h-screen w-screen bg-zinc-100 flex flex-col overflow-hidden font-sans text-zinc-900">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <LeftPanel />
        <CanvasArea />
        <RightPanel />
      </div>
    </div>
  );
};
