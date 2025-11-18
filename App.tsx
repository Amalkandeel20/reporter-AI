import React, { useState, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { TasksScreen } from './components/TasksScreen';
import { CameraScreen } from './components/CameraScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { Task, ReportData } from './types';
import { initialTasks } from './constants';
import { generateReport } from './services/reportGenerator';

const AppContent: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>(initialTasks);
    const [autoSyncTasks, setAutoSyncTasks] = useState(true);
    const nextTaskId = useRef(initialTasks.length + 1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const navigate = useNavigate();

    const handleTaskToggle = (id: number) => {
        setTasks(prevTasks =>
            prevTasks.map(task =>
                task.id === id ? { ...task, completed: !task.completed } : task
            )
        );
    };

    const handleAddTask = useCallback((title: string, description: string) => {
        setTasks(prevTasks => [
            ...prevTasks,
            {
                id: nextTaskId.current++,
                title,
                description,
                completed: false,
            },
        ]);
    }, []);

    const handleGenerateReport = useCallback(async (videoFile: File) => {
        setIsProcessing(true);
        try {
            const newReport = await generateReport(videoFile, (status) => setProcessingStatus(status));
            setReportData(newReport);
            if (autoSyncTasks && newReport.tasksCompleted.length) {
                setTasks(prevTasks => {
                    const existingByTitle = new Map(
                        prevTasks.map(task => [task.title.trim().toLowerCase(), task] as const)
                    );

                    const mergedTasks = prevTasks.map(task => {
                        const aiMatch = newReport.tasksCompleted.find(
                            aiTask => aiTask.name.trim().toLowerCase() === task.title.trim().toLowerCase()
                        );
                        if (!aiMatch) {
                            return task;
                        }
                        return {
                            ...task,
                            completed: aiMatch.status === 'Completed',
                            description: task.description || 'Captured from Gemini report analysis.',
                        };
                    });

                    const aiTasksToAdd = newReport.tasksCompleted
                        .filter(task => !existingByTitle.has(task.name.trim().toLowerCase()))
                        .map(task => ({
                            id: nextTaskId.current++,
                            title: task.name,
                            description: 'Captured from Gemini report analysis.',
                            completed: task.status === 'Completed',
                        }));

                    return [...mergedTasks, ...aiTasksToAdd];
                });
            }
            navigate('/reports');
        } catch (error) {
            console.error("Failed to generate report:", error);
            alert("Error generating report. Please check the console for details.");
        } finally {
            setIsProcessing(false);
            setProcessingStatus('');
        }
    }, [navigate]);

    return (
        <div className="flex justify-center items-center min-h-screen bg-black font-sans">
            <div className="w-[390px] h-[844px] bg-slate-800 rounded-[50px] shadow-2xl overflow-hidden flex flex-col relative border-4 border-slate-600">
                <Header />
                <main className="flex-grow overflow-y-auto bg-slate-200">
                    <Routes>
                        <Route
                            path="/"
                            element={
                                <TasksScreen
                                    tasks={tasks}
                                    onTaskToggle={handleTaskToggle}
                                    onAddTask={handleAddTask}
                                    autoSyncEnabled={autoSyncTasks}
                                    onToggleAutoSync={() => setAutoSyncTasks(prev => !prev)}
                                />
                            }
                        />
                        <Route path="/camera" element={<CameraScreen onGenerateReport={handleGenerateReport} isProcessing={isProcessing} processingStatus={processingStatus} />} />
                        <Route path="/reports" element={<ReportsScreen reportData={reportData} />} />
                    </Routes>
                </main>
                <BottomNav />
            </div>
        </div>
    );
};

const App: React.FC = () => (
    <HashRouter>
        <AppContent />
    </HashRouter>
);

export default App;
