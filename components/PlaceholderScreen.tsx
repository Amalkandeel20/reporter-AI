import React from 'react';
import { useNavigate } from 'react-router-dom';

interface PlaceholderScreenProps {
    title: string;
    items: { label: string; path?: string; onClick?: () => void }[];
}

export const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({ title, items }) => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col h-full px-4 pb-6 pt-2">
            {/* Profile/Icon Placeholder - specific to some screens, generic here */}
            {title === "Settings" && (
                <div className="flex justify-center mb-6">
                    <div className="w-32 h-32 bg-brand-teal-dark rounded-full flex items-center justify-center border-4 border-brand-teal/30">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-3">
                {items.map((item, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            if (item.onClick) {
                                item.onClick();
                            } else if (item.path) {
                                navigate(item.path);
                            }
                        }}
                        className="w-full bg-brand-teal-dark hover:bg-brand-teal text-white py-4 px-6 rounded-2xl flex items-center justify-center transition-all duration-200 font-medium shadow-md"
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
};
