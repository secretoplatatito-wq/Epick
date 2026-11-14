export type AspectRatioProfile = '9:16' | '16:9' | '1:1';

export type RankingCategory =
  | 'Funniest Animal Moments'
  | 'Most Unexpected Moments'
  | 'Craziest Sports Moments'
  | 'Most Satisfying Videos'
  | 'Funniest Fails'
  | 'Most Unbelievable Coincidences'
  | 'Top 10 Incredible Animal Reactions'
  | string;

export interface VideoMetadata {
  filename: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  hasAudio: boolean;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  bitrateKbps?: number;
  fileSizeBytes: number;
}

export interface SceneBoundary {
  index: number;
  timestampSec: number;
  formattedTime: string;
  sceneScore: number;
  audioPeakDb: number;
}

export interface KeyframeAsset {
  id: string;
  timestampSec: number;
  formattedTime: string;
  relativePath: string;
  publicUrl: string;
  sceneIndex: number;
}

export interface RankedClip {
  id: string;
  rank: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  startFormatted: string;
  endFormatted: string;
  description: string;
  caption: string;
  score: number;
  reason: string;
  sourceVideoRef: string;
  keyframeUrl?: string;
  transition: 'fade' | 'cut' | 'slideleft' | 'zoom';
}

export interface VisualOverlayConfig {
  referenceId: string;
  aspectRatio: AspectRatioProfile;
  titlePlacement: 'top-banner' | 'lower-third' | 'top-minimal';
  rankingBadgePlacement: 'top-left' | 'top-right' | 'bottom-left';
  captionPlacement: 'bottom-third' | 'bottom-bar' | 'center-low';
  accentColor: string;
  fontFamily: string;
  backgroundTreatment: 'obsidian-blur' | 'clean-matte' | 'studio-frame';
  showRankingNumber: boolean;
  showCaptions: boolean;
  includeMusicBed: boolean;
}

export interface VisualReferenceItem {
  id: string;
  imageUrl: string;
  category: string;
  description: string;
  recommendedUse: string;
  supportedFormats: AspectRatioProfile[];
  attributes: {
    titlePlacement: VisualOverlayConfig['titlePlacement'];
    rankingBadgePlacement: VisualOverlayConfig['rankingBadgePlacement'];
    captionPlacement: VisualOverlayConfig['captionPlacement'];
    typography: string;
    textAnimation: string;
    captionStyling: string;
    aspectRatio: AspectRatioProfile;
    transitionStyle: RankedClip['transition'];
    backgroundTreatment: VisualOverlayConfig['backgroundTreatment'];
  };
}

export interface WorkspaceExportMetadata {
  renderStatus: 'idle' | 'analyzing' | 'rendering' | 'completed' | 'error';
  progressPct: number;
  renderedFilePath?: string;
  renderedBytes?: number;
  renderedAt?: string;
  exportProfile: AspectRatioProfile;
  errorMessage?: string;
}

export interface WorkspaceProject {
  uuid: string;
  ownerId: string;
  title: string;
  viralTitleCandidates: string[];
  description: string;
  category: RankingCategory;
  instruction: string;
  createdAt: string;
  updatedAt: string;
  sourceVideoPath?: string;
  sourceVideoUrl?: string;
  videoMetadata?: VideoMetadata;
  scenes: SceneBoundary[];
  keyframes: KeyframeAsset[];
  clips: RankedClip[];
  overlayConfig: VisualOverlayConfig;
  referenceImageUrls: string[];
  exportMetadata: WorkspaceExportMetadata;
  aiAnalysisSummary?: string;
  providerUsed?: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  documentationUrl: string;
  apiEndpoint: string;
  authRequirement: string;
  freeTierLimitations: string;
  capabilities: string[];
  available: boolean;
  fallbackProviderId: string | null;
  tier: 'local-open-source' | 'free-api' | 'optional-paid';
}

export interface FeedbackSubmission {
  id: string;
  projectUuid?: string;
  rating: number;
  category: 'AI Ranking' | 'Video Render' | 'MCP Integration' | 'UI / UX' | 'Bug Report' | 'General';
  comment: string;
  issueDescription?: string;
  timestamp: string;
  deliveryStatus: 'sent-smtp' | 'sent-webhook' | 'queued-local-spool';
  recipient: string;
}
