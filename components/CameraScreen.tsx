import React, { useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';

interface CameraScreenProps {
    onGenerateReport: (videoFile: File) => void;
    isProcessing: boolean;
    processingStatus: string;
}

export const CameraScreen: React.FC<CameraScreenProps> = ({ onGenerateReport, isProcessing, processingStatus }) => {
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
