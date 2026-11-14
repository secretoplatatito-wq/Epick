import fs from 'node:fs';
import path from 'node:path';
import type { AspectRatioProfile, RankedClip, RankingCategory, WorkspaceProject } from '../types';
import {
  getWorkspace,
  getWorkspaceDir,
  updateWorkspace,
} from '../storage/workspaceStore';
import {
  analyzeAudioPeaks,
  detectScenes,
  extractKeyframes,
  inspectVideo,
  renderRankingVideo,
} from '../../video-engine/ffmpegPipeline';
import {
  buildCandidateWindowsFromScenes,
  clampClipWindow,
  formatTimestamp,
  sortClipsForCountdown,
} from '../../video-engine/rankingEngine';
import {
  analyzeMomentsWithGemini,
  generateViralTitlesWithGemini,
} from '../../ai/orchestration/geminiService';
import { getReferenceById } from '../../ai/visualReferences';
import { ensureSampleVideo } from '../storage/sampleVideoGenerator';

export function buildWorkspaceUrls(uuid: string, baseUrl: string) {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const encoded = encodeURIComponent(uuid);
  return {
    workspace: `${cleanBase}/api/workspace/${encoded}/`,
    preview: `${cleanBase}/api/workspace/${encoded}/preview/`,
    download: `${cleanBase}/api/workspace/${encoded}/download/`,
  };
}

export async function attachSampleVideoToWorkspace(uuid: string, presetId: string): Promise<WorkspaceProject> {
  const ws = getWorkspace(uuid);
  if (!ws) throw new Error(`Workspace ${uuid} not found.`);

  const { filePath, preset } = await ensureSampleVideo(presetId);
  const wsDir = getWorkspaceDir(uuid);
  const destPath = path.join(wsDir, `source_${preset.id}.mp4`);
  fs.copyFileSync(filePath, destPath);

  const metadata = await inspectVideo(destPath);
  const updated = updateWorkspace(uuid, {
    sourceVideoPath: destPath,
    sourceVideoUrl: `/api/workspace/${encodeURIComponent(uuid)}/source/`,
    videoMetadata: metadata,
    category: preset.category,
  });
  if (!updated) throw new Error('Failed to update workspace with sample video.');
  return updated;
}

export async function attachUploadedVideoToWorkspace(
  uuid: string,
  tempFilePath: string,
  originalName: string
): Promise<WorkspaceProject> {
  const ws = getWorkspace(uuid);
  if (!ws) throw new Error(`Workspace ${uuid} not found.`);

  const wsDir = getWorkspaceDir(uuid);
  const ext = path.extname(originalName) || '.mp4';
  const safeName = `source${ext.replace(/[^a-zA-Z0-9.]/g, '')}`;
  const destPath = path.join(wsDir, safeName);
  fs.renameSync(tempFilePath, destPath);

  const metadata = await inspectVideo(destPath);
  const updated = updateWorkspace(uuid, {
    sourceVideoPath: destPath,
    sourceVideoUrl: `/api/workspace/${encodeURIComponent(uuid)}/source/`,
    videoMetadata: metadata,
  });
  if (!updated) throw new Error('Failed to update workspace with uploaded video.');
  return updated;
}

