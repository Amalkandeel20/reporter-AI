import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, showCloseButton = true }) => {
    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-brand-teal-dark rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-brand-teal/30 relative flex flex-col items-center text-center">
                {showCloseButton && (
                    <button 
                        onClick={onClose} 
                        className="absolute top-4 right-4 p-1 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
                    >
                        <X size={20} />
                    </button>
                )}
                
                {title && (
                    <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
                )}

                <div className="w-full">
                    {children}
                </div>
            </div>
        </div>
    );
};

// Sub-components for specific modal styles if needed, or just use generic
export const ModalButton: React.FC<{ onClick: () => void; label: string; variant?: 'primary' | 'secondary' }> = ({ onClick, label, variant = 'primary' }) => (
    <button
        onClick={onClick}
        className={`w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
            variant === 'primary' 
                ? 'bg-brand-teal-light text-white hover:bg-brand-teal shadow-lg' 
                : 'bg-white/10 text-white hover:bg-white/20'
        }`}
    >
        {label}
    </button>
);
