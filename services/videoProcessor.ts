import { Episode, VideoAnalysis } from '../types';

interface FrameAnalytics {
    time: number;
    thumbnail: string;
    highlighted: string;
    motionScore: number;
    bounds: MotionResult['bounds'];
    normalizedBounds: { x: number; y: number; width: number; height: number } | null;
}

interface MotionResult {
    motionScore: number;
    bounds: { x: number; y: number; width: number; height: number } | null;
}

const clampTime = (time: number, duration: number) =>
    Math.min(Math.max(time, 0), Math.max(duration - 0.05, 0));

const toDataUrl = (canvas: HTMLCanvasElement, quality = 0.85): string =>
    canvas.toDataURL('image/jpeg', quality);

const toRoundedSecond = (value: number) => Number(value.toFixed(1));

const ensureSeek = (video: HTMLVideoElement, time: number): Promise<void> =>
    new Promise((resolve, reject) => {
        const handleSeeked = () => {
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('error', handleError);
            resolve();
        };
        const handleError = () => {
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('error', handleError);
            reject(new Error('Unable to seek video for analysis.'));
        };

        video.addEventListener('seeked', handleSeeked);
        video.addEventListener('error', handleError);
        video.currentTime = time;
    });

const analyzeMotion = (
    current: Uint8ClampedArray,
    previous: Uint8ClampedArray,
    width: number,
    height: number
): MotionResult => {
    const blockSize = Math.max(Math.floor(Math.min(width, height) / 18), 24);
    const step = Math.max(Math.floor(blockSize / 4), 4);
    const threshold = 28;

    let totalDiff = 0;
    let sampleCount = 0;
    const activeBlocks: Array<{ x: number; y: number }> = [];

    for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
            let blockDiff = 0;
            let blockSamples = 0;

            const maxY = Math.min(y + blockSize, height);
            const maxX = Math.min(x + blockSize, width);

            for (let yy = y; yy < maxY; yy += step) {
                for (let xx = x; xx < maxX; xx += step) {
                    const idx = (yy * width + xx) * 4;
                    const dr = Math.abs(current[idx] - previous[idx]);
                    const dg = Math.abs(current[idx + 1] - previous[idx + 1]);
                    const db = Math.abs(current[idx + 2] - previous[idx + 2]);
                    const diff = (dr + dg + db) / 3;

                    blockDiff += diff;
                    blockSamples += 1;
                }
            }

            if (blockSamples === 0) {
                continue;
            }

            const averageDiff = blockDiff / blockSamples;
            totalDiff += averageDiff;
            sampleCount += 1;

            if (averageDiff >= threshold) {
                activeBlocks.push({ x, y });
            }
        }
    }

    if (sampleCount === 0) {
        return { motionScore: 0, bounds: null };
    }

    const motionScore = totalDiff / (sampleCount * 255);

    if (!activeBlocks.length) {
        return { motionScore, bounds: null };
    }

    const minX = Math.max(
        Math.min(...activeBlocks.map((block) => block.x)) - Math.floor(blockSize * 0.4),
        0
    );
    const minY = Math.max(
        Math.min(...activeBlocks.map((block) => block.y)) - Math.floor(blockSize * 0.4),
        0
    );
    const maxX = Math.min(
        Math.max(...activeBlocks.map((block) => block.x)) + blockSize + Math.floor(blockSize * 0.4),
        width
    );
    const maxY = Math.min(
        Math.max(...activeBlocks.map((block) => block.y)) + blockSize + Math.floor(blockSize * 0.4),
        height
    );

    return {
        motionScore,
        bounds: {
            x: minX,
            y: minY,
            width: Math.max(maxX - minX, Math.floor(blockSize * 1.2)),
            height: Math.max(maxY - minY, Math.floor(blockSize * 1.2)),
        },
    };
};

