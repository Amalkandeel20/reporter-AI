import React from 'react';
import { useNavigate } from 'react-router-dom';

const pillClass =
    'w-full bg-[#023743] hover:bg-[#06495a] text-white py-3 px-6 rounded-full text-base font-semibold shadow-lg transition-colors active:scale-95';

export const SettingsMenu: React.FC = () => {
    const navigate = useNavigate();

    const actions = [
        { label: 'Accessibility & Language', onClick: () => navigate('/settings/accessibility') },
        { label: 'Account Settings' },
        { label: 'Notifications' },
        { label: 'Device Settings' },
        { label: 'Gestures & Controls' },
        { label: 'Data Management' },
    ];

    return (
        <div className="absolute inset-0 flex items-start justify-center px-6 pt-4">
            <div className="w-full max-w-md bg-[#3a3534] rounded-3xl p-4 space-y-3 shadow-2xl">
                <div className="space-y-3">
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            className={pillClass}
                            onClick={action.onClick}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
