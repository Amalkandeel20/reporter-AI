import React, { useState, useEffect } from 'react';
import { Plus, Play, FileText, Upload, List, Clock, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Task } from '../types';

interface HomeScreenProps {
    currentProject: string | null;
    tasks: Task[];
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ currentProject, tasks }) => {
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showPercentage, setShowPercentage] = useState(true);

    useEffect(() => {
        const timer = setInterval(() => setCurrentDate(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const formattedDate = currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + 'th'; // suffix logic simplified for demo
    const formattedTime = currentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Calculate task completion percentage
    const completedTasks = tasks.filter(task => task.completed).length;
    const totalTasks = tasks.length;
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const progressLabel = totalTasks > 0
        ? showPercentage
            ? `${completionPercentage}% Complete`
            : `${completedTasks}/${totalTasks} Tasks Complete`
        : 'No tasks yet';

    return (
        <div className="flex flex-col h-full px-4 pb-6 gap-4">
            {/* Date/Time Card */}
            <div className="bg-brand-teal-dark rounded-3xl p-6 flex flex-col items-center justify-center shadow-lg border border-brand-teal/20">
                <h2 className="text-3xl font-bold text-white">{formattedDate}</h2>
                <h3 className="text-4xl font-bold text-white mt-1">{formattedTime}</h3>
            </div>

            {/* Current Project Card */}
            <div className="bg-brand-teal-dark rounded-3xl p-6 flex flex-col gap-4 shadow-lg border border-brand-teal/20 flex-grow">
                <div className="text-center">
                    <h4 className="text-brand-text-muted text-sm font-medium uppercase tracking-wider">Current project:</h4>
                    <p className="text-white font-semibold text-lg mt-2 leading-tight">
                        {currentProject || "No project in progress"}
                    </p>
                </div>

                <div className="mt-auto">
                    <button
                        onClick={() => setShowPercentage((prev) => !prev)}
                        className="w-full bg-[#4A4A4A] rounded-full h-12 relative overflow-hidden flex items-center px-4 text-left"
                    >
                        <div
                            className="absolute left-0 top-0 bottom-0 bg-brand-teal-light rounded-full transition-all duration-500"
                            style={{ width: `${completionPercentage}%` }}
                        ></div>
                        <span className="relative z-10 text-white font-bold text-lg drop-shadow-md">
                            {progressLabel}
                        </span>
                        <span className="absolute right-2 z-10 p-1 text-white/80">
                            <RotateCw size={20} />
                        </span>
                    </button>
                </div>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-3 gap-3 mt-2">
                <ActionButton 
                    icon={<Plus size={28} />} 
                    label="Start New Report" 
                    onClick={() => navigate('/camera')} // Assuming this starts the flow
                />
                <ActionButton 
                    icon={<Play size={28} />} 
                    label="Resume Report" 
                    onClick={() => navigate('/reports')} 
                />
                <ActionButton 
                    icon={<FileText size={28} />} 
                    label="Review Report" 
                    onClick={() => navigate('/reports')} 
                />
                <ActionButton 
                    icon={<Upload size={28} />} 
                    label="Import Report" 
                    onClick={() => {}} // TODO: Open Import Modal
                />
                <ActionButton 
                    icon={<List size={28} />} 
                    label="Task List" 
                    onClick={() => navigate('/tasks')} 
                />
                <ActionButton 
                    icon={<Clock size={28} />} 
                    label="History" 
                    onClick={() => navigate('/history')} 
                />
            </div>
        </div>
    );
};

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
    <button 
        onClick={onClick}
        className="bg-brand-teal-dark aspect-square rounded-[2rem] flex flex-col items-center justify-center gap-2 text-white hover:bg-brand-teal transition-all duration-200 shadow-lg active:scale-95 p-2"
    >
        <div className="mb-1">{icon}</div>
        <span className="text-[10px] font-medium leading-tight text-center max-w-[80%]">{label}</span>
    </button>
);
