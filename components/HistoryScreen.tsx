import React from 'react';
import { useNavigate } from 'react-router-dom';

export const HistoryScreen: React.FC = () => {
    const navigate = useNavigate();

    // Mock data based on image
    const reports = [
        { date: '9.10.25', summary: 'Report lorem ipsum lorem ipsum lorem ipsum lorem.' },
        { date: '2.10.25', summary: 'Report lorem ipsum lorem ipsum lorem ipsum lorem.' },
        { date: '28.9.25', summary: 'Report lorem ipsum lorem ipsum lorem ipsum lorem.' },
        { date: '22.9.25', summary: 'Report lorem ipsum lorem ipsum lorem ipsum lorem.' },
    ];

    return (
        <div className="flex flex-col h-full px-4 pb-6 pt-2 gap-4 overflow-y-auto">
            {reports.map((report, index) => (
                <div 
                    key={index}
                    onClick={() => navigate('/reports')} // Go to report details
                    className="bg-brand-teal-dark rounded-3xl p-5 shadow-lg border-l-4 border-brand-teal hover:bg-brand-teal-dark/80 transition-colors cursor-pointer"
                >
                    <h3 className="text-white font-bold text-lg mb-1">{report.date}</h3>
                    <p className="text-brand-text-muted text-sm leading-relaxed">
                        {report.summary}
                    </p>
                </div>
            ))}
        </div>
    );
};
