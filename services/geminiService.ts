import { GoogleGenAI } from '@google/genai';
import {
    Episode,
    EpisodeInsightRequest,
    GeminiEpisodeInsight,
    GeminiReportOverview,
    BoundingBox,
    GeminiVideoReference,
    ReportData,
    ReportEditTurn,
    ReportEditResponse,
    GeminiFullScanEpisode,
} from '../types';

export interface FrameSelectionRequest {
    episodeSummary: string;
    startTime: number | null;
    endTime: number | null;
    candidateFrames: string[];
    candidateFrameTimes: number[];
    maxFrames?: number;
}

export interface FrameSelectionResult {
    status: 'selected' | 'not_visible' | 'not_in_candidates';
    frameIndices: number[];
    reason: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';
// Use 2.5-flash for edits - now optimized with no image data sent
const GEMINI_MODEL_EDIT = 'gemini-2.5-flash';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('Gemini API key is not set. Add VITE_GEMINI_API_KEY to your environment.');
}

const geminiClient = new GoogleGenAI({ apiKey }) as any;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_GENERATION_CONFIG = {
    temperature: 0,
    topP: 0.1,
};

const callGemini = async (payload: Record<string, unknown>, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const { generationConfig: callerConfig, ...restPayload } = payload as any;
            const mergedPayload = {
                ...restPayload,
                generationConfig: { ...DEFAULT_GENERATION_CONFIG, ...(callerConfig || {}) },
            };

            // Support for standard GoogleGenAI SDK with caching
            if (typeof geminiClient.getGenerativeModel === 'function') {
                const { model: modelName, cachedContent, ...rest } = mergedPayload;
                const model = geminiClient.getGenerativeModel({
                    model: modelName as string,
                    cachedContent: cachedContent as string,
                });
                return await model.generateContent(rest as any);
            }

            if (geminiClient.responses && typeof geminiClient.responses.generate === 'function') {
                return await geminiClient.responses.generate(mergedPayload as never);
            }
            if (geminiClient.models && typeof geminiClient.models.generateContent === 'function') {
                return await geminiClient.models.generateContent(mergedPayload as never);
            }
            throw new Error('Gemini client does not expose a compatible generate method.');
        } catch (error: any) {
            const isLastAttempt = i === retries - 1;
            console.warn(`Gemini call failed (attempt ${i + 1}/${retries}):`, error.message || error);

            if (isLastAttempt) throw error;

            // Exponential backoff: 1s, 2s, 4s
            await sleep(1000 * Math.pow(2, i));
        }
    }
};

const extractText = (result: any): string => {
    if (!result) return '';
    if (typeof result.output_text === 'string') return result.output_text;
    if (typeof result.text === 'string') return result.text;
    if (typeof result.outputText === 'string') return result.outputText;
    if (result.candidates?.length) {
        const parts = result.candidates[0]?.content?.parts ?? [];
        const partText = parts
            .map((part: any) => ('text' in part ? part.text : ''))
            .join('')
            .trim();
        if (partText) return partText;
    }
    if (result.response?.text) {
        const maybeFn = result.response.text;
        if (typeof maybeFn === 'function') {
            return maybeFn.call(result.response) ?? '';
        }
        return result.response.text ?? '';
    }
    return '';
};

