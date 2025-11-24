import React, { useState, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { TasksScreen } from './components/TasksScreen';
import { CameraScreen } from './components/CameraScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { HomeScreen } from './components/HomeScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { PlaceholderScreen } from './components/PlaceholderScreen';
import { BurgerMenu } from './components/BurgerMenu';
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
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    const navigate = useNavigate();
    const location = useLocation();

    // Determine if we are on the home screen to adjust layout/header
    const isHome = location.pathname === '/';

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
            
            // Auto-sync tasks from report if enabled
            if (autoSyncTasks && newReport.tasksCompleted && newReport.tasksCompleted.length > 0) {
                // Clear existing tasks and add new ones from the report
                const newTasks = newReport.tasksCompleted.map((task, index) => ({
                    id: index + 1,
                    title: task.name,
                    description: `Auto-generated from ${newReport.projectTitle || 'report'} on ${newReport.date}`,
                    completed: task.status === 'Completed',
                }));
                
                // Reset the task list with only the new tasks
                setTasks(newTasks);
                // Update the next task ID counter
                nextTaskId.current = newTasks.length + 1;
            } else if (autoSyncTasks) {
                // If auto-sync is enabled but no tasks in report, clear the list
                setTasks([]);
                nextTaskId.current = 1;
            }
            
            navigate('/reports');
        } catch (error) {
            console.error("Failed to generate report:", error);
            alert("Error generating report. Please check the console for details.");
        } finally {
            setIsProcessing(false);
            setProcessingStatus('');
        }
    }, [navigate, autoSyncTasks]);

    return (
        <div className="flex justify-center items-center min-h-screen bg-black font-sans">
            <div className="w-[390px] h-[844px] bg-brand-dark rounded-[50px] shadow-2xl overflow-hidden flex flex-col relative border-4 border-slate-700">
                
                <Header 
                    onMenuClick={() => setIsMenuOpen(true)} 
                    showClose={!isHome}
                    onCloseClick={() => navigate('/')}
                />

                <main className="flex-grow overflow-hidden relative">
                    <Routes>
                        <Route path="/" element={<HomeScreen currentProject={reportData?.projectTitle || null} tasks={tasks} />} />
                        <Route
                            path="/tasks"
                            element={
                                <TasksScreen
                                    tasks={tasks}
                                    onTaskToggle={handleTaskToggle}
                                    onAddTask={handleAddTask}
                                    onDeleteTask={(id) => setTasks(prev => prev.filter(t => t.id !== id))}
                                    autoSyncEnabled={autoSyncTasks}
                                    onToggleAutoSync={() => setAutoSyncTasks(prev => !prev)}
                                />
                            }
                        />
                        <Route path="/camera" element={<CameraScreen onGenerateReport={handleGenerateReport} isProcessing={isProcessing} processingStatus={processingStatus} />} />
                        <Route path="/reports" element={<ReportsScreen reportData={reportData} />} />
                        <Route path="/history" element={<HistoryScreen />} />
                        
                        {/* Placeholder Routes */}
                        <Route path="/devices" element={<PlaceholderScreen title="Connected Devices" items={[{label: 'Connect New Device'}, {label: 'Device 1'}, {label: 'Device 2'}]} />} />
                        <Route path="/settings" element={<PlaceholderScreen title="Settings" items={[
                            {label: 'Accessibility & Language'}, 
                            {label: 'Account Settings'}, 
                            {label: 'Notifications'},
                            {label: 'Connect Database (Mock)', onClick: () => alert('Database Connected Successfully (Mock)')}
                        ]} />} />
                        <Route path="/support" element={<PlaceholderScreen title="Support" items={[{label: 'Support Chatbot'}, {label: 'Contact Support'}]} />} />
                    </Routes>
                </main>

                <BurgerMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
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
