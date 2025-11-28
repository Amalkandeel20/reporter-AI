import React, { useEffect, useState, useRef } from 'react';
import { ReportData, ReportEditTurn } from '../types';
import { FileText, MessageCircle, Send, ShieldCheck, Loader2, Trash2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { editReportWithGemini, deleteGeminiFile, pickFramesForEpisode } from '../services/geminiService';

const mergeReportMedia = (base: ReportData, updated: ReportData): ReportData => {
    const safeImage = (candidate?: string) =>
        candidate && candidate !== '[omitted]' ? candidate : undefined;

    const pickFrameForEpisode = (episode: any): string => {
        const frames = base.candidateFrames ?? [];
        if (!frames.length) {
            return (
                safeImage(base.beforeImage) ??
                safeImage(base.afterImage) ??
                safeImage(base.episodes[0]?.episodeData?.thumbnail) ??
                ''
            );
        }
        const times = base.candidateFrameTimes ?? [];
        const targetTime =
            typeof episode?.episodeData?.startTime === 'number' &&
            typeof episode?.episodeData?.endTime === 'number'
                ? (episode.episodeData.startTime + episode.episodeData.endTime) / 2
                : times.length
                    ? times[Math.floor(times.length / 2)]
                    : 0;

        if (!times.length) {
            return frames[Math.min(Math.max(Math.floor(frames.length / 2), 0), frames.length - 1)];
        }

        let bestIndex = 0;
        let bestDelta = Math.abs(times[0] - targetTime);
        for (let i = 1; i < times.length; i++) {
            const delta = Math.abs(times[i] - targetTime);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestIndex = i;
            }
        }
        return frames[bestIndex] ?? frames[0];
    };

    const defaultThumb = pickFrameForEpisode(updated.episodes[0] ?? base.episodes[0]);
    const defaultHighlight =
        safeImage(base.episodes[0]?.episodeData?.highlightedFrame) ??
        defaultThumb ??
        '';

    const mergedEpisodes = updated.episodes.map((episode, idx) => {
        const baseEp = base.episodes[idx];
        const baseData = baseEp?.episodeData;
        const updatedData = episode.episodeData;

        const mergedEpisodeData = {
            ...(baseData || updatedData || {}),
            ...updatedData,
            thumbnail:
                safeImage(updatedData?.thumbnail) ??
                baseData?.thumbnail ??
                defaultThumb ??
                '',
            highlightedFrame:
                safeImage(updatedData?.highlightedFrame) ??
                baseData?.highlightedFrame ??
                defaultHighlight ??
                '',
        };

        return {
            ...episode,
            episodeData: mergedEpisodeData,
        };
    });

    return {
        ...base,
        ...updated,
        beforeImage: safeImage(updated.beforeImage) ?? base.beforeImage,
        afterImage: safeImage(updated.afterImage) ?? base.afterImage,
        episodes: mergedEpisodes,
        geminiVideo: base.geminiVideo ?? updated.geminiVideo ?? null,
        demoMode: base.demoMode ?? updated.demoMode,
        candidateFrames: base.candidateFrames ?? updated.candidateFrames ?? [],
        candidateFrameTimes: base.candidateFrameTimes ?? updated.candidateFrameTimes ?? [],
    };
};