const normaliseJson = <T>(raw: string, fallback: T): T => {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;

    const withoutFence = trimmed
        .replace(/^```json/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();

    // Try to isolate the first JSON object if the model added extra text
    const jsonMatch = withoutFence.match(/\{[\s\S]*\}/);
    const jsonCandidate = jsonMatch ? jsonMatch[0] : withoutFence;

    try {
        return JSON.parse(jsonCandidate) as T;
    } catch (error) {
        console.warn('Failed to parse Gemini JSON response', error, withoutFence);
        return fallback;
    }
};

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const sanitizeBoxes = (input: any): BoundingBox[] => {
    if (!Array.isArray(input)) return [];
    return input
        .map((item) => {
            const source =
                item && typeof item === 'object'
                    ? item
                    : Array.isArray(item)
                        ? { x: item[0], y: item[1], width: item[2], height: item[3] }
                        : null;
            if (!source) return null;
            const x = Number(source.x ?? source.left ?? source.X ?? source.col ?? 0);
            const y = Number(source.y ?? source.top ?? source.Y ?? source.row ?? 0);
            const width = Number(source.width ?? source.w ?? source.cols ?? source.right ?? 0);
            const height = Number(source.height ?? source.h ?? source.rows ?? source.bottom ?? 0);

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
                return null;
            }

            return {
                x: clamp01(x),
                y: clamp01(y),
                width: clamp01(width),
                height: clamp01(height),
            };
        })
        .filter((box): box is BoundingBox => !!box && box.width > 0 && box.height > 0);
};

const coerceEpisodeInsight = (raw: any): GeminiEpisodeInsight => {
    const fallback: GeminiEpisodeInsight = {
        summary: 'No automated summary available for this segment.',
        tools: [],
        actions: [],
        focusRegions: [],
        redactionRegions: [],
        isBeforeCandidate: false,
        isAfterCandidate: false,
    };

    if (!raw || typeof raw !== 'object') {
        return fallback;
    }

    const summary =
        typeof raw.summary === 'string' && raw.summary.trim()
            ? raw.summary.trim()
            : fallback.summary;

    const toolsSource = Array.isArray(raw.tools) ? raw.tools : [];
    const actionsSource = Array.isArray(raw.actions) ? raw.actions : [];

    const tools = toolsSource
        .map((tool) => (typeof tool === 'string' ? tool.trim() : ''))
        .filter(Boolean);

    const actions = actionsSource
        .map((action) => (typeof action === 'string' ? action.trim() : ''))
        .filter(Boolean);

    const focusRegions = sanitizeBoxes(
        raw.focusRegions ??
        raw.focus_regions ??
        raw.focusRegionsNormalized ??
        raw.focus ?? []
    );

    const redactionRegions = sanitizeBoxes(
        raw.redactionRegions ??
        raw.redaction_regions ??
        raw.peopleRegions ??
        raw.faces ??
        []
    );

    const isBeforeCandidate =
        typeof raw.isBeforeCandidate === 'boolean'
            ? raw.isBeforeCandidate
            : typeof raw.before === 'boolean'
                ? raw.before
                : false;

    const isAfterCandidate =
        typeof raw.isAfterCandidate === 'boolean'
            ? raw.isAfterCandidate
            : typeof raw.after === 'boolean'
                ? raw.after
                : false;

    return {
        summary,
        tools,
        actions,
        focusRegions,
        redactionRegions,
        isBeforeCandidate,
        isAfterCandidate,
    };
};

const MIN_FULL_SCAN_DURATION = 1.5; // seconds

const coerceFullScanEpisode = (raw: any): GeminiFullScanEpisode | null => {
    if (!raw || typeof raw !== 'object') return null;

    const startTime = Number(raw.startTime ?? raw.start ?? raw.begin ?? NaN);
    const endTime = Number(raw.endTime ?? raw.end ?? raw.stop ?? NaN);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;

    const base = coerceEpisodeInsight(raw);

    const frameTimeRaw = raw.frameTime ?? raw.thumbnailTime ?? raw.thumb ?? null;
    let frameTime =
        frameTimeRaw === null || frameTimeRaw === undefined
            ? null
            : Number.isFinite(Number(frameTimeRaw))
                ? Number(frameTimeRaw)
                : null;

    const normalizedStart = Math.max(0, startTime);
    const normalizedEnd = Math.max(normalizedStart, endTime);
    const duration = normalizedEnd - normalizedStart;

    // Drop segments that are too short to be meaningful or obviously invalid
    if (!Number.isFinite(duration) || duration < MIN_FULL_SCAN_DURATION) {
        return null;
    }

    if (typeof frameTime === 'number' && (frameTime < normalizedStart || frameTime > normalizedEnd)) {
        frameTime = null;
    }

    // Default to the midpoint of the segment when frameTime is missing/invalid
    if (frameTime === null) {
        frameTime = Number(((normalizedStart + normalizedEnd) / 2).toFixed(1));
    }

    // Require at least some visible action/tool context; otherwise drop
    const hasContent = Boolean((base.tools?.length ?? 0) || (base.actions?.length ?? 0));
    if (!hasContent) return null;

    return {
        startTime: normalizedStart,
        endTime: normalizedEnd,
        summary: base.summary,
        tools: base.tools,
        actions: base.actions,
        isBeforeCandidate: base.isBeforeCandidate ?? false,
        isAfterCandidate: base.isAfterCandidate ?? false,
        frameTime,
        focusRegions: base.focusRegions,
        redactionRegions: base.redactionRegions,
    };
};

const dataUrlToBase64 = (dataUrl: string): { mimeType: string; data: string } => {
    if (!dataUrl.startsWith('data:')) {
        return { mimeType: 'image/jpeg', data: dataUrl };
    }
    const [header, data] = dataUrl.split(',');
    const mimeMatch = /^data:(.*?);base64$/.exec(header);
    return {
        mimeType: mimeMatch?.[1] ?? 'image/jpeg',
        data: data ?? '',
    };
};

const isFileApiAvailable = () =>
    geminiClient.files &&
    typeof geminiClient.files.upload === 'function' &&
    typeof geminiClient.files.get === 'function';
const isFileDeleteAvailable = () =>
    geminiClient.files && typeof geminiClient.files.delete === 'function';
const isCacheApiAvailable = () =>
    geminiClient.cachedContents && typeof geminiClient.cachedContents.create === 'function';

const createGeminiCache = async (
    videoFile: any,
    mimeType: string,
    displayName: string
): Promise<string | null> => {
    if (!isCacheApiAvailable()) {
        console.warn('Cache API not available');
        return null;
    }

    try {
        console.log('Creating Gemini cache for video:', displayName);
        const cache = await geminiClient.cachedContents.create({
            model: GEMINI_MODEL_EDIT,
            displayName: `cache-${displayName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            fileData: {
                                mimeType,
                                fileUri: videoFile.uri,
                            },
                        },
                    ],
                },
            ],
            ttlSeconds: 60 * 10, // 10 minutes cache
        });
        console.log('✅ Gemini cache created successfully:', cache.name);
        return cache.name;
    } catch (error) {
        console.error('❌ Failed to create Gemini cache:', error);
        return null;
    }
};

