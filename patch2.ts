import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const oldMouseDown = `    const handleSvgMouseDownOrTouchStart = (
      e: React.MouseEvent<any> | React.TouchEvent<any>,
      type: 'cursor' | 'control' | 'node' | 'node-control' | 'node-control-prev' | 'node-control-next' | 'selection',
      index?: number
    ) => {
      e.stopPropagation();
      if (type === 'cursor') setActiveTarget('cursor');
      if (type === 'control') setActiveTarget('control');
      if (type.startsWith('node')) {
        setUndoStack(prev => [...prev, drawCommands]);
        setRedoStack([]);
      }
      if (type === 'selection') {
        const coords = getSvgCoords(e);
        if (coords) {
          setSelectionStart(coords);
          setSelectionEnd(coords);
        }
      }
      setDraggingPoint({ type, index });
    };`;

const newMouseDown = `    const handleSvgMouseDownOrTouchStart = (
      e: React.MouseEvent<any> | React.TouchEvent<any>,
      type: 'cursor' | 'control' | 'node' | 'node-control' | 'node-control-prev' | 'node-control-next' | 'selection' | 'pan',
      index?: number
    ) => {
      e.stopPropagation();
      if (type === 'cursor') setActiveTarget('cursor');
      if (type === 'control') setActiveTarget('control');
      if (type.startsWith('node')) {
        setUndoStack(prev => [...prev, drawCommands]);
        setRedoStack([]);
      }
      if (type === 'selection') {
        const coords = getSvgCoords(e);
        if (coords) {
          setSelectionStart(coords);
          setSelectionEnd(coords);
        }
      }
      if (type === 'pan') {
        let clientX = 0, clientY = 0;
        if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }
        setPanStart({ x: clientX, y: clientY, vbX: viewBox.x, vbY: viewBox.y });
      }
      setDraggingPoint({ type, index });
    };`;

content = content.replace(oldMouseDown, newMouseDown);

const oldMouseMove = `    const handleSvgMouseMoveOrTouchMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (!draggingPoint) return;
      
      const coords = getSvgCoords(e);
      if (!coords) return;
      
      // Clamp coordinates to keep them fully within viewBox 1000x1000 (-200 to 800 on Y)
      const clampedX = Math.round(Math.max(0, Math.min(1000, coords.x)));
      const clampedY = Math.round(Math.max(-200, Math.min(800, coords.y)));
      
      if (draggingPoint.type === 'cursor') {
        setCursorX(clampedX);
        setCursorY(clampedY);
      } else if (draggingPoint.type === 'control') {
        setControlX(clampedX);
        setControlY(clampedY);
      } else if (draggingPoint.type === 'node' && draggingPoint.index !== undefined) {
        const idx = draggingPoint.index;
        setDrawCommands(prev => {
          const oldCmd = prev[idx];
          if (!oldCmd) return prev;
          
          let dx = clampedX - oldCmd.x;
          let dy = clampedY - oldCmd.y;
          
          let updated = [...prev];
          
          if (oldCmd.type === 'L' || oldCmd.type === 'M') {
             updated[idx] = { ...oldCmd, x: clampedX, y: clampedY };
          } else if (oldCmd.type === 'Q') {
             updated[idx] = { ...oldCmd, x: clampedX, y: clampedY };
          }
          return updated;
        });
      } else if (draggingPoint.type === 'node-control' && draggingPoint.index !== undefined) {
         const idx = draggingPoint.index;
         setDrawCommands(prev => {
            const oldCmd = prev[idx];
            if (!oldCmd || oldCmd.type !== 'Q') return prev;
            let updated = [...prev];
            updated[idx] = { ...oldCmd, cx: clampedX, cy: clampedY };
            return updated;
         });
      } else if (draggingPoint.type === 'selection') {
         setSelectionEnd(coords);
         
         if (selectionStart) {
           const minX = Math.min(selectionStart.x, coords.x);
           const maxX = Math.max(selectionStart.x, coords.x);
           const minY = Math.min(selectionStart.y, coords.y);
           const maxY = Math.max(selectionStart.y, coords.y);
           
           const selected = drawCommands.map((cmd, i) => {
             if (cmd.x >= minX && cmd.x <= maxX && cmd.y >= minY && cmd.y <= maxY) {
               return i;
             }
             return -1;
           }).filter(i => i !== -1);
           
           setSelectedNodeIndices(selected);
         }
      }
    };`;

