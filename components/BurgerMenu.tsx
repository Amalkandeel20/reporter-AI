import React from 'react';
import { X, User, Settings, HelpCircle, HardDrive, Command } from 'lucide-react';
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
        onClose();
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
                        icon={<HardDrive size={20} />} 
                        label="Connected Devices" 
                        onClick={() => handleNavigation('/devices')} 
                    />
                    <MenuButton 
                        icon={<Settings size={20} />} 
                        label="Settings" 
                        onClick={() => handleNavigation('/settings')} 
                    />
                    <MenuButton 
                        icon={<HelpCircle size={20} />} 
                        label="Support" 
                        onClick={() => handleNavigation('/support')} 
                    />
                    <MenuButton 
                        icon={<Command size={20} />} 
                        label="Configure Shortcuts" 
                        onClick={() => handleNavigation('/shortcuts')} 
                    />
                </div>
            </div>
        </div>
    );
};

interface MenuButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}

const MenuButton: React.FC<MenuButtonProps> = ({ icon, label, onClick }) => (
    <button 
        onClick={onClick}
        className="w-full bg-brand-teal-dark hover:bg-brand-teal text-white py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 font-medium shadow-lg active:scale-95"
    >
        {/* {icon} Icon is optional in design, text is centered */}
        {label}
    </button>
);