const toVideoReference = (file: any, fallbackMime: string): GeminiVideoReference | null => {
    if (!file) return null;
    const fileUri = file.uri ?? file.fileUri ?? null;
    if (!fileUri) return null;
    return {
        fileUri,
        mimeType: file.mimeType ?? fallbackMime,
        name: file.name ?? undefined,
    };
};

export const uploadVideoForGemini = async (videoFile: File): Promise<GeminiVideoReference | null> => {
    if (!isFileApiAvailable()) {
        console.warn('Gemini client does not expose file upload APIs; skipping demo mode upload.');
        return null;
    }

    const mimeType = videoFile.type || 'video/mp4';

    try {
        const uploaded = await geminiClient.files.upload({
            file: videoFile,
            config: {
                mimeType,
                displayName: videoFile.name,
            },
        });

        let reference = toVideoReference(uploaded, mimeType);
        const fileName = uploaded?.name ?? uploaded?.uri ?? null;

        if (uploaded?.state === 'PROCESSING' && fileName) {
            const timeoutAt = Date.now() + 30000;
            let latest = uploaded;
            while (Date.now() < timeoutAt) {
                if (latest?.state === 'ACTIVE') break;
                if (latest?.state === 'FAILED') {
                    console.warn('Gemini video upload failed to process.', latest?.error ?? '');
                    return null;
                }
                await sleep(1000);
                latest = await geminiClient.files.get({ name: fileName });
            }
            reference = toVideoReference(latest, mimeType) ?? reference;
        }

        // Try to create a cache for this video to optimize chat calls
        const cacheName = await createGeminiCache(uploaded, mimeType, videoFile.name);
        if (cacheName) {
            reference = { ...reference, cacheName };
        }

        return reference;
    } catch (error) {
        console.error('Failed to upload video for Gemini analysis', error);
        return null;
    }
};

export const deleteGeminiFile = async (video: GeminiVideoReference | null | undefined): Promise<void> => {
    if (!video || !isFileDeleteAvailable()) return;
    const name = video.name ?? video.fileUri;
    try {
        await geminiClient.files.delete({ name });
    } catch (error) {
        console.warn('Failed to delete Gemini file', error);
    }
};

