import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import HexGrid from './components/HexGrid';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import { findPath, parseHexId } from './utils/pathfinding';

// Helper to update cell state immutably
const updateCell = (cells, id, modifier) => {
  const cell = cells[id] || { hoveredBy: [], selectedBy: [] };
  const newCell = modifier(cell);
  return { ...cells, [id]: newCell };
};

export default function App() {
  const [socket, setSocket] = useState(null);
  const [joined, setJoined] = useState(false);
  const [me, setMe] = useState(null); // { id, name, color, role, avatar }

  // Data State
  const [users, setUsers] = useState([]);
  const [cells, setCells] = useState({});

  // Form State
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ff0055');
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Active Role Color (defaults to user color, but can be changed by Palette)
  const [isMJ, setIsMJ] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState(null);
  const [boardState, setBoardState] = useState({}); // cellId -> color (Static)
  const [userPaths, setUserPaths] = useState(new Map()); // userId -> {path, color, length}
  const [gridType, setGridType] = useState('standard'); // 'standard' or 'fine'
  const [darkMode, setDarkMode] = useState(false);
  const [revealedCells, setRevealedCells] = useState({}); // cellId -> opacity
  const [activeHoveredCell, setActiveHoveredCell] = useState(null); // {q, r}

  // Active Role Color (defaults to user color, but can be changed by Palette)
  const [activeColor, setActiveColor] = useState(color);

  useEffect(() => {
    setActiveColor(color);
  }, [color]);

  // Connect
  useEffect(() => {
    // Connect to the server. If in production, use the current origin.
    const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
    const s = io(socketUrl);
    setSocket(s);

    s.on('connect', () => console.log('Connected to server'));

    s.on('state:full', (data) => {
      setUsers(data.users);
      setBackgroundUrl(data.backgroundImage);
      setBoardState(data.boardState || {});
      setGridType(data.gridType || 'standard');
      setDarkMode(!!data.darkMode);
      setRevealedCells(data.revealedCells || {});

      // Reconstruct cells from data.selections (userId -> cellId)
      const newCells = {};

      // 1. Process User Selections
      for (const [userId, cellId] of Object.entries(data.selections)) {
        const u = data.users.find(u => u.id === userId);
        if (u) {
          if (!newCells[cellId]) newCells[cellId] = { hoveredBy: [], selectedBy: [], staticColor: null };
          newCells[cellId].selectedBy.push({ userId, color: u.color });
        }
      }
      setCells(newCells);
    });

    s.on('users:update', (u) => setUsers(u));

    s.on('user:joined', (user) => {
      if (user.id === s.id) {
        setMe(user);
        setJoined(true);
        setActiveColor(user.color);
      }
    });

    s.on('cell:hover', ({ cellId, userId, color }) => {
      setCells(prev => updateCell(prev, cellId, c => ({
        ...c,
        hoveredBy: [...c.hoveredBy.filter(h => h.userId !== userId), { userId, color }]
      })));
    });

    s.on('cell:unhover', ({ cellId, userId }) => {
      setCells(prev => updateCell(prev, cellId, c => ({
        ...c,
        hoveredBy: c.hoveredBy.filter(h => h.userId !== userId)
      })));
    });

    s.on('cell:click', ({ cellId, userId, color }) => {
      setCells(prev => updateCell(prev, cellId, c => ({
        ...c,
        selectedBy: [...c.selectedBy.filter(h => h.userId !== userId), { userId, color }]
      })));
    });

    s.on('cell:unselect', ({ cellId, userId }) => {
      setCells(prev => updateCell(prev, cellId, c => ({
        ...c,
        selectedBy: c.selectedBy.filter(h => h.userId !== userId)
      })));
    });

    s.on('board:update', ({ cellId, data }) => {
      setBoardState(prev => {
        const next = { ...prev };
        if (data === null) delete next[cellId];
        else next[cellId] = data;
        return next;
      });
    });

    s.on('background:update', (url) => {
      setBackgroundUrl(url);
    });

    s.on('path:update', ({ userId, path, color, startId }) => {
      setUserPaths(prev => {
        const newMap = new Map(prev);
        if (path && path.length > 0) {
          newMap.set(userId, { path, color, length: path.length - 1, startId });
        } else {
          newMap.delete(userId);
        }
        return newMap;
      });
    });

    s.on('grid:type_update', (type) => {
      setGridType(type);
    });

    s.on('grid:dark_update', (data) => {
      setDarkMode(data.enabled);
      setRevealedCells(data.revealedCells || {});
    });

    s.on('grid:opacities_updated', (updates) => {
      setRevealedCells(prev => {
        const next = { ...prev };
        updates.forEach(({ id, opacity }) => {
          next[id] = opacity;
        });
        return next;
      });
    });

    return () => s.disconnect();
  }, []);

  const handleJoin = async (e) => {
    e.preventDefault();
    let avatarUrl = null;

    if (file) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);
      try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
        const res = await fetch(`${baseUrl}/api/avatar`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        avatarUrl = data.avatarUrl;
      } catch (err) {
        console.error("Upload failed", err);
        alert("Avatar upload failed");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    socket.emit('join', { name, color, avatar: avatarUrl, isMJ });
  };

  // Calculate/Update Path Reactive to selection or mouse moves
  useEffect(() => {
    if (!joined || !me || !socket) return;

    if (!activeHoveredCell) {
      // Clear path if not hovering
      setUserPaths(prev => {
        const newMap = new Map(prev);
        if (newMap.has(me.id)) {
          newMap.delete(me.id);
          socket.emit('path:update', { path: [] });
          return newMap;
        }
        return prev;
      });
      return;
    }

    const { q, r } = activeHoveredCell;
    let mySelection = null;

    if (me.role === 'MJ') {
      const normalizedActive = activeColor.toLowerCase();
      let foundDebris = null;

      for (const [cellId, val] of Object.entries(boardState)) {
        const itemColor = (val.color || val).toLowerCase();
        const itemType = val.type || 'active';
        if (itemColor === normalizedActive) {
          if (itemType === 'active' || itemType === 'mj_active') {
            mySelection = cellId;
            break;
          } else if (itemType === 'debris') {
            foundDebris = cellId;
          }
        }
      }
      if (!mySelection) mySelection = foundDebris;
    } else {
      for (const [cellId, cellState] of Object.entries(cells)) {
        if (cellState.selectedBy && cellState.selectedBy.some(s => s.userId === me.id)) {
          mySelection = cellId;
          break;
        }
      }
    }

    if (mySelection) {
      const start = parseHexId(mySelection);
      const end = { q, r };
      const path = findPath(start, end);

      if (path && path.length > 0) {
        setUserPaths(prev => {
          const newMap = new Map(prev);
          newMap.set(me.id, { path, color: activeColor, length: path.length - 1, startId: mySelection });
          return newMap;
        });
        socket.emit('path:update', { path, color: activeColor, startId: mySelection });
      }
    } else {
      // No selection, clear path
      setUserPaths(prev => {
        const newMap = new Map(prev);
        if (newMap.has(me.id)) {
          newMap.delete(me.id);
          socket.emit('path:update', { path: [] });
          return newMap;
        }
        return prev;
      });
    }
  }, [activeHoveredCell, boardState, cells, activeColor, me, socket, joined]);

  const handleHoverStart = useCallback((q, r) => {
    if (!joined) return;
    const hoverColor = me && me.role === 'MJ' ? '#444444' : activeColor;
    socket.emit('hover:start', { q, r, color: hoverColor });
    setActiveHoveredCell({ q, r });
  }, [socket, joined, activeColor, me]);

  const handleHoverStop = useCallback((q, r) => {
    if (!joined || !me) return;
    socket.emit('hover:stop', { q, r });
    setActiveHoveredCell(null);
  }, [socket, joined, me]);

  const handleMouseLeaveGrid = useCallback(() => {
    if (!joined || !me) return;
    setActiveHoveredCell(null);
  }, [joined, me]);

  const handleClick = useCallback((q, r) => {
    if (!joined) return;
    const cellId = `${q},${r}`;

    // If MJ and DarkMode is active AND cell is NOT fully revealed, reveal it!
    // Threshold is 0.1 (center opacity)
    const currentOpacity = revealedCells[cellId] !== undefined ? revealedCells[cellId] : 1.0;
    if (me?.role === 'MJ' && darkMode && currentOpacity > 0.1) {
      socket.emit('grid:clear_cell', { q, r });
    } else {
      socket.emit('click', { q, r, color: activeColor });
    }
  }, [socket, activeColor, joined, me, darkMode, revealedCells]);

  const handleMJBackground = async (file) => {
    const formData = new FormData();
    formData.append('background', file);
    try {
      const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
      const res = await fetch(`${baseUrl}/api/background`, { method: 'POST', body: formData });
      const data = await res.json();
      socket.emit('background:set', data.backgroundUrl);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGridTypeChange = (type) => {
    if (socket) socket.emit('grid:set_type', type);
  };

  const handleFillDark = () => {
    if (socket) socket.emit('grid:fill_dark');
  };

  const handleClearDark = () => {
    if (socket) socket.emit('grid:reset_dark');
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <form onSubmit={handleJoin} className="w-full max-w-md border-4 border-white p-8 space-y-6 bg-black z-10 relative">
          <h1 className="text-4xl font-mono font-bold uppercase tracking-tighter mb-8">Honeycomb<br />Access</h1>

          <div>
            <label className="block font-mono font-bold mb-2">IDENTIFIER</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-black border-2 border-white p-3 text-white font-mono focus:bg-white focus:text-black outline-none transition-colors"
              required
              placeholder="Enter Name..."
            />
          </div>

          <div>
            <label className="flex items-center gap-4 cursor-pointer">
              <input
                type="checkbox"
                checked={isMJ}
                onChange={e => setIsMJ(e.target.checked)}
                className="w-6 h-6 border-2 border-white bg-black accent-white"
              />
              <span className="font-mono font-bold text-lg">ACTIVATE MJ PROTOCOL</span>
            </label>
          </div>

          {!isMJ && (
            <div>
              <label className="block font-mono font-bold mb-2">SIGNATURE COLOR</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="bg-black border-2 border-white w-16 h-12"
                />
                <input
                  type="text"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="flex-1 bg-black border-2 border-white p-3 text-white font-mono uppercase"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-mono font-bold mb-2">VISUAL UPLINK (150x150)</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setFile(e.target.files[0])}
              className="w-full text-sm font-mono file:mr-4 file:py-2 file:px-4 file:border-2 file:border-white file:text-white file:bg-black hover:file:bg-white hover:file:text-black cursor-pointer"
            />
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="w-full bg-white text-black font-mono font-bold text-xl py-4 hover:bg-transparent hover:text-white border-4 border-transparent hover:border-white transition-all uppercase"
          >
            {isUploading ? 'UPLOADING...' : 'INITIALIZE LINK'}
          </button>
        </form>
      </div>
    );
  }

  // Merge Cells for Display
  const displayCells = { ...cells };
  for (const [cellId, val] of Object.entries(boardState)) {
    displayCells[cellId] = { ...(displayCells[cellId] || { hoveredBy: [], selectedBy: [] }) };
    displayCells[cellId].staticColor = val.color || val;
    displayCells[cellId].staticType = val.type || 'active';
    // Check if this is debris (type === 'debris') and set opacity accordingly
    displayCells[cellId].staticOpacity = (val.type === 'debris') ? 0.2 : 1.0;
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden relative">
      <div className="relative z-10 h-full w-full flex flex-col">
        <TopBar users={users.filter(u => u.role !== 'MJ')} userPaths={userPaths} />

        <HexGrid
          cellData={displayCells}
          backgroundUrl={backgroundUrl}
          gridType={gridType}
          darkMode={darkMode}
          revealedCells={revealedCells}
          isMJ={me?.role === 'MJ'}
          onHoverStart={handleHoverStart}
          onHoverStop={handleHoverStop}
          onMouseLeave={handleMouseLeaveGrid}
          onClick={handleClick}
          userPaths={userPaths}
        />

        <BottomBar
          users={users.filter(u => u.role === 'MJ')}
          onSelectColor={setActiveColor}
          onSelectBackground={handleMJBackground}
          onGridTypeChange={handleGridTypeChange}
          onFillDark={handleFillDark}
          onClearDark={handleClearDark}
          gridType={gridType}
          darkMode={darkMode}
          me={me}
          userPaths={userPaths}
        />
      </div>
    </div>
  );
}
