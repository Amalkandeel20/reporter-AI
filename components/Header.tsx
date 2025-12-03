import React from 'react';
import { Menu, User, X } from 'lucide-react';

interface HeaderProps {
    onMenuClick?: () => void;
    title?: string;
    showClose?: boolean; // For sub-screens that need a close button instead of profile
    onCloseClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick, title = "Edge Vision", showClose = false, onCloseClick }) => {
    const renderUserButton = () => (
        <button className="w-10 h-10 bg-brand-teal-dark rounded-full flex items-center justify-center text-white shadow-lg hover:bg-brand-teal transition-colors">
            <User size={24} />
        </button>
    );

    const renderMenuButton = () => (
        <button 
            onClick={onMenuClick}
            className="w-10 h-10 bg-brand-teal-dark rounded-full flex items-center justify-center text-white shadow-lg hover:bg-brand-teal transition-colors"
        >
            <Menu size={24} />
        </button>
    );

    return (
        <header className="flex items-center justify-between px-4 py-4 bg-transparent z-10 relative">
            {showClose ? renderMenuButton() : renderUserButton()}

            <div className="bg-brand-teal-dark px-6 py-2 rounded-full shadow-lg border border-brand-teal/20">
                <h1 className="text-white font-semibold tracking-wide text-sm">{title}</h1>
            </div>

            {showClose ? (
                <button 
                    onClick={onCloseClick}
                    className="w-10 h-10 bg-brand-teal-dark rounded-full flex items-center justify-center text-white shadow-lg hover:bg-brand-teal transition-colors"
                >
                    <X size={24} />
                </button>
            ) : (
                renderMenuButton()
            )}
        </header>
    );
};
