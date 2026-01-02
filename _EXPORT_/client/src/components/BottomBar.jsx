import React, { useRef } from 'react';

export default function BottomBar({ users, onSelectColor, onSelectBackground, onGridTypeChange, onFillDark, onClearDark, gridType, darkMode, me, userPaths = new Map() }) {
    const fileInputRef = useRef(null);

    const handleFieldClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleGridToggle = () => {
        if (onGridTypeChange) {
            onGridTypeChange(gridType === 'standard' ? 'fine' : 'standard');
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && onSelectBackground) {
            onSelectBackground(file);
        }
    };

    // users should be filtered to only be MJs
    return (
        <div className="fixed bottom-[0px] left-0 w-full p-4 flex justify-center items-end gap-4 pointer-events-none z-[45]">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
            />
            {users.map((u) => {
                const pathData = userPaths.get(u.id);
                const hasPath = pathData && pathData.length > 0;

                return (
                    <div key={u.id} className="flex flex-col items-center gap-2 group">
                        <div className="flex flex-col items-center bg-black/80 px-2 py-1">
                        </div>




                        {/* Main Row: Avatar + Color Stack */}
                        <div className="flex flex-row items-end gap-1">
                            {u.avatar ? (
                                <img
                                    src={u.avatar}
                                    alt="avatar"
                                    className="w-[75px] h-[75px] object-cover border-[0px] border-white"
                                />
                            ) : (
                                <div className="w-[75px] h-[75px] bg-gray-900 flex items-center justify-center text-red-500 font-bold">
                                </div>
                            )}

                            {/* Color Stack - Only visible to MJ */}
                            {me && me.role === 'MJ' && (
                                <div className="flex flex-row items-end gap-1 pointer-events-auto">
                                    <div className="grid grid-cols-3">
                                        {[
                                            '#0099ffff', '#5b7978ff', 'rgba(0, 0, 0, 0)',
                                            '#5ccd00ff', '#6c8656ff', '#4b4b4bff',
                                            '#ffe100ff', '#978c5aff', '#979797ff',
                                            '#ff8800ff', '#917950ff', '#c5c5c5ff',
                                            '#f10000ff', '#896358ff', '#ffffff'
                                        ].map(color => (
                                            <div
                                                key={color}
                                                onClick={() => onSelectColor && onSelectColor(color)}
                                                className="w-[31px] h-[15px] cursor-pointer hover:border-[3px] hover:w-[25px]  hover:h-[11px] hover:border-[#000000] hover:opacity-80 transition-opacity"
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>



                                    {/* 2x2 Grid of Control Buttons */}
                                    <div className="grid grid-cols-1 gap-[1px]">
                                        {/* Top Left: Dark/Fog */}
                                        <button
                                            className="h-[18px] w-[30px] bg-black border-[0px] border-black text-white font-mono font-bold text-[20px] flex items-center justify-center hover:border-2 hover:text-[18px] transition-all"
                                            onClick={onFillDark}
                                            title="Fill All Fog"
                                        >
                                            👁
                                        </button>

                                        {/* Top Right: Clear */}
                                        <button
                                            className="h-[18px] w-[30px] bg-black border-[0px] border-black text-white font-mono font-bold text-[20px] flex items-center justify-center hover:border-2 hover:text-[18px] transition-all"
                                            onClick={onClearDark}
                                            title="Clear All Fog"
                                        >
                                            ☀
                                        </button>

                                        {/* Bottom Left: Grid Toggle */}
                                        <button
                                            className="h-[18px] w-[30px] bg-black border-[0px] border-black text-white font-mono font-bold text-[20px] flex items-center justify-center hover:border-2 hover:text-[18px] transition-all"
                                            onClick={handleGridToggle}
                                            title={gridType === 'standard' ? 'Switch to Fine Grid' : 'Switch to Standard Grid'}
                                        >
                                            {gridType === 'standard' ? '⬡' : 'ꙮ'}
                                        </button>

                                        {/* Bottom Right: Field/Background Upload */}
                                        <button
                                            className="h-[18px] w-[30px] bg-black border-[0px] border-black text-white font-mono font-bold text-[20px] flex items-center justify-center hover:border-2 hover:text-[18px] transition-all"
                                            onClick={handleFieldClick}
                                            title="Upload Background Image"
                                        >
                                            🖌
                                        </button>

                                    </div>

                                </div>

                            )}
                        </div>

                    </div>

                );
            })}
        </div>
    );
}