export async function runFullVideoAnalysisAndRanking(params: {
  uuid: string;
  targetClipCount?: number;
  category?: RankingCategory;
  instruction?: string;
}): Promise<WorkspaceProject> {
  const ws = getWorkspace(params.uuid);
  if (!ws) throw new Error(`Workspace ${params.uuid} not found.`);
  if (!ws.sourceVideoPath || !fs.existsSync(ws.sourceVideoPath)) {
    throw new Error('No source video attached to this workspace. Upload a video or load a sample first.');
  }

  updateWorkspace(params.uuid, (prev) => ({
    ...prev,
    category: params.category || prev.category,
    instruction: params.instruction || prev.instruction,
    exportMetadata: {
      ...prev.exportMetadata,
      renderStatus: 'analyzing',
      progressPct: 15,
      errorMessage: undefined,
    },
  }));

  try {
    const metadata = await inspectVideo(ws.sourceVideoPath);
    const scenes = await detectScenes(ws.sourceVideoPath, metadata.durationSec, 0.22);
    const wsDir = getWorkspaceDir(params.uuid);
    const kfTimestamps = scenes.slice(0, 10).map((s) => s.timestampSec + 0.4);
    const keyframes = await extractKeyframes({
      filePath: ws.sourceVideoPath,
      timestamps: kfTimestamps,
      outDir: path.join(wsDir, 'keyframes'),
      workspaceUuid: params.uuid,
    });

    const desiredCount = Math.min(10, Math.max(3, params.targetClipCount ?? 6));
    const baseClips = buildCandidateWindowsFromScenes({
      durationSec: metadata.durationSec,
      scenes,
      keyframes,
      targetClipCount: desiredCount,
      sourceVideoRef: metadata.filename,
    });

    const aiResult = await analyzeMomentsWithGemini({
      category: params.category || ws.category,
      instruction: params.instruction || ws.instruction,
      durationSec: metadata.durationSec,
      keyframes,
      keyframesBaseDir: wsDir,
      baseClips,
    });

    const updated = updateWorkspace(params.uuid, (prev) => ({
      ...prev,
      title: aiResult.title,
      viralTitleCandidates: aiResult.viralTitleCandidates,
      description: aiResult.description,
      aiAnalysisSummary: aiResult.aiAnalysisSummary,
      providerUsed: aiResult.providerUsed,
      videoMetadata: metadata,
      scenes,
      keyframes,
      clips: aiResult.clips,
      exportMetadata: {
        ...prev.exportMetadata,
        renderStatus: 'idle',
        progressPct: 0,
      },
    }));

    if (!updated) throw new Error('Failed to save analyzed workspace.');
    return updated;
  } catch (err) {
    updateWorkspace(params.uuid, (prev) => ({
      ...prev,
      exportMetadata: {
        ...prev.exportMetadata,
        renderStatus: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    }));
    throw err;
  }
}

export async function renderWorkspaceCompilation(params: {
  uuid: string;
  aspectRatio?: AspectRatioProfile;
  referenceId?: string;
}): Promise<WorkspaceProject> {
  const ws = getWorkspace(params.uuid);
  if (!ws) throw new Error(`Workspace ${params.uuid} not found.`);
  if (!ws.sourceVideoPath || !fs.existsSync(ws.sourceVideoPath)) {
    throw new Error('Cannot render: no source video exists in this workspace.');
  }
  if (!ws.clips.length) {
    throw new Error('Cannot render: no clips detected yet. Run video analysis first.');
  }

  let nextOverlay = { ...ws.overlayConfig };
  if (params.referenceId) {
    const ref = getReferenceById(params.referenceId);
    nextOverlay = {
      ...nextOverlay,
      referenceId: ref.id,
      titlePlacement: ref.attributes.titlePlacement,
      rankingBadgePlacement: ref.attributes.rankingBadgePlacement,
      captionPlacement: ref.attributes.captionPlacement,
      backgroundTreatment: ref.attributes.backgroundTreatment,
      aspectRatio: params.aspectRatio ?? ref.attributes.aspectRatio,
    };
  } else if (params.aspectRatio) {
    nextOverlay.aspectRatio = params.aspectRatio;
  }

  updateWorkspace(params.uuid, (prev) => ({
    ...prev,
    overlayConfig: nextOverlay,
    exportMetadata: {
      ...prev.exportMetadata,
      renderStatus: 'rendering',
      progressPct: 10,
      exportProfile: nextOverlay.aspectRatio,
      errorMessage: undefined,
    },
  }));

  try {
    const wsDir = getWorkspaceDir(params.uuid);
    const outputFilePath = path.join(wsDir, 'output', `clippah_render_${params.uuid.slice(0, 8)}.mp4`);

    const result = await renderRankingVideo({
      sourceVideoPath: ws.sourceVideoPath,
      hasAudio: ws.videoMetadata?.hasAudio ?? true,
      clips: ws.clips,
      title: ws.title,
      overlayConfig: nextOverlay,
      workDir: wsDir,
      outputFilePath,
      onProgress: (pct) => {
        updateWorkspace(params.uuid, (prev) => ({
          ...prev,
          exportMetadata: {
            ...prev.exportMetadata,
            renderStatus: 'rendering',
            progressPct: pct,
          },
        }));
      },
    });

    const finalWs = updateWorkspace(params.uuid, (prev) => ({
      ...prev,
      overlayConfig: nextOverlay,
      exportMetadata: {
        renderStatus: 'completed',
        progressPct: 100,
        renderedFilePath: result.outputPath,
        renderedBytes: result.sizeBytes,
        renderedAt: new Date().toISOString(),
        exportProfile: nextOverlay.aspectRatio,
      },
    }));

    if (!finalWs) throw new Error('Failed to persist rendered workspace state.');
    return finalWs;
  } catch (err) {
    updateWorkspace(params.uuid, (prev) => ({
      ...prev,
      exportMetadata: {
        ...prev.exportMetadata,
        renderStatus: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    }));
    throw err;
  }
}

export function editClipInWorkspace(
  uuid: string,
  clipId: string,
  updates: Partial<Pick<RankedClip, 'startSec' | 'endSec' | 'caption' | 'description' | 'rank' | 'score' | 'transition'>>
): WorkspaceProject {
  const ws = getWorkspace(uuid);
  if (!ws) throw new Error(`Workspace ${uuid} not found.`);
  const totalDur = ws.videoMetadata?.durationSec ?? 30;

  const updatedClips = ws.clips.map((clip) => {
    if (clip.id !== clipId) return clip;
    const rawStart = updates.startSec ?? clip.startSec;
    const rawEnd = updates.endSec ?? clip.endSec;
    const clamped = clampClipWindow(rawStart, rawEnd, totalDur, 1.0);
    return {
      ...clip,
      ...updates,
      startSec: clamped.startSec,
      endSec: clamped.endSec,
      durationSec: clamped.durationSec,
      startFormatted: formatTimestamp(clamped.startSec),
      endFormatted: formatTimestamp(clamped.endSec),
    };
  });

  const sorted = updates.score !== undefined ? sortClipsForCountdown(updatedClips, 'countdown') : updatedClips;
  const saved = updateWorkspace(uuid, { clips: sorted });
  if (!saved) throw new Error('Failed to save clip edit.');
  return saved;
}

export async function refreshViralTitle(uuid: string): Promise<WorkspaceProject> {
  const ws = getWorkspace(uuid);
  if (!ws) throw new Error(`Workspace ${uuid} not found.`);
  const res = await generateViralTitlesWithGemini({
    category: ws.category,
    clipDescriptions: ws.clips.map((c) => `#${c.rank} (${c.startFormatted}-${c.endFormatted}): ${c.description}`),
  });
  const saved = updateWorkspace(uuid, {
    title: res.bestTitle,
    viralTitleCandidates: res.candidates,
    providerUsed: res.providerUsed,
  });
  if (!saved) throw new Error('Failed to save generated viral title.');
  return saved;
}

export async function inspectAudioOnly(uuid: string) {
  const ws = getWorkspace(uuid);
  if (!ws || !ws.sourceVideoPath) throw new Error('Workspace or source video not found.');
  return analyzeAudioPeaks(ws.sourceVideoPath);
}
