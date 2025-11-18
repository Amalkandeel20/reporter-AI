import { GoogleGenAI } from '@google/genai';
import { Episode, EpisodeInsightRequest, GeminiEpisodeInsight, GeminiReportOverview, BoundingBox } from '../types';

const GEMINI_MODEL = 'gemini-2.5-flash';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('Gemini API key is not set. Add VITE_GEMINI_API_KEY to your environment.');
}

const geminiClient = new GoogleGenAI({ apiKey }) as any;

const callGemini = async (payload: Record<string, unknown>) => {
    if (geminiClient.responses && typeof geminiClient.responses.generate === 'function') {
        return geminiClient.responses.generate(payload as never);
    }
    if (geminiClient.models && typeof geminiClient.models.generateContent === 'function') {
        return geminiClient.models.generateContent(payload as never);
    }
    throw new Error('Gemini client does not expose a compatible generate method.');
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

export const analyzeEpisodeWithGemini = async (
    request: EpisodeInsightRequest
): Promise<GeminiEpisodeInsight> => {
    const { episode, contextFrame } = request;
    const { mimeType, data } = dataUrlToBase64(contextFrame);

    const prompt = `
You are an assistant that documents real-world construction, maintenance, and repair work in private homes.
Field workers wear a body-mounted camera while working in a customer's house. The goal is to build an accurate, privacy-safe "digital twin" of the work that was actually performed.

You are given a single still frame from the video. This frame represents work taking place between ${episode.startTime}s and ${episode.endTime}s in the clip.

Your job is to describe only the work that is clearly visible and to identify where to focus and where to blur for privacy. You must never guess or add tasks that are not obviously supported by the image.

Return a strict JSON object with exactly this shape:
{
  "summary": string,        // 1 short, customer-friendly sentence describing the visible work (what is being done and to what, e.g. "Repairing a leaking copper pipe behind the kitchen wall.")
  "tools": string[],        // short names of handheld or power tools clearly visible and being used or ready for use (e.g. "cordless drill", "pipe wrench"); empty array if none are clearly visible
  "actions": string[],      // short verb phrases that describe the actual work activity visible in the frame (e.g. "tightening bolts", "cutting drywall"); use empty array if you are not sure
  "isBeforeCandidate": boolean, // true if this frame would make a good \"before\" photo that shows the problem or work area before it is fully resolved; otherwise false
  "isAfterCandidate": boolean,  // true if this frame would make a good \"after\" photo that shows the finished or improved result of the work; otherwise false
  "focus_regions": [        // regions to keep clearly visible in the customer report (only tools, worker hands, and immediate work area; no faces or full bodies)
    { "x": number, "y": number, "width": number, "height": number } // all values normalized to 0–1 relative to image width and height
  ],
  "redaction_regions": [    // regions that contain faces, people, personal belongings, or anything that could identify the occupants and must be blurred
    { "x": number, "y": number, "width": number, "height": number }
  ]
}

Rules:
- Always return valid JSON that matches the schema above, with no extra keys and no trailing comments or text.
- The tone of "summary" must be clear and professional but easy for a homeowner to understand.
- Do not hide problems or risky conditions: if you can clearly see damage, hazards, or temporary fixes, include that in the summary or actions.
- Do not speculate about future work or hidden parts of the system; describe only what is visible in this frame.
- "tools" should list only tools that are clearly identifiable; if you cannot confidently name a tool, do not include it.
- "actions" should only describe work that is clearly happening in this frame (for example, "turning a valve" rather than "fixing plumbing" if that is all you can see).
- "focus_regions" must only highlight the work itself: tools, worker hands, and the immediate work surface or components being worked on (pipes, wiring, fixtures, etc.).
- "redaction_regions" must include faces, heads, full bodies, and any sensitive personal items (for example, family photos, documents, computer screens, or visible house numbers).
- Set "isBeforeCandidate" to true only if:
    - The frame clearly shows the problem area, equipment, or setup before the work is fully completed (for example, damaged, dirty, blocked, leaking, or disassembled components), AND
    - The work area or components occupy most of the visible frame, AND
    - No person's face or upper body dominates the frame. If a person is the main subject, set "isBeforeCandidate" to false.
- Set "isAfterCandidate" to true only if:
    - The frame clearly shows the result after work has been completed or significantly improved (for example, clean or restored components, sealed connections, reassembled equipment, or a visibly cleared blockage), AND
    - The finished work area occupies most of the frame and is easy for a homeowner to visually understand as "after", AND
    - No person's face or upper body dominates the frame. If the frame looks like a selfie or the person is the main subject, set "isAfterCandidate" to false.
- If the frame mostly shows a worker's face, body, or other non-work content (for example, talking to camera, walking, or unrelated scenery), set both "isBeforeCandidate" and "isAfterCandidate" to false.
- If no tools are visible, return "tools": [].
- If no clear actions are visible, return "actions": [].
- If no work-focused regions are needed, return "focus_regions": [].
- If there is nothing that needs to be blurred, return "redaction_regions": [].
`.trim();

    try {
        const response = await callGemini({
            model: GEMINI_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType, data } },
                    ],
                },
            ],
        });

        const text = extractText(response);
        const parsed = normaliseJson<any>(text, {});
        return coerceEpisodeInsight(parsed);
    } catch (error) {
        console.error('Gemini episode analysis failed', error);
        return {
            summary: 'No automated summary available for this segment.',
            tools: [],
            actions: [],
            focusRegions: [],
            redactionRegions: [],
        };
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
