import React, { useState } from 'react';
import { Task } from '../types';
import { ChevronDown, Check } from 'lucide-react';

interface TaskItemProps {
    task: Task;
    onToggle: (id: number) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onToggle }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-[#6B7A90] rounded-xl p-4 text-white shadow-md">
            <div className="flex items-center justify-between" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex-grow">
                    <h3 className="font-bold">{task.title}</h3>
                    {!isOpen && task.description && (
                        <p className="text-sm text-slate-300 truncate">{task.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-4">
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
            {isOpen && task.description && (
                <div className="mt-3 pt-3 border-t border-slate-500/50">
                    <p className="text-sm text-slate-200 whitespace-pre-line">{task.description}</p>
                </div>
            )}
        </div>
    );
};

interface TaskFormProps {
    onAddTask: (title: string, description: string) => void;
    autoSyncEnabled: boolean;
}

const TaskForm: React.FC<TaskFormProps> = ({ onAddTask, autoSyncEnabled }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        if (!trimmedTitle) {
            return;
        }
        onAddTask(trimmedTitle, trimmedDescription);
        setTitle('');
        setDescription('');
        setIsExpanded(false);
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-slate-700">Add a task</h3>
                    {!autoSyncEnabled && (
                        <p className="text-xs text-slate-500 mt-1">
                            Auto-generated tasks are paused. Use this form to track work manually.
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setIsExpanded(prev => !prev)}
                    className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                >
                    {isExpanded ? 'Hide details' : 'Add details'}
                </button>
            </div>
            <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-700"
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
            />
            {isExpanded && (
                <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-700 h-20 resize-none"
                    placeholder="Notes or steps to complete"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            )}
            <button
                type="submit"
                className="w-full bg-orange-500 text-white font-semibold py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60"
                disabled={!title.trim()}
            >
                Save task
            </button>
        </form>
    );
};

interface TasksScreenProps {
    tasks: Task[];
    onTaskToggle: (id: number) => void;
    onAddTask: (title: string, description: string) => void;
    autoSyncEnabled: boolean;
    onToggleAutoSync: () => void;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
    tasks,
    onTaskToggle,
    onAddTask,
    autoSyncEnabled,
    onToggleAutoSync,
}) => {
    const completedCount = tasks.filter(t => t.completed).length;
    const totalCount = tasks.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <div className="p-4 space-y-4 bg-slate-300 h-full pb-28">
            <div className="bg-white border border-slate-200 rounded-xl shadow-md p-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-700">Auto-capture tasks from reports</p>
                    <p className="text-xs text-slate-500">
                        {autoSyncEnabled
                            ? 'New Gemini reports will add and update tasks for you.'
                            : 'Tasks will only change when you edit them here.'}
                    </p>
                </div>
                <button
                    onClick={onToggleAutoSync}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoSyncEnabled ? 'bg-green-500' : 'bg-slate-400'
                    }`}
                    aria-pressed={autoSyncEnabled}
                    type="button"
                >
                    <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                            autoSyncEnabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            <TaskForm onAddTask={onAddTask} autoSyncEnabled={autoSyncEnabled} />

            {tasks.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-400 rounded-xl p-6 text-center text-slate-600">
                    <p className="font-semibold text-slate-700">No tasks yet</p>
                    <p className="text-sm mt-1">
                        Add tasks manually or upload a worksite video to let Gemini suggest activity-based items.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map(task => (
                        <TaskItem key={task.id} task={task} onToggle={onTaskToggle} />
                    ))}
                </div>
            )}

            <div className="bg-[#6B7A90] rounded-xl p-4 text-white shadow-md">
                <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">Task Progress</span>
                    <span className="text-sm">{completedCount} / {totalCount} Tasks Complete</span>
                </div>
                <div className="w-full bg-slate-500 rounded-full h-2.5">
                    <div className="bg-orange-500 h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
        </div>
    );
};