interface ReportsScreenProps {
    reportData: ReportData | null;
    onUpdateReport?: (report: ReportData | null) => void;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ reportData, onUpdateReport }) => {
    const [view, setView] = useState<'preview' | 'chat'>('preview');
    const [chatTurns, setChatTurns] = useState<ReportEditTurn[]>([]);
    const [input, setInput] = useState('');
    const [draftReport, setDraftReport] = useState<ReportData | null>(reportData);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [isFinishing, setIsFinishing] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null); // seconds remaining for auto-clear

    // Check if session is cleared from the report data (persists across navigation)
    const sessionCleared = reportData?.sessionCleared ?? false;

    // Track if component is mounted to prevent auto-finalize on initial load
    const isMountedRef = useRef(false);
    const skipFirstCleanupRef = useRef(import.meta.env.DEV); // React StrictMode double-invokes effects in dev
    const latestDraftRef = useRef<ReportData | null>(draftReport);
    const latestSessionClearedRef = useRef(sessionCleared);
    const latestVideoRef = useRef(reportData?.geminiVideo ?? null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        setDraftReport(reportData);
        setChatTurns(
            reportData
                ? [
                    {
                        role: 'assistant',
                        content:
                            'Tell me what to adjust. I will only add items that are clearly visible in the video and will refuse anything else.',
                    },
                ]
                : []
        );
        setInput('');
        setError('');
        setView('preview');
        setTimeLeft(null); // reset timer for a new report
        
        // Mark as mounted after first render
        isMountedRef.current = true;
    }, [reportData]);

    // Start the 10-minute timer on first entry into Chat (do not reset when switching views)
    useEffect(() => {
        if (sessionCleared) {
            setTimeLeft(null);
            return;
        }
        if (view === 'chat' && timeLeft === null) {
            setTimeLeft(10 * 60); // 10 minutes in seconds
        }
    }, [view, sessionCleared, timeLeft]);

    // Drive the countdown tick
    useEffect(() => {
        if (timeLeft === null || sessionCleared) {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
            }
            return;
        }

        if (!countdownRef.current) {
            countdownRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev === null) return null;
                    return Math.max(prev - 1, 0);
                });
            }, 1000);
        }

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
            }
        };
    }, [timeLeft, sessionCleared]);

    // Auto-finish when countdown hits zero
    useEffect(() => {
        if (timeLeft === 0 && !sessionCleared && !isFinishing) {
            handleFinishAndClear(true);
            setTimeLeft(null);
        }
    }, [timeLeft, sessionCleared, isFinishing]);

    // Keep refs in sync so the unmount cleanup uses the latest data
    useEffect(() => {
        latestDraftRef.current = draftReport;
    }, [draftReport]);

    useEffect(() => {
        latestSessionClearedRef.current = sessionCleared;
    }, [sessionCleared]);

    useEffect(() => {
        latestVideoRef.current = draftReport?.geminiVideo ?? reportData?.geminiVideo ?? null;
    }, [draftReport, reportData]);

    // Separate effect for cleanup - only runs on unmount
    useEffect(() => {
        return () => {
            // In dev, React StrictMode runs effect cleanup once on mount; skip that first pass.
            if (skipFirstCleanupRef.current) {
                skipFirstCleanupRef.current = false;
                return;
            }

            const currentDraft = latestDraftRef.current;
            const alreadyCleared = latestSessionClearedRef.current;
            const videoToDelete = latestVideoRef.current;

            // Only auto-save if component was actually used (not just mounted and unmounted immediately)
            // and session is not already cleared
            if (isMountedRef.current && currentDraft && !alreadyCleared && onUpdateReport) {
                const finalReport = {
                    ...currentDraft,
                    geminiVideo: null,
                    sessionCleared: true,
                };
                onUpdateReport(finalReport);

                // Clean up video in background (fire and forget)
                if (videoToDelete) {
                    deleteGeminiFile(videoToDelete).catch(() => {
                        // Silently fail - video will expire naturally
                    });
                }
            }
        };
    }, [onUpdateReport]); // Empty-ish deps - only runs on mount/unmount

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

    const displayData = draftReport ?? reportData;
    const hasVideo = !!reportData.geminiVideo;
    const canSend = input.trim().length > 0 && !isSending && !sessionCleared;

    const attachFramesToNewEpisodes = async (base: ReportData, updated: ReportData): Promise<ReportData> => {
        if (!updated.episodes || !updated.episodes.length) return updated;
        if (!base.candidateFrames?.length) return updated;

        const candidateFrames = base.candidateFrames;
        const candidateFrameTimes = base.candidateFrameTimes ?? [];
        const minTime = candidateFrameTimes.length ? Math.min(...candidateFrameTimes) : 0;
        const maxTime = candidateFrameTimes.length ? Math.max(...candidateFrameTimes) : 0;

        const episodes = await Promise.all(
            updated.episodes.map(async (episode, idx) => {
                const hasThumb = episode.episodeData?.thumbnail && episode.episodeData.thumbnail !== '[omitted]';
                if (hasThumb) return episode;

                const summary = episode.summary || '';
                const startTime = typeof episode.episodeData?.startTime === 'number' ? episode.episodeData.startTime : null;
                const endTime = typeof episode.episodeData?.endTime === 'number' ? episode.episodeData.endTime : null;

                const selection = await pickFramesForEpisode({
                    episodeSummary: summary,
                    startTime,
                    endTime,
                    candidateFrames,
                    candidateFrameTimes,
                    maxFrames: 1,
                });

                const clampTime = (t: number) => {
                    if (!Number.isFinite(t)) return t;
                    if (minTime === maxTime) return t;
                    return Math.min(Math.max(t, minTime), maxTime);
                };

                const needsTimeCorrection = (start: number | null, end: number | null) => {
                    if (start === null || end === null) return true;
                    if (minTime === maxTime) return false;
                    return end - start > (maxTime - minTime) * 0.8;
                };

                if (selection.status === 'selected' && selection.frameIndices.length) {
                    const chosenIndex = selection.frameIndices[0];
                    const chosen = candidateFrames[chosenIndex];
                    const chosenTime = candidateFrameTimes[chosenIndex] ?? null;

                    const shouldReplaceTime = needsTimeCorrection(startTime, endTime) && chosenTime !== null;
                    const startTimeAdjusted =
                        shouldReplaceTime && chosenTime !== null
                            ? clampTime(chosenTime - 1)
                            : startTime ?? (chosenTime !== null ? clampTime(chosenTime) : startTime);
                    const endTimeAdjusted =
                        shouldReplaceTime && chosenTime !== null
                            ? clampTime(chosenTime + 1)
                            : endTime ?? (chosenTime !== null ? clampTime(chosenTime) : endTime);

                    return {
                        ...episode,
                        episodeData: {
                            ...episode.episodeData,
                            thumbnail: chosen,
                            highlightedFrame: chosen,
                            startTime: startTimeAdjusted ?? episode.episodeData?.startTime,
                            endTime: endTimeAdjusted ?? episode.episodeData?.endTime,
                        },
                    };
                }

                // fallback to nearest frame by time if selection failed
                const targetTime =
                    startTime !== null && endTime !== null
                        ? (startTime + endTime) / 2
                        : candidateFrameTimes.length
                            ? candidateFrameTimes[Math.floor(candidateFrameTimes.length / 2)]
                            : 0;

                let bestIndex = 0;
                let bestDelta = Number.POSITIVE_INFINITY;
                for (let i = 0; i < candidateFrames.length; i++) {
                    const t = candidateFrameTimes[i] ?? targetTime;
                    const delta = Math.abs(t - targetTime);
                    if (delta < bestDelta) {
                        bestDelta = delta;
                        bestIndex = i;
                    }
                }

                const fallbackFrame = candidateFrames[bestIndex];
                const fallbackTime = candidateFrameTimes[bestIndex] ?? targetTime;
                return {
                    ...episode,
                    episodeData: {
                        ...episode.episodeData,
                        thumbnail: fallbackFrame,
                        highlightedFrame: fallbackFrame,
                        startTime: startTime ?? fallbackTime,
                        endTime: endTime ?? fallbackTime,
                    },
                };
            })
        );

        return { ...updated, episodes };
    };

    const handleSendMessage = async () => {
        const trimmed = input.trim();
        if (!trimmed || !displayData) return;

        setIsSending(true);
        setError('');
        setInput('');

        const userTurn: ReportEditTurn = { role: 'user', content: trimmed };
        const nextTurns = [...chatTurns, userTurn];
        setChatTurns(nextTurns);

        try {
            const result = await editReportWithGemini({
                report: displayData,
                message: trimmed,
                turns: nextTurns,
                video: reportData.geminiVideo ?? null,
            });

            const assistantTurn: ReportEditTurn = {
                role: 'assistant',
                content: result.reply || 'Update ready.',
            };

            setChatTurns((prev) => [...prev, assistantTurn]);

            if (result.updatedReport) {
                // Preserve existing episodes and media; only append new episodes from Gemini
                const baseEpisodes = displayData.episodes ?? [];
                const incomingEpisodes = result.updatedReport.episodes ?? [];
                const candidateFrameTimes = displayData.candidateFrameTimes ?? [];
                const minTime = candidateFrameTimes.length ? Math.min(...candidateFrameTimes) : 0;
                const maxTime = candidateFrameTimes.length ? Math.max(...candidateFrameTimes) : 0;
                const clampTime = (t: number | null | undefined) => {
                    if (t === null || t === undefined || !Number.isFinite(t)) return t ?? undefined;
                    if (minTime === maxTime) return t;
                    return Math.min(Math.max(t, minTime), maxTime);
                };

                const isDuplicateEpisode = (ep: any, against: any[]) => {
                    const s = typeof ep?.episodeData?.startTime === 'number' ? ep.episodeData.startTime : null;
                    const e = typeof ep?.episodeData?.endTime === 'number' ? ep.episodeData.endTime : null;
                    for (const existing of against) {
                        const es = typeof existing?.episodeData?.startTime === 'number' ? existing.episodeData.startTime : null;
                        const ee = typeof existing?.episodeData?.endTime === 'number' ? existing.episodeData.endTime : null;
                        const startClose = s !== null && es !== null && Math.abs(s - es) < 0.25;
                        const endClose = e !== null && ee !== null && Math.abs(e - ee) < 0.25;
                        const summaryMatch =
                            typeof ep?.summary === 'string' &&
                            typeof existing?.summary === 'string' &&
                            ep.summary.trim().toLowerCase() === existing.summary.trim().toLowerCase();
                        if (startClose && endClose && summaryMatch) return true;
                    }
                    return false;
                };

                const normalizeNewEpisodes = (eps: any[]) =>
                    eps.map((ep) => {
                        const s = typeof ep?.episodeData?.startTime === 'number' ? ep.episodeData.startTime : null;
                        const e = typeof ep?.episodeData?.endTime === 'number' ? ep.episodeData.endTime : null;
                        let startTime = s;
                        let endTime = e;
                        const range = maxTime - minTime;
                        const tooWide = startTime !== null && endTime !== null && range > 0 && (endTime - startTime > range * 0.8 || endTime - startTime > 30);
                        if (tooWide || startTime === null || endTime === null) {
                            const center = startTime !== null && endTime !== null ? (startTime + endTime) / 2 : minTime;
                            const clampedCenter = clampTime(center) ?? center ?? 0;
                            startTime = clampTime(clampedCenter - 1) ?? clampedCenter;
                            endTime = clampTime(clampedCenter + 1) ?? clampedCenter + 1;
                            if (endTime <= startTime) endTime = startTime + 1;
                        } else {
                            startTime = clampTime(startTime) ?? startTime;
                            endTime = clampTime(endTime) ?? endTime;
                        }
                        return {
                            ...ep,
                            episodeData: {
                                ...ep.episodeData,
                                startTime,
                                endTime,
                            },
                        };
                    });

                const existingIds = new Set(
                    baseEpisodes
                        .map((ep) => ep.episodeData?.id)
                        .filter((id): id is number => typeof id === 'number')
                );
                const newEpisodes = incomingEpisodes.filter((ep, idx) => {
                    // Treat any episodes beyond the existing length as new
                    if (idx >= baseEpisodes.length) return true;
                    const id = ep.episodeData?.id;
                    return typeof id !== 'number' || !existingIds.has(id);
                });
                const dedupedNew = normalizeNewEpisodes(
                    newEpisodes.filter((ep) => !isDuplicateEpisode(ep, baseEpisodes))
                );

                const normalizedReport: ReportData = {
                    ...displayData, // keep existing top-level fields
                    ...result.updatedReport,
                    episodes: [...baseEpisodes, ...dedupedNew],
                    beforeImage: displayData.beforeImage,
                    afterImage: displayData.afterImage,
                    candidateFrames: displayData.candidateFrames,
                    candidateFrameTimes: displayData.candidateFrameTimes,
                    geminiVideo: displayData.geminiVideo,
                };

                const withFrames = await attachFramesToNewEpisodes(displayData, normalizedReport);
                const merged = mergeReportMedia(displayData, withFrames);
                const sortedEpisodes = [...merged.episodes].sort((a, b) => {
                    const aStart = a.episodeData?.startTime ?? 0;
                    const bStart = b.episodeData?.startTime ?? 0;
                    return aStart - bStart;
                });
                setDraftReport({ ...merged, episodes: sortedEpisodes });
            }

            if (result.error) {
                setError(result.error);
            } else {
                setError('');
            }
        } catch (err) {
            setError('Edit failed. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const handleFinishAndClear = async (triggeredByTimer = false) => {
        if (sessionCleared || isFinishing) return;
        setIsFinishing(true);
        try {
            // Save the edited report before clearing
            if (onUpdateReport && draftReport) {
                // Clear the video reference and mark session as cleared
                const finalReport = { 
                    ...draftReport, 
                    geminiVideo: null,
                    sessionCleared: true // Lock the report permanently
                };
                onUpdateReport(finalReport);
            }
            
            await deleteGeminiFile(reportData.geminiVideo ?? null);
            setChatTurns((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: triggeredByTimer
                        ? 'Session auto-cleared after 10 minutes. Report saved and upload cleared.'
                        : 'Session finished. Report saved and upload cleared.',
                },
            ]);
        } catch (err) {
            setError('Could not clear the session. Try again.');
        } finally {
            setIsFinishing(false);
        }
    };

    const handleDownloadPdf = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - (margin * 2);

        // Brand colors (matching app theme)
        const brandTeal: [number, number, number] = [0, 77, 86]; // #004D56
        const brandTealLight: [number, number, number] = [0, 109, 122]; // #006D7A
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
        doc.setDrawColor(...brandTeal);
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
            
            yPos = addSectionHeader("SITE CONDITION", yPos, brandTeal);
            
            const imgWidth = (contentWidth - 15) / 2;
            const imgHeight = imgWidth * 0.7;

            if (displayData.beforeImage) {
                try {
                    // Label with background
                    doc.setFillColor(220, 38, 38); // Muted red to match app tint
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
                    doc.setFillColor(22, 163, 74); // Muted green to match app tint
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

            yPos = addSectionHeader("ACTIVITY LOG", yPos, brandTeal);
            yPos += 5;

            displayData.episodes.forEach((ep: any, index: number) => {
                if (yPos > pageHeight - 65) { doc.addPage(); yPos = 20; }

                // Episode card with border
                doc.setDrawColor(220, 220, 220);
                doc.setLineWidth(0.3);
                const cardStartY = yPos;
                
                // Episode number badge
                doc.setFillColor(...brandTealLight);
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
        <div className="absolute inset-0 flex flex-col px-4 pb-28 pt-2 overflow-hidden">
            <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                    onClick={() => setView('preview')}
                    className={`py-3 rounded-2xl font-semibold text-sm transition-colors ${view === 'preview' ? 'bg-brand-teal-dark text-white shadow-lg' : 'bg-slate-800 text-slate-300'}`}
                >
                    Preview
                </button>
                <button
                    onClick={() => setView('chat')}
                    className={`py-3 rounded-2xl font-semibold text-sm transition-colors ${view === 'chat' ? 'bg-brand-teal-dark text-white shadow-lg' : 'bg-slate-800 text-slate-300'}`}
                >
                    Chat Edit
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
                {view === 'preview' ? (
                    <>
                        <div className="bg-white rounded-3xl shadow-xl">
                            <div className="bg-brand-teal-dark p-4 text-center rounded-t-3xl">
                                <h2 className="text-white font-bold text-lg">{displayData.projectTitle || "Worksite Report"}</h2>
                                <p className="text-brand-teal-light text-xs font-medium">{displayData.date || new Date().toLocaleDateString()}</p>
                                <p className="text-[11px] text-teal-100 mt-1">
                                    {hasVideo ? 'Grounded to uploaded video' : 'Frame-based analysis'}
                                </p>
                            </div>

                            <div className="p-6 text-brand-dark">
                                <p className="text-sm leading-relaxed text-center mb-6 font-medium text-gray-600">
                                    {displayData.summary}
                                </p>

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

                        <div className="grid grid-cols-2 gap-3">
                            <ActionButton label="Edit Report" />
                            <ActionButton label="View Full Report" variant="primary" onClick={handleDownloadPdf} />
                            <ActionButton label="Resume Report" />
                            <ActionButton label="Export Report" onClick={handleDownloadPdf} />
                        </div>
                    </>
                ) : (
                    <div className="bg-slate-900/70 rounded-3xl border border-slate-800 flex flex-col h-full">
                        <div className="p-4 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-white font-semibold flex items-center gap-2">
                                    <MessageCircle size={18} /> Edit with Gemini
                                </p>
                                <p className="text-xs text-slate-400">
                                    {hasVideo
                                        ? 'Grounded to uploaded video. Add time hints for faster checks.'
                                        : 'No video upload available; additions must be clearly visible in provided frames.'}
                                </p>
                                {isSending && (
                                    <p className="text-[11px] text-teal-200 mt-1 flex items-center gap-1">
                                        <Loader2 className="animate-spin" size={12} /> Sending…
                                    </p>
                                )}
                                {timeLeft !== null && !sessionCleared && (
                                    <p className="text-[11px] text-amber-200 mt-1">
                                        Auto-clears in {Math.floor(timeLeft / 60)
                                            .toString()
                                            .padStart(2, '0')}:
                                        {(timeLeft % 60).toString().padStart(2, '0')}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => handleFinishAndClear(false)}
                                disabled={isFinishing || sessionCleared || !hasVideo}
                                className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                    sessionCleared
                                        ? 'bg-emerald-700 text-white'
                                        : hasVideo
                                            ? 'bg-slate-800 text-white hover:bg-slate-700'
                                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                            >
                                {isFinishing ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                                {sessionCleared ? 'Cleared' : 'Finish & Clear'}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 space-y-3">
                            {chatTurns.map((turn, idx) => (
                                <div
                                    key={idx}
                                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                        turn.role === 'user'
                                            ? 'ml-auto bg-brand-teal-dark text-white'
                                            : 'bg-slate-800 text-slate-100'
                                    }`}
                                >
                                    {turn.content}
                                </div>
                            ))}
                            {!chatTurns.length && (
                                <div className="text-slate-500 text-sm">No messages yet.</div>
                            )}
                        </div>

                        {error && (
                            <div className="px-4 pt-2 text-xs text-amber-300">
                                {error}
                            </div>
                        )}

                        <div className="p-3 border-t border-slate-800">
                            <div className="flex items-center gap-2">
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && canSend) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Ask to add or edit something (cite a timecode)"
                                    className="flex-1 bg-slate-800 text-white rounded-2xl px-3 py-3 text-sm outline-none border border-slate-700 focus:border-brand-teal-light"
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!canSend}
                                    className={`p-3 rounded-2xl text-white font-semibold flex items-center gap-1 transition-colors ${
                                        canSend ? 'bg-brand-teal-dark hover:bg-brand-teal' : 'bg-slate-700 cursor-not-allowed'
                                    }`}
                                >
                                    {isSending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                                <ShieldCheck size={12} /> Only changes visible in the video will be applied. Include time offsets when you can.
                            </p>
                        </div>
                    </div>
                )}
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