export const analyzeEpisodeWithGemini = async (
    request: EpisodeInsightRequest
): Promise<GeminiEpisodeInsight> => {
    const { episode, contextFrame, demoMode = false, uploadedVideo } = request;
    const { mimeType, data } = dataUrlToBase64(contextFrame);

    const usingVideo = demoMode && uploadedVideo?.fileUri;

    const prompt = `
You are an assistant that documents real-world activities, work, and events.
The video is recorded from a first-person perspective (e.g., body camera, smart glasses) or a handheld camera. The goal is to build an accurate, privacy-safe "digital twin" of the events that actually occurred.
${usingVideo
            ? `You have the full source video. Focus strictly on activity between ${episode.startTime}s and ${episode.endTime}s. Do not include events outside this window.`
            : `You are given a single still frame from the video representing work taking place between ${episode.startTime}s and ${episode.endTime}s.`}
Your job is to describe only the activity that is clearly visible and to identify where to focus and where to blur for privacy. You must never guess or add details that are not obviously supported by the visuals.

Return a strict JSON object with exactly this shape:
{
  "summary": string,        // 1 short, clear sentence describing the visible activity (e.g. "Reviewing documents at a desk.", "Repairing a leaking pipe.", "Discussing project plans.")
  "tools": string[],        // short names of objects, tools, or devices clearly visible and being used (e.g. "laptop", "pen", "drill"); empty array if none are clearly visible
  "actions": string[],      // short verb phrases that describe the actual activity visible in the frame (e.g. "typing", "writing", "tightening bolts"); use empty array if you are not sure
  "isBeforeCandidate": boolean, // true if this frame shows the "before" state of a task or event (e.g. broken item, messy desk, start of meeting); otherwise false
  "isAfterCandidate": boolean,  // true if this frame shows the "after" state (e.g. fixed item, organized desk, end of meeting); otherwise false
  "focus_regions": [        // regions to keep clearly visible (the main subject of the activity, tools, hands, work area; NO faces)
    { "x": number, "y": number, "width": number, "height": number } // all values normalized to 0–1 relative to image width and height
  ],
  "redaction_regions": [    // regions that contain faces, people, personal belongings, or anything that could identify individuals and must be blurred
    { "x": number, "y": number, "width": number, "height": number }
  ]
}

Rules:
- Always return valid JSON that matches the schema above, with no extra keys and no trailing comments or text.
- The tone of "summary" must be professional and factual.
- Do not speculate about context not visible in the frame.
- "tools" should list only objects/tools that are clearly identifiable.
- "actions" should only describe activity that is clearly happening.
- "focus_regions" must highlight the main activity: hands, tools, objects being worked on, documents being read. NEVER mark faces as focus regions.
- "redaction_regions" must ONLY include faces and heads (ONLY the head/face area, NOT the body). Also blur sensitive personal items like screens displaying private info, family photos, or documents with PII.
- CRITICAL: When defining "redaction_regions" for faces, be GENEROUS. Include the entire head, hair, ears, and chin. Add a safety margin to ensure the face is fully covered even if the person moves slightly. It is better to blur a bit too much around the head than to leave part of a face exposed.
- CRITICAL: DO NOT blur the person's hands, arms, torso, or the objects they are interacting with (unless it's PII). Only blur faces/heads from the neck up.
- If you see hands holding items or working, those hands must be in "focus_regions", NEVER in "redaction_regions".
- Example of what TO blur: A person's face, a computer screen with email, a visible badge with a name.
- Example of what NOT to blur: Hands, keyboard, tools, the desk surface, body below the neck.
- Set "isBeforeCandidate" to true only if the frame clearly shows the initial state of a task/event.
- Set "isAfterCandidate" to true only if the frame clearly shows the completed state.
- If the visuals mostly show a person's face or non-activity content, set both "isBeforeCandidate" and "isAfterCandidate" to false.
- If no tools/objects are visible, return "tools": [].
- If no clear actions are visible, return "actions": [].
- If no specific focus is needed, return "focus_regions": [].
- If there is nothing that needs to be blurred, return "redaction_regions": [].
- CRITICAL FINAL CHECK: If the frame shows only hands doing work with no faces visible, "redaction_regions" should be EMPTY [].
`.trim();

    try {
        const parts: any[] = [{ text: prompt }];

        if (usingVideo) {
            parts.push({
                fileData: {
                    mimeType: uploadedVideo.mimeType,
                    fileUri: uploadedVideo.fileUri,
                },
            });
            parts.push({
                text: `Analyze the video segment from ${episode.startTime}s to ${episode.endTime}s.`,
            });
            if (data) {
                // Also provide the thumbnail context to ground the result
                parts.push({ inlineData: { mimeType, data } });
            }
        } else {
            parts.push({ inlineData: { mimeType, data } });
        }

        const response = await callGemini({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: 'user',
                    parts,
                },
            ],
        });

        const text = extractText(response);
        const parsed = normaliseJson<any>(text, {});
        return coerceEpisodeInsight(parsed);
    } catch (error) {
        console.error('Gemini episode analysis failed', error);
        return coerceEpisodeInsight({});
    }
};

