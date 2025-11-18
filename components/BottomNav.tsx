import React from 'react';
import { ListChecks, Camera, FileText } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => {
    const baseClasses = "flex flex-col items-center justify-center gap-1 w-full h-full rounded-lg transition-colors duration-200";
    const activeClasses = "bg-indigo-500 text-white";
    const inactiveClasses = "text-slate-300 hover:bg-slate-600/50";

    return (
        <NavLink
            to={to}
            className={({ isActive }) => `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        >
            {icon}
            <span className="text-xs font-medium">{label}</span>
        </NavLink>
    );
};

export const BottomNav: React.FC = () => {
    return (
        <footer className="bg-[#4a5568] p-2 shrink-0">
            <div className="grid grid-cols-3 gap-2 h-16">
                <NavItem to="/" icon={<ListChecks size={24} />} label="Tasks" />
                <NavItem to="/camera" icon={<Camera size={24} />} label="Camera" />
                <NavItem to="/reports" icon={<FileText size={24} />} label="Reports" />
            </div>
        </footer>
    );
};
