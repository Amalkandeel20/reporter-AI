import { GoogleGenAI } from '@google/genai';
import { Episode, EpisodeInsightRequest, GeminiEpisodeInsight, GeminiReportOverview, BoundingBox } from '../types';

const GEMINI_MODEL = 'gemini-2.0-flash';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('Gemini API key is not set. Add VITE_GEMINI_API_KEY to your environment.');
}

const geminiClient = new GoogleGenAI({ apiKey });

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

    try {
        return JSON.parse(withoutFence) as T;
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

    return {
        summary,
        tools,
        actions,
        focusRegions,
        redactionRegions,
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
You are an assistant that documents construction and repair work for compliance reports.
Review the provided still frame from a user-captured video segment. The frame covers work that starts at ${episode.startTime}s and ends at ${episode.endTime}s in the clip.

Return a strict JSON object with the following shape:
{
  "summary": string, // one sentence describing what is happening
  "tools": string[], // short names of handheld or power tools clearly visible, empty array if none
  "actions": string[], // verbs or short phrases describing the work activity (e.g. "tightening bolts"), empty array if unsure
  "focus_regions": [ // regions to keep visible (tools and work area only; exclude people)
    { "x": number, "y": number, "width": number, "height": number } // all values normalized 0-1 relative to image width/height
  ],
  "redaction_regions": [ // regions containing faces or people that must remain blurred
    { "x": number, "y": number, "width": number, "height": number }
  ]
}

Do not include any additional keys or commentary.
If you cannot see the tools clearly, respond with empty arrays for tools and actions but still include a concise summary.
Always provide empty arrays for focus_regions or redaction_regions if none are visible.
Focus regions should capture just the work surface, tools, or worker hands. Faces or bodies must be listed under redaction_regions instead.
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
