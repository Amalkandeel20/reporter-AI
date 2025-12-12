import { processVideo } from './videoProcessor';
import { analyzeEpisodeWithGemini, analyzeFullVideoWithGemini, generateReportOverview, selectBeforeAfterFromFrames, uploadVideoForGemini } from './geminiService';
import { applyPrivacyMask } from './privacyMask';
import { detectFaces } from './faceDetector';
import { AnalysisMode, GeminiEpisodeInsight, GeminiFullScanEpisode, GeminiVideoReference, ReportData } from '../types';

const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

export const generateReport = async (
    videoFile: File,
    onStatusUpdate: (status: string) => void,
    options?: { demoMode?: boolean; mode?: AnalysisMode }
): Promise<ReportData> => {
    const mode: AnalysisMode = options?.mode ?? (options?.demoMode ? 'demo' : 'standard');
    const demoMode = mode === 'demo';
    const fullAIMode = mode === 'full';

    onStatusUpdate('Detecting activity in the video...');
    const analysis = await processVideo(videoFile);

    if (!analysis.episodes.length) {
        throw new Error('No meaningful activity detected in the video.');
    }

    let uploadedVideo: GeminiVideoReference | null = null;

    if (demoMode || fullAIMode) {
        onStatusUpdate('Uploading video to Gemini for native analysis (demo mode)...');
        uploadedVideo = await uploadVideoForGemini(videoFile);
        if (!uploadedVideo) {
            onStatusUpdate('Upload failed, continuing with frame-based analysis.');
        }
    }

    const pickFrameByTime = (targetTime: number | null | undefined, fallbackWindow?: { start: number; end: number }): string => {
        const frames = analysis.candidateFrames ?? [];
        const times = analysis.candidateFrameTimes ?? [];
        if (!frames.length) return '';
        let desired = targetTime;
        if (fallbackWindow && (desired === null || desired === undefined || !Number.isFinite(desired))) {
            desired = (fallbackWindow.start + fallbackWindow.end) / 2;
        }
        if (!times.length || typeof desired !== 'number' || !Number.isFinite(desired)) {
            return frames[Math.max(0, Math.floor(frames.length / 2))];
        }
        let bestIndex = 0;
        let bestDelta = Math.abs(times[0] - desired);
        for (let i = 1; i < times.length; i++) {
            const delta = Math.abs(times[i] - desired);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestIndex = i;
            }
        }
        return frames[bestIndex] ?? frames[0];
    };

    onStatusUpdate(`Found ${analysis.episodes.length} activity segment${analysis.episodes.length > 1 ? 's' : ''}. Capturing documentation...`);

    const episodeInsights: GeminiEpisodeInsight[] = [];
    const summarizedEpisodes = [];
    const privacySafeFrames: string[] = [];

    const buildFromFullAI = async (fullEpisodes: GeminiFullScanEpisode[]) => {
        const roundTime = (value: number) => Number(Math.max(0, value).toFixed(1));

        for (const [index, episode] of fullEpisodes.entries()) {
            const anchorFrame =
                pickFrameByTime(
                    episode.frameTime,
                    { start: episode.startTime, end: episode.endTime }
                ) || analysis.beforeFrame;

            // Only blur detected faces; leave everything else sharp to avoid over-blurring tools/work area
            const detectedFaces = anchorFrame ? await detectFaces(anchorFrame) : [];
            const combinedRedactions = detectedFaces;

            const privacyFrame = anchorFrame
                ? await applyPrivacyMask(anchorFrame, {
                    focusRegions: episode.focusRegions || [],
                    redactionRegions: combinedRedactions,
                })
                : anchorFrame;

            const uniqueTools = [...new Set(episode.tools)];
            const uniqueActions = [...new Set(episode.actions)];

            episodeInsights.push({
                summary: episode.summary,
                tools: uniqueTools,
                actions: uniqueActions,
                focusRegions: episode.focusRegions || [],
                redactionRegions: episode.redactionRegions || [],
                isBeforeCandidate: episode.isBeforeCandidate,
                isAfterCandidate: episode.isAfterCandidate,
            });

            summarizedEpisodes.push({
                episodeData: {
                    id: index + 1,
                    startTime: roundTime(episode.startTime),
                    endTime: roundTime(episode.endTime),
                    detectedTools: uniqueTools,
                    keyActions: uniqueActions,
                    thumbnail: privacyFrame,
                    highlightedFrame: privacyFrame,
                    activityBounds: null,
                },
                summary: episode.summary,
            });

            privacySafeFrames.push(privacyFrame);
        }
    };

    const runFrameBasedAnalysis = async () => {
        for (const episode of analysis.episodes) {
            const insight = await analyzeEpisodeWithGemini({
                episode,
                contextFrame: episode.thumbnail,
                demoMode,
                uploadedVideo,
            });

            // Only blur detected faces; leave everything else sharp to avoid over-blurring tools/work area
            const detectedFaces = await detectFaces(episode.thumbnail);
            const combinedRedactions = detectedFaces;

            const privacyFrame = await applyPrivacyMask(episode.thumbnail, {
                focusRegions: insight.focusRegions,
                redactionRegions: combinedRedactions,
            });

            episodeInsights.push(insight);
            summarizedEpisodes.push({
                episodeData: {
                    ...episode,
                    detectedTools: [...new Set(insight.tools)],
                    keyActions: [...new Set(insight.actions)],
                    thumbnail: privacyFrame,
                    highlightedFrame: privacyFrame,
                },
                summary: insight.summary,
            });
            privacySafeFrames.push(privacyFrame);
        }
    };

    let fullEpisodes: GeminiFullScanEpisode[] = [];

    if (fullAIMode && uploadedVideo) {
        onStatusUpdate('Scanning entire video with Gemini (Full AI mode)...');
        fullEpisodes = await analyzeFullVideoWithGemini(uploadedVideo);
    }

    const saneFullEpisodes = fullEpisodes.filter(
        (ep) => Number.isFinite(ep.startTime) && Number.isFinite(ep.endTime) && ep.endTime - ep.startTime >= 1.5
    );

    if (saneFullEpisodes.length) {
        await buildFromFullAI(saneFullEpisodes);
    } else {
        await runFrameBasedAnalysis();
    }

    onStatusUpdate('Generating overall project summary and task list...');
    const reportOverview = await generateReportOverview(episodeInsights);

    const today = new Date();
    const formattedDate = formatDate(today);

    // Ask Gemini to pick the best before/after frames from the whole video
    const candidateFrames = analysis.candidateFrames ?? [];
    const beforeAfterSelection = await selectBeforeAfterFromFrames(candidateFrames);

    let beforeImage = '';
    let afterImage = '';

    if (beforeAfterSelection.beforeIndex !== null && candidateFrames[beforeAfterSelection.beforeIndex]) {
        beforeImage = candidateFrames[beforeAfterSelection.beforeIndex];
    }

    if (beforeAfterSelection.afterIndex !== null && candidateFrames[beforeAfterSelection.afterIndex]) {
        afterImage = candidateFrames[beforeAfterSelection.afterIndex];
    }

    const tasksCompleted = (reportOverview.tasks.length
        ? reportOverview.tasks
        : episodeInsights.map((insight, index) => `Documented activity segment ${index + 1}`)
    ).map((task) => ({
        name: task,
        status: 'Completed' as const,
        statusLabel: 'Completed', // Adding statusLabel to match UI expectations if needed, or just status
    }));

    // Fix for type mismatch if 'status' is strictly 'Completed' | 'Pending' etc.
    // The original code had 'status: "Completed" as const', which is fine.
    // I'll stick to the original structure.

    return {
        projectTitle: reportOverview.projectTitle || 'Worksite Activity',
        site: reportOverview.site || 'On-site location',
        date: formattedDate,
        summary: reportOverview.summary || 'Automated project summary unavailable.',
        episodes: summarizedEpisodes,
        tasksCompleted: tasksCompleted.map(t => ({ name: t.name, status: 'Completed' as const })),
        beforeImage,
        afterImage,
        demoMode: mode !== 'standard',
        analysisMode: mode,
        geminiVideo: uploadedVideo ?? null,
        candidateFrames: analysis.candidateFrames ?? [],
        candidateFrameTimes: analysis.candidateFrameTimes ?? [],
    };
};
