import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Data Models
// users: socketId -> { id, name, color, avatar, role }
const users = new Map();

// userSelections: userId -> cellId ("q,r")
const userSelections = new Map();

// activeHovers: cellId -> Set<userId>
const activeHovers = new Map();

// --- Uploads ---
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// boardState: cellId -> color (Static "MJ" cells)
const boardState = new Map();
let globalBackgroundImage = null;

// Grid State
let gridType = 'standard'; // 'standard' or 'fine'
let darkMode = false;
const revealedCells = new Map(); // cellId -> opacity (0 is fully revealed, 1 is hidden)


const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images allowed'));
    }
});

// ----------------

// Serve static files from the React app (client/dist) after build
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));
app.use('/uploads', express.static(uploadDir));

app.post('/api/avatar', upload.single('avatar'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const fullUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ avatarUrl: fullUrl });
});

app.post('/api/background', upload.single('background'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const fullUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ backgroundUrl: fullUrl });
});

// Any request that doesn't match an API route or static file gets sent to index.html
app.get('(.*)', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ----------------

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send initial state
    const selections = {};
    for (const [userId, cellId] of userSelections.entries()) {
        selections[userId] = cellId;
    }

    const staticCells = {};
    for (const [cellId, val] of boardState.entries()) {
        // Normalize to object if legacy
        staticCells[cellId] = typeof val === 'string' ? { color: val, type: 'active' } : val;
    }

    // Convert revealedCells Map to Object
    const revealedObj = {};
    for (const [key, val] of revealedCells.entries()) {
        revealedObj[key] = val;
    }

    socket.emit('state:full', {
        users: Array.from(users.values()),
        selections: selections,
        boardState: staticCells,
        backgroundImage: globalBackgroundImage,
        gridType,
        darkMode,
        revealedCells: revealedObj
    });

    socket.on('join', ({ name, color, avatar, isMJ }) => {
        const role = isMJ ? 'MJ' : 'default';

        const user = {
            id: socket.id,
            name: name || `User ${socket.id.substr(0, 4)}`,
            color: color || '#ffffff',
            avatar,
            role
        };

        users.set(socket.id, user);

        // Broadcast updated user list
        io.emit('users:update', Array.from(users.values()));

        // Notify user of their own join (confirmation)
        socket.emit('user:joined', user);
    });

    socket.on('hover:start', ({ q, r, color }) => {
        const cellId = `${q},${r}`;
        if (!activeHovers.has(cellId)) {
            activeHovers.set(cellId, new Set());
        }
        activeHovers.get(cellId).add(socket.id);

        const user = users.get(socket.id);
        if (user) {
            // Broadcast hover effect
            io.emit('cell:hover', {
                cellId,
                userId: socket.id,
                color: color || user.color,
                alpha: 0.5
            });
        }
    });

    socket.on('hover:stop', ({ q, r }) => {
        const cellId = `${q},${r}`;
        if (activeHovers.has(cellId)) {
            activeHovers.get(cellId).delete(socket.id);
            if (activeHovers.get(cellId).size === 0) {
                activeHovers.delete(cellId);
            }
        }
        io.emit('cell:unhover', { cellId, userId: socket.id });
    });

    // Click / Selection
    socket.on('click', ({ q, r, color }) => {
        const cellId = `${q},${r}`;
        const user = users.get(socket.id);
        if (!user) return;

        const usedColor = color || user.color;

        if (user.role === 'MJ') {
            // MJ Logic: Entity Token Mode (1 Cell Per Color) - NO DEBRIS
            const normalizedUsedColor = usedColor.toLowerCase();

            // 1. Remove ANY existing cell of this color (Active or Debris)
            for (const [key, val] of boardState.entries()) {
                const itemColor = (typeof val === 'string' ? val : val.color).toLowerCase();
                if (itemColor === normalizedUsedColor) {
                    boardState.delete(key);
                    io.emit('board:update', { cellId: key, data: null });
                }
            }

            // 2. Set new cell (mj_active)
            const newActive = { color: usedColor, type: 'mj_active' };
            boardState.set(cellId, newActive);
            io.emit('board:update', { cellId, data: newActive });

        } else {
            // User Logic: Single Selection (Move Token) with Debris handling

            // 1. Deselect previous cell for this user
            const prevCellId = userSelections.get(socket.id);
            if (prevCellId) {
                io.emit('cell:unselect', { cellId: prevCellId, userId: socket.id });
            }

            // 2. Debris handling – keep only ONE debris per colour
            const normalizedUsedColor = usedColor.toLowerCase();
            let previousActiveKey = null;
            const debrisKeysToDelete = [];
            for (const [key, val] of boardState.entries()) {
                const itemColor = (typeof val === 'string' ? val : val.color).toLowerCase();
                const itemType = (typeof val === 'string' ? 'active' : val.type);
                if (itemColor === normalizedUsedColor) {
                    if (itemType === 'active') {
                        previousActiveKey = key; // will become debris
                    } else if (itemType === 'debris') {
                        debrisKeysToDelete.push(key);
                    }
                }
            }
            // Convert previous active token to debris
            if (previousActiveKey) {
                const newVal = { color: usedColor, type: 'debris' };
                boardState.set(previousActiveKey, newVal);
                io.emit('board:update', { cellId: previousActiveKey, data: newVal });
            }
            // Remove any leftover debris of the same colour
            for (const k of debrisKeysToDelete) {
                boardState.delete(k);
                io.emit('board:update', { cellId: k, data: null });
            }

            // 3. Set the new cell as active in boardState
            const newActive = { color: usedColor, type: 'active' };
            boardState.set(cellId, newActive);
            io.emit('board:update', { cellId, data: newActive });

            // 4. Update user selection mapping
            userSelections.set(socket.id, cellId);

            // 5. Broadcast new selection for UI (cells map)
            io.emit('cell:click', {
                cellId,
                userId: socket.id,
                color: usedColor,
                alpha: 1.0
            });
        }
    });

    socket.on('background:set', (url) => {
        const user = users.get(socket.id);
        if (user && user.role === 'MJ') {
            globalBackgroundImage = url;
            io.emit('background:update', url);
        }
    });

    socket.on('path:update', (data) => {
        const user = users.get(socket.id);
        if (user) {
            // Broadcast path data to other clients
            socket.broadcast.emit('path:update', {
                userId: user.id,
                path: data.path,
                startId: data.startId,
                color: data.color
            });
        }
    });

    // --- Grid Control Events ---

    socket.on('grid:set_type', (type) => {
        const user = users.get(socket.id);
        if (user && user.role === 'MJ') {
            gridType = type;
            io.emit('grid:type_update', type);
        }
    });

    socket.on('grid:fill_dark', () => {
        const user = users.get(socket.id);
        if (user && user.role === 'MJ') {
            darkMode = true;
            // Don't clear revealedCells, just enable the mode
            io.emit('grid:dark_update', { enabled: true, revealedCells: {} });
        }
    });

    socket.on('grid:reset_dark', () => {
        const user = users.get(socket.id);
        if (user && user.role === 'MJ') {
            darkMode = false;
            revealedCells.clear();
            io.emit('grid:dark_update', { enabled: false, revealedCells: {} });
        }
    });

    socket.on('grid:clear_cell', ({ q, r }) => {
        const user = users.get(socket.id);
        // Only MJ can clear fog
        if (user && user.role === 'MJ') {
            const updates = [];

            // Helper function to get hexagon neighbors at a specific distance
            const getNeighborsAtDistance = (centerQ, centerR, distance) => {
                if (distance === 0) return [{ q: centerQ, r: centerR }];

                const neighbors = [];
                const directions = [
                    { q: 1, r: 0 },   // East
                    { q: 1, r: -1 },  // Northeast
                    { q: 0, r: -1 },  // Northwest
                    { q: -1, r: 0 },  // West
                    { q: -1, r: 1 },  // Southwest
                    { q: 0, r: 1 }    // Southeast
                ];

                // For distance > 1, we need to collect all cells at exactly that distance
                // Use a Set to avoid duplicates
                const visited = new Set();
                const queue = [{ q: centerQ, r: centerR, dist: 0 }];
                visited.add(`${centerQ},${centerR}`);

                while (queue.length > 0) {
                    const current = queue.shift();

                    if (current.dist === distance) {
                        neighbors.push({ q: current.q, r: current.r });
                        continue;
                    }

                    if (current.dist < distance) {
                        for (const dir of directions) {
                            const nq = current.q + dir.q;
                            const nr = current.r + dir.r;
                            const key = `${nq},${nr}`;

                            if (!visited.has(key)) {
                                visited.add(key);
                                queue.push({ q: nq, r: nr, dist: current.dist + 1 });
                            }
                        }
                    }
                }

                return neighbors;
            };

            // Helper to apply opacity only if it reduces darkness (never increase opacity value)
            const applyOpacity = (cells, targetOpacity) => {
                cells.forEach(cell => {
                    const cellId = `${cell.q},${cell.r}`;
                    const currentOpacity = revealedCells.get(cellId);

                    // If cell has no opacity set, it defaults to 1.0 (fully dark)
                    const existingOpacity = currentOpacity !== undefined ? currentOpacity : 1.0;

                    // Only update if new opacity is LESS than existing (more revealed)
                    let newOpacity = Math.min(existingOpacity, targetOpacity);

                    // Special case: If a 20% cell would stay at 20%, make it 0% instead
                    if (existingOpacity === 0.2 && newOpacity === 0.2) {
                        newOpacity = 0;
                    }

                    // Special case: If an 80% cell would stay at 80%, make it 40% instead
                    if (existingOpacity === 0.8 && newOpacity === 0.8) {
                        newOpacity = 0.4;
                    }

                    if (newOpacity !== existingOpacity) {
                        revealedCells.set(cellId, newOpacity);
                        updates.push({ id: cellId, opacity: newOpacity });
                    }
                });
            };

            // Center cell: 0% opacity (fully revealed)
            const centerCells = getNeighborsAtDistance(q, r, 0);
            applyOpacity(centerCells, 0);

            // Direct neighbors (distance 1): 0% opacity
            const directNeighbors = getNeighborsAtDistance(q, r, 1);
            applyOpacity(directNeighbors, 0);

            // Distance 2 neighbors: 20% opacity
            const distance2Neighbors = getNeighborsAtDistance(q, r, 2);
            applyOpacity(distance2Neighbors, 0.2);

            // Distance 3 neighbors: 80% opacity
            const distance3Neighbors = getNeighborsAtDistance(q, r, 3);
            applyOpacity(distance3Neighbors, 0.8);

            // Emit all updates at once
            if (updates.length > 0) {
                io.emit('grid:opacities_updated', updates);
            }
        }
    });

    // ---------------------------


    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        users.delete(socket.id);

        // Remove selection (Only for normal users, MJ static cells stay)
        const cellId = userSelections.get(socket.id);
        if (cellId) {
            userSelections.delete(socket.id);
            io.emit('cell:unselect', { cellId, userId: socket.id });
        }

        io.emit('users:update', Array.from(users.values()));
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

