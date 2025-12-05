export interface Task {
  id: number;
  title: string;
  description: string;
  completed: boolean;
}

export interface BoundingBox {
  x: number; // normalized 0-1
  y: number;
  width: number;
  height: number;
}

export type AnalysisMode = 'standard' | 'demo' | 'full';

export interface Episode {
  id: number;
  startTime: number;
  endTime: number;
  detectedTools: string[];
  keyActions: string[];
  thumbnail: string; // base64 data URL
  highlightedFrame: string; // background blurred frame
  activityBounds?: BoundingBox | null;
}

export interface ReportData {
  projectTitle: string;
  site: string;
  date: string;
  summary: string;
  episodes: Array<{
    episodeData: Episode;
    summary: string;
  }>;
  tasksCompleted: Array<{
    name: string;
    status: 'Completed' | 'Pending';
  }>;
  beforeImage: string;
  afterImage: string;
  demoMode?: boolean;
  analysisMode?: AnalysisMode;
  geminiVideo?: GeminiVideoReference | null;
  candidateFrames?: string[];
  candidateFrameTimes?: number[];
  sessionCleared?: boolean; // True once "Finish & Clear" is clicked - locks editing
}

export enum Tab {
  Tasks = 'Tasks',
  Camera = 'Camera',
  Reports = 'Reports',
}

export interface EpisodeInsightRequest {
  episode: Episode;
  contextFrame: string;
  demoMode?: boolean;
  uploadedVideo?: GeminiVideoReference | null;
}

export interface GeminiEpisodeInsight {
  summary: string;
  tools: string[];
  actions: string[];
  focusRegions: BoundingBox[];
  redactionRegions: BoundingBox[];
  isBeforeCandidate?: boolean;
  isAfterCandidate?: boolean;
}

export interface GeminiFullScanEpisode {
  startTime: number;
  endTime: number;
  summary: string;
  tools: string[];
  actions: string[];
  isBeforeCandidate: boolean;
  isAfterCandidate: boolean;
  frameTime: number | null;
  focusRegions: BoundingBox[];
  redactionRegions: BoundingBox[];
}

export interface GeminiReportOverview {
  projectTitle: string;
  site: string;
  summary: string;
  tasks: string[];
}

export interface GeminiVideoReference {
  fileUri: string;
  mimeType: string;
  name?: string;
  cacheName?: string;
}

export interface VideoAnalysis {
  episodes: Episode[];
  beforeFrame: string;
  afterFrame: string;
  // Ordered candidate frames from across the video (data URLs)
  candidateFrames?: string[];
  candidateFrameTimes?: number[];
}

export type ChatRole = 'user' | 'assistant';

export interface ReportEditTurn {
  role: ChatRole;
  content: string;
}

export interface ReportEditResponse {
  reply: string;
  updatedReport: ReportData | null;
  error?: string;
}
