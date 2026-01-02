import React, { useMemo } from 'react';

const HexCell = React.memo(({ q, r, size, cellState, darkMode, isPeeked, isMJ, pathCount, onHoverStart, onHoverStop, onClick }) => {
    // Geometry
    // Pointy topped
    // angles: 30, 90, 150, 210, 270, 330
    const points = useMemo(() => {
        const angles = [30, 90, 150, 210, 270, 330];
        return angles.map(a => {
            const rad = Math.PI / 180 * a;
            return `${size * 1.12 * Math.cos(rad)},${size * 1.12 * Math.sin(rad)}`;
        }).join(' ');
    }, [size]);

    // cellState = { hoveredBy, selectedBy, staticColor }
    const hoveredBy = cellState?.hoveredBy || [];
    const selectedBy = cellState?.selectedBy || [];
    const staticColor = cellState?.staticColor;

    return (
        <g
            className="transition-all duration-200"
            onMouseEnter={() => onHoverStart(q, r)}
            onMouseLeave={() => onHoverStop(q, r)}
            onClick={() => onClick(q, r)}
            style={{ cursor: 'pointer' }}
        >
            {/* Outline / Base (Transparent) */}
            <polygon
                points={points}
                stroke="rgba(0, 0, 0, 1)"
                strokeWidth={size > 15 ? 2.5 : 1}
                strokeOpacity={size > 15 ? .1 : .2}
                fill="transparent"
                pointerEvents="all"
            />

            {/* Dark Mode Layer */}
            {darkMode !== null && (
                <polygon
                    points={points}
                    fill="black"
                    fillOpacity={isMJ ?
                        (isPeeked ? Math.min(darkMode, 0.5) : Math.min(darkMode, 0.8)) :
                        darkMode
                    }
                    className="pointer-events-none transition-opacity duration-200"
                />
            )}

            {/* Static Colors (MJ or Debris) */}
            {/* Static Colors (MJ or Debris) */}
            {staticColor && (cellState.staticType === 'mj_active' || cellState.staticType === 'debris') && (
                <polygon
                    points={points}
                    fill={cellState.staticType === 'mj_active' ? staticColor : "transparent"}
                    fillOpacity={cellState.staticType === 'mj_active' ? 0.5 : 1}
                    stroke={staticColor}
                    strokeWidth={cellState.staticType === 'mj_active' ? "5" : "10"}
                    opacity={cellState.staticOpacity || 1}
                    className="pointer-events-none"
                    transform="scale(0.5)"
                />
            )}

            {/* Selections (User Tokens) */}
            {selectedBy.map((s) => (
                <polygon
                    key={`s-${s.userId}`}
                    points={points}
                    fill="transparent"
                    stroke={s.color}
                    strokeWidth="12"
                    transform="scale(0.5)"
                />
            ))}

            {/* Pathfinding Count (Centered on the active token) */}
            {pathCount !== null && (
                <text
                    x="0"
                    y="0"
                    fill="black"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={size * 1.6}
                    fontWeight="bold"
                    pointerEvents="none"
                    className="select-none"
                    style={{ filter: 'drop-shadow(0px 0px 1px rgba(255,255,255,0.5))' }}
                >
                    {pathCount}
                </text>
            )}

            {/* Hovers (Render last to be on top) */}
            {hoveredBy.map((h) => (
                <polygon
                    key={`h-${h.userId}`}
                    points={points}
                    fill={h.color}
                    opacity={0.5}
                    className="pointer-events-none"
                    stroke="none"
                />
            ))}
        </g>
    );
}, (prev, next) => {
    // Custom comparison for performance if grid is huge
    return (
        prev.cellState === next.cellState &&
        prev.size === next.size &&
        prev.darkMode === next.darkMode &&
        prev.isPeeked === next.isPeeked &&
        prev.isMJ === next.isMJ &&
        prev.pathCount === next.pathCount
    );
});

export default HexCell;