export interface BeforeAfterSelection {
    beforeIndex: number | null;
    afterIndex: number | null;
}

export const selectBeforeAfterFromFrames = async (
    frames: string[]
): Promise<BeforeAfterSelection> => {
    if (!frames.length) {
        return { beforeIndex: null, afterIndex: null };
    }

    const parts: any[] = [];

    frames.forEach((frame, index) => {
        const { mimeType, data } = dataUrlToBase64(frame);
        parts.push({ text: `Frame ${index}` });
        parts.push({ inlineData: { mimeType, data } });
    });

    const prompt = `
You are selecting the best BEFORE and AFTER photos from a short work video.
The frames are provided in chronological order from the worker's body camera in a customer's home.

Goal:
- BEFORE: a frame that clearly shows the problem area or work area before the job is completed (for example, blockage, damage, exposed components, or a clearly incomplete state).
- AFTER: a frame that clearly shows the result once the work has been completed or significantly improved (for example, cleared blockage, restored components, sealed connections, or a visibly finished setup).

Privacy and relevance rules:
- Avoid frames where a person's face or upper body is the main focus (selfie-style or talking-to-camera shots). These should not be chosen as BEFORE or AFTER.
- Prefer frames where the work area and components take up most of the image and it is visually obvious what changed between BEFORE and AFTER.
- If you cannot find a suitable BEFORE or AFTER frame that clearly matches the definitions above, use null for that value.

Timeline rules (frames are in time order from 0 to ${frames.length - 1}):
- BEFORE should be chosen from the earlier part of the video: prefer frames from the first half, ideally the first third, where the problem or pre-work condition is visible.
- AFTER should be chosen from the later part of the video: prefer frames from the second half, ideally the last third, where the work looks finished or clearly improved.
- Enforce BEFORE to come strictly before AFTER in time: beforeIndex must be less than afterIndex. If that is not possible, set beforeIndex or afterIndex to null instead of forcing a bad choice.

Return a strict JSON object:
{
  "beforeIndex": number | null, // index of the chosen BEFORE frame from 0 to ${frames.length - 1}, or null if none is suitable
  "afterIndex": number | null   // index of the chosen AFTER frame from 0 to ${frames.length - 1}, or null if none is suitable
}

Only return the JSON object with these two keys.
`.trim();

    try {
        const response = await callGemini({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        ...parts,
                    ],
                },
            ],
        });

        const text = extractText(response);
        const parsed = normaliseJson<BeforeAfterSelection>(text, {
            beforeIndex: null,
            afterIndex: null,
        });

        const clampIndex = (value: unknown): number | null => {
            if (typeof value !== 'number' || !Number.isFinite(value)) return null;
            const idx = Math.round(value);
            if (idx < 0 || idx >= frames.length) return null;
            return idx;
        };

        let beforeIndex = clampIndex(parsed.beforeIndex);
        let afterIndex = clampIndex(parsed.afterIndex);

        // Enforce coarse timeline constraints: BEFORE from earlier part, AFTER from later part
        const half = Math.floor(frames.length / 2);
        const minAfter = half;

        if (beforeIndex !== null && beforeIndex >= half) {
            beforeIndex = null;
        }

        if (afterIndex !== null && afterIndex < minAfter) {
            afterIndex = null;
        }

        // Ensure BEFORE is strictly before AFTER
        if (beforeIndex !== null && afterIndex !== null && beforeIndex >= afterIndex) {
            // If they collide or are reversed, drop BEFORE (safer than choosing a late "before")
            beforeIndex = null;
        }

        return { beforeIndex, afterIndex };
    } catch (error) {
        console.error('Gemini before/after frame selection failed', error);
        return { beforeIndex: null, afterIndex: null };
    }
};

