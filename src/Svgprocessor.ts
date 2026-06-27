import svgpath from 'svgpath';
import opentype from 'opentype.js';
import { SVGPathData } from 'svg-pathdata';

export function svgToOpentype(svgPath: string): opentype.Path {
    const normalized = svgpath(svgPath).abs().unshort().unarc().toString();
    const p = new opentype.Path();
    const parsed = new SVGPathData(normalized).toAbs();
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;
    
    for (const cmd of parsed.commands) {
        if (cmd.type === SVGPathData.MOVE_TO) {
            p.moveTo(cmd.x, cmd.y);
            currentX = cmd.x;
            currentY = cmd.y;
            startX = cmd.x;
            startY = cmd.y;
        } else if (cmd.type === SVGPathData.LINE_TO) {
            p.lineTo(cmd.x, cmd.y);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.HORIZ_LINE_TO) {
            p.lineTo(cmd.x, currentY);
            currentX = cmd.x;
        } else if (cmd.type === SVGPathData.VERT_LINE_TO) {
            p.lineTo(currentX, cmd.y);
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.CURVE_TO) {
            p.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.QUAD_TO) {
            p.quadTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.CLOSE_PATH) {
            p.close();
            currentX = startX;
            currentY = startY;
        }
    }
    return p;
}

export function elementToPathData(el: Element): string {
    const type = el.tagName.toLowerCase();
    
    const getNumericAttr = (name: string, fallback: number = 0): number => {
        const val = el.getAttribute(name);
        if (!val) return fallback;
        const parsed = parseFloat(val);
        return isNaN(parsed) ? fallback : parsed;
    };
    
    if (type === 'path') {
        return el.getAttribute('d') || '';
    }
    
    if (type === 'rect') {
        const x = getNumericAttr('x', 0);
        const y = getNumericAttr('y', 0);
        const w = getNumericAttr('width', 0);
        const h = getNumericAttr('height', 0);
        const rx = getNumericAttr('rx', 0);
        const ry = getNumericAttr('ry', 0);
        
        if (w === 0 || h === 0) return '';
        
        if (rx === 0 && ry === 0) {
            return `M ${x} ${y} H ${x+w} V ${y+h} H ${x} Z`;
        } else {
            const rx_ = rx || ry;
            const ry_ = ry || rx;
            return `M ${x+rx_} ${y} 
                    H ${x+w-rx_} A ${rx_} ${ry_} 0 0 1 ${x+w} ${y+ry_}
                    V ${y+h-ry_} A ${rx_} ${ry_} 0 0 1 ${x+w-rx_} ${y+h}
                    H ${x+rx_} A ${rx_} ${ry_} 0 0 1 ${x} ${y+h-ry_}
                    V ${y+ry_} A ${rx_} ${ry_} 0 0 1 ${x+rx_} ${y} Z`;
        }
    }
    
    if (type === 'circle') {
        const cx = getNumericAttr('cx', 0);
        const cy = getNumericAttr('cy', 0);
        const r = getNumericAttr('r', 0);
        if (r === 0) return '';
        return `M ${cx-r} ${cy} 
                A ${r} ${r} 0 1 0 ${cx+r} ${cy} 
                A ${r} ${r} 0 1 0 ${cx-r} ${cy} Z`;
    }
    
    if (type === 'ellipse') {
        const cx = getNumericAttr('cx', 0);
        const cy = getNumericAttr('cy', 0);
        const rx = getNumericAttr('rx', 0);
        const ry = getNumericAttr('ry', 0);
        if (rx === 0 || ry === 0) return '';
        return `M ${cx-rx} ${cy} 
                A ${rx} ${ry} 0 1 0 ${cx+rx} ${cy} 
                A ${rx} ${ry} 0 1 0 ${cx-rx} ${cy} Z`;
    }
    
    if (type === 'line') {
        const x1 = getNumericAttr('x1', 0);
        const y1 = getNumericAttr('y1', 0);
        const x2 = getNumericAttr('x2', 0);
        const y2 = getNumericAttr('y2', 0);
        return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    
    if (type === 'polygon' || type === 'polyline') {
        const points = el.getAttribute('points');
        if (!points) return '';
        // Robust extraction of all float numbers supporting negatives, decimals and scientific notations
        const coords = points.trim().match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
        if (!coords || coords.length < 4) return '';
        
        let path = '';
        for (let i = 0; i < coords.length; i += 2) {
            const x = coords[i];
            const y = coords[i+1];
            if (x === undefined || y === undefined) break;
            if (i === 0) path += `M ${x} ${y} `;
            else path += `L ${x} ${y} `;
        }
        
        if (type === 'polygon') path += 'Z';
        return path;
    }
    
    return '';
}


export function parseColor(color: string): boolean {
    if (!color) return false;
    const str = color.toLowerCase().trim();
    
    // Quick matches for common red color names
    if (str === 'red' || str === 'crimson' || str === 'tomato') return true;
    
    let r = 0, g = 0, b = 0, parsed = false;
    
    // 1. Hex format: #rgb, #rgba, #rrggbb, #rrggbbaa
    if (str.startsWith('#')) {
        const hex = str.substring(1);
        if (hex.length === 3 || hex.length === 4) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
            parsed = true;
        } else if (hex.length === 6 || hex.length === 8) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
            parsed = true;
        }
    } 
    // 2. rgb / rgba format: rgb(r, g, b) or rgba(r, g, b, a)
    else {
        const rgbMatch = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/);
        if (rgbMatch) {
            r = parseInt(rgbMatch[1], 10);
            g = parseInt(rgbMatch[2], 10);
            b = parseInt(rgbMatch[3], 10);
            parsed = true;
        }
    }
    
    if (parsed) {
        // Red is high and dominant
        return r >= 150 && (r - g >= 80) && (r - b >= 80);
    }
    
    return false;
}

