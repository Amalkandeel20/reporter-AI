import React, { useState } from 'react';
import { Task } from '../types';
import { Check, Plus, Edit2, Trash2, ChevronDown } from 'lucide-react';
import { Modal, ModalButton } from './Modal';

interface TaskItemProps {
    task: Task;
    onToggle: (id: number) => void;
    onDelete: (id: number) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onToggle, onDelete }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-[#6B7A90] rounded-xl p-4 text-white shadow-md">
            <div className="flex items-center justify-between gap-3" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold break-words">{task.title}</h3>
                    {!isOpen && task.description && (
                        <p className="text-sm text-slate-300 truncate">{task.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${task.completed ? 'bg-green-500' : 'bg-slate-500'}`}
                        aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                    >
                        {task.completed && <Check size={20} />}
                    </button>
                    <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown size={24} />
                    </div>
                </div>
            </div>
            {isOpen && (
                <div className="mt-3 pt-3 border-t border-slate-500/50">
                    {task.description && (
                        <p className="text-sm text-slate-200 whitespace-pre-line mb-3">{task.description}</p>
                    )}
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                        className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-medium"
                    >
                        <Trash2 size={16} /> Delete
                    </button>
                </div>
            )}
        </div>
    );
};

interface TasksScreenProps {
    tasks: Task[];
    onTaskToggle: (id: number) => void;
    onAddTask: (title: string, description: string) => void;
    onDeleteTask: (id: number) => void;
    autoSyncEnabled: boolean;
    onToggleAutoSync: () => void;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({ tasks, onTaskToggle, onAddTask, onDeleteTask }) => {
    const [isModifyMode, setIsModifyMode] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDesc, setNewTaskDesc] = useState('');

    const handleAddNew = () => {
        if (newTaskTitle.trim()) {
            onAddTask(newTaskTitle, newTaskDesc);
            setNewTaskTitle('');
            setNewTaskDesc('');
            setIsAddModalOpen(false);
        }
    };

    return (
        <div className="flex flex-col h-full px-4 pb-20 pt-2 relative">
            {/* Task List */}
            <div className="flex flex-col gap-3 overflow-y-auto pb-24">
                {tasks.map(task => (
                    <div key={task.id}>
                        {isModifyMode ? (
                            <div className="bg-brand-teal-dark rounded-3xl p-5 shadow-lg flex items-center justify-between opacity-90">
                                <div className="flex-1 pr-4">
                                    <h3 className="text-white font-bold text-lg mb-1">{task.title}</h3>
                                    <p className="text-brand-text-muted text-sm leading-snug line-clamp-2">
                                        {task.description}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => onDeleteTask(task.id)}
                                    className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-red-500 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                >
                                    <Trash2 size={24} />
                                </button>
                            </div>
                        ) : (
                            <TaskItem 
                                task={task} 
                                onToggle={onTaskToggle} 
                                onDelete={onDeleteTask}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Floating Action Buttons or Modify Menu */}
            {!isModifyMode ? (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 px-4">
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex-1 bg-brand-teal-dark hover:bg-brand-teal text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 transition-all"
                    >
                        <Plus size={20} /> Add New Task
                    </button>
                    <button 
                        onClick={() => setIsModifyMode(true)}
                        className="flex-1 bg-brand-teal-dark hover:bg-brand-teal text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-2 transition-all"
                    >
                        <Edit2 size={20} /> Modify Tasks
                    </button>
                </div>
            ) : (
                <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-md p-6 rounded-t-3xl animate-in slide-in-from-bottom">
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setIsModifyMode(false)}
                            className="flex-1 bg-brand-teal-dark hover:bg-brand-teal text-white py-4 rounded-2xl font-bold"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Add Task Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Task">
                <div className="flex flex-col gap-4">
                    <input 
                        type="text" 
                        placeholder="Task Title" 
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl p-3 text-white placeholder-white/40 focus:outline-none focus:border-brand-teal"
                    />
                    <textarea 
                        placeholder="Description" 
                        value={newTaskDesc}
                        onChange={e => setNewTaskDesc(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-xl p-3 text-white placeholder-white/40 focus:outline-none focus:border-brand-teal h-24 resize-none"
                    />
                    <ModalButton label="Add Task" onClick={handleAddNew} />
                </div>
            </Modal>
        </div>
    );
};
