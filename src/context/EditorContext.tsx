import React, { createContext, useContext, useState, ReactNode } from 'react';

interface EditorState {
  mode: 'normal' | 'pen';
  drawCommands: any[];
  selectedNodeIndices: number[];
  isDrawingStudioOpen: boolean;
  isClosingPath: boolean;
  activeTarget: string | null;
  drawMode: 'line' | 'curve';
  cursorX: number;
  cursorY: number;
}

interface EditorContextType {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  setDrawCommands: (commands: any[] | ((prev: any[]) => any[])) => void;
  setMode: (mode: 'normal' | 'pen') => void;
  setSelectedNodes: (indices: number[]) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<EditorState>({
    mode: 'normal',
    drawCommands: [],
    selectedNodeIndices: [],
    isDrawingStudioOpen: false,
    isClosingPath: false,
    activeTarget: null,
    drawMode: 'line',
    cursorX: 500,
    cursorY: 600,
  });

  const setDrawCommands = (commands: any[] | ((prev: any[]) => any[])) => {
    setState(prev => ({ 
      ...prev, 
      drawCommands: typeof commands === 'function' ? commands(prev.drawCommands) : commands 
    }));
  };

  const setMode = (mode: 'normal' | 'pen') => {
    setState(prev => ({ ...prev, mode }));
  };

  const setSelectedNodes = (selectedNodeIndices: number[]) => {
    setState(prev => ({ ...prev, selectedNodeIndices }));
  };

  return (
    <EditorContext.Provider value={{ state, setState, setDrawCommands, setMode, setSelectedNodes }}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within an EditorProvider');
  return context;
};
