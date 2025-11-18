import React from 'react';
import { Menu, X } from 'lucide-react';

export const Header: React.FC = () => {
    return (
        <header className="bg-[#4a5568] p-4 flex justify-between items-center text-white shrink-0">
            <button className="p-2 rounded-full bg-slate-600/50 hover:bg-slate-500/50 transition-colors">
                <Menu size={20} />
            </button>
            <div className="px-4 py-1.5 rounded-lg text-sm bg-slate-600/50">
                Dim Screen
            </div>
            <button className="p-2 rounded-full bg-slate-600/50 hover:bg-slate-500/50 transition-colors">
                <X size={20} />
            </button>
        </header>
    );
};
