import React, { useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { AnalysisMode } from '../types';

interface CameraScreenProps {
    onGenerateReport: (videoFile: File, mode: AnalysisMode) => void;
    isProcessing: boolean;
    processingStatus: string;
    mode: AnalysisMode;
    onModeChange: (mode: AnalysisMode) => void;
}

export const CameraScreen: React.FC<CameraScreenProps> = ({
    onGenerateReport,
    isProcessing,
    processingStatus,
    mode,
    onModeChange,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modes: Array<{ id: AnalysisMode; title: string; desc: string }> = [
        { id: 'standard', title: 'Frames only', desc: 'Extract frames locally; no video upload.' },
        { id: 'demo', title: 'Demo', desc: 'Send frames + video; Gemini guided by timestamps.' },
        { id: 'full', title: 'Full AI', desc: 'Send video only; let Gemini find segments.' },
    ];

    const handleCameraClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onGenerateReport(file, mode);
        }
    };

    return (
        <div className="h-full bg-black flex flex-col items-center justify-center text-white p-4">
            {isProcessing ? (
                <div className="flex flex-col items-center gap-4 text-center">
                    <Loader2 className="animate-spin text-orange-500" size={64} />
                    <h2 className="text-2xl font-bold">Processing Video...</h2>
                    <p className="text-slate-300">{processingStatus}</p>
                </div>
            ) : (
                <>
                    <div className="w-full max-w-sm mb-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
                        <p className="text-white font-semibold mb-2">Analysis Mode</p>
                        <div className="grid grid-cols-3 gap-2">
                            {modes.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => onModeChange(m.id)}
                                    disabled={isProcessing}
                                    className={`text-left rounded-xl border px-2 py-2 transition ${
                                        mode === m.id
                                            ? 'border-orange-500 bg-orange-500/10 text-white'
                                            : 'border-slate-700 bg-slate-800 text-slate-300'
                                    } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <div className="text-sm font-semibold">{m.title}</div>
                                    <div className="text-[11px] text-slate-400 leading-tight">{m.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="video/*"
                    />
                    <button
                        onClick={handleCameraClick}
                        className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center hover:bg-orange-600 transition-colors shadow-lg"
                    >
                        <Camera size={48} />
                    </button>
                    <p className="mt-4 text-slate-400">Tap to upload a video</p>
                </>
            )}
        </div>
    );
};
