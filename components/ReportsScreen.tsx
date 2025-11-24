import React from 'react';
import { ReportData } from '../types';
import { FileText, Download, Play, Edit } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';

interface ReportsScreenProps {
    reportData: ReportData | null;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ reportData }) => {
    // If no report data, show empty state
    if (!reportData) {
        return (
            <div className="flex flex-col h-full px-4 pb-6 pt-2 items-center justify-center text-center">
                <FileText size={64} className="text-slate-600 mb-4" />
                <h2 className="text-white font-bold text-xl mb-2">No Report Available</h2>
                <p className="text-slate-400 mb-8">
                    Generate a report from the Camera screen to view analysis results here.
                </p>
            </div>
        );
    }

    const displayData = reportData;

    const handleDownloadPdf = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - (margin * 2);

        // Brand colors
        const brandTeal: [number, number, number] = [13, 148, 136];
        const brandTealLight: [number, number, number] = [77, 182, 172];
        const darkGray: [number, number, number] = [51, 65, 85];
        const lightGray: [number, number, number] = [241, 245, 249];

        // Helper for centered text
        const centerText = (text: string, y: number, size: number = 12, isBold: boolean = false) => {
            doc.setFontSize(size);
            doc.setFont("helvetica", isBold ? "bold" : "normal");
            const textWidth = doc.getTextWidth(text);
            doc.text(text, (pageWidth - textWidth) / 2, y);
        };

        // Helper for adding a styled section header with accent bar
        const addSectionHeader = (text: string, y: number, color: [number, number, number] = brandTeal) => {
            // Accent bar on left
            doc.setFillColor(...color);
            doc.rect(margin, y - 7, 3, 10, 'F');
            
            // Background
            doc.setFillColor(...lightGray);
            doc.rect(margin + 5, y - 7, contentWidth - 5, 10, 'F');
            
            // Text
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...darkGray);
            doc.text(text, margin + 10, y);
            
            doc.setTextColor(0, 0, 0);
            return y + 12;
        };

        // Helper for bordered box
        const addInfoBox = (label: string, value: string, x: number, y: number, width: number) => {
            doc.setDrawColor(...brandTeal);
            doc.setLineWidth(0.5);
            doc.rect(x, y, width, 12);
            
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(100, 100, 100);
            doc.text(label, x + 3, y + 5);
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(0, 0, 0);
            doc.text(value, x + 3, y + 10);
        };

        // --- HEADER with gradient effect ---
        doc.setFillColor(...brandTeal);
        doc.rect(0, 0, pageWidth, 45, 'F');
        
        // Add subtle accent line
        doc.setFillColor(...brandTealLight);
        doc.rect(0, 42, pageWidth, 3, 'F');
        
        doc.setTextColor(255, 255, 255);
        centerText("WORKSITE REPORTER AI", 18, 24, true);
        centerText("Professional Site Documentation", 30, 11, false);
        
        // Add decorative corner elements
        doc.setFillColor(255, 255, 255);
        (doc as any).setGState((doc as any).GState({opacity: 0.2}));
        doc.circle(10, 10, 15, 'F');
        doc.circle(pageWidth - 10, 10, 15, 'F');
        (doc as any).setGState((doc as any).GState({opacity: 1}));

        doc.setTextColor(0, 0, 0);
        let yPos = 60;

        // --- PROJECT INFO BOXES ---
        const boxWidth = (contentWidth - 10) / 2;
        addInfoBox("PROJECT", displayData.projectTitle || "Worksite Activity", margin, yPos, boxWidth);
        addInfoBox("DATE", displayData.date || new Date().toLocaleDateString(), margin + boxWidth + 10, yPos, boxWidth);
        
        yPos += 25;

        // --- EXECUTIVE SUMMARY ---
        yPos = addSectionHeader("EXECUTIVE SUMMARY", yPos);
        
        // Summary box with border
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        const summaryHeight = Math.min(doc.splitTextToSize(displayData.summary, contentWidth - 12).length * 5 + 10, 40);
        doc.roundedRect(margin, yPos, contentWidth, summaryHeight, 2, 2);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const splitSummary = doc.splitTextToSize(displayData.summary, contentWidth - 12);
        doc.text(splitSummary, margin + 6, yPos + 7);
        yPos += summaryHeight + 15;

        // --- SITE CONDITION (Before/After) ---
        if (displayData.beforeImage || displayData.afterImage) {
            if (yPos > pageHeight - 110) { doc.addPage(); yPos = 20; }
            
            yPos = addSectionHeader("SITE CONDITION", yPos, [239, 68, 68]); // Red accent
            
            const imgWidth = (contentWidth - 15) / 2;
            const imgHeight = imgWidth * 0.7;

            if (displayData.beforeImage) {
                try {
                    // Label with background
                    doc.setFillColor(239, 68, 68);
                    doc.rect(margin, yPos, 30, 8, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "bold");
                    doc.text("BEFORE", margin + 3, yPos + 5.5);
                    
                    // Image with border
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.5);
                    doc.rect(margin, yPos + 10, imgWidth, imgHeight);
                    doc.addImage(displayData.beforeImage, 'JPEG', margin + 1, yPos + 11, imgWidth - 2, imgHeight - 2);
                } catch (e) { console.error("Before img error", e); }
            }

            if (displayData.afterImage) {
                try {
                    // Label with background
                    doc.setFillColor(34, 197, 94);
                    doc.rect(margin + imgWidth + 15, yPos, 28, 8, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "bold");
                    doc.text("AFTER", margin + imgWidth + 18, yPos + 5.5);
                    
                    // Image with border
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.5);
                    doc.rect(margin + imgWidth + 15, yPos + 10, imgWidth, imgHeight);
                    doc.addImage(displayData.afterImage, 'JPEG', margin + imgWidth + 16, yPos + 11, imgWidth - 2, imgHeight - 2);
                } catch (e) { console.error("After img error", e); }
            }
            
            doc.setTextColor(0, 0, 0);
            yPos += imgHeight + 25;
        }

        // --- ACTIVITY LOG ---
        if (displayData.episodes && displayData.episodes.length > 0) {
            if (yPos > pageHeight - 70) { doc.addPage(); yPos = 20; }

            yPos = addSectionHeader("ACTIVITY LOG", yPos, [99, 102, 241]); // Blue accent
            yPos += 5;

            displayData.episodes.forEach((ep: any, index: number) => {
                if (yPos > pageHeight - 65) { doc.addPage(); yPos = 20; }

                // Episode card with border
                doc.setDrawColor(220, 220, 220);
                doc.setLineWidth(0.3);
                const cardStartY = yPos;
                
                // Episode number badge
                doc.setFillColor(99, 102, 241);
                doc.circle(margin + 8, yPos + 8, 8, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.setFont("helvetica", "bold");
                doc.text(`${index + 1}`, margin + (index + 1 > 9 ? 5 : 6.5), yPos + 10.5);
                
                // Episode title and time
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(11);
                doc.text(`Episode ${index + 1}`, margin + 20, yPos + 10);
                
                if (ep.episodeData?.startTime !== undefined) {
                    doc.setFontSize(8);
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(120, 120, 120);
                    doc.text(`${ep.episodeData.startTime}s - ${ep.episodeData.endTime}s`, margin + 55, yPos + 10);
                }
                
                yPos += 18;
                doc.setTextColor(0, 0, 0);

                // Content with thumbnail
                if (ep.episodeData?.thumbnail) {
                    try {
                        const thumbWidth = 55;
                        const thumbHeight = 42;
                        
                        // Thumbnail with border
                        doc.setDrawColor(200, 200, 200);
                        doc.rect(margin + 5, yPos, thumbWidth, thumbHeight);
                        doc.addImage(ep.episodeData.thumbnail, 'JPEG', margin + 6, yPos + 1, thumbWidth - 2, thumbHeight - 2);
                        
                        // Summary text
                        doc.setFontSize(9);
                        doc.setFont("helvetica", "normal");
                        const epSummary = doc.splitTextToSize(ep.summary, contentWidth - thumbWidth - 15);
                        doc.text(epSummary, margin + thumbWidth + 12, yPos + 5);
                        
                        const contentHeight = Math.max(thumbHeight, epSummary.length * 4.5);
                        yPos += contentHeight + 8;
                    } catch (e) {
                        doc.setFontSize(9);
                        const epSummary = doc.splitTextToSize(ep.summary, contentWidth - 15);
                        doc.text(epSummary, margin + 8, yPos + 3);
                        yPos += (epSummary.length * 4.5) + 8;
                    }
                } else {
                    doc.setFontSize(9);
                    const epSummary = doc.splitTextToSize(ep.summary, contentWidth - 15);
                    doc.text(epSummary, margin + 8, yPos + 3);
                    yPos += (epSummary.length * 4.5) + 8;
                }
                
                // Draw card border
                doc.roundedRect(margin, cardStartY, contentWidth, yPos - cardStartY, 2, 2);
                yPos += 8;
            });
        }

        // --- FOOTER with branding ---
        const pageCount = doc.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            // Footer line
            doc.setDrawColor(...brandTeal);
            doc.setLineWidth(0.5);
            doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
            
            // Footer text
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(120, 120, 120);
            doc.text(`Generated by Worksite Reporter AI • ${new Date().toLocaleDateString()}`, margin, pageHeight - 8);
            
            doc.setFont("helvetica", "bold");
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, pageHeight - 8);
        }

        doc.save("worksite-report.pdf");
    };

    return (
        <div className="absolute inset-0 flex flex-col px-4 pb-32 pt-2 overflow-y-auto">
            {/* Report Card */}
            <div className="bg-white rounded-3xl shadow-xl mb-4">
                {/* Header */}
                <div className="bg-brand-teal-dark p-4 text-center rounded-t-3xl">
                    <h2 className="text-white font-bold text-lg">{displayData.projectTitle || "Worksite Report"}</h2>
                    <p className="text-brand-teal-light text-xs font-medium">{displayData.date || new Date().toLocaleDateString()}</p>
                </div>

                {/* Content */}
                <div className="p-6 text-brand-dark">
                    <p className="text-sm leading-relaxed text-center mb-6 font-medium text-gray-600">
                        {displayData.summary}
                    </p>

                    {/* Before / After Photos */}
                    {(displayData.beforeImage || displayData.afterImage) && (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {displayData.beforeImage && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-bold uppercase text-slate-500">Before</span>
                                    <img src={displayData.beforeImage} alt="Before" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                                </div>
                            )}
                            {displayData.afterImage && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-bold uppercase text-slate-500">After</span>
                                    <img src={displayData.afterImage} alt="After" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Render Episodes */}
                    {displayData.episodes && displayData.episodes.length > 0 ? (
                        <div className="space-y-6">
                            <h3 className="font-bold text-slate-700 text-center">Episode Highlights</h3>
                            {displayData.episodes.map((episode: any, index: number) => (
                                <div key={index} className="bg-slate-50 rounded-xl overflow-hidden border border-slate-100 shadow-sm">
                                    {episode.episodeData?.thumbnail && (
                                        <img
                                            src={episode.episodeData.thumbnail}
                                            alt={`Episode ${index + 1}`}
                                            className="w-full h-40 object-cover"
                                        />
                                    )}
                                    <div className="p-4 space-y-2">
                                        <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wide">
                                            <span>Episode {index + 1}</span>
                                            {episode.episodeData?.startTime !== undefined && (
                                                <span>{episode.episodeData.startTime}s – {episode.episodeData.endTime}s</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-700">{episode.summary}</p>
                                        
                                        {/* Tools & Actions Tags */}
                                        {(episode.episodeData?.detectedTools?.length > 0 || episode.episodeData?.keyActions?.length > 0) && (
                                            <div className="flex flex-wrap gap-2 text-xs mt-2">
                                                {episode.episodeData.detectedTools?.map((tool: string) => (
                                                    <span key={tool} className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                                                        {tool}
                                                    </span>
                                                ))}
                                                {episode.episodeData.keyActions?.map((action: string) => (
                                                    <span key={action} className="px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                                                        {action}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-slate-500 text-sm italic">No episodes recorded.</p>
                    )}
                </div>
            </div>

            {/* Action Buttons Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <ActionButton label="Edit Report" />
                <ActionButton label="View Full Report" variant="primary" onClick={handleDownloadPdf} />
                <ActionButton label="Resume Report" />
                <ActionButton label="Export Report" onClick={handleDownloadPdf} />
            </div>
        </div>
    );
};

const ActionButton: React.FC<{ label: string; variant?: 'default' | 'primary'; onClick?: () => void }> = ({ label, variant = 'default', onClick }) => (
    <button 
        onClick={onClick}
        className={`
        py-4 px-2 rounded-2xl font-bold text-sm transition-all shadow-lg
        ${variant === 'primary' 
            ? 'bg-brand-teal-light text-white hover:bg-brand-teal' 
            : 'bg-brand-teal-dark text-white hover:bg-brand-teal'}
    `}>
        {label}
    </button>
);