export const generateReportOverview = async (
    episodes: GeminiEpisodeInsight[]
): Promise<GeminiReportOverview> => {
    const prompt = `
You are helping produce a formal worksite activity report.
You will receive a list of episode summaries gathered from video analysis of a job in progress.
Provide a JSON response with:
{
  "projectTitle": string, // concise title (<= 6 words)
  "site": string, // if the site is unknown use "On-site location"
  "summary": string, // paragraph summarizing the job done across the episodes
  "tasks": string[] // 3 to 5 bullet-ready task descriptions in past tense
}
Keep the tone factual and professional and never invent locations.
`.trim();

    const context = episodes
        .map(
            (episode, index) =>
                `Episode ${index + 1}: summary="${episode.summary}", tools=[${episode.tools.join(', ')}], actions=[${episode.actions.join(', ')}]`
        )
        .join('\n');

    try {
        const response = await callGemini({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: `${prompt}\n\nEpisode data:\n${context}` },
                    ],
                },
            ],
        });

        const text = extractText(response);
        const parsed = normaliseJson<GeminiReportOverview>(text, {
            projectTitle: 'Worksite Activity',
            site: 'On-site location',
            summary: 'Automated summary is unavailable.',
            tasks: [],
        });

        return parsed;
    } catch (error) {
        console.error('Gemini overview generation failed', error);
        return {
            projectTitle: 'Worksite Activity',
            site: 'On-site location',
            summary: 'Automated summary is unavailable.',
            tasks: [],
        };
    }
};

const formatTurns = (turns: ReportEditTurn[], limit = 2): string =>
    turns
        .slice(-limit)
        .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
        .join('\n');

const stripImagesFromReport = (report: ReportData): ReportData => {
    const episodes = report.episodes.map((ep) => ({
        ...ep,
        episodeData: {
            ...ep.episodeData,
            thumbnail: '[omitted]',
            highlightedFrame: '[omitted]',
        },
    }));

    return {
        ...report,
        beforeImage: report.beforeImage ? '[omitted]' : '',
        afterImage: report.afterImage ? '[omitted]' : '',
        episodes,
        // Remove candidateFrames - this is an array of base64 images that can be 100s of KB
        candidateFrames: [],
        candidateFrameTimes: report.candidateFrameTimes ?? [],
    };
};

export const pickFramesForEpisode = async (
    request: FrameSelectionRequest
): Promise<FrameSelectionResult> => {
    const { episodeSummary, startTime, endTime, candidateFrames, candidateFrameTimes, maxFrames = 2 } = request;

    if (!candidateFrames.length) {
        return {
            status: 'not_in_candidates',
            frameIndices: [],
            reason: 'No candidate frames available.',
        };
    }

    const labeledFrames = candidateFrames
        .map((_, idx) => {
            const t = candidateFrameTimes[idx];
            return `Frame ${idx} @ ${typeof t === 'number' ? `${t.toFixed(1)}s` : 'unknown time'}`;
        })
        .join('\n');

    const prompt = `
You are selecting representative frames for an episode in a worksite report.
Episode summary: ${episodeSummary}
Episode time span: ${startTime ?? '?'}s – ${endTime ?? '?'}s

You are given a list of candidate frames (by index and timestamp). Pick the best ${maxFrames} frames that clearly show the described action. If the action is NOT visible in any provided frame, say so. If the action exists but none of the listed frames capture it, say you need frames closer to the event.

Return strict JSON:
{
  "status": "selected" | "not_visible" | "not_in_candidates",
  "frameIndices": number[],   // only when status = "selected"
  "reason": string            // short reason
}

Candidate frames:
${labeledFrames}
`.trim();

    try {
        const response = await callGemini({
            model: GEMINI_MODEL_EDIT,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text = extractText(response);
        const parsed = normaliseJson<FrameSelectionResult>(text, {
            status: 'not_in_candidates',
            frameIndices: [],
            reason: 'Failed to parse Gemini response.',
        });

        if (parsed.status === 'selected') {
            const indices = Array.isArray(parsed.frameIndices)
                ? parsed.frameIndices
                    .map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : -1))
                    .filter((v) => v >= 0 && v < candidateFrames.length)
                    .slice(0, maxFrames)
                : [];
            return {
                status: indices.length ? 'selected' : 'not_in_candidates',
                frameIndices: indices,
                reason: parsed.reason || '',
            };
        }

        if (parsed.status === 'not_visible' || parsed.status === 'not_in_candidates') {
            return {
                status: parsed.status,
                frameIndices: [],
                reason: parsed.reason || '',
            };
        }

        return {
            status: 'not_in_candidates',
            frameIndices: [],
            reason: parsed.reason || 'Unknown status.',
        };
    } catch (error) {
        console.error('Gemini frame selection failed', error);
        return {
            status: 'not_in_candidates',
            frameIndices: [],
            reason: 'Gemini frame selection failed.',
        };
    }
};