const createHighlightedFrame = (
    sourceCanvas: HTMLCanvasElement,
    bounds: MotionResult['bounds']
): string => {
    const highlightCanvas = document.createElement('canvas');
    const highlightCtx = highlightCanvas.getContext('2d');
    if (!highlightCtx) {
        return toDataUrl(sourceCanvas);
    }

    highlightCanvas.width = sourceCanvas.width;
    highlightCanvas.height = sourceCanvas.height;

    highlightCtx.filter = 'blur(35px)';
    highlightCtx.drawImage(sourceCanvas, 0, 0, highlightCanvas.width, highlightCanvas.height);
    highlightCtx.filter = 'none';

    highlightCtx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    highlightCtx.fillRect(0, 0, highlightCanvas.width, highlightCanvas.height);

    if (!bounds) {
        return toDataUrl(highlightCanvas);
    }

    const padding = Math.round(Math.max(bounds.width, bounds.height) * 0.2);
    const x = Math.max(bounds.x - padding, 0);
    const y = Math.max(bounds.y - padding, 0);
    const width = Math.min(bounds.width + padding * 2, highlightCanvas.width - x);
    const height = Math.min(bounds.height + padding * 2, highlightCanvas.height - y);

    highlightCtx.drawImage(
        sourceCanvas,
        x,
        y,
        width,
        height,
        x,
        y,
        width,
        height
    );

    const gradient = highlightCtx.createRadialGradient(
        x + width / 2,
        y + height / 2,
        Math.max(width, height) * 0.1,
        x + width / 2,
        y + height / 2,
        Math.max(width, height) * 0.65
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(1, 'rgba(15,23,42,0.25)');

    highlightCtx.fillStyle = gradient;
    highlightCtx.fillRect(x, y, width, height);

    highlightCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    highlightCtx.lineWidth = Math.max(Math.round(highlightCanvas.width / 250), 3);
    highlightCtx.strokeRect(x, y, width, height);

    return toDataUrl(highlightCanvas);
};

export const processVideo = async (videoFile: File): Promise<VideoAnalysis> => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const ready = new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load the video for processing.'));
    });

    await ready;

    const duration = video.duration;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
        URL.revokeObjectURL(video.src);
        throw new Error('Unable to initialise canvas context for frame extraction.');
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Sample more densely so longer videos can produce multiple episodes
    const frameInterval = Math.max(duration / 120, 0.5);
    const sampleTimes: number[] = [];
    for (let t = 0; t < duration; t += frameInterval) {
        sampleTimes.push(clampTime(t, duration));
    }
    if (sampleTimes[sampleTimes.length - 1] < duration) {
        sampleTimes.push(clampTime(duration, duration));
    }

    const frameAnalytics: FrameAnalytics[] = [];
    let previousFrameData: Uint8ClampedArray | null = null;

    try {
        for (const time of sampleTimes) {
            await ensureSeek(video, clampTime(time, duration));
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            let motionScore = 0;
            let bounds: MotionResult['bounds'] = null;

            if (previousFrameData) {
                const analysis = analyzeMotion(
                    imageData.data,
                    previousFrameData,
                    canvas.width,
                    canvas.height
                );
                motionScore = analysis.motionScore;
                bounds = analysis.bounds;
            }

            const originalUrl = toDataUrl(canvas);
            const highlightedUrl = createHighlightedFrame(canvas, bounds);
            const normalizedBounds = bounds
                ? {
                      x: Math.max(Math.min(bounds.x / canvas.width, 1), 0),
                      y: Math.max(Math.min(bounds.y / canvas.height, 1), 0),
                      width: Math.max(Math.min(bounds.width / canvas.width, 1), 0.001),
                      height: Math.max(Math.min(bounds.height / canvas.height, 1), 0.001),
                  }
                : null;

            frameAnalytics.push({
                time,
                motionScore,
                thumbnail: originalUrl,
                highlighted: highlightedUrl,
                bounds,
                normalizedBounds,
            });

            previousFrameData = new Uint8ClampedArray(imageData.data);
        }
    } finally {
        URL.revokeObjectURL(video.src);
    }

    const MIN_MOTION_SCORE = 0.01;
    const MIN_SEGMENT_DURATION = 4; // seconds
    const MAX_SEGMENT_DURATION = 45; // seconds

    const episodes: Episode[] = [];
    let activeSegment: {
        start: number;
        end: number;
        frames: FrameAnalytics[];
    } | null = null;

    const finaliseSegment = (segment: typeof activeSegment) => {
        if (!segment || !segment.frames.length) {
            return;
        }
        // Ignore very short bursts of motion
        if (segment.end - segment.start < MIN_SEGMENT_DURATION) {
            return;
        }
        const bestFrame = segment.frames.reduce((best, current) =>
            current.motionScore > best.motionScore ? current : best
        );

        episodes.push({
            id: episodes.length + 1,
            startTime: toRoundedSecond(Math.max(0, segment.start)),
            endTime: toRoundedSecond(Math.min(duration, segment.end)),
            detectedTools: [],
            keyActions: [],
            thumbnail: bestFrame.thumbnail,
            highlightedFrame: bestFrame.highlighted,
            activityBounds: bestFrame.normalizedBounds,
        });
    };

    for (let i = 0; i < frameAnalytics.length; i++) {
        const frameInfo = frameAnalytics[i];
        if (frameInfo.motionScore >= MIN_MOTION_SCORE) {
            if (!activeSegment) {
                activeSegment = {
                    start: frameInfo.time,
                    end: frameInfo.time + frameInterval,
                    frames: [frameInfo],
                };
            } else {
                activeSegment.end = frameInfo.time + frameInterval;
                activeSegment.frames.push(frameInfo);

                // If a segment runs for a long time, split it so we can
                // capture distinct phases of the job (e.g. framing vs finishing)
                if (activeSegment.end - activeSegment.start >= MAX_SEGMENT_DURATION) {
                    finaliseSegment(activeSegment);
                    activeSegment = {
                        start: frameInfo.time,
                        end: frameInfo.time + frameInterval,
                        frames: [frameInfo],
                    };
                }
            }
        } else if (activeSegment) {
            finaliseSegment(activeSegment);
            activeSegment = null;
        }
    }

    if (activeSegment) {
        finaliseSegment(activeSegment);
    }

    if (!episodes.length && frameAnalytics.length) {
        const representative = frameAnalytics[Math.floor(frameAnalytics.length / 2)];
        episodes.push({
            id: 1,
            startTime: 0,
            endTime: toRoundedSecond(duration),
            detectedTools: [],
            keyActions: [],
            thumbnail: representative.thumbnail,
            highlightedFrame: representative.highlighted,
            activityBounds: representative.normalizedBounds,
        });
    }

    const beforeFrame = frameAnalytics[0]?.thumbnail ?? '';
    const afterFrame = frameAnalytics[frameAnalytics.length - 1]?.thumbnail ?? beforeFrame;
    const candidateFrames = frameAnalytics.map((frame) => frame.thumbnail);
    const candidateFrameTimes = frameAnalytics.map((frame) => frame.time);

    return {
        episodes: episodes.slice(0, 10),
        beforeFrame,
        afterFrame,
        candidateFrames,
        candidateFrameTimes,
    };
};
