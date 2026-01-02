/**
 * Hexagonal Grid Pathfinding Utilities
 * Using Axial Coordinate System (q, r)
 */

/**
 * Calculate Manhattan distance between two hexagons in axial coordinates
 * @param {Object} a - Start hex {q, r}
 * @param {Object} b - End hex {q, r}
 * @returns {number} Distance
 */
export function hexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/**
 * Get all valid neighbors of a hexagon within grid bounds
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @param {number} maxRadius - Maximum grid radius
 * @returns {Array} Array of neighbor coordinates [{q, r}, ...]
 */
export function getNeighbors(q, r) {
    const directions = [
        { q: 1, r: 0 },   // East
        { q: 1, r: -1 },  // Northeast
        { q: 0, r: -1 },  // Northwest
        { q: -1, r: 0 },  // West
        { q: -1, r: 1 },  // Southwest
        { q: 0, r: 1 }    // Southeast
    ];

    const neighbors = [];
    for (const dir of directions) {
        const nq = q + dir.q;
        const nr = r + dir.r;

        neighbors.push({ q: nq, r: nr });
    }

    return neighbors;
}

/**
 * Find shortest path between two hexagons using A* algorithm
 * @param {Object} start - Start hex {q, r}
 * @param {Object} end - End hex {q, r}
 * @param {number} maxRadius - Maximum grid radius
 * @returns {Array} Array of hex coordinates forming the path, or empty array if no path
 */
export function findPath(start, end) {
    if (!start || !end) return [];
    // If start and end are the same, return just that hex
    if (start.q === end.q && start.r === end.r) {
        return [start];
    }

    const hexKey = (hex) => `${hex.q},${hex.r}`;

    // Priority queue (simple array-based implementation)
    const openSet = [start];
    const cameFrom = new Map();

    // Cost from start to node
    const gScore = new Map();
    gScore.set(hexKey(start), 0);

    // Estimated total cost (g + heuristic)
    const fScore = new Map();
    fScore.set(hexKey(start), hexDistance(start, end));

    while (openSet.length > 0) {
        // Find node in openSet with lowest fScore
        let current = openSet[0];
        let currentIdx = 0;
        for (let i = 1; i < openSet.length; i++) {
            const currentF = fScore.get(hexKey(current)) ?? Infinity;
            const candidateF = fScore.get(hexKey(openSet[i])) ?? Infinity;
            if (candidateF < currentF) {
                current = openSet[i];
                currentIdx = i;
            }
        }

        // Check if we reached the goal
        if (current.q === end.q && current.r === end.r) {
            // Reconstruct path
            const path = [current];
            let key = hexKey(current);
            while (cameFrom.has(key)) {
                current = cameFrom.get(key);
                path.unshift(current);
                key = hexKey(current);
            }
            return path;
        }

        // Remove current from openSet
        openSet.splice(currentIdx, 1);

        // Check all neighbors
        const neighbors = getNeighbors(current.q, current.r);
        for (const neighbor of neighbors) {
            const neighborKey = hexKey(neighbor);
            // FIX: Use nullish coalescing (??) because 0 || Infinity returns Infinity
            const currentG = gScore.get(hexKey(current));
            const tentativeGScore = (currentG !== undefined ? currentG : Infinity) + 1;

            if (tentativeGScore < (gScore.get(neighborKey) ?? Infinity)) {
                // This path to neighbor is better than any previous one
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeGScore);
                fScore.set(neighborKey, tentativeGScore + hexDistance(neighbor, end));

                // Add neighbor to openSet if not already there
                if (!openSet.some(hex => hex.q === neighbor.q && hex.r === neighbor.r)) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    // No path found
    return [];
}

/**
 * Parse hexId string to coordinate object
 * @param {string} hexId - Hex ID in format "q,r"
 * @returns {Object} Coordinate object {q, r}
 */
export function parseHexId(hexId) {
    const [q, r] = hexId.split(',').map(Number);
    return { q, r };
}

/**
 * Convert coordinate object to hexId string
 * @param {Object} hex - Coordinate object {q, r}
 * @returns {string} Hex ID in format "q,r"
 */
export function toHexId(hex) {
    return `${hex.q},${hex.r}`;
}
