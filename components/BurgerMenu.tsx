import React from 'react';
import { X, User, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BurgerMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BurgerMenu: React.FC<BurgerMenuProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const handleNavigation = (path: string) => {
        navigate(path, { state: { fromMenu: true } });
        // Leave the overlay up briefly so the next screen renders before we hide the menu
        setTimeout(() => onClose(), 120);
    };

    return (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center">
            <div className="w-full h-full bg-[#3A3332] px-6 pt-6 pb-10 flex flex-col items-center gap-8 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
                {/* Header */}
                <div className="w-full flex items-center justify-between">
                    <div className="w-12" />
                    <div className="flex-1 flex justify-center">
                        <div className="px-6 py-2 rounded-full bg-[#004B54] text-white font-semibold shadow-lg border border-black/20">
                            Edge Vision
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 rounded-full bg-[#004B54] text-white flex items-center justify-center shadow-lg hover:bg-[#03616c] transition-colors">
                        <X size={26} />
                    </button>
                </div>

                {/* Profile */}
                <div className="flex flex-col items-center gap-4 mt-2">
                    <div className="w-40 h-40 rounded-full bg-[#004B54] flex items-center justify-center shadow-xl border border-black/10">
                        <User size={96} color="white" />
                    </div>
                    <span className="text-white text-lg font-semibold">Username</span>
                </div>

                {/* Menu Items */}
                <div className="w-full flex flex-col gap-4">
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
        className="w-full bg-[#004B54] hover:bg-[#03616c] text-white py-3 px-6 rounded-full text-base font-semibold shadow-lg border border-black/20 transition-colors active:scale-95"
    >
        {label}
    </button>
);
