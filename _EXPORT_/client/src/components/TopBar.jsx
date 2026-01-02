import React from 'react';

export default function TopBar({ users, userPaths = new Map() }) {
    return (
        <div className="fixed top-0 left-0 w-full p-4 flex flex-wrap justify-center gap-4 pointer-events-none z-50">
            {users.map(u => {
                const pathData = userPaths.get(u.id);
                const hasPath = pathData && pathData.length > 0;

                return (
                    <div key={u.id} className="flex flex-col items-center ">
                        <div className="flex items-center gap-2">
                            {u.avatar ? (
                                <img src={u.avatar} alt="avatar" className="w-[75px] h-[75px] object-cover" />
                            ) : (
                                <div className="w-[75px] h-[75px] flex items-center justify-center text-[75px]"></div>
                            )}
                            <span
                                className="w-[120px] h-[70px] font-mono text-lg font-bold font-bold text-[25px]"

                                style={{ color: u.color }}
                            >
                                ⠀{u.name}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
