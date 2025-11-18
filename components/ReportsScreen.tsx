import React from 'react';
import { ReportData } from '../types';
import { FileText, Wrench, CheckCircle2 } from 'lucide-react';
import saveAs from 'file-saver';
import { generatePdf } from '../services/pdfGenerator';

interface ReportsScreenProps {
    reportData: ReportData | null;
}

const ReportPlaceholder: React.FC = () => (
    <div className="text-center text-slate-500 p-8 flex flex-col items-center justify-center h-full">
        <FileText size={64} className="mb-4" />
        <h2 className="text-xl font-bold mb-2">No Report Generated</h2>
        <p>Go to the Camera tab to upload a video and generate a new report.</p>
    </div>
);

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ reportData }) => {
    if (!reportData) {
        return <ReportPlaceholder />;
    }

    const handleDownloadPdf = async () => {
        const pdfBlob = await generatePdf(reportData);
        saveAs(pdfBlob, 'Worksite-Report.pdf');
    };

    return (
        <div className="p-4 bg-white space-y-6">
            <div className="bg-indigo-50 p-6 rounded-2xl text-center shadow-sm border border-indigo-200">
                <div className="inline-flex items-center justify-center bg-indigo-500 text-white rounded-full p-3 mb-4">
                    <Wrench size={32} />
                </div>
                <p className="text-xs uppercase tracking-widest text-indigo-700 font-semibold">{reportData.site} • {reportData.date}</p>
                <h1 className="text-2xl font-bold text-slate-800 mt-2">{reportData.projectTitle}</h1>
                <p className="text-slate-600 mt-3 text-sm">{reportData.summary}</p>
            </div>

            <div className="text-center">
                <h3 className="font-bold text-slate-700">Before & After</h3>
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                        {reportData.beforeImage ? (
                            <img
                                src={reportData.beforeImage}
                                alt="Before"
                                className="rounded-lg shadow-md w-full h-auto object-cover"
                            />
                        ) : (
                            <div className="rounded-lg shadow-inner w-full h-32 flex items-center justify-center bg-slate-100 text-xs text-slate-500 px-2 text-center">
                                No suitable before photo was identified for this job.
                            </div>
                        )}
                        <span className="text-xs font-semibold text-red-500 bg-red-100 px-2 py-0.5 rounded-full inline-block mt-2">
                            Before
                        </span>
                    </div>
                    <div>
                        {reportData.afterImage ? (
                            <img
                                src={reportData.afterImage}
                                alt="After"
                                className="rounded-lg shadow-md w-full h-auto object-cover"
                            />
                        ) : (
                            <div className="rounded-lg shadow-inner w-full h-32 flex items-center justify-center bg-slate-100 text-xs text-slate-500 px-2 text-center">
                                No suitable after photo was identified for this job.
                            </div>
                        )}
                        <span className="text-xs font-semibold text-green-500 bg-green-100 px-2 py-0.5 rounded-full inline-block mt-2">
                            After
                        </span>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-3">Tasks Completed</h3>
                <ul className="space-y-2">
                    {reportData.tasksCompleted.map((task, index) => (
                         <li key={index} className="flex items-center text-slate-600">
                            <CheckCircle2 size={18} className="text-green-500 mr-3 shrink-0" />
                            <span className="flex-grow">{task.name}</span>
                            <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{task.status}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="space-y-4">
                <h3 className="font-bold text-slate-700">Episode Highlights</h3>
                {reportData.episodes.map((episode, index) => (
                    <div key={episode.episodeData.id ?? index} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <img
                            src={episode.episodeData.highlightedFrame || episode.episodeData.thumbnail}
                            alt={`Episode ${index + 1}`}
                            className="w-full h-48 object-cover"
                        />
                        <div className="p-4 space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wide">
                                <span>Episode {index + 1}</span>
                                <span>
                                    {episode.episodeData.startTime}s – {episode.episodeData.endTime}s
                                </span>
                            </div>
                            <p className="text-sm text-slate-700">{episode.summary}</p>
                            {(episode.episodeData.detectedTools.length > 0 || episode.episodeData.keyActions.length > 0) && (
                                <div className="flex flex-wrap gap-2 text-xs">
                                    {episode.episodeData.detectedTools.map((tool) => (
                                        <span key={tool} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                                            Tool: {tool}
                                        </span>
                                    ))}
                                    {episode.episodeData.keyActions.map((action) => (
                                        <span key={action} className="px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                                            Action: {action}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={handleDownloadPdf} className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition-colors shadow-lg">
                View Full Report (PDF)
            </button>
        </div>
    );
};