const newMouseMove = `    const handleSvgMouseMoveOrTouchMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (!draggingPoint) return;
      
      if (draggingPoint.type === 'pan' && panStart && svgRef.current) {
        let clientX = 0, clientY = 0;
        if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }
        const dx = clientX - panStart.x;
        const dy = clientY - panStart.y;
        const ctm = svgRef.current.getScreenCTM();
        if (ctm) {
           const scaledDx = dx / ctm.a;
           const scaledDy = dy / ctm.d;
           setViewBox({ ...viewBox, x: panStart.vbX - scaledDx, y: panStart.vbY - scaledDy });
        }
        return;
      }

      const coords = getSvgCoords(e);
      if (!coords) return;
      
      // Removed clamp so we can draw anywhere
      const clampedX = coords.x;
      const clampedY = coords.y;
      
      if (draggingPoint.type === 'cursor') {
        setCursorX(clampedX);
        setCursorY(clampedY);
      } else if (draggingPoint.type === 'control') {
        setControlX(clampedX);
        setControlY(clampedY);
      } else if (draggingPoint.type === 'node' && draggingPoint.index !== undefined) {
        const idx = draggingPoint.index;
        setDrawCommands(prev => {
          const oldCmd = prev[idx];
          if (!oldCmd) return prev;
          
          let updated = [...prev];
          
          if (oldCmd.type === 'L' || oldCmd.type === 'M') {
             updated[idx] = { ...oldCmd, x: clampedX, y: clampedY };
          } else if (oldCmd.type === 'Q') {
             updated[idx] = { ...oldCmd, x: clampedX, y: clampedY };
          }
          return updated;
        });
      } else if (draggingPoint.type === 'node-control' && draggingPoint.index !== undefined) {
         const idx = draggingPoint.index;
         setDrawCommands(prev => {
            const oldCmd = prev[idx];
            if (!oldCmd || oldCmd.type !== 'Q') return prev;
            let updated = [...prev];
            updated[idx] = { ...oldCmd, cx: clampedX, cy: clampedY };
            return updated;
         });
      } else if (draggingPoint.type === 'selection') {
         setSelectionEnd(coords);
         
         if (selectionStart) {
           const minX = Math.min(selectionStart.x, coords.x);
           const maxX = Math.max(selectionStart.x, coords.x);
           const minY = Math.min(selectionStart.y, coords.y);
           const maxY = Math.max(selectionStart.y, coords.y);
           
           const selected = drawCommands.map((cmd, i) => {
             if (cmd.x >= minX && cmd.x <= maxX && cmd.y >= minY && cmd.y <= maxY) {
               return i;
             }
             return -1;
           }).filter(i => i !== -1);
           
           setSelectedNodeIndices(selected);
         }
      }
    };`;

content = content.replace(oldMouseMove, newMouseMove);

const oldMouseUp = `    const handleSvgMouseUpOrTouchEnd = () => {
      setDraggingPoint(null);
      setSelectionStart(null);
      setSelectionEnd(null);
    };`;

const newMouseUp = `    const handleSvgMouseUpOrTouchEnd = () => {
      setDraggingPoint(null);
      setSelectionStart(null);
      setSelectionEnd(null);
      setPanStart(null);
    };`;

content = content.replace(oldMouseUp, newMouseUp);

fs.writeFileSync('src/App.tsx', content);
console.log('patched');
