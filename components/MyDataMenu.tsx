import React from 'react';

const pillClass =
    'w-full bg-[#023743] hover:bg-[#06495a] text-white py-3 px-6 rounded-full text-base font-semibold shadow-lg transition-colors active:scale-95';

export const MyDataMenu: React.FC = () => {
    const actions = [
        { label: 'Account Data' },
        { label: 'Saved Files' },
        { label: 'Clear Cache / Data' },
        { label: 'Connected Databases' },
        { label: 'Privacy Statement' },
    ];

    return (
        <div className="absolute inset-0 flex items-start justify-center px-6 pt-4">
            <div className="w-full max-w-md bg-[#3a3534] rounded-3xl p-4 space-y-3 shadow-2xl">
                <div className="space-y-3">
                    {actions.map((action) => (
                        <button key={action.label} className={pillClass}>
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