function getQuadExtrema(p0: number, p1: number, p2: number): number[] {
    const t = (p0 - p1) / (p0 - 2 * p1 + p2);
    if (t > 0 && t < 1) {
        const val = (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
        return [p0, p2, val];
    }
    return [p0, p2];
}

function getCubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
    const vals = [p0, p3];
    const a = p3 - 3 * p2 + 3 * p1 - p0;
    const b = 2 * (p2 - 2 * p1 + p0);
    const c = p1 - p0;
    
    if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) > 1e-12) {
            const t = -c / b;
            if (t > 0 && t < 1) {
                vals.push((1-t)**3 * p0 + 3*(1-t)**2 * t * p1 + 3*(1-t) * t**2 * p2 + t**3 * p3);
            }
        }
    } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-b + sqrtDisc) / (2 * a);
            const t2 = (-b - sqrtDisc) / (2 * a);
            for (const t of [t1, t2]) {
                if (t > 0 && t < 1) {
                    vals.push((1-t)**3 * p0 + 3*(1-t)**2 * t * p1 + 3*(1-t) * t**2 * p2 + t**3 * p3);
                }
            }
        }
    }
    return vals;
}

export function calculateExactPathBounds(svgPath: string): { x1: number, y1: number, x2: number, y2: number } {
    const normalized = svgpath(svgPath).abs().unshort().unarc().toString();
    const parsed = new SVGPathData(normalized).toAbs();
    
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;
    
    function updateBounds(xValues: number[], yValues: number[]) {
        for (const x of xValues) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
        for (const y of yValues) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    
    for (const cmd of parsed.commands) {
        if (cmd.type === SVGPathData.MOVE_TO) {
            updateBounds([cmd.x], [cmd.y]);
            currentX = cmd.x;
            currentY = cmd.y;
            startX = cmd.x;
            startY = cmd.y;
        } else if (cmd.type === SVGPathData.LINE_TO) {
            updateBounds([cmd.x], [cmd.y]);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.HORIZ_LINE_TO) {
            updateBounds([cmd.x], [currentY]);
            currentX = cmd.x;
        } else if (cmd.type === SVGPathData.VERT_LINE_TO) {
            updateBounds([currentX], [cmd.y]);
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.CURVE_TO) {
            const xExtrema = getCubicExtrema(currentX, cmd.x1, cmd.x2, cmd.x);
            const yExtrema = getCubicExtrema(currentY, cmd.y1, cmd.y2, cmd.y);
            updateBounds(xExtrema, yExtrema);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.QUAD_TO) {
            const xExtrema = getQuadExtrema(currentX, cmd.x1, cmd.x);
            const yExtrema = getQuadExtrema(currentY, cmd.y1, cmd.y);
            updateBounds(xExtrema, yExtrema);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.CLOSE_PATH) {
            updateBounds([startX], [startY]);
            currentX = startX;
            currentY = startY;
        }
    }
    
    if (minX === Infinity) {
        return { x1: 0, y1: 0, x2: 0, y2: 0 };
    }
    
    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
}

export function isActualBackground(
    el: Element, 
    bounds: { x1: number, y1: number, x2: number, y2: number }, 
    vbWidth: number, 
    vbHeight: number,
    shapeIndex: number
): boolean {
    const tagName = el.tagName.toLowerCase();
    const w = bounds.x2 - bounds.x1;
    const h = bounds.y2 - bounds.y1;
    
    // Check if it covers almost the entire viewBox
    const coversWholeViewBox = (w >= vbWidth * 0.95 && h >= vbHeight * 0.95);
    if (!coversWholeViewBox) return false;
    
    // Backgrounds are typically the first element (the bottom layer)
    const isFirstFew = shapeIndex <= 1;
    
    // Check if fill is explicitly a background color (white, transparent, none)
    const fill = (el.getAttribute('fill') || '').toLowerCase().trim();
    const isBgColor = fill === 'white' || fill === '#ffffff' || fill === '#fff' || fill === 'none' || fill === '';
    
    // If it's a simple rect covering the whole area and has background fill, it's a background
    if (tagName === 'rect' && coversWholeViewBox && isBgColor) {
        return true; 
    }
    
    // If it's a path covering the whole area with low command complexity and background fill, it's a background
    if (tagName === 'path' && coversWholeViewBox && isFirstFew && isBgColor) {
        const d = el.getAttribute('d') || '';
        const commandCount = (d.match(/[a-zA-Z]/g) || []).length;
        if (commandCount <= 6) {
            return true;
        }
    }
    
    return false;
}

export function extractAllPaths(doc: Document, vbWidth: number, vbHeight: number): { combinedPath: string, redPaths: { pathData: string }[] } {
    let combinedPath = "";
    const redPaths: any[] = [];
    let shapeIndex = 0;
    
    // We must accumulate transforms down the tree.
    function traverse(el: Element, currentTransform: string) {
        const tag = el.tagName.toLowerCase();
        // Skip defs, clipPath, mask, style, metadata, script
        if (tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'symbol' || tag === 'style' || tag === 'metadata' || tag === 'script') return;
        
        let localTransform = currentTransform;
        
        if (el.hasAttribute('transform')) {
            const elTransform = el.getAttribute('transform') || '';
            localTransform = currentTransform ? `${currentTransform} ${elTransform}` : elTransform;
        }
        
        // Handle <use>
        if (tag === 'use') {
            const href = el.getAttribute('href') || el.getAttribute('xlink:href');
            if (href && href.startsWith('#')) {
                const id = href.substring(1);
                const ref = doc.getElementById(id);
                if (ref) {
                    const useFill = el.getAttribute('fill');
                    const useStroke = el.getAttribute('stroke');
                    
                    const clone = ref.cloneNode(true) as Element;
                    if (useFill) clone.setAttribute('fill', useFill);
                    if (useStroke) clone.setAttribute('stroke', useStroke);
                    
                    const x = parseFloat(el.getAttribute('x') || '0');
                    const y = parseFloat(el.getAttribute('y') || '0');
                    let newTransform = localTransform;
                    if (x !== 0 || y !== 0) {
                        const trans = `translate(${x}, ${y})`;
                        newTransform = newTransform ? `${newTransform} ${trans}` : trans;
                    }
                    traverse(clone, newTransform);
                }
            }
            return;
        }

        const pathData = elementToPathData(el);
        if (pathData) {
            let finalPath = pathData;
            if (localTransform.trim()) {
                try {
                    finalPath = svgpath(finalPath).transform(localTransform).toString();
                } catch (e) {
                    console.warn('Transform failed', e);
                }
            }
            
            finalPath = svgpath(finalPath).abs().unshort().unarc().toString();
            
            if (finalPath) {
                const stroke = el.getAttribute('stroke') || (el as HTMLElement).style?.stroke;
                const isRed = parseColor(stroke || '');
                
                if (isRed) {
                    redPaths.push({ pathData: finalPath });
                } else {
                    try {
                        const bounds = calculateExactPathBounds(finalPath);
                        if (isActualBackground(el, bounds, vbWidth, vbHeight, shapeIndex)) {
                            console.log("Filtered out background element:", tag, "at index", shapeIndex);
                        } else {
                            combinedPath += finalPath + " ";
                        }
                    } catch (e) {
                        combinedPath += finalPath + " ";
                    }
                    shapeIndex++;
                }
            }
        }
        
        for (let i = 0; i < el.children.length; i++) {
            traverse(el.children[i], localTransform);
        }
    }
    
    const svgEl = doc.querySelector('svg');
    if (svgEl) {
        for (let i = 0; i < svgEl.children.length; i++) {
            traverse(svgEl.children[i], '');
        }
    }
    
    return { combinedPath: combinedPath.trim(), redPaths };
}

function commandsToPathString(commands: any[]): string {
    const parts: string[] = [];
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

    const rc = (num: number): number => {
        if (isNaN(num)) return 0;
        return Math.round(num * 1000) / 1000;
    };

    for (const cmd of commands) {
        if (cmd.type === SVGPathData.MOVE_TO) {
            parts.push(`M ${rc(cmd.x)} ${rc(cmd.y)}`);
            currentX = cmd.x;
            currentY = cmd.y;
            startX = cmd.x;
            startY = cmd.y;
        } else if (cmd.type === SVGPathData.LINE_TO) {
            parts.push(`L ${rc(cmd.x)} ${rc(cmd.y)}`);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.HORIZ_LINE_TO) {
            parts.push(`L ${rc(cmd.x)} ${rc(currentY)}`);
            currentX = cmd.x;
        } else if (cmd.type === SVGPathData.VERT_LINE_TO) {
            parts.push(`L ${rc(currentX)} ${rc(cmd.y)}`);
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.CURVE_TO) {
            parts.push(`C ${rc(cmd.x1)} ${rc(cmd.y1)} ${rc(cmd.x2)} ${rc(cmd.y2)} ${rc(cmd.x)} ${rc(cmd.y)}`);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.QUAD_TO) {
            parts.push(`Q ${rc(cmd.x1)} ${rc(cmd.y1)} ${rc(cmd.x)} ${rc(cmd.y)}`);
            currentX = cmd.x;
            currentY = cmd.y;
        } else if (cmd.type === SVGPathData.CLOSE_PATH) {
            parts.push('Z');
            currentX = startX;
            currentY = startY;
        }
    }
    return parts.join(' ');
}

export function cleanAndNormalizePath(svgPath: string): string {
    try {
        if (!svgPath || svgPath.trim() === '') return '';

        // 1. Normalize using svgpath to remove arcs and shorthand commands, and make absolute
        const normalized = svgpath(svgPath).abs().unshort().unarc().toString();
        
        // 2. Parse into absolute commands using SVGPathData
        const parsed = new SVGPathData(normalized).toAbs();
        
        const cleanCommands: any[] = [];
        let contourOpen = false;
        let hasDrawn = false;
        let lastX = 0;
        let lastY = 0;
        let startX = 0;
        let startY = 0;

        for (let i = 0; i < parsed.commands.length; i++) {
            const cmd = parsed.commands[i];
            
            if (cmd.type === SVGPathData.MOVE_TO) {
                // If a contour is already open and has actual drawings, close it first
                if (contourOpen) {
                    if (hasDrawn) {
                        cleanCommands.push({ type: SVGPathData.CLOSE_PATH });
                    }
                    contourOpen = false;
                    hasDrawn = false;
                }
                
                // Peek ahead to skip consecutive/empty MoveTo commands
                let nextIsMoveOrClose = false;
                for (let j = i + 1; j < parsed.commands.length; j++) {
                    const nextCmd = parsed.commands[j];
                    if (nextCmd.type === SVGPathData.MOVE_TO || nextCmd.type === SVGPathData.CLOSE_PATH) {
                        nextIsMoveOrClose = true;
                        break;
                    }
                    // Found a drawing command, so this MOVE_TO is valid
                    break;
                }
                
                // If it's the last command, it's also useless
                if (i === parsed.commands.length - 1) {
                    nextIsMoveOrClose = true;
                }

                if (!nextIsMoveOrClose) {
                    cleanCommands.push(cmd);
                    contourOpen = true;
                    hasDrawn = false;
                    startX = cmd.x;
                    startY = cmd.y;
                    lastX = cmd.x;
                    lastY = cmd.y;
                }
            } else if (cmd.type === SVGPathData.CLOSE_PATH) {
                if (contourOpen) {
                    if (hasDrawn) {
                        cleanCommands.push(cmd);
                    }
                    contourOpen = false;
                    hasDrawn = false;
                }
            } else {
                // Drawing command
                if (!contourOpen) {
                    // Open a contour if not already open (defensive)
                    cleanCommands.push({ type: SVGPathData.MOVE_TO, x: lastX, y: lastY });
                    contourOpen = true;
                    hasDrawn = false;
                    startX = lastX;
                    startY = lastY;
                }
                
                cleanCommands.push(cmd);
                hasDrawn = true;
                
                // Update last tracking coordinates
                if ('x' in cmd) lastX = cmd.x;
                if ('y' in cmd) lastY = cmd.y;
            }
        }
        
        // Close the final contour if still open
        if (contourOpen && hasDrawn) {
            cleanCommands.push({ type: SVGPathData.CLOSE_PATH });
        }
        
        // Convert to a clean absolute path string
        return commandsToPathString(cleanCommands);
    } catch (err) {
        console.error("Error in cleanAndNormalizePath:", err);
        return svgPath; // Fallback to original path
    }
}
