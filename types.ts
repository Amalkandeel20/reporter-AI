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
}

export enum Tab {
  Tasks = 'Tasks',
  Camera = 'Camera',
  Reports = 'Reports',
}

export interface EpisodeInsightRequest {
  episode: Episode;
  contextFrame: string;
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

export interface GeminiReportOverview {
  projectTitle: string;
  site: string;
  summary: string;
  tasks: string[];
}

export interface VideoAnalysis {
  episodes: Episode[];
  beforeFrame: string;
  afterFrame: string;
  // Ordered candidate frames from across the video (data URLs)
  candidateFrames?: string[];
}
