import { processVideo } from './videoProcessor';
import { analyzeEpisodeWithGemini, generateReportOverview, selectBeforeAfterFromFrames } from './geminiService';
import { applyPrivacyMask } from './privacyMask';
import { GeminiEpisodeInsight, ReportData } from '../types';

const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

export const generateReport = async (
    videoFile: File,
    onStatusUpdate: (status: string) => void
): Promise<ReportData> => {
    onStatusUpdate('Detecting activity in the video...');
    const analysis = await processVideo(videoFile);

    if (!analysis.episodes.length) {
        throw new Error('No meaningful activity detected in the video.');
    }

    onStatusUpdate(`Found ${analysis.episodes.length} activity segment${analysis.episodes.length > 1 ? 's' : ''}. Capturing documentation...`);

    const episodeInsights: GeminiEpisodeInsight[] = [];
    const summarizedEpisodes = [];
    const privacySafeFrames: string[] = [];

    for (const episode of analysis.episodes) {
        const insight = await analyzeEpisodeWithGemini({
            episode,
            contextFrame: episode.thumbnail,
        });

        const privacyFrame = await applyPrivacyMask(episode.thumbnail, {
            focusRegions: insight.focusRegions,
            redactionRegions: insight.redactionRegions,
            fallbackRegion: episode.activityBounds ?? null,
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
    }));

    return {
        projectTitle: reportOverview.projectTitle || 'Worksite Activity',
        site: reportOverview.site || 'On-site location',
        date: formattedDate,
        summary: reportOverview.summary || 'Automated project summary unavailable.',
        episodes: summarizedEpisodes,
        tasksCompleted,
        beforeImage,
        afterImage,
    };
};
