import React, { useState, useMemo } from 'react';
import HexCell from './HexCell';

// Helper to generate rectangular staggered grid
function generateRectGrid(width, height) {
    let results = [];
    for (let r = 0; r < height; r++) {
        let r_offset = Math.floor(r / 2); // Axial staggering for flat alignment
        for (let q = -r_offset; q < width - r_offset; q++) {
            results.push({ q, r });
        }
    }
    return results;
}

export default function HexGrid({ cellData, backgroundUrl, gridType, darkMode, revealedCells, isMJ, onHoverStart, onHoverStop, onMouseLeave, onClick, userPaths = new Map() }) {
    const [hoveredCell, setHoveredCell] = useState(null);



    // Determine dimensions based on grid type
    const isFine = gridType === 'fine';
    const GRID_WIDTH = isFine ? 58 : 34;
    const GRID_HEIGHT = isFine ? 48 : 28;
    const size = isFine ? 12 : 21;

    const hexes = useMemo(() => generateRectGrid(GRID_WIDTH, GRID_HEIGHT), [GRID_WIDTH, GRID_HEIGHT]);

    const getNeighbors = (q, r, radius) => {
        const neighbors = new Set();
        neighbors.add(`${q},${r}`);
        for (let dq = -radius; dq <= radius; dq++) {
            for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
                neighbors.add(`${q + dq},${r + dr}`);
            }
        }
        return neighbors;
    };

    const peekedIds = useMemo(() => {
        if (!hoveredCell || !isMJ || !darkMode) return new Set();
        return getNeighbors(hoveredCell.q, hoveredCell.r, 2);
    }, [hoveredCell, isMJ, darkMode]);

    const handleMouseEnter = (q, r) => {
        setHoveredCell({ q, r });
        onHoverStart(q, r);
    };

    const handleMouseLeave = (q, r) => {
        setHoveredCell(null);
        onHoverStop(q, r);
    };

    // Calculate pixel center for each hex
    const hexPixel = (q, r) => {
        const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
        const y = size * (3. / 2 * r);
        return { x, y };
    };

    // Render a path as semi-transparent hexagons
    const renderPath = (path, color, key) => {
        return path.map((hex, idx) => {
            const { q, r } = hex;
            const { x, y } = hexPixel(q, r);
            const degToRad = Math.PI / 180;
            const points = [30, 90, 150, 210, 270, 330].map(a => {
                const px = size * Math.cos(a * degToRad);
                const py = size * Math.sin(a * degToRad);
                return `${px},${py}`;
            });

            return (
                <g key={`${key}-${idx}`} transform={`translate(${x},${y})`}>
                    <polygon
                        points={points.join(' ')}
                        fill={color}
                        fillOpacity="0.15"
                        pointerEvents="none"
                    />
                </g>
            );
        });
    };

    // Calculate bounds for viewBox
    const columns = 24;
    const coreWidth = (columns - 1) * 30 * Math.sqrt(3) + 30 * Math.sqrt(3);
    const totalHeight = 915; // Fits 20 standard rows (was 907.5 for 19)

    // Horizontal Alignment Logic (Unified and centered)
    const padding = 0;
    const vbX = - (30 * Math.sqrt(3) / 2) - padding / 2 - 13; // Nudged left
    const vbW = coreWidth + padding + 10;
    const vbH = totalHeight + 10 + 15; // Extra height for bottom nudge
    const vbY = -32; // Tight top edge

    return (
        <div className="flex-1 w-full h-full flex items-center justify-center overflow-hidden">
            <svg
                viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
                className="w-full h-full max-h-[85vh]"
                preserveAspectRatio="xMidYMin meet"
                onMouseLeave={onMouseLeave}
            >
                {/* Background Image synced to SVG coordinate system */}
                {backgroundUrl && (
                    <image
                        href={backgroundUrl}
                        x={vbX + 15} // Keep image at old vbX position
                        y={vbY + (vbH * 0.05)}
                        width={vbW}
                        height={vbH * 0.9}
                        preserveAspectRatio="xMidYMin meet"
                        opacity="1"
                    />
                )}


                {/* Grid 2 (Fine) is shifted right by one fine column width to fix offset */}
                <g transform={`translate(${5 + (isFine ? (1 + Math.sqrt(3)) : 0)}, 15)`}>
                    {/* Render hexagons */}
                    {hexes.map(({ q, r }) => {
                        const { x, y } = hexPixel(q, r);
                        const id = `${q},${r}`;
                        const state = cellData[id] || { hoveredBy: [], selectedBy: [] };
                        const revealedOpacity = revealedCells[id];

                        // Find if this hex is the origin of any user's path
                        let pathCount = null;
                        for (const pathData of userPaths.values()) {
                            if (pathData.startId === id && pathData.length > 0) {
                                pathCount = pathData.length;
                                break;
                            }
                        }

                        return (
                            <g key={id} transform={`translate(${x},${y})`}>
                                <HexCell
                                    q={q}
                                    r={r}
                                    size={size - 1} // gap
                                    cellState={state}
                                    darkMode={darkMode ? (revealedOpacity !== undefined ? revealedOpacity : 1.0) : null}
                                    isPeeked={peekedIds.has(id)}
                                    isMJ={isMJ}
                                    pathCount={pathCount}
                                    onHoverStart={handleMouseEnter}
                                    onHoverStop={handleMouseLeave}
                                    onClick={onClick}
                                />
                            </g>
                        );
                    })}
                    {/* Render paths on top of grid for better visibility */}
                    {Array.from(userPaths.entries()).map(([userId, pathData]) =>
                        renderPath(pathData.path, pathData.color, `path-${userId}`)
                    )}
                </g>
            </svg>
        </div>
    );
}