export const editReportWithGemini = async (args: {
    report: ReportData;
    message: string;
    turns?: ReportEditTurn[];
    video?: GeminiVideoReference | null;
}): Promise<ReportEditResponse> => {
    const { report, message, turns = [], video } = args;

    // Smart detection: Include video if user is asking to ADD new content
    const isAddingContent = /\b(add|include|insert|create)\b/i.test(message);
    const shouldUseVideo = isAddingContent && video;

    const rules = `
You are editing a worksite report based on the user's request.
- The report was generated from a bodycam video that has already been fully analyzed.
- You have the complete report data with all episodes, summaries, and metadata.${shouldUseVideo ? '\n- You have access to the full source video to verify and find new content.' : ''}
- For edits: Only modify fields the user explicitly requests to change.
- For additions: ${shouldUseVideo ? 'Review the video to find the described content, extract the timestamp, and add it as a new episode with proper details.' : 'Only add new episodes if the user provides specific timestamps (e.g., "at 2:30" or "between 1:00-1:15").'}
- CRITICAL: If the user asks to add content, do NOT refuse by saying it is already covered. Add a new episode for the requested action, even if similar content exists. Do not alter existing episodes unless the user explicitly asks you to change them.
- CRITICAL: If the user asks to add content, do NOT refuse by saying it is already covered. Add a new episode for the requested action, even if similar content exists. Do not alter existing episodes unless the user explicitly asks you to change them.
- Do NOT merge multiple distinct actions/tools into a single episode or thumbnail. If an action involves a different tool or a clearly separate step (e.g., screwdriver vs. jet hose), create separate episodes with their own timestamps and frames that visually show that action/tool.
- Each new episode must have precise, narrow timestamps (start/end) that match the specific action shown in its thumbnail/frame. Keep spans tight (a few seconds) and centered on the frame you pick. Do not reuse an unrelated frame; pick a frame where the action/tool is clearly visible.
- When adding new episodes, you MUST include episodeData with: startTime, endTime, detectedTools, keyActions. The thumbnail will be added automatically later.
- Do NOT invent or guess content. Only add what you can clearly see in the video or what the user explicitly describes with a timestamp.
- Preserve all existing fields unless explicitly instructed to change them.
- Do NOT change or blank out any media fields (before/after images, thumbnails, highlighted frames). Keep them exactly as provided.
- Output strict JSON: { "reply": string, "report": <full updated report object>, "error": string | null }.
`.trim();

    const history = formatTurns(turns, 2);
    const condensedReport = stripImagesFromReport(report);
    const currentReportJson = JSON.stringify(condensedReport);

    const parts: any[] = [
        {
            text: [
                rules,
                `Current report JSON: ${currentReportJson}`,
                history ? `Recent chat:\n${history}` : '',
                `User request: ${message}`,
            ]
                .filter(Boolean)
                .join('\n\n'),
        },
    ];

    // Smart video inclusion: only when adding new content
    let cachedContent: string | undefined;

    if (shouldUseVideo) {
        if (video.cacheName) {
            console.log('🎥 Using cached video context:', video.cacheName);
            cachedContent = video.cacheName;
        } else {
            console.log('🎥 Including video for content addition request');
            parts.push({
                fileData: { mimeType: video.mimeType, fileUri: video.fileUri },
            });
        }
    }

    try {
        console.log(shouldUseVideo ? '📝 Sending request with video' : '📝 Sending text-only request');
        const response = await callGemini({
            model: GEMINI_MODEL_EDIT,
            cachedContent,
            contents: [
                {
                    role: 'user',
                    parts,
                },
            ],
        });

        const text = extractText(response);
        const parsed = normaliseJson<{ reply?: string; report?: ReportData | null; error?: string | null }>(text, {
            reply: '',
            report: null,
            error: 'Unable to parse Gemini response.',
        });

        let updatedReport = parsed.report ?? null;

        // Auto-sort episodes by startTime to maintain chronological order
        if (updatedReport?.episodes) {
            const sortedEpisodes = [...updatedReport.episodes].sort((a, b) => {
                const timeA = a.episodeData?.startTime ?? 0;
                const timeB = b.episodeData?.startTime ?? 0;
                return timeA - timeB;
            });
            updatedReport = { ...updatedReport, episodes: sortedEpisodes };
        }

        const reply = parsed.reply || (parsed.error ? String(parsed.error) : text);

        return {
            reply,
            updatedReport,
            error: parsed.error ?? undefined,
        };
    } catch (error) {
        console.error('Gemini report edit failed', error);
        return {
            reply: 'Unable to process your edit right now.',
            updatedReport: null,
            error: 'Gemini edit call failed.',
        };
    }
};

