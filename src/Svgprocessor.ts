import svgpath from 'svgpath';
import opentype from 'opentype.js';
import { SVGPathData } from 'svg-pathdata';

export function cleanTransformString(transform: string): string {
    if (!transform) return "";
    // Match float numbers (including negatives, decimals, and scientific notations)
    return transform.replace(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g, (match) => {
        const val = parseFloat(match);
        if (isNaN(val)) return match;
        // If it's extremely small, treat as zero to avoid parsing or visual offset issues
        if (Math.abs(val) < 1e-10) return "0";
        // Round to 6 decimal places to clean up precision
        return (Math.round(val * 1000000) / 1000000).toString();
    });
}

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


function hslToRgb(h: number, s: number, l: number): { r: number, g: number, b: number } {
    const sFrac = s / 100;
    const lFrac = l / 100;
    
    // Normalize hue
    let hNorm = h % 360;
    if (hNorm < 0) hNorm += 360;
    
    const k = (n: number) => (n + hNorm / 30) % 12;
    const a = sFrac * Math.min(lFrac, 1 - lFrac);
    const f = (n: number) => lFrac - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    
    return {
        r: Math.round(f(0) * 255),
        g: Math.round(f(8) * 255),
        b: Math.round(f(4) * 255)
    };
}

export function parseColor(color: string): boolean {
    if (!color) return false;
    const str = color.toLowerCase().trim();
    
    // Quick matches for common red color names
    const redColorNames = new Set([
        'red', 'crimson', 'tomato', 'darkred', 'maroon', 'firebrick',
        'indianred', 'lightcoral', 'salmon', 'darksalmon', 'lightsalmon', 'orangered'
    ]);
    if (redColorNames.has(str)) return true;
    
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
    else if (str.startsWith('rgb')) {
        const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)/);
        if (rgbMatch) {
            r = Math.round(parseFloat(rgbMatch[1]));
            g = Math.round(parseFloat(rgbMatch[2]));
            b = Math.round(parseFloat(rgbMatch[3]));
            parsed = true;
        }
    }
    // 3. hsl / hsla format: hsl(h, s%, l%) or hsla(h, s%, l%, a)
    else if (str.startsWith('hsl')) {
        const hslMatch = str.match(/hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+\s*)?\)/);
        if (hslMatch) {
            const h = parseFloat(hslMatch[1]);
            const s = parseFloat(hslMatch[2]);
            const l = parseFloat(hslMatch[3]);
            
            // Convert HSL to RGB
            const rgb = hslToRgb(h, s, l);
            r = rgb.r;
            g = rgb.g;
            b = rgb.b;
            parsed = true;
        }
    }
    
    if (parsed) {
        // Red is high and dominant
        // Lowered threshold to 110 to support darker reds like maroon, and 70 difference
        return r >= 110 && (r - g >= 70) && (r - b >= 70);
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
    let fill = (el.getAttribute('fill') || '').toLowerCase().trim();
    const style = (el.getAttribute('style') || '').toLowerCase();
    if (!fill && style) {
        const match = style.match(/fill\s*:\s*([^;]+)/);
        if (match) {
            fill = match[1].trim();
        }
    }
    const isBgColor = fill === 'white' || fill === '#ffffff' || fill === '#fff' || fill === 'transparent' || fill === 'none';
    
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

    // Parse all style tags to find class-based stroke rules
    const classStyles: Record<string, string> = {};
    const styleTags = doc.querySelectorAll('style');
    styleTags.forEach(styleTag => {
        const cssText = styleTag.textContent || '';
        // Match rules like: .className { stroke: red; ... } or .cls-1{stroke:#ff0;}
        const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
        let match;
        while ((match = ruleRegex.exec(cssText)) !== null) {
            const className = match[1];
            const ruleBody = match[2];
            classStyles[className] = ruleBody;
        }
    });
    
    // We must accumulate transforms down the tree.
    function traverse(el: Element, currentTransform: string) {
        const tag = el.tagName.toLowerCase();
        // Skip defs, clipPath, mask, style, metadata, script
        if (tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'symbol' || tag === 'style' || tag === 'metadata' || tag === 'script') return;
        
        let localTransform = currentTransform;
        
        if (el.hasAttribute('transform')) {
            const elTransform = cleanTransformString(el.getAttribute('transform') || '');
            localTransform = currentTransform ? `${currentTransform} ${elTransform}` : elTransform;
        }
        
        // Handle <use>
        if (tag === 'use') {
            let href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
            if (!href) {
                const attrs = el.attributes;
                for (let i = 0; i < attrs.length; i++) {
                    if (attrs[i].nodeName.endsWith('href')) {
                        href = attrs[i].nodeValue || '';
                        break;
                    }
                }
            }
            href = href.trim();
            const hashIdx = href.indexOf('#');
            if (hashIdx !== -1) {
                const id = href.substring(hashIdx + 1);
                const ref = doc.getElementById(id);
                if (ref) {
                    const useFill = el.getAttribute('fill');
                    const useStroke = el.getAttribute('stroke');
                    
                    // 1. Extract the <use> element's own transform
                    let useElementTransform = "";
                    if (el.hasAttribute('transform')) {
                        useElementTransform = cleanTransformString(el.getAttribute('transform') || '');
                    }
                    
                    // 2. Extract the <use> element's translation (x, y)
                    let useTranslation = "";
                    const x = parseFloat(el.getAttribute('x') || '0');
                    const y = parseFloat(el.getAttribute('y') || '0');
                    if (x !== 0 || y !== 0) {
                        useTranslation = `translate(${x}, ${y})`;
                    }
                    
                    // 3. Extract the referenced element's own transform
                    let referencedElementTransform = "";
                    if (ref.hasAttribute('transform')) {
                        referencedElementTransform = cleanTransformString(ref.getAttribute('transform') || '');
                    }
                    
                    // 4. Combine all transforms in the correct sequence (currentTransform -> use's transform -> use's x/y -> ref's transform)
                    let mergedTransform = currentTransform;
                    
                    if (useElementTransform) {
                        mergedTransform = mergedTransform ? `${mergedTransform} ${useElementTransform}` : useElementTransform;
                    }
                    if (useTranslation) {
                        mergedTransform = mergedTransform ? `${mergedTransform} ${useTranslation}` : useTranslation;
                    }
                    if (referencedElementTransform) {
                        mergedTransform = mergedTransform ? `${mergedTransform} ${referencedElementTransform}` : referencedElementTransform;
                    }
                    
                    // Clone the referenced element and completely strip its 'transform' attribute to prevent double application
                    const clone = ref.cloneNode(true) as Element;
                    clone.removeAttribute('transform');
                    
                    if (useFill) clone.setAttribute('fill', useFill);
                    if (useStroke) clone.setAttribute('stroke', useStroke);
                    
                    traverse(clone, mergedTransform);
                }
            }
            return;
        }

        const pathData = elementToPathData(el);
        if (pathData) {
            let finalPath = pathData;
            if (localTransform.trim()) {
                try {
                    // Pre-clean localTransform to ensure it is completely safe and robust for svgpath parser
                    const safeTransform = cleanTransformString(localTransform);
                    finalPath = svgpath(finalPath).transform(safeTransform).toString();
                } catch (e) {
                    console.warn('Transform failed', e);
                }
            }
            
            finalPath = svgpath(finalPath).abs().unshort().unarc().toString();
            
            if (finalPath) {
                let stroke = el.getAttribute('stroke') || '';
                
                // 1. Check inline style attribute
                if (!stroke) {
                    const styleAttr = el.getAttribute('style') || '';
                    if (styleAttr) {
                        const match = styleAttr.match(/stroke\s*:\s*([^;]+)/i);
                        if (match) {
                            stroke = match[1].trim().replace(/['"]/g, '');
                        }
                    }
                }
                
                // 2. Check class styles (from SVG <style> tags)
                if (!stroke) {
                    const clsAttr = el.getAttribute('class') || '';
                    if (clsAttr) {
                        const classes = clsAttr.split(/\s+/);
                        for (const cls of classes) {
                            if (classStyles[cls]) {
                                const match = classStyles[cls].match(/stroke\s*:\s*([^;]+)/i);
                                if (match) {
                                    stroke = match[1].trim().replace(/['"]/g, '');
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // 3. Fallback to style object
                if (!stroke) {
                    stroke = (el as HTMLElement).style?.stroke || '';
                }

                const isRed = parseColor(stroke);
                
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

export function decodeDataURI(uri: string): string {
    const trimmed = uri.trim();
    if (!trimmed.startsWith('data:')) {
        return trimmed;
    }
    
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) return trimmed;
    
    const meta = trimmed.substring(0, commaIdx);
    const data = trimmed.substring(commaIdx + 1);
    
    const isBase64 = meta.toLowerCase().includes(';base64');
    
    if (isBase64) {
        try {
            return atob(data);
        } catch (e) {
            try {
                return atob(decodeURIComponent(data));
            } catch (e2) {
                throw new Error("فشل فك تشفير Base64 لملف الـ SVG.");
            }
        }
    } else {
        try {
            return decodeURIComponent(data);
        } catch (e) {
            return data;
        }
    }
}

export function cleanXMLString(str: string): string {
    let current = str.trim();
    
    // 1. Decode potential nested/multiple data URIs
    while (current.toLowerCase().startsWith('data:')) {
        const decoded = decodeDataURI(current);
        if (decoded === current) break;
        current = decoded.trim();
    }
    
    // 2. Strip UTF-16 BE, UTF-16 LE, and UTF-8 BOM if present
    if (current.charCodeAt(0) === 0xFEFF || current.charCodeAt(0) === 0xFFFE) {
        current = current.substring(1);
    }
    if (current.startsWith('\uFEFF')) {
        current = current.substring(1);
    }
    // Strip byte-level EF BB BF string signature if read incorrectly
    current = current.replace(/^\uEFBBBF/, '');
    current = current.replace(/^\xEF\xBB\xBF/, '');
    
    return current.trim();
}

export async function decompressGzip(arrayBuffer: ArrayBuffer): Promise<string> {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error("بيئة التشغيل الحالية لا تدعم DecompressionStream لفك ضغط SVGZ.");
    }
    try {
        const stream = new Response(arrayBuffer).body;
        if (!stream) throw new Error("لم يتمكن من قراءة دفق الملف.");
        const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
        const text = await new Response(decompressedStream).text();
        return text;
    } catch (err) {
        throw new Error("فشل فك ضغط ملف SVGZ. قد يكون الملف تالفاً أو مضغوطاً بصيغة غير متوافقة.");
    }
}

export async function fileToSVGText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const arrayBuffer = reader.result as ArrayBuffer;
                const uint8Array = new Uint8Array(arrayBuffer);
                
                let text = "";
                // Check for Gzip magic bytes: 0x1F, 0x8B
                if (uint8Array.length >= 2 && uint8Array[0] === 0x1F && uint8Array[1] === 0x8B) {
                    text = await decompressGzip(arrayBuffer);
                } else {
                    // Detect encoding from the XML declaration
                    const tempDecoder = new TextDecoder('utf-8');
                    const tempText = tempDecoder.decode(uint8Array.subarray(0, 1000));
                    const encodingMatch = tempText.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
                    
                    let encoding = 'utf-8';
                    if (encodingMatch && encodingMatch[1]) {
                        encoding = encodingMatch[1].toLowerCase();
                    }
                    
                    try {
                        const decoder = new TextDecoder(encoding);
                        text = decoder.decode(uint8Array);
                    } catch (e) {
                        // Fallback to utf-8
                        const decoder = new TextDecoder('utf-8');
                        text = decoder.decode(uint8Array);
                    }
                }
                resolve(text);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("فشل قراءة ملف الـ SVG."));
        reader.readAsArrayBuffer(file);
    });
}

export function parseSVGStringToDoc(rawText: string): Document {
    const cleanText = cleanXMLString(rawText);
    const parser = new DOMParser();
    
    // Try image/svg+xml first
    const doc = parser.parseFromString(cleanText, 'image/svg+xml');
    const hasParserError = doc.querySelector('parsererror');
    const svgEl = doc.querySelector('svg');
    
    if (!svgEl || hasParserError) {
        // Try text/html parsing as fallback (very resilient for inline SVG or malformed namespaces/entities)
        const htmlDoc = parser.parseFromString(cleanText, 'text/html');
        const fallbackSvg = htmlDoc.querySelector('svg');
        if (fallbackSvg) {
            return htmlDoc;
        }
    }
    
    return doc;
}

