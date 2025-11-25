import React from 'react';
import { X, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BurgerMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BurgerMenu: React.FC<BurgerMenuProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const handleNavigation = (path: string) => {
        navigate(path);
        // Leave the overlay up briefly so the next screen renders before we hide the menu
        setTimeout(() => onClose(), 120);
    };

    return (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
            <div className="w-4/5 h-full bg-[#2D2D2D] p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <button onClick={onClose} className="p-2 bg-brand-teal-dark rounded-full text-white hover:bg-brand-teal transition-colors">
                        <X size={24} />
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="text-white font-medium">Username</span>
                        <div className="w-10 h-10 bg-brand-teal rounded-full flex items-center justify-center text-white">
                            <User size={20} />
                        </div>
                    </div>
                </div>

                {/* Menu Items */}
                <div className="flex flex-col gap-4">
                    <MenuButton
                        label="Settings"
                        onClick={() => handleNavigation('/settings')}
                    />
                    <MenuButton
                        label="Connected Devices"
                        onClick={() => handleNavigation('/devices')}
                    />
                    <MenuButton
                        label="My Data"
                        onClick={() => handleNavigation('/my-data')}
                    />
                    <MenuButton
                        label="Support"
                        onClick={() => handleNavigation('/support')}
                    />
                </div>
            </div>
        </div>
    );
};

interface MenuButtonProps {
    label: string;
    onClick: () => void;
}

const MenuButton: React.FC<MenuButtonProps> = ({ label, onClick }) => (
    <button 
        onClick={onClick}
        className="w-full bg-[#023743] hover:bg-[#06495a] text-white py-3 px-6 rounded-full text-base font-semibold shadow-lg transition-colors active:scale-95"
    >
        {label}
    </button>
);
