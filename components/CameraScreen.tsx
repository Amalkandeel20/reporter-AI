import React, { useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';

interface CameraScreenProps {
    onGenerateReport: (videoFile: File) => void;
    isProcessing: boolean;
    processingStatus: string;
    demoMode: boolean;
    onToggleDemoMode: () => void;
}

export const CameraScreen: React.FC<CameraScreenProps> = ({
    onGenerateReport,
    isProcessing,
    processingStatus,
    demoMode,
    onToggleDemoMode,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCameraClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onGenerateReport(file);
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
                    <div className="w-full max-w-sm mb-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 pr-4">
                                <p className="text-white font-semibold">Demo Mode</p>
                                <p className="text-xs text-slate-400">
                                    Uploads the full video to Gemini for native analysis (experimental).
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onToggleDemoMode}
                                disabled={isProcessing}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                                    demoMode ? 'bg-orange-500' : 'bg-slate-600'
                                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                        demoMode ? 'translate-x-5' : 'translate-x-1'
                                    }`}
                                />
                            </button>
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