export const analyzeFullVideoWithGemini = async (
    video: GeminiVideoReference
): Promise<GeminiFullScanEpisode[]> => {
    const prompt = `
You have the full source video. Scan the entire timeline and identify key segments of visible work.

CRITICAL TIMELINE RULES:
1. **Use real seconds**: Timestamps must correspond to the video player time (e.g., startTime: 12.5, endTime: 45.0).
2. **Reject micro-segments**: DO NOT return episodes shorter than 1.5 seconds. If the action is unclear or too brief, omit the segment.
3. **Visible action only**: Only return segments where a visible action or tool use is clearly happening. Skip idle/filler or shots with no obvious work.
4. **Full coverage of the action**: Keep each segment to the tight window where the action is visible (a few seconds, not milliseconds). Avoid giant spans with no action.
5. **Chronological**: Return episodes in time order.

Return strict JSON:
{
  "episodes": [
    {
      "startTime": number,   // seconds (e.g. 10.5)
      "endTime": number,     // seconds (e.g. 24.0)
      "summary": string,     // 1 sentence, factual
      "tools": string[],     // clearly visible tools/objects in use
      "actions": string[],   // clearly visible actions
      "isBeforeCandidate": boolean, // true only if clearly a "before" state
      "isAfterCandidate": boolean,  // true only if clearly an "after" state
      "frameTime": number | null,   // best timestamp for a thumbnail INSIDE this segment; if unsure, use the midpoint
      "focus_regions": [ { "x": number, "y": number, "width": number, "height": number } ],
      "redaction_regions": [ { "x": number, "y": number, "width": number, "height": number } ]
    }
  ]
}
Rules:
- Keep segments tight around the visible action; do not merge unrelated steps. Do not invent segments for filler or idle moments.
- Do NOT include a segment if no tool/action is visible; omit it instead.
- Only include tools/actions you can clearly see.
- Mark faces/screens in redaction_regions; never blur hands/tools.
- Pick frameTime INSIDE the segment where the key action/tool is clearly visible and faces are minimal; avoid 0s unless the action truly starts immediately. If frameTime is unclear, use the midpoint of the segment.
- If nothing meaningful is visible, return an empty episodes array.
- No extra text outside the JSON.
`.trim();

    try {
        const response = await callGemini({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { fileData: { mimeType: video.mimeType, fileUri: video.fileUri } },
                    ],
                },
            ],
        });

        const text = extractText(response);
        const parsed = normaliseJson<{ episodes?: any[] }>(text, { episodes: [] });
        const episodes = Array.isArray(parsed.episodes) ? parsed.episodes : [];
        const coerced = episodes
            .map((ep) => coerceFullScanEpisode(ep))
            .filter((ep): ep is GeminiFullScanEpisode => !!ep);

        // Sort by start time for consistency
        return coerced.sort((a, b) => a.startTime - b.startTime);
    } catch (error) {
        console.error('Gemini full video analysis failed', error);
        return [];
    }
};
